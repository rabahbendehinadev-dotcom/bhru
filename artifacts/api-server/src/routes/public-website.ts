import { Router, raw, type Request } from 'express';
import { randomUUID } from 'node:crypto';
import { pool } from '@workspace/db';
import { UpdateCurrentPublicWebsiteBody, PreviewCurrentPublicWebsiteBody } from '@workspace/api-zod';
import { requireUser, authorizeTenant, HttpError, rateLimit } from '../lib/auth';
import { transaction, getSubscriber, audit } from '../lib/platform';
import { websiteConfiguration, websiteNames, websiteFields, valueSchema, validateWebsiteValues, ownedImages, configuredPublicModel } from '../lib/public-site/configuration';
import { MAX_IMAGE_BYTES, normalizeImage, writeImage, readImage, removeImage, previewImageUrl, validPreviewToken } from '../lib/public-site/media';
import { renderPublicHome } from '../lib/public-site/homepage';
import { PUBLIC_MENU_SCRIPT_HASH } from '../lib/public-site/mobile-menu';

const router = Router();
function current(req: Request) {
  const user = requireUser(req);
  if (user.admin) throw new HttpError(403, 'Public Website management requires a subscriber account.');
  authorizeTenant(req, user.subscriber_id);
  if (Object.keys(req.query).length) throw new HttpError(400, 'This endpoint does not accept subscriber identifiers or query parameters.');
  return user;
}
const eligible = async (id: string, client: Parameters<typeof getSubscriber>[1]) => {
  await client!.query('SELECT id FROM subscriptions WHERE subscriber_id=$1 FOR SHARE', [id]);
  const subscriber = await getSubscriber(id,client);
  if (!subscriber) throw new HttpError(404,'Subscriber not found.');
  if (!subscriber.allowed) throw new HttpError(403,subscriber.accessReason);
};

router.get('/cms/public-website', async (req,res) => {
  const user = current(req);
  res.json(await transaction(async client => {
    await eligible(user.subscriber_id, client);
    return websiteConfiguration(user.subscriber_id,client);
  }));
});
router.put('/cms/public-website', async (req,res) => {
  const user = current(req);
  const input = UpdateCurrentPublicWebsiteBody.extend({ values: valueSchema }).strict().parse(req.body);
  const values = validateWebsiteValues(input.values,req.get('host'));
  let replaced: string[] = [];
  const saved = await transaction(async client => {
    await eligible(user.subscriber_id,client);
    await client.query('SELECT id FROM subscribers WHERE id=$1 FOR UPDATE', [user.subscriber_id]);
    const previous = (await client.query('SELECT revision,logo_asset_id,hero_asset_id FROM subscriber_public_sites WHERE subscriber_id=$1', [user.subscriber_id])).rows[0];
    if ((previous?.revision ?? 0) !== input.revision) throw new HttpError(409,'Your website was changed elsewhere. Reset to load the latest saved version before saving again.');
    await ownedImages(user.subscriber_id,values,client);
    replaced = [...new Set([previous?.logo_asset_id,previous?.hero_asset_id].filter((id): id is string => !!id && id!==values.logo_asset_id && id!==values.hero_asset_id))];
    const columns = websiteFields.join(',');
    const placeholders = websiteFields.map((_,index) => `$${index+2}`).join(',');
    const updates = websiteFields.map(key => `${key}=EXCLUDED.${key}`).join(',');
    await client.query(`INSERT INTO subscriber_public_sites(subscriber_id,${columns}) VALUES($1,${placeholders})
      ON CONFLICT(subscriber_id) DO UPDATE SET ${updates},revision=subscriber_public_sites.revision+1,updated_at=now()`,
      [user.subscriber_id,...websiteFields.map(key => values[key])]);
    await audit(client,user,'Public website branding and hero updated','subscriber',user.subscriber_id,'Public Website');
    return websiteConfiguration(user.subscriber_id,client);
  });
  // Old saved images are removed only after the new configuration commits.
  // A failure to clean an unreferenced file must not misreport a saved config.
  try {
    const keys=await transaction(async client => {
      const deleted=await client.query(`DELETE FROM public_site_assets a WHERE subscriber_id=$1 AND id=ANY($2::uuid[])
        AND NOT EXISTS(SELECT 1 FROM subscriber_public_sites c WHERE c.subscriber_id=a.subscriber_id AND (c.logo_asset_id=a.id OR c.hero_asset_id=a.id))
        RETURNING storage_key`,[user.subscriber_id,replaced]);
      return deleted.rows.map(row => row.storage_key as string);
    });
    for (const key of keys) await removeImage(key);
  } catch { req.log.warn({code:'MEDIA_CLEANUP'},'Unused website media cleanup deferred'); }
  res.json(saved);
});
router.post('/cms/public-website/preview', async (req,res) => {
  const user = current(req);
  const input = PreviewCurrentPublicWebsiteBody.extend({ values: valueSchema }).strict().parse(req.body);
  const values = validateWebsiteValues(input.values,req.get('host'));
  const preview = await transaction(async client => {
    await eligible(user.subscriber_id,client);
    const names = await websiteNames(user.subscriber_id,client);
    const images = await ownedImages(user.subscriber_id,values,client);
    const model = configuredPublicModel(names,values,images,true);
    const policy = `default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https: data:; script-src 'sha256-${PUBLIC_MENU_SCRIPT_HASH}'; base-uri 'none'; form-action 'none'`;
    return {
      html: renderPublicHome(model).replace('<meta charset="utf-8">', `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}">`),
      logo_url: model.logo, hero_image_url: model.heroImage,
    };
  });
  res.json(preview);
});
router.post('/cms/public-website/assets', async (req,res,next) => {
  const user = current(req);
  await transaction(client => eligible(user.subscriber_id,client));
  await rateLimit(`cms-image:${user.subscriber_id}`,20);
  next();
}, raw({ type: () => true, limit: MAX_IMAGE_BYTES }), async (req,res) => {
  const user = current(req);
  if (!Buffer.isBuffer(req.body)) throw new HttpError(400,'Send a PNG or JPEG image.');
  const image = normalizeImage(req.body,(req.get('content-type') || '').split(';')[0]!.toLowerCase());
  const id = randomUUID(), key = `${id}.${image.extension}`;
  try {
    await transaction(async client => {
      await eligible(user.subscriber_id,client);
      await client.query('SELECT id FROM subscribers WHERE id=$1 FOR UPDATE',[user.subscriber_id]);
      const quota = (await client.query('SELECT count(*)::int AS count,coalesce(sum(byte_size),0)::bigint AS bytes FROM public_site_assets WHERE subscriber_id=$1',[user.subscriber_id])).rows[0];
      if (quota.count >= 16 || Number(quota.bytes)+image.bytes.length>32*1024*1024) throw new HttpError(429,'Website image storage is full. Remove unused uploads before uploading more images.');
      await writeImage(key,image.bytes);
      await client.query(`INSERT INTO public_site_assets(id,subscriber_id,storage_key,content_type,byte_size,width,height)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,[id,user.subscriber_id,key,image.contentType,image.bytes.length,image.width,image.height]);
    });
  } catch (error) { await removeImage(key).catch(() => undefined); throw error; }
  res.status(201).json({id,url:previewImageUrl(id,key)});
});
router.delete('/cms/public-website/assets/:assetId', async(req,res) => {
  const user=current(req), id=req.params.assetId;
  if (typeof id!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) throw new HttpError(404,'Image not found.');
  const key = await transaction(async client => {
    await eligible(user.subscriber_id,client);
    const row=(await client.query('SELECT storage_key FROM public_site_assets WHERE id=$1 AND subscriber_id=$2 FOR UPDATE',[id,user.subscriber_id])).rows[0];
    if (!row) throw new HttpError(404,'Image not found.');
    const used=(await client.query('SELECT 1 FROM subscriber_public_sites WHERE subscriber_id=$1 AND (logo_asset_id=$2 OR hero_asset_id=$2)',[user.subscriber_id,id])).rowCount;
    if (used) throw new HttpError(409,'This image is still used by your saved website.');
    await client.query('DELETE FROM public_site_assets WHERE id=$1 AND subscriber_id=$2',[id,user.subscriber_id]);
    return row.storage_key as string;
  });
  await removeImage(key);
  res.status(204).end();
});

/** Public files are served before session middleware, with no visitor context. */
export const publicMediaRouter = Router();
publicMediaRouter.get('/api/public/media/:key',async(req,res) => {
  const key=req.params.key;
  if (typeof key!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(png|jpg)$/.test(key)) { res.status(404).end(); return; }
  const id=key.slice(0,36);
  const asset=(await pool.query(`SELECT a.storage_key,a.content_type,
    EXISTS(SELECT 1 FROM subscriber_public_sites c JOIN subscriptions l ON l.subscriber_id=c.subscriber_id
      WHERE c.subscriber_id=a.subscriber_id AND (c.logo_asset_id=a.id OR c.hero_asset_id=a.id)
      AND l.status IN ('ACTIVE','TRIAL') AND l.expires_at>now() AND l.licence_key IS NOT NULL AND l.plan_id IS NOT NULL) AS published
    FROM public_site_assets a WHERE a.id=$1 AND a.storage_key=$2`,[id,key])).rows[0];
  if (!asset || (!asset.published && !validPreviewToken(id,req.query.preview))) { res.status(404).end(); return; }
  try {
    const bytes=await readImage(asset.storage_key);
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'none'");
    res.setHeader('Cross-Origin-Resource-Policy','cross-origin');
    res.type(asset.content_type).send(bytes);
  } catch (error) {
    if ((error as {code?:string}).code==='ENOENT') { res.status(404).end(); return; }
    throw error;
  }
});
export default router;
