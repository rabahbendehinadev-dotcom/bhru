import {Router} from 'express';
import {z} from '@workspace/api-zod';
import {subscriberContext} from '../lib/commerce/data';
import {transaction,audit} from '../lib/platform';
import {HttpError,rateLimit} from '../lib/auth';
import {providerStorageReady} from '../lib/providers/credentials';
import {assertProviderSchemaReady} from '../lib/providers/schema-ready';
import {providerInput,inputCredentials,configureProvider,providerRow,providerView,policyInput,validatePolicyGroups} from '../lib/providers/connections';
import {providerProtocols,providerAdapter} from '../lib/providers/adapter';
import {providerUrl,ProviderError} from '../lib/providers/transport';
import {enqueueProviderJob,jobView} from '../lib/providers/worker';
import {previewImport,importServices} from '../lib/providers/import';
import {usdText} from '../lib/client-finance/wallet';
const router=Router(),uuid=z.string().uuid();
router.use('/external-providers',(_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
router.get('/external-providers',async(req,res)=>{
  const owner=subscriberContext(req);
  res.json(await transaction(async db=>{
    await assertProviderSchemaReady(db);
    return {data:(await db.query(`SELECT p.*,
    (SELECT count(*)::int FROM external_provider_catalog c WHERE c.subscriber_id=p.subscriber_id AND c.provider_id=p.id AND NOT c.missing) service_count
    FROM external_providers p WHERE p.subscriber_id=$1 ORDER BY p.created_at DESC LIMIT 100`,[owner.subscriber_id])).rows.map(providerView),
    protocols:providerProtocols,storageReady:providerStorageReady()};
  }));
});
router.post('/external-providers/test',async(req,res)=>{
  const owner=subscriberContext(req);await rateLimit(`provider-draft:${owner.subscriber_id}`,20);
  if(!providerStorageReady())throw new HttpError(503,'Provider encryption is not configured.');
  const input=providerInput.parse(req.body);providerUrl(input.baseUrl,input.protocol);
  const credential=inputCredentials(input);
  if(!input.enabled){res.json({health:'DISABLED',currency:null,balance:null});return;}
  if(!credential)throw new HttpError(400,'Enter new credentials for this draft test. Saved connections can be tested from the provider list.');
  try{
    const account=await providerAdapter(input.protocol).account(input.baseUrl,credential);
    if(input.currency&&input.currency!==account.currency)throw new HttpError(409,'Provider currency differs from the configured currency.');
    res.json({health:'CONNECTED',...account});
  }catch(e){
    if(e instanceof ProviderError){
      if(input.protocol==='DHRU_FUSION_LEGACY_V61'){
        res.json({health:e.category,currency:null,balance:null});return;
      }
      throw new HttpError(502,`Provider test failed: ${e.category}. Verify URL, credentials, currency and upstream IP permissions.`);
    }
    throw e;
  }
});
router.post('/external-providers',async(req,res)=>{
  const owner=subscriberContext(req);await rateLimit(`provider-save:${owner.subscriber_id}`,50);
  res.status(201).json(await transaction(async db=>{
    // Bound configuration inventory and serialize concurrent creates.
    await db.query('SELECT id FROM subscribers WHERE id=$1 FOR UPDATE',[owner.subscriber_id]);
    if((await db.query('SELECT id FROM external_providers WHERE subscriber_id=$1',[owner.subscriber_id])).rows.length>=100)
      throw new HttpError(409,'A reseller may configure at most 100 providers.');
    const p=await configureProvider(owner.subscriber_id,undefined,req.body,db);
    await audit(db,owner,'External provider created','external_provider',p.id,p.name);return p;
  }));
});
router.patch('/external-providers/:id',async(req,res)=>{
  const owner=subscriberContext(req),id=uuid.parse(req.params.id);await rateLimit(`provider-save:${owner.subscriber_id}`,50);
  res.json(await transaction(async db=>{
    const p=await configureProvider(owner.subscriber_id,id,req.body,db);
    await audit(db,owner,'External provider configuration updated','external_provider',id,p.name);return p;
  }));
});
router.post('/external-providers/:id/jobs',async(req,res)=>{
  const owner=subscriberContext(req),id=uuid.parse(req.params.id);
  const {kind}=z.object({kind:z.enum(['TEST','SYNC'])}).strict().parse(req.body);
  if(!providerStorageReady())throw new HttpError(503,'Provider encryption is not configured.');
  await rateLimit(`provider-job:${owner.subscriber_id}`,30);
  res.status(202).json(await transaction(async db=>{
    const j=await enqueueProviderJob(owner.subscriber_id,id,owner.id,kind,db);
    await audit(db,owner,`External provider ${kind.toLowerCase()} queued`,'external_provider',id,'External provider');return j;
  }));
});
const page=z.coerce.number().int().min(1).max(10000).default(1);
router.get('/external-providers/:id/jobs',async(req,res)=>{
  const owner=subscriberContext(req),id=uuid.parse(req.params.id),q=z.object({page}).strict().parse(req.query);
  res.json(await transaction(async db=>{
    await providerRow(owner.subscriber_id,id,db);
    const rows=(await db.query('SELECT * FROM external_provider_jobs WHERE subscriber_id=$1 AND provider_id=$2 ORDER BY created_at DESC LIMIT 31 OFFSET $3',[owner.subscriber_id,id,(q.page-1)*30])).rows;
    return {data:rows.slice(0,30).map(jobView),page:q.page,hasMore:rows.length>30};
  }));
});
router.get('/external-providers/:id/catalog',async(req,res)=>{
  const owner=subscriberContext(req),id=uuid.parse(req.params.id);
  const q=z.object({page,search:z.string().trim().max(100).optional(),category:z.string().max(128).optional(),
    serviceType:z.enum(['imei','server','file','remote']).optional(),changedOnly:z.enum(['true','false']).optional()}).strict().parse(req.query);
  res.json(await transaction(async db=>{
    await providerRow(owner.subscriber_id,id,db);
    const rows=(await db.query(`SELECT c.*,l.service_id,s.selling_price_usd_units retail_units
      FROM external_provider_catalog c LEFT JOIN external_provider_service_links l ON l.subscriber_id=c.subscriber_id AND l.provider_id=c.provider_id AND l.catalog_id=c.id
      LEFT JOIN manual_services s ON s.subscriber_id=l.subscriber_id AND s.id=l.service_id
      WHERE c.subscriber_id=$1 AND c.provider_id=$2 AND($3::text IS NULL OR c.name ILIKE $3)
       AND($4::text IS NULL OR c.category_id=$4) AND($5::text IS NULL OR c.service_type=$5)
       AND(NOT $6 OR c.changes<>'[]'::jsonb) ORDER BY c.category_name NULLS LAST,c.name,c.id LIMIT 101 OFFSET $7`,
      [owner.subscriber_id,id,q.search?`%${q.search.replace(/[\\%_]/g,'\\$&')}%`:null,q.category??null,q.serviceType??null,q.changedOnly==='true',(q.page-1)*100])).rows;
    const data=rows.slice(0,100).map(c=>({id:c.id,upstreamId:c.upstream_id,name:c.name,serviceType:c.service_type,
      categoryId:c.category_id,categoryName:c.category_name,cost:usdText(c.cost_units),currency:c.currency,
      previousCost:c.previous_snapshot?.cost??null,changes:c.changes,reviewReasons:c.review_reasons,
      missing:c.missing,availability:c.availability,linkedServiceId:c.service_id??null,
      retailPriceUsd:c.retail_units?usdText(c.retail_units):null,estimatedTime:c.estimated_time}));
    const categories=(await db.query(`SELECT category_id id,category_name name,count(*)::int count FROM external_provider_catalog
      WHERE subscriber_id=$1 AND provider_id=$2 AND category_id IS NOT NULL GROUP BY category_id,category_name ORDER BY category_name`,[owner.subscriber_id,id])).rows;
    return {data,categories,page:q.page,hasMore:rows.length>100};
  }));
});
router.put('/external-providers/:id/pricing',async(req,res)=>{
  const owner=subscriberContext(req),id=uuid.parse(req.params.id),policy=policyInput.parse(req.body);
  res.json(await transaction(async db=>{
    await providerRow(owner.subscriber_id,id,db,true);await validatePolicyGroups(owner.subscriber_id,policy,db);
    await db.query('UPDATE external_providers SET pricing_policy=$3,updated_at=now() WHERE subscriber_id=$1 AND id=$2',[owner.subscriber_id,id,policy]);
    await audit(db,owner,'External provider import pricing defaults updated','external_provider',id,'External provider');
    return providerView(await providerRow(owner.subscriber_id,id,db));
  }));
});
router.post('/external-providers/:id/preview',async(req,res)=>{
  const owner=subscriberContext(req),id=uuid.parse(req.params.id);await rateLimit(`provider-preview:${owner.subscriber_id}`,100);
  res.json(await transaction(db=>previewImport(owner.subscriber_id,id,req.body,db)));
});
router.post('/external-providers/:id/import',async(req,res)=>{
  const owner=subscriberContext(req),id=uuid.parse(req.params.id);await rateLimit(`provider-import:${owner.subscriber_id}`,30);
  res.json(await transaction(async db=>{
    const result=await importServices(owner.subscriber_id,id,req.body,db);
    await audit(db,owner,'External provider services imported (inactive)','external_provider',id,`${result.imported} services imported`);
    return result;
  }));
});
export default router;
