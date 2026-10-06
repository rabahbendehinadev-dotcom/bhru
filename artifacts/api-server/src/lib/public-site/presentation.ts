import sanitizeHtml from 'sanitize-html';
import { pool, type PoolClient } from '@workspace/db';
import { UpdateCurrentPublicPresentationBody, type PublicPresentationValues } from '@workspace/api-zod';
import { HttpError } from '../auth';
import { adminPath } from '../admin-entry';
import { safePublicLink } from './safety';
import { previewImageUrl, publicImageUrl } from './media';
import { ownedImages, emptyWebsiteValues } from './configuration';
import type { PublicSiteModel } from './model';

const generated = UpdateCurrentPublicPresentationBody.shape.values;
export const presentationSchema = generated.extend({
  logos: generated.shape.logos.element.strict().array().max(6),
  announcements: generated.shape.announcements.element.strict().array().max(8),
  banners: generated.shape.banners.element.strict().array().max(8),
}).strict();
type Database = Pick<PoolClient,'query'>;
const settingsFields = ['logo_strip_enabled','announcements_enabled','custom_html_enabled','custom_html','hero_mode','slider_autoplay','slider_interval'] as const;
const itemTables = [
  ['logos','public_site_partner_logos',['asset_id','label','destination','new_tab','enabled']],
  ['announcements','public_site_announcements',['enabled','text','destination','background_color','text_color','movement','direction','speed']],
  ['banners','public_site_banners',['asset_id','alt_text','destination','enabled']],
] as const;
const reserved = new Set(['login','register','dashboard','settings','m','api','admin','assets','brand','pwa','healthz','src','node_modules',adminPath.slice(1).toLowerCase()]);
export function presentationLink(value: string, host?: string): string {
  if (!value) return '';
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new HttpError(400,'Use a safe public link, page anchor, HTTPS, email or telephone destination.');
  if (/^\/[a-z0-9]+(?:-[a-z0-9]+)*(?:#[a-z][a-z0-9-]*)?$/.test(value)) {
    if (reserved.has(value.slice(1).split('#')[0]!)) throw new HttpError(400,'Links cannot open private BHRU routes.');
    return value;
  }
  const safe = safePublicLink(value,'');
  if (!safe || (/\s/.test(value) && !value.startsWith('tel:'))) throw new HttpError(400,'Use a public /slug, page anchor, HTTPS, email or telephone link.');
  if (safe.startsWith('https:')) {
    const u=new URL(safe);
    const hostname=u.hostname.toLowerCase().replace(/\.$/,'');
    if (['bhru.net','www.bhru.net'].includes(hostname) || u.host===host) {
      const first=u.pathname.split('/')[1]?.toLowerCase();
      if (!first || reserved.has(first) || u.pathname.includes('%')) throw new HttpError(400,'Links cannot open private BHRU routes.');
    }
  }
  return safe;
}
/** Parser-based allowlist, also applied on rendering as defence in depth. */
export function sanitizedTopHTML(html: string, host?: string): string {
  return sanitizeHtml(html,{
    allowedTags:['div','p','span','strong','b','em','i','u','small','br','ul','ol','li','a','h2','h3','blockquote'],
    allowedAttributes:{a:['href','target','rel']},
    allowedSchemes:['https','mailto','tel'], allowProtocolRelative:false,
    disallowedTagsMode:'discard', enforceHtmlBoundary:true,
    transformTags:{a:(_tag,attributes)=>{
      let href='';
      try { href=presentationLink(attributes.href || '',host); } catch { /* strip unsafe destinations */ }
      return {tagName:'a',attribs:href ? {href,...(attributes.target==='_blank'?{target:'_blank',rel:'noopener noreferrer'}:{})} : {}};
    }},
  });
}
export const emptyPresentation = (): PublicPresentationValues => ({
  logo_strip_enabled:false,announcements_enabled:false,custom_html_enabled:false,custom_html:'',
  hero_mode:'classic',slider_autoplay:true,slider_interval:5,logos:[],announcements:[],banners:[],
});
export function validatePresentation(raw: unknown,host?:string): PublicPresentationValues {
  const values=presentationSchema.parse(raw);
  const seen=new Set<string>();
  for(const group of [values.logos,values.announcements,values.banners]) for(const item of group) {
    item.id=item.id.toLowerCase();
    if('asset_id' in item) item.asset_id=item.asset_id.toLowerCase();
    if(seen.has(item.id)) throw new HttpError(400,'Each item must have a distinct ID.');
    seen.add(item.id);
    for(const [key,value] of Object.entries(item)) {
      if(typeof value==='string' && /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new HttpError(400,'Unsupported characters in an item.');
      if(['label','alt_text','text','destination'].includes(key) && typeof value==='string') (item as unknown as Record<string,unknown>)[key]=value.trim();
    }
    item.destination=presentationLink(item.destination,host);
  }
  if(values.announcements.some(item=>!item.text)) throw new HttpError(400,'Announcement text is required.');
  values.custom_html=sanitizedTopHTML(values.custom_html,host);
  if(values.custom_html.length>4096) throw new HttpError(400,'Sanitized HTML is too long.');
  return values;
}
export const presentationAssetIds=(values:PublicPresentationValues)=>[...new Set([...values.logos,...values.banners].map(item=>item.asset_id))];
export async function readPresentation(id:string,client:Database=pool) {
  const row=(await client.query('SELECT * FROM public_site_presentation WHERE subscriber_id=$1',[id])).rows[0];
  if(!row) return {values:emptyPresentation(),revision:0};
  const raw:Record<string,unknown>=Object.fromEntries(settingsFields.map(key=>[key,row[key]]));
  for(const [key,table,columns] of itemTables) {
    raw[key]=(await client.query(`SELECT id,${columns.join(',')} FROM ${table} WHERE subscriber_id=$1 ORDER BY sort_order`,[id])).rows;
  }
  return {values:validatePresentation(raw),revision:row.revision as number};
}
export async function presentationConfiguration(id:string,client:Database=pool) {
  const config=await readPresentation(id,client);
  const images=await ownedImages(id,emptyWebsiteValues(),client,presentationAssetIds(config.values));
  return {...config,asset_urls:Object.fromEntries([...images].map(([asset,key])=>[asset,previewImageUrl(asset,key)]))};
}
export async function savePresentation(id:string,values:PublicPresentationValues,revision:number,client:PoolClient) {
  // Caller holds the authenticated owner's subscriber FOR UPDATE lock.
  const prior=await readPresentation(id,client);
  if(prior.revision!==revision) throw new HttpError(409,'Your website presentation changed elsewhere. Reset to load its latest version.');
  await ownedImages(id,emptyWebsiteValues(),client,presentationAssetIds(values));
  const ids=[...values.logos,...values.announcements,...values.banners].map(item=>item.id);
  for(const [,table] of itemTables) {
    if(ids.length && (await client.query(`SELECT 1 FROM ${table} WHERE id=ANY($1::uuid[]) AND subscriber_id<>$2 LIMIT 1`,[ids,id])).rowCount) {
      throw new HttpError(400,'An item is not owned by your website.');
    }
  }
  await client.query(`INSERT INTO public_site_presentation(subscriber_id,${settingsFields.join(',')})
    VALUES($1,${settingsFields.map((_,i)=>`$${i+2}`).join(',')})
    ON CONFLICT(subscriber_id) DO UPDATE SET ${settingsFields.map(k=>`${k}=EXCLUDED.${k}`).join(',')},
    revision=public_site_presentation.revision+1,updated_at=now()`,[id,...settingsFields.map(k=>values[k])]);
  for(const [key,table,columns] of itemTables) {
    await client.query(`DELETE FROM ${table} WHERE subscriber_id=$1`,[id]);
    for(const [order,item] of values[key].entries()) {
      const record=item as unknown as Record<string,unknown>;
      await client.query(`INSERT INTO ${table}(id,subscriber_id,sort_order,${columns.join(',')})
        VALUES(${Array.from({length:columns.length+3},(_,i)=>`$${i+1}`).join(',')})`,
        [item.id,id,order,...columns.map(k=>record[k])]);
    }
  }
  return presentationAssetIds(prior.values).filter(asset=>!presentationAssetIds(values).includes(asset));
}
export async function attachPresentation(model:PublicSiteModel,id:string,client:Database=pool,raw?:PublicPresentationValues,preview=false) {
  const values=raw ?? (await readPresentation(id,client)).values;
  const sizes=new Map<string,{width:number;height:number}>();
  const images=await ownedImages(id,emptyWebsiteValues(),client,presentationAssetIds(values),sizes);
  const url=preview?previewImageUrl:publicImageUrl;
  model.presentation={
    logos:values.logo_strip_enabled?values.logos.filter(i=>i.enabled).map(i=>({src:url(i.asset_id,images.get(i.asset_id)!),label:i.label,href:i.destination,newTab:i.new_tab,...sizes.get(i.asset_id)})):[],
    announcements:values.announcements_enabled?values.announcements.filter(i=>i.enabled).map(i=>({text:i.text,href:i.destination,background:i.background_color,color:i.text_color,movement:i.movement,direction:i.direction,speed:i.speed})):[],
    customHTML:values.custom_html_enabled?sanitizedTopHTML(values.custom_html):'',
    heroMode:values.hero_mode,banners:values.banners.filter(i=>i.enabled).map(i=>({src:url(i.asset_id,images.get(i.asset_id)!),alt:i.alt_text,href:i.destination,...sizes.get(i.asset_id)})),
    autoplay:values.slider_autoplay,interval:values.slider_interval,
  };
  return model;
}
/** All persisted references protect media, including disabled items. Alias a is trusted. */
export const SAVED_MEDIA_REFERENCE=`(
  EXISTS(SELECT 1 FROM subscriber_public_sites c WHERE c.subscriber_id=a.subscriber_id AND (c.logo_asset_id=a.id OR c.hero_asset_id=a.id))
  OR EXISTS(SELECT 1 FROM public_site_partner_logos x WHERE x.subscriber_id=a.subscriber_id AND x.asset_id=a.id)
  OR EXISTS(SELECT 1 FROM public_site_banners x WHERE x.subscriber_id=a.subscriber_id AND x.asset_id=a.id)
)`;
/** Only enabled, publicly rendered Phase 2 items get unsigned public access. */
export const PUBLISHED_MEDIA_REFERENCE=`(
  EXISTS(SELECT 1 FROM subscriber_public_sites c WHERE c.subscriber_id=a.subscriber_id AND (c.logo_asset_id=a.id OR c.hero_asset_id=a.id))
  OR EXISTS(SELECT 1 FROM public_site_partner_logos x JOIN public_site_presentation p USING(subscriber_id)
    WHERE x.subscriber_id=a.subscriber_id AND x.asset_id=a.id AND x.enabled AND p.logo_strip_enabled)
  OR EXISTS(SELECT 1 FROM public_site_banners x JOIN public_site_presentation p USING(subscriber_id)
    WHERE x.subscriber_id=a.subscriber_id AND x.asset_id=a.id AND x.enabled AND p.hero_mode='banner')
)`;
