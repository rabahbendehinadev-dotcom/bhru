import {ProviderError,safeLegacyRead} from './transport';
import {legacyRejection} from './legacy-diagnostics';
import {unknownLegacyKeys,sanitizeLegacyMetadataKeys} from './legacy-metadata-diagnostics';
import {exactJson,object,text,currency,decimal,hashValue,type ReadOnlyAdapter,type CatalogItem} from './adapter';

// Protocol reference: dhru-fusion-api-standards-master/api/index.php (v6.1).
// Its auth/credit helpers are demo stubs, not evidence of a real connection.
function success(raw:string){
  const prefix=raw.trimStart();
  if(/^(?:<!doctype\s+html\b|<html\b)/i.test(prefix))
    throw new ProviderError('INVALID_RESPONSE',false,'UNEXPECTED_HTML');
  if(/^<\?xml\b/i.test(prefix))
    throw new ProviderError('INVALID_RESPONSE',false,'UNEXPECTED_XML');
  let parsed:unknown;
  try{parsed=exactJson(raw);}catch{
    throw new ProviderError('INVALID_RESPONSE',false,'MALFORMED_JSON');
  }
  const root=object(parsed);
  if(root.ERROR!==undefined){
    if(!Array.isArray(root.ERROR)||!root.ERROR.length)throw new ProviderError('INVALID_RESPONSE');
    const messages=root.ERROR.map(e=>{
      const v=object(e),message=v.MESSAGE??v.message;
      return message;
    });
    const reason=legacyRejection(messages);
    throw new ProviderError(reason==='AUTHENTICATION_REJECTED'||reason==='IP_RESTRICTED'?'AUTHENTICATION_FAILED':'INVALID_RESPONSE',false,reason);
  }
  if(root.apiversion!==undefined&&root.apiversion!=='6.1')throw new ProviderError('INVALID_RESPONSE');
  if(!Array.isArray(root.SUCCESS)||root.SUCCESS.length!==1)throw new ProviderError('INVALID_RESPONSE');
  if(['page','pagination','next','next_page','has_more','cursor'].some(k=>k in root))throw new ProviderError('INVALID_RESPONSE');
  return object(root.SUCCESS[0]);
}
async function withLegacySchema<T>(operation:()=>Promise<T>):Promise<T>{
  try{return await operation();}catch(e){
    if(e instanceof ProviderError&&e.category==='INVALID_RESPONSE'&&!e.diagnosticCode)
      throw new ProviderError(e.category,e.retryable,'UNEXPECTED_RESPONSE_SCHEMA');
    throw e;
  }
}
function optionalText(v:unknown,max:number){return v===undefined||v===null?'':text(v,max);}
function requiredFlag(v:unknown):boolean|null{
  if(v==='1'||v===true)return true;
  if(v==='0'||v===false)return false;
  return null;
}
function requirements(p:Record<string,any>){
  const review:string[]=[],fields:Record<string,unknown>[]=[],seen=new Set<string>();
  const add=(label:string,type:string,required:boolean,options?:string[])=>{
    const key=label.toLowerCase().replace(/[^a-z0-9_]+/g,'_');
    if(!/^[a-z][a-z0-9_]{0,31}$/.test(key)||['constructor','prototype'].includes(key)||seen.has(key)||fields.length>=12){
      review.push('Legacy requirement key or count needs review.');return;
    }
    seen.add(key);fields.push({key,label,type,required,...(options?{options}:{})});
  };
  for(const key of Object.keys(p).filter(k=>k.startsWith('Requires.')&&k!=='Requires.Custom')){
    const v=p[key];
    if(v===''||v==='None'||v==='0'||v===false)continue;
    if(v!=='Required'){review.push('Unknown Legacy requirement flag.');continue;}
    if(key==='Requires.SN')add('Serial Number','reference',true);
    else if(key==='Requires.Reference')add('Reference','reference',true);
    else review.push('Legacy requirement needs options or validation not supplied by the reference.');
  }
  const custom=p['Requires.Custom'];
  if(custom!==undefined){
    if(!Array.isArray(custom)||custom.length>12)review.push('Unsupported Legacy custom field structure or count.');
    else for(const raw of custom){
      const f=object(raw),label=text(f.fieldname??'',100),required=requiredFlag(f.required);
      const type={text:'text',textarea:'textarea',dropdown:'select'}[String(f.fieldtype) as 'text'|'textarea'|'dropdown'];
      const description=optionalText(f.description,1000),optionsRaw=optionalText(f.fieldoptions,6000);
      if(required===null||!label||!type||description||
        f.type!==undefined&&f.type!=='serviceimei'||
        Object.keys(f).some(k=>!['type','fieldname','fieldtype','description','fieldoptions','required'].includes(k))){
        review.push('Legacy custom field has unsupported type, constraints or metadata.');continue;
      }
      let options:string[]|undefined;
      if(type==='select'){
        options=optionsRaw.split(',').map(s=>s.trim());
        if(options.length>50||options.some(s=>!s||s.length>100)||new Set(options).size!==options.length){
          review.push('Legacy dropdown options need review.');continue;
        }
      }else if(optionsRaw){review.push('Unexpected Legacy field options.');continue;}
      add(label,type,required,options);
    }
  }
  // Quantity pricing/primary order inputs are not guessed from family names.
  if(p.QNT==='1'||p.QNT!==undefined&&!['0',''].includes(String(p.QNT))||
    ['QNTOPTIONS','MINQNT','MAXQNT'].some(k=>p[k]!==undefined&&p[k]!==''&&p[k]!=='0'))
    review.push('Legacy quantity requirements/pricing are unsupported in this read-only slice.');
  return {fields,review:[...new Set(review)]};
}
export const legacyAdapter:ReadOnlyAdapter={
  async account(base,credentials,read){
    return withLegacySchema(async()=>{
    const result=success(await (read??safeLegacyRead)(base,credentials,'accountinfo'));
    const info=object(result.AccoutInfo); // Misspelling is part of the official contract.
    return {currency:info.currency===undefined||info.currency===null?null:currency(info.currency),
      balance:info.credit===undefined||info.credit===null?null:decimal(info.credit).text};
    });
  },
  async catalog(base,credentials,read,onUnknownMetadata){
    return withLegacySchema(async()=>{
    // The list contains no currency. Obtain it from a verified account request first.
    const account=await legacyAdapter.account(base,credentials,read);
    if(!account.currency)throw new ProviderError('INVALID_RESPONSE');
    const c=account.currency,result=success(await (read??safeLegacyRead)(base,credentials,'imeiservicelist'));
    const groups=object(result.LIST),items:CatalogItem[]=[],ids=new Set<string>();
    if(Object.keys(groups).length>20000)throw new ProviderError('INVALID_RESPONSE');
    for(const [groupId,value] of Object.entries(groups)){
      const group=object(value),groupName=text(group.GROUPNAME,100),services=object(group.SERVICES);
      if(!groupId||groupId.length>128)throw new ProviderError('INVALID_RESPONSE');
      for(const [mapId,raw] of Object.entries(services)){
        const p=object(raw),id=text(p.SERVICEID,128),name=text(p.SERVICENAME,160);
        if(!id||id!==mapId||!name||ids.has(id)||items.length>=20000)throw new ProviderError('INVALID_RESPONSE');
        ids.add(id);
        const cost=decimal(p.CREDIT),time=optionalText(p.TIME,100),info=optionalText(p.INFO,10000);
        const type=p.SERVICETYPE??group.GROUPTYPE;
        // IMEI/SERVER are demonstrated; REMOTE is explicitly named by reference comments.
        const serviceType=({IMEI:'imei',SERVER:'server',REMOTE:'remote'} as Record<string,string>)[String(type)]??null;
        const f=requirements(p),reviewReasons=[...f.review];
        if(!serviceType)reviewReasons.push('Unknown Legacy service type; File is not documented.');
        if(group.GROUPTYPE!==undefined&&p.SERVICETYPE!==undefined&&group.GROUPTYPE!==p.SERVICETYPE)
          reviewReasons.push('Legacy group and service types disagree.');
        const unknown=unknownLegacyKeys(p);
        if(unknown.length){
          reviewReasons.push('Undocumented Legacy service metadata needs review.');
          onUnknownMetadata?.(id,sanitizeLegacyMetadataKeys(unknown));
        }
        // Hash only: unknown upstream values may contain sensitive content; never persist raw extras.
        const snapshot={name,type,cid:groupId,cids:[groupId],categoryName:groupName,cost:cost.text,currency:c,time,
          description:info,fields:f.fields,definitionHash:hashValue(p),availability:null,reviewReasons};
        items.push({upstreamId:id,name,serviceType,categoryId:groupId,categoryName:groupName,costUnits:cost.units,
          currency:c,estimatedTime:time,requirements:f.fields,availability:null,reviewReasons,snapshot,hash:hashValue(snapshot)});
      }
    }
    return {currency:c,items};
    });
  },
};
