import type {PoolClient} from '@workspace/db';
import {HttpError} from '../auth';

/** Read-only gate: a valid encryption key alone does not prove provider storage exists. */
export async function assertProviderSchemaReady(db:PoolClient){
  try{
    await db.query(`SELECT p.credentials_encrypted,p.config_version,p.health,p.pricing_policy,
      j.actor_id,j.kind,j.state,j.lease_token,j.lease_until,j.next_attempt_at,j.counts,
      c.upstream_id,c.cost_units,c.currency,c.requirements,c.source_snapshot,c.source_hash,c.last_job_id,
      l.imported_source_hash,l.imported_cost_units,l.imported_currency,l.imported_fx_rate
      FROM external_providers p
      JOIN external_provider_jobs j ON j.subscriber_id=p.subscriber_id AND j.provider_id=p.id
      JOIN external_provider_catalog c ON c.subscriber_id=p.subscriber_id AND c.provider_id=p.id
      JOIN external_provider_service_links l ON l.subscriber_id=p.subscriber_id AND l.provider_id=p.id AND l.catalog_id=c.id
      LIMIT 0`);
    const requiredIndexes=[
      'external_providers_pkey','external_providers_subscriber_id_id_key',
      'external_provider_jobs_pkey','external_provider_jobs_subscriber_id_provider_id_id_key',
      'external_provider_one_live_job','external_provider_job_claim','external_provider_history',
      'external_provider_catalog_pkey','external_provider_catalog_subscriber_id_provider_id_upstrea_key',
      'external_provider_catalog_subscriber_id_provider_id_id_key','external_provider_catalog_browse',
      'external_provider_service_links_pkey','external_provider_service_links_subscriber_id_service_id_key',
    ];
    const result=(await db.query(`SELECT
      (SELECT count(*)::int FROM schema_migrations WHERE name=ANY($1)) AS migrations,
      (SELECT count(*)::int FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
       JOIN pg_namespace n ON c.relnamespace=n.oid
       WHERE n.nspname='public' AND c.relname=ANY($2) AND i.indisvalid AND i.indisready) AS indexes,
      (SELECT count(*)::int FROM pg_constraint WHERE conrelid='external_providers'::regclass
       AND convalidated AND ((conname='external_providers_protocol_check'
         AND pg_get_constraintdef(oid) LIKE '%DHRU_FUSION_LEGACY_V61%')
         OR (conname='external_providers_health_check'
         AND pg_get_constraintdef(oid) LIKE '%AUTHENTICATION_FAILED%'))) AS constraints`,
      [['032_external_provider_foundation.sql','033_legacy_provider_protocol.sql'],requiredIndexes])).rows[0];
    if(result.migrations!==2||result.indexes!==requiredIndexes.length||result.constraints!==2)throw Error('Incomplete schema');
  }catch{
    throw new HttpError(503,'Provider storage schema is unavailable or incompatible. Verify migrations 032/033 and required provider indexes before enabling operations.');
  }
}
