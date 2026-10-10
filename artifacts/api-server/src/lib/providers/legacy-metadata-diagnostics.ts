import {logger} from '../logger';

export const legacyServiceKeys=new Set([
  'SERVICEID','SERVICETYPE','SERVICENAME','CREDIT','INFO','TIME','QNT','QNTOPTIONS','MINQNT','MAXQNT',
]);
export function unknownLegacyKeys(service:Record<string,unknown>){
  return Object.keys(service).filter(key=>!legacyServiceKeys.has(key)&&!key.startsWith('Requires.'));
}
export interface LegacyMetadataDiagnostic{
  fieldNames:string[];
  omitted:boolean;
}
const sensitive=/(auth|credential|token|passw|passwd|secret|key|user|email|mail|phone|mobile|contact|address|imei|serial|customer|client|person|account|session|cookie|signature|bearer|private|name|birth|dob|payment|card|bank|ipaddress|^ip$|device|udid|location|latitude|longitude|passport|ssn|tax|identity|macaddress)/i;
/** Names are untrusted input too. Never copy values or retain a rejected name. */
export function sanitizeLegacyMetadataKeys(keys:string[]):LegacyMetadataDiagnostic{
  const names=new Set<string>();
  let omitted=keys.length>128;
  for(const key of keys.slice(0,128)){
    if(names.size>=16){omitted=true;break;}
    if(key.length>64||!(/^[A-Z][A-Z0-9_.-]*$/.test(key)||/^[a-z][a-z0-9_.-]*$/.test(key))||
      sensitive.test(key)||key.split(/[_.-]/).some(part=>part.length>24)||
      /[0-9]{5}/.test(key)||/[a-f0-9]{16}/i.test(key)){
      omitted=true;continue;
    }
    names.add(key);
  }
  return {fieldNames:[...names],omitted};
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function legacyMetadataDiagnosticsAuthorized(
  tenantId:string,providerId:string,jobId:string,
  authorization=process.env.BHRU_LEGACY_METADATA_DIAGNOSTICS,now=Date.now(),
){
  if(!authorization||authorization.length>512||![tenantId,providerId,jobId].every(id=>uuid.test(id)))return false;
  try{
    const config=JSON.parse(authorization);
    if(!config||typeof config!=='object'||Array.isArray(config)||
      Object.keys(config).sort().join(',')!=='expiresAt,jobId,providerId,tenantId')return false;
    if(config.tenantId!==tenantId||config.providerId!==providerId||config.jobId!==jobId||
      typeof config.expiresAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(config.expiresAt))return false;
    const expiry=Date.parse(config.expiresAt);
    return Number.isFinite(expiry)&&expiry>now&&expiry-now<=15*60*1000;
  }catch{return false;}
}
export function logLegacyMetadataDiagnostic(
  tenantId:string,providerId:string,jobId:string,catalogId:string,diagnostic:LegacyMetadataDiagnostic,
){
  // Defense in depth: do not rely on callers to have filtered names or scope.
  if(!uuid.test(catalogId)||!legacyMetadataDiagnosticsAuthorized(tenantId,providerId,jobId))return;
  const safe=sanitizeLegacyMetadataKeys(diagnostic.fieldNames);
  logger.info({diagnosticCode:'LEGACY_UNKNOWN_METADATA',tenantId,providerId,jobId,catalogId,
    fieldNames:safe.fieldNames,fieldNamesOmitted:diagnostic.omitted||safe.omitted,
    reviewReason:'Undocumented Legacy service metadata needs review.'},
  'Legacy catalog contains unrecognized metadata field names');
}
