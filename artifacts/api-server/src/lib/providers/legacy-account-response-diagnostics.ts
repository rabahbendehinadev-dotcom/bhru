import {currency,decimal,exactJson,object} from './adapter';
import {legacyMetadataDiagnosticsAuthorized} from './legacy-metadata-diagnostics';
import {logger} from '../logger';

type Field='VALID'|'MISSING'|'NULL'|'INVALID';
export interface AccountResponseDiagnostic{
  response:'JSON'|'HTML'|'XML'|'MALFORMED_JSON';
  version:'MISSING'|'SUPPORTED_6_1'|'OBSERVED_2023_21'|'OTHER_STRING'|'MALFORMED';
  success:'VALID'|'INVALID';
  account:'VALID'|'INVALID';
  currency:Field;
  credit:Field;
}
export function accountDiagnosticsAuthorized(tenant:string,provider:string,job:string,
  authorization=process.env.BHRU_LEGACY_ACCOUNT_DIAGNOSTICS,now=Date.now()){
  // Explicit empty string prevents falling back to the catalog authorization.
  return legacyMetadataDiagnosticsAuthorized(tenant,provider,job,authorization??'',now);
}
export function classifyAccountResponse(raw:string):AccountResponseDiagnostic{
  const result:AccountResponseDiagnostic={response:'JSON',version:'MISSING',success:'INVALID',
    account:'INVALID',currency:'MISSING',credit:'MISSING'};
  const prefix=raw.trimStart();
  if(/^(?:<!doctype\s+html\b|<html\b)/i.test(prefix))return {...result,response:'HTML'};
  if(/^<\?xml\b/i.test(prefix))return {...result,response:'XML'};
  let parsed:unknown;
  try{parsed=exactJson(raw);}catch{return {...result,response:'MALFORMED_JSON'};}
  let root:Record<string,any>;
  try{root=object(parsed);}catch{return result;}
  result.version=root.apiversion===undefined?'MISSING':root.apiversion==='6.1'?'SUPPORTED_6_1':
    root.apiversion==='2023.21'?'OBSERVED_2023_21':typeof root.apiversion==='string'?'OTHER_STRING':'MALFORMED';
  // ERROR precedence and pagination constraints remain part of a valid success envelope.
  if(root.ERROR!==undefined||!Array.isArray(root.SUCCESS)||root.SUCCESS.length!==1||
    ['page','pagination','next','next_page','has_more','cursor'].some(k=>k in root))return result;
  let item:Record<string,any>,info:Record<string,any>;
  try{item=object(root.SUCCESS[0]);}catch{return result;}
  result.success='VALID';
  try{info=object(item.AccoutInfo);}catch{return result;}
  result.account='VALID';
  const field=(value:unknown,validate:(value:unknown)=>unknown):Field=>{
    if(value===undefined)return 'MISSING';
    if(value===null)return 'NULL';
    try{validate(value);return 'VALID';}catch{return 'INVALID';}
  };
  result.currency=field(info.currency,currency);
  result.credit=field(info.credit,decimal);
  return result;
}
export function logAccountResponseDiagnostic(tenantId:string,providerId:string,jobId:string,d:AccountResponseDiagnostic){
  if(!accountDiagnosticsAuthorized(tenantId,providerId,jobId))return;
  // Copy only exact enum members; never spread an upstream/caller object into logs.
  if(!['JSON','HTML','XML','MALFORMED_JSON'].includes(d.response)||
    !['MISSING','SUPPORTED_6_1','OBSERVED_2023_21','OTHER_STRING','MALFORMED'].includes(d.version)||
    !['VALID','INVALID'].includes(d.success)||!['VALID','INVALID'].includes(d.account)||
    !['VALID','MISSING','NULL','INVALID'].includes(d.currency)||!['VALID','MISSING','NULL','INVALID'].includes(d.credit))return;
  logger.info({diagnosticCode:'LEGACY_ACCOUNT_RESPONSE_CLASSIFICATION',tenantId,providerId,jobId,
    response:d.response,version:d.version,success:d.success,account:d.account,currency:d.currency,credit:d.credit},
  'Authorized Legacy account response classification');
}
