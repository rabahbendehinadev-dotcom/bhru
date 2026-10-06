import { pool, type PoolClient } from '@workspace/db';
import { UpdateCurrentPublicWebsiteBody, type PublicWebsiteValues } from '@workspace/api-zod';
import { HttpError } from '../auth';
import { normalizePublicSite, type PublicSiteModel, type PublicSiteNames } from './model';
import { safePublicLink } from './safety';
import { publicImageUrl, previewImageUrl } from './media';
import { adminPath } from '../admin-entry';

export const valueSchema = UpdateCurrentPublicWebsiteBody.shape.values.strict();
export const websiteFields = Object.keys(valueSchema.shape) as (keyof PublicWebsiteValues)[];
export const emptyWebsiteValues = (): PublicWebsiteValues => ({
  display_name: '', business_description: '', primary_color: '#2563eb',
  hero_badge: '', hero_title: '', hero_description: '', logo_asset_id: null, hero_asset_id: null,
  primary_cta_label: '', primary_cta_destination: '', secondary_cta_label: '', secondary_cta_destination: '',
});
export function validateWebsiteValues(raw: unknown, host?: string) {
  const values = valueSchema.parse(raw);
  for (const key of websiteFields) {
    const value = values[key];
    if (typeof value !== 'string') continue;
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new HttpError(400, `${key} contains unsupported characters.`);
    (values as Record<string, unknown>)[key] = value.trim();
  }
  values.primary_color = values.primary_color.toLowerCase();
  for (const key of ['primary_cta_destination','secondary_cta_destination'] as const) {
    const value = values[key];
    if (!value) continue;
    const safe = safePublicLink(value, '');
    if (!safe || /\s/.test(value) && !value.startsWith('tel:') || /[\r\n\t]/.test(value)) throw new HttpError(400, `${key}: use a page anchor, HTTPS, email or telephone link.`);
    values[key] = safe;
    if (safe.startsWith('https://')) {
      const url = new URL(safe), hostname=url.hostname.toLowerCase().replace(/\.$/,'');
      if (['bhru.net','www.bhru.net'].includes(hostname) || url.host === host) {
        const first = url.pathname.split('/')[1]?.toLowerCase();
        if (!first || ['login','register','dashboard','settings','m','api','admin','assets','brand','pwa','healthz'].includes(first) ||
            first === adminPath.slice(1).toLowerCase()) throw new HttpError(400, 'CTA destinations must not open private BHRU routes.');
      }
    }
  }
  return values;
}
export const rowWebsiteValues = (row?: Record<string, unknown>): PublicWebsiteValues =>
  row ? valueSchema.parse(Object.fromEntries(websiteFields.map(key => [key, row[key]]))) : emptyWebsiteValues();

export async function websiteNames(id: string, client: Pick<PoolClient,'query'> = pool) {
  const result = await client.query(`SELECT s.business AS "businessName",
    coalesce(nullif(btrim(g.company_name),''),s.business) AS "companyName",s.public_slug
    FROM subscribers s LEFT JOIN subscriber_general_settings g ON g.subscriber_id=s.id WHERE s.id=$1`, [id]);
  if (!result.rows[0]) throw new HttpError(404, 'Subscriber not found.');
  return result.rows[0] as PublicSiteNames & { public_slug: string };
}
export async function ownedImages(id: string, values: PublicWebsiteValues, client: Pick<PoolClient,'query'> = pool, additional: string[] = [], sizes?: Map<string,{width:number;height:number}>) {
  const ids = [...new Set([values.logo_asset_id, values.hero_asset_id,...additional].filter(Boolean))];
  const rows = ids.length ? (await client.query(
    'SELECT id,storage_key,width,height FROM public_site_assets WHERE subscriber_id=$1 AND id=ANY($2::uuid[]) FOR KEY SHARE', [id,ids],
  )).rows : [];
  if (rows.length !== ids.length) throw new HttpError(400, 'Select an existing image uploaded to your own website.');
  rows.forEach(row=>sizes?.set(row.id,{width:row.width,height:row.height}));
  return new Map(rows.map(row => [row.id as string, row.storage_key as string]));
}
export function configuredPublicModel(names: PublicSiteNames, values: PublicWebsiteValues, images: Map<string,string>, preview = false): PublicSiteModel {
  const model = normalizePublicSite(names);
  model.siteName = values.display_name || model.siteName;
  model.heroBadge = values.hero_badge || (names.businessName !== model.siteName ? names.businessName : model.siteName);
  model.heroTitle = values.hero_title || model.heroTitle;
  model.heroDescription = values.hero_description || `Welcome to ${model.siteName}. Explore our service catalogue and find the information you need for your device.`;
  model.theme.accent = values.primary_color;
  model.footer.description = values.business_description || model.footer.description;
  model.primaryCTA = { label: values.primary_cta_label || model.primaryCTA.label, href: values.primary_cta_destination || model.primaryCTA.href };
  model.secondaryCTA = { label: values.secondary_cta_label || model.secondaryCTA.label, href: values.secondary_cta_destination || model.secondaryCTA.href };
  const url = preview ? previewImageUrl : publicImageUrl;
  model.logo = values.logo_asset_id ? url(values.logo_asset_id, images.get(values.logo_asset_id)!) : null;
  model.heroImage = values.hero_asset_id ? url(values.hero_asset_id, images.get(values.hero_asset_id)!) : null;
  return model;
}
export async function websiteConfiguration(id: string, client: Pick<PoolClient,'query'> = pool) {
  const names = await websiteNames(id,client);
  const row = (await client.query('SELECT * FROM subscriber_public_sites WHERE subscriber_id=$1', [id])).rows[0];
  const values = rowWebsiteValues(row);
  const images = await ownedImages(id, values, client);
  const model = normalizePublicSite(names);
  return {
    values, defaults: { ...emptyWebsiteValues(), display_name: model.siteName,
      business_description: model.footer.description, hero_badge: names.businessName,
      hero_title: model.heroTitle, hero_description: model.heroDescription,
      primary_cta_label: model.primaryCTA.label, primary_cta_destination: model.primaryCTA.href,
      secondary_cta_label: model.secondaryCTA.label, secondary_cta_destination: model.secondaryCTA.href },
    revision: row?.revision ?? 0, public_slug: names.public_slug,
    public_url: `https://bhru.net/${names.public_slug}`, preview_url: `/${names.public_slug}`,
    logo_url: values.logo_asset_id ? previewImageUrl(values.logo_asset_id, images.get(values.logo_asset_id)!) : null,
    hero_image_url: values.hero_asset_id ? previewImageUrl(values.hero_asset_id, images.get(values.hero_asset_id)!) : null,
  };
}
