import {createHash} from 'node:crypto';
import {parseUsd} from '../commerce/currency-money';
import {ProviderError,safeRead} from './transport';
import {legacyAdapter} from './legacy-adapter';
export type ReadTransport=(base:string,token:string,path:'account'|'products'|'accountinfo'|'imeiservicelist')=>Promise<string>;
export type ProviderProtocol='fusion_rest'|'DHRU_FUSION_LEGACY_V61'|'simple_listener';
export interface CatalogItem{
  upstreamId:string;name:string;serviceType:string|null;categoryId:string|null;categoryName:string|null;
  costUnits:string;currency:string;estimatedTime:string;requirements:Record<string,unknown>[];
  availability:boolean|null;reviewReasons:string[];snapshot:Record<string,unknown>;hash:string;
}
export interface ReadOnlyAdapter{
  account(base:string,token:string,read?:ReadTransport):Promise<{currency:string|null;balance:string|null}>;
  catalog(base:string,token:string,read?:ReadTransport):Promise<{currency:string;items:CatalogItem[]}>;
}
/** Quote JSON numeric tokens before parsing, never round upstream money through Number. */
export function exactJson(raw:string):unknown{
  let out='',quoted=false,escape=false;
  for(let i=0;i<raw.length;i++){
    const c=raw[i]!;
    if(quoted){out+=c;if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;continue;}
    if(c==='"'){quoted=true;out+=c;continue;}
    if(c==='-'||c>='0'&&c<='9'){
      const token=raw.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)?.[0];
      if(!token)throw new ProviderError('INVALID_RESPONSE');
      out+=JSON.stringify(token);i+=token.length-1;
    }else out+=c;
  }
  try{return JSON.parse(out);}catch{throw new ProviderError('INVALID_RESPONSE');}
}
export function object(value:unknown):Record<string,any>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new ProviderError('INVALID_RESPONSE');
  return value as Record<string,any>;
}
export function text(value:unknown,max:number){
  if(typeof value!=='string'||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))throw new ProviderError('INVALID_RESPONSE');
  return value;
}
export function currency(value:unknown){const c=text(value,3);if(!/^[A-Z]{3}$/.test(c))throw new ProviderError('INVALID_RESPONSE');return c;}
export function decimal(value:unknown){
  const s=text(value,32);
  try{return {text:s,units:parseUsd(s).toString()};}catch{throw new ProviderError('INVALID_RESPONSE');}
}
function envelope(raw:string){
  const root=object(exactJson(raw)),code=String(root.code);
  if(['pagination','next','next_page','has_more','cursor','links'].some(k=>k in root))throw new ProviderError('INVALID_RESPONSE');
  if(root.status!=='success'||!/^2\d\d$/.test(code)){
    if(['401','402','403'].includes(code))throw new ProviderError('AUTH_FAILED');
    throw new ProviderError('INVALID_RESPONSE');
  }
  return object(root.data);
}
export function hashValue(value:unknown):string{
  const sort=(v:any):any=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'
    ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
  return createHash('sha256').update(JSON.stringify(sort(value))).digest('hex');
}
function fields(raw:unknown){
  const reasons:string[]=[],requirements:Record<string,unknown>[]=[],source:Record<string,unknown>[]=[];
  if(raw===undefined)return {reasons,requirements,source};
  if(!Array.isArray(raw)||raw.length>12)return {reasons:['Unsupported requirement structure or field count.'],requirements,source};
  const keys=new Set<string>();
  for(const value of raw){
    const f=object(value);
    const supported=['text','textarea','number','select','imei','reference'].includes(f.type);
    const name=text(f.name??f.label??'',100),label=text(f.label??name,100);
    const fieldKey=typeof f.key==='string'?f.key:name.toLowerCase().replace(/[^a-z0-9_]+/g,'_');
    const safe:Record<string,unknown>={name,label,key:fieldKey,type:typeof f.type==='string'?text(f.type,40):null,required:f.required===true,
      definitionHash:hashValue(f)};
    if(f.options!==undefined){
      if(!Array.isArray(f.options)||f.options.length>50||f.options.some((x:any)=>typeof x!=='string'||!x.length||x.length>100))
        reasons.push('Unsupported choice metadata.');
      else safe.options=f.options;
    }
    source.push(safe);
    if(!supported||typeof f.required!=='boolean'||!label||!name||
      !/^[a-z][a-z0-9_]{0,31}$/.test(fieldKey)||['constructor','prototype'].includes(fieldKey)||keys.has(fieldKey)||
      Object.keys(f).some(k=>!['name','label','key','type','required','options'].includes(k))||
      f.type==='select'&&(!Array.isArray(safe.options)||!safe.options.length||new Set(safe.options).size!==safe.options.length)||
      f.type!=='select'&&f.options!==undefined){
      reasons.push('Requirement needs manual review; unsupported type, validation, key or choices.');continue;
    }
    keys.add(fieldKey);
    requirements.push({key:fieldKey,label,type:f.type,required:f.required,...(f.type==='select'?{options:safe.options}:{})});
  }
  return {reasons:[...new Set(reasons)],requirements,source};
}
const rest:ReadOnlyAdapter={
  async account(base,token,read){
    const data=envelope(await (read??safeRead)(base,token,'account'));
    return {currency:currency(data.currency),balance:decimal(data.balance).text};
  },
  async catalog(base,token,read){
    const data=envelope(await (read??safeRead)(base,token,'products')),c=currency(data.currency);
    const categories=object(data.categories),products=object(data.products),entries=Object.entries(products);
    if(entries.length>20000||Object.keys(categories).length>20000)throw new ProviderError('INVALID_RESPONSE');
    // No paging contract was supplied. Never interpret a paged result as a complete catalog.
    if(['page','pagination','meta','next','next_page','has_more','hasMore','cursor','links'].some(k=>k in data)||
      'total' in data&&String(entries.length)!==String(data.total))throw new ProviderError('INVALID_RESPONSE');
    for(const cat of Object.values(categories)){const value=object(cat);text(value.name,100);if(value.type!==undefined)text(value.type,40);}
    const items=entries.map(([id,raw]):CatalogItem=>{
      const p=object(raw),name=text(p.name,160);
      if(!id||id.length>128||!name)throw new ProviderError('INVALID_RESPONSE');
      const cost=decimal(p.price),time=text(p.time??'',100);
      if(p.cids!==undefined&&(!Array.isArray(p.cids)||p.cids.length>50))throw new ProviderError('INVALID_RESPONSE');
      const cids=(p.cids??[]).map((v:unknown)=>text(v,128));
      const cid=p.cid===undefined?cids[0]??null:text(p.cid,128),category=cid?categories[cid]:null;
      const type=p.type??category?.type;
      const serviceType=['imei','server','file','remote'].includes(type)?type:null;
      const f=fields(p.fields),reviewReasons=[...f.reasons];
      if(!serviceType)reviewReasons.push('Unknown or missing service type.');
      if(cid&&!category)reviewReasons.push('Category is not present in the complete response.');
      let availability:boolean|null=null;
      if(typeof p.enabled==='boolean')availability=p.enabled;
      else if(typeof p.active==='boolean')availability=p.active;
      if(typeof p.status==='string'){
        if(['inactive','disabled'].includes(p.status.toLowerCase()))availability=false;
        else if(!['active','enabled'].includes(p.status.toLowerCase()))reviewReasons.push('Unknown availability state.');
      }
      if('enabled' in p&&typeof p.enabled!=='boolean'||'active' in p&&typeof p.active!=='boolean')
        reviewReasons.push('Unsupported availability metadata.');
      const snapshot={name,type:type??null,cid,cids,categoryName:category?.name??null,cost:cost.text,currency:c,time,
        fields:f.source,availability,reviewReasons};
      return {upstreamId:id,name,serviceType,categoryId:cid,categoryName:category?.name??null,costUnits:cost.units,
        currency:c,estimatedTime:time,requirements:f.requirements,availability,reviewReasons,snapshot,hash:hashValue(snapshot)};
    });
    return {currency:c,items};
  },
};
export const providerProtocols=[
  {code:'fusion_rest',name:'DHRU Fusion Pro REST',available:true,reason:null},
  {code:'DHRU_FUSION_LEGACY_V61',name:'DHRU Fusion Legacy v6.1',available:true,reason:null},
  {code:'simple_listener',name:'Fusion Pro Simple Listener',available:false,reason:'Not implemented: distinct supplier-side protocol.'},
] as const;
export function providerAdapter(protocol:string):ReadOnlyAdapter{
  if(protocol==='fusion_rest')return rest;
  if(protocol==='DHRU_FUSION_LEGACY_V61')return legacyAdapter;
  throw new ProviderError('UNSUPPORTED_PROVIDER');
}
