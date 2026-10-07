import { Router, raw } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from '@workspace/api-zod';
import { pool } from '@workspace/db';
import { requireAdmin, HttpError, rateLimit } from '../lib/auth';
import { currencyConfig, saveCurrency, deleteCurrency, currencies,saveDisplayCurrency,requireUsdModel } from '../lib/commerce/currencies';
import { parseUsd,usdCents } from '../lib/commerce/currency-money';
import { transaction, audit } from '../lib/platform';
import { subscriberContext, requireCommerce, storeSettings, ownedAssets, categories, products, orderDetail, publicStore, COMMERCE_SAVED_REFERENCE } from '../lib/commerce/data';
import { uuid, productInput, categoryInput, settingsInput, statusInput, minor, PAGE_SIZE, linesInput } from '../lib/commerce/validation';
import { quote, createOrder,customerQuote } from '../lib/commerce/checkout';
import { MAX_IMAGE_BYTES, normalizeImage, writeImage, removeImage, previewImageUrl } from '../lib/public-site/media';

const router=Router();
const pagination=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),search:z.string().max(100).optional(),status:z.enum(['new','confirmed','processing','completed','cancelled']).optional(),id:uuid.optional()}).strict();
router.get('/commerce/access',async(req,res)=>{
  const user=subscriberContext(req);
  const row=(await pool.query("SELECT enabled FROM subscriber_modules WHERE subscriber_id=$1 AND module_key='ecommerce'",[user.subscriber_id])).rows[0];
  res.json({enabled:!!row?.enabled});
});
router.get('/platform/subscribers/:id/modules/ecommerce',async(req,res)=>{
  requireAdmin(req);
  const id=uuid.parse(req.params.id);
  if(!(await pool.query('SELECT id FROM subscribers WHERE id=$1',[id])).rowCount)throw new HttpError(404,'Subscriber not found.');
  const row=(await pool.query("SELECT enabled FROM subscriber_modules WHERE subscriber_id=$1 AND module_key='ecommerce'",[id])).rows[0];
  res.json({enabled:!!row?.enabled});
});
router.put('/platform/subscribers/:id/modules/ecommerce',async(req,res)=>{
  const user=requireAdmin(req),id=uuid.parse(req.params.id);
  const input=z.object({enabled:z.boolean()}).strict().parse(req.body);
  await transaction(async client=>{
    if(!(await client.query('SELECT id FROM subscribers WHERE id=$1 FOR UPDATE',[id])).rowCount)throw new HttpError(404,'Subscriber not found.');
    await client.query(`INSERT INTO subscriber_modules(subscriber_id,module_key,enabled) VALUES($1,'ecommerce',$2)
      ON CONFLICT(subscriber_id,module_key) DO UPDATE SET enabled=EXCLUDED.enabled,updated_at=now()`,[id,input.enabled]);
    await audit(client,user,input.enabled?'E-Commerce module enabled':'E-Commerce module disabled','subscriber',id,'Module entitlement');
  });
  res.json(input);
});
router.get('/commerce/:resource',async(req,res)=>{
  const user=subscriberContext(req),q=pagination.parse(req.query),id=user.subscriber_id;
  res.json(await transaction(async client=>{
    if(req.params.resource==='currencies')return {data:await currencyConfig(id,client,user.id)};
    await requireCommerce(id,client);
    const publicSlug=(await client.query('SELECT public_slug FROM subscribers WHERE id=$1',[id])).rows[0]?.public_slug;
    switch(req.params.resource) {
      case 'settings':return {data:{...await storeSettings(id,client),public_slug:publicSlug}};
      case 'products':return products(id,client,{page:q.page,search:q.search,productId:q.id});
      case 'categories':return {data:await categories(id,client)};
      case 'overview': {
        const counts=(await client.query(`SELECT (SELECT count(*)::int FROM store_products WHERE subscriber_id=$1 AND NOT archived) total_products,
          (SELECT count(*)::int FROM store_products WHERE subscriber_id=$1 AND active AND NOT archived) active_products,
          count(*)::int total_orders,count(*) FILTER(WHERE status IN ('new','confirmed'))::int new_orders,
          count(*) FILTER(WHERE status='completed')::int completed_orders FROM store_orders WHERE subscriber_id=$1`,[id])).rows[0];
        return {data:{...counts,public_slug:publicSlug,recent_orders:(await client.query('SELECT id,reference,customer_name,phone,total_minor,currency,currency_snapshot,status,created_at FROM store_orders WHERE subscriber_id=$1 ORDER BY created_at DESC LIMIT 6',[id])).rows}};
      }
      case 'orders': {
        if(q.id)return {data:await orderDetail(id,q.id,client)};
        const rows=(await client.query(`SELECT id,reference,customer_name,phone,total_minor,currency,currency_snapshot,status,created_at
          FROM store_orders WHERE subscriber_id=$1 AND ($2::text IS NULL OR status=$2)
          AND ($3::text IS NULL OR reference ILIKE $3 OR customer_name ILIKE $3 OR phone ILIKE $3)
          ORDER BY created_at DESC LIMIT $4 OFFSET $5`,[id,q.status??null,q.search?`%${q.search}%`:null,PAGE_SIZE+1,(q.page-1)*PAGE_SIZE])).rows;
        return {data:rows.slice(0,PAGE_SIZE),page:q.page,has_more:rows.length>PAGE_SIZE};
      }
      case 'customers': {
        const rows=(await client.query(`SELECT DISTINCT ON (phone) phone,customer_name,email,
          count(*) OVER(PARTITION BY phone)::int order_count,max(created_at) OVER(PARTITION BY phone) last_order_at
          FROM store_orders WHERE subscriber_id=$1 AND ($2::text IS NULL OR phone ILIKE $2 OR customer_name ILIKE $2)
          ORDER BY phone,created_at DESC LIMIT $3 OFFSET $4`,[id,q.search?`%${q.search}%`:null,PAGE_SIZE+1,(q.page-1)*PAGE_SIZE])).rows;
        return {data:rows.slice(0,PAGE_SIZE),page:q.page,has_more:rows.length>PAGE_SIZE};
      }
      default:throw new HttpError(404,'Store resource not found.');
    }
  }));
});
router.post('/commerce/:resource',async(req,res,next)=>{
  if(req.params.resource==='assets'){next();return;}
  const user=subscriberContext(req),id=user.subscriber_id;
  const data=await transaction(async client=>{
    await client.query('SELECT id FROM subscribers WHERE id=$1 FOR UPDATE',[id]);
    if(req.params.resource==='currencies')return saveCurrency(id,req.body,client);
    if(req.params.resource==='display-currency')return saveDisplayCurrency(id,user.id,req.body,client);
    await requireCommerce(id,client);
    switch(req.params.resource) {
      case 'products': {
        await requireUsdModel(id,client);
        const v=productInput.parse(req.body),pid=v.id??randomUUID();
        let usd:bigint,compareUsd:bigint|null;
        try {usd=parseUsd(v.price);compareUsd=v.compare_at===null?null:parseUsd(v.compare_at);}
        catch {throw new HttpError(400,'Enter a valid USD price with at most 12 decimals within the price limit.');}
        const price=usdCents(usd),compare=compareUsd===null?null:usdCents(compareUsd);
        if(compareUsd!==null&&compareUsd<usd)throw new HttpError(400,'Compare-at price must not be lower than selling price.');
        if(compare!==null&&compare<price)throw new HttpError(400,'Compare-at price must not be lower than price.');
        if(v.category_id&&!(await client.query('SELECT id FROM store_categories WHERE subscriber_id=$1 AND id=$2',[id,v.category_id])).rowCount)throw new HttpError(400,'Category is not owned by this store.');
        await ownedAssets(id,v.image_ids,client);
        if(v.id&&!(await client.query('SELECT id FROM store_products WHERE subscriber_id=$1 AND id=$2 AND NOT archived',[id,v.id])).rowCount)throw new HttpError(404,'Product not found.');
        await client.query(`INSERT INTO store_products(id,subscriber_id,category_id,name,slug,short_description,description,sku,price_minor,compare_at_minor,active,featured,in_stock,stock_quantity,sort_order,price_usd_units,compare_at_usd_units)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
          ON CONFLICT(id) DO UPDATE SET category_id=EXCLUDED.category_id,name=EXCLUDED.name,slug=EXCLUDED.slug,short_description=EXCLUDED.short_description,
          description=EXCLUDED.description,sku=EXCLUDED.sku,price_minor=EXCLUDED.price_minor,compare_at_minor=EXCLUDED.compare_at_minor,price_usd_units=EXCLUDED.price_usd_units,compare_at_usd_units=EXCLUDED.compare_at_usd_units,
          active=EXCLUDED.active,featured=EXCLUDED.featured,in_stock=EXCLUDED.in_stock,stock_quantity=EXCLUDED.stock_quantity,sort_order=EXCLUDED.sort_order,updated_at=now()
          WHERE store_products.subscriber_id=EXCLUDED.subscriber_id`,
          [pid,id,v.category_id,v.name,v.slug,v.short_description,v.description,v.sku,price.toString(),compare?.toString()??null,v.active,v.featured,v.in_stock,v.stock_quantity,v.sort_order,usd.toString(),compareUsd?.toString()??null]);
        await client.query('DELETE FROM store_product_images WHERE subscriber_id=$1 AND product_id=$2',[id,pid]);
        for(const [order,asset] of v.image_ids.entries())await client.query('INSERT INTO store_product_images(subscriber_id,product_id,asset_id,sort_order) VALUES($1,$2,$3,$4)',[id,pid,asset,order]);
        return {id:pid};
      }
      case 'categories': {
        const v=categoryInput.parse(req.body),cid=v.id??randomUUID();
        await ownedAssets(id,v.image_id?[v.image_id]:[],client);
        if(v.id&&!(await client.query('SELECT id FROM store_categories WHERE subscriber_id=$1 AND id=$2',[id,cid])).rowCount)throw new HttpError(404,'Category not found.');
        await client.query(`INSERT INTO store_categories(id,subscriber_id,name,slug,description,image_id,enabled,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,slug=EXCLUDED.slug,description=EXCLUDED.description,image_id=EXCLUDED.image_id,enabled=EXCLUDED.enabled,sort_order=EXCLUDED.sort_order
          WHERE store_categories.subscriber_id=EXCLUDED.subscriber_id`,[cid,id,v.name,v.slug,v.description,v.image_id,v.enabled,v.sort_order]);
        return {id:cid};
      }
      case 'settings': {
        const v=settingsInput.parse(req.body),previous=await storeSettings(id,client);
        if(v.currency!==previous.currency)throw new HttpError(409,'The accounting reference cannot be changed in Store Settings. USD is permanent; legacy conversion requires approval.');
        const fields=Object.keys(v),values=Object.values(v);
        await client.query(`INSERT INTO store_settings(subscriber_id,${fields.join(',')}) VALUES($1,${values.map((_,i)=>`$${i+2}`).join(',')})
          ON CONFLICT(subscriber_id) DO UPDATE SET ${fields.map(k=>`${k}=EXCLUDED.${k}`).join(',')},updated_at=now()`,[id,...values]);
        return v;
      }
      case 'orders': {
        const v=statusInput.parse(req.body);
        const prior=(await client.query('SELECT status FROM store_orders WHERE subscriber_id=$1 AND id=$2 FOR UPDATE',[id,v.id])).rows[0];
        if(!prior)throw new HttpError(404,'Order not found.');
        await client.query('UPDATE store_orders SET status=$3,updated_at=now() WHERE subscriber_id=$1 AND id=$2',[id,v.id,v.status]);
        if(prior.status!==v.status)await client.query('INSERT INTO store_order_status_history(subscriber_id,order_id,status) VALUES($1,$2,$3)',[id,v.id,v.status]);
        return {id:v.id,status:v.status};
      }
      default:throw new HttpError(404,'Store resource not found.');
    }
  });
  res.json({data});
});
router.delete('/commerce/:resource/:id',async(req,res,next)=>{
  if(req.params.resource==='assets'){next();return;}
  if(req.params.resource==='currencies'){
    const user=subscriberContext(req);
    await transaction(async client=>{
      await client.query('SELECT id FROM subscribers WHERE id=$1 FOR UPDATE',[user.subscriber_id]);
      await deleteCurrency(user.subscriber_id,String(req.params.id),client);
    });
    res.json({ok:true});return;
  }
  const user=subscriberContext(req),id=uuid.parse(req.params.id);
  await transaction(async client=>{
    await requireCommerce(user.subscriber_id,client);
    const table=req.params.resource==='products'?'store_products':req.params.resource==='categories'?'store_categories':null;
    if(!table)throw new HttpError(404,'Store resource not found.');
    const mutation=table==='store_products'?'archived=true,active=false,updated_at=now()':'enabled=false';
    if(!(await client.query(`UPDATE ${table} SET ${mutation} WHERE subscriber_id=$1 AND id=$2`,[user.subscriber_id,id])).rowCount)throw new HttpError(404,'Item not found.');
  });
  res.json({ok:true});
});
router.post('/commerce/assets',raw({type:['image/png','image/jpeg'],limit:MAX_IMAGE_BYTES}),async(req,res)=>{
  const user=subscriberContext(req);
  if(!Buffer.isBuffer(req.body))throw new HttpError(400,'Send a PNG or JPEG file.');
  const id=randomUUID(),image=normalizeImage(req.body,req.get('content-type')??'',true),key=`${id}.${image.extension}`;
  try {
    await transaction(async client=>{
      await client.query('SELECT id FROM subscribers WHERE id=$1 FOR UPDATE',[user.subscriber_id]);
      await requireCommerce(user.subscriber_id,client);
      const quota=(await client.query('SELECT count(*)::int count,coalesce(sum(byte_size),0)::bigint bytes FROM public_site_assets WHERE subscriber_id=$1',[user.subscriber_id])).rows[0];
      if(quota.count>=500||BigInt(quota.bytes)+BigInt(image.bytes.length)>256n*1024n*1024n)throw new HttpError(429,'Store media quota reached.');
      await writeImage(key,image.bytes);
      await client.query("INSERT INTO public_site_assets(id,subscriber_id,storage_key,content_type,byte_size,width,height,media_scope) VALUES($1,$2,$3,$4,$5,$6,$7,'commerce')",[id,user.subscriber_id,key,image.contentType,image.bytes.length,image.width,image.height]);
    });
  }catch(error){await removeImage(key).catch(()=>undefined);throw error;}
  res.status(201).json({id,url:previewImageUrl(id,key)});
});
router.delete('/commerce/assets/:id',async(req,res)=>{
  const user=subscriberContext(req),id=uuid.parse(req.params.id);
  const key=await transaction(async client=>{
    await requireCommerce(user.subscriber_id,client);
    const row=(await client.query(`DELETE FROM public_site_assets a WHERE subscriber_id=$1 AND id=$2 AND NOT ${COMMERCE_SAVED_REFERENCE}
      AND NOT EXISTS(SELECT 1 FROM subscriber_public_sites w WHERE w.subscriber_id=a.subscriber_id AND (w.logo_asset_id=a.id OR w.hero_asset_id=a.id))
      AND NOT EXISTS(SELECT 1 FROM public_site_partner_logos l WHERE l.subscriber_id=a.subscriber_id AND l.asset_id=a.id)
      AND NOT EXISTS(SELECT 1 FROM public_site_banners b WHERE b.subscriber_id=a.subscriber_id AND b.asset_id=a.id)
      RETURNING storage_key`,[user.subscriber_id,id])).rows[0];
    if(!row)throw new HttpError(409,'Image is referenced or unavailable.');
    return row.storage_key;
  });
  await removeImage(key);res.json({ok:true});
});
export const publicCommerceRouter=Router();
publicCommerceRouter.use('/api/public/commerce',async(req,res,next)=>{
  await rateLimit(`commerce:${req.ip}`,500);
  res.setHeader('Cache-Control','no-store');next();
});
publicCommerceRouter.get('/api/public/commerce/:slug/catalog',async(req,res)=>{
  const q=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),category:uuid.optional()}).strict().parse(req.query);
  res.json(await transaction(async client=>{
    const store=await publicStore(String(req.params.slug),client);
    return {...await products(store.id,client,{publicOnly:true,page:q.page,category:q.category,featuredFirst:store.settings.featured_first}),categories:await categories(store.id,client,true)};
  }));
});
publicCommerceRouter.post('/api/public/commerce/:slug/quote',async(req,res)=>{
  const input=linesInput.parse(req.body);
    res.json({data:await transaction(async client=>{const store=await publicStore(String(req.params.slug),client);return customerQuote(await quote(store.id,input,store.settings.currency,client,false,store.settings.money_model_version??1));})});
});
publicCommerceRouter.post('/api/public/commerce/:slug/orders',async(req,res)=>{
  await rateLimit(`commerce-order:${req.ip}`,30);
  // Guest checkout uses no login cookies. Require same-origin custom-header JSON
  // requests; cross-origin forms cannot submit or preflight without CORS permission.
  if(req.get('X-BHRU-Request')!=='1'||!req.is('application/json')||req.get('sec-fetch-site')==='cross-site')throw new HttpError(403,'Request not permitted.');
  const data=await transaction(async client=>{
    const store=await publicStore(String(req.params.slug),client);
    return createOrder(store.id,req.body,store.settings,client);
  });
  res.status(201).json({data});
});
export default router;
