import {HttpError} from '../auth';
export interface GatewayField {key:string;label:string;secret:boolean;required:boolean}
/** Common configuration contract, combined with each trusted definition's
 * credential whitelist, currency/method capabilities and fee policy. */
export const GATEWAY_CONFIGURATION_SCHEMA={
  type:'object',additionalProperties:false,required:['enabled','instructions','currencyRules'],
  properties:{
    enabled:{type:'boolean'},instructions:{type:'string',maxLength:1000},
    currencyRules:{type:'array',maxItems:30,items:{type:'object',additionalProperties:false,
      required:['currency','minimum','maximum','feeBps','fixedFee'],properties:{
        currency:{type:'string',pattern:'^[A-Z]{3}$'},minimum:{type:'string'},maximum:{type:'string'},
        feeBps:{type:'integer',minimum:0,maximum:10000},fixedFee:{type:'string'},
      }}},
    credentials:{type:'object',writeOnly:true,additionalProperties:{type:'string',minLength:1,maxLength:4096}},
  },
} as const;
export interface VerifiedCallback {
  fundingId:string;providerReference:string;eventId:string;
  merchantScope:string;amountMinor:string;currency:string;status:'PAID'|'FAILED'|'PENDING';
  occurredAt:string;
}
/** An adapter is trusted code, never an uploaded plugin or request-supplied function.
 * verifyCallback MUST authenticate the raw callback, merchant and provider transaction.
 * A browser redirect is not a callback. Slice 5A registers no adapters.
 */
export interface GatewayAdapter {
  merchantScope(credentials:Readonly<Record<string,string>>):Promise<string>;
  verifyCallback(raw:Buffer,headers:Readonly<Record<string,string>>,credentials:Readonly<Record<string,string>>):Promise<VerifiedCallback>;
  validateCredentials(credentials:Readonly<Record<string,string>>):Promise<boolean>;
}
export interface GatewayDefinition {
  code:string;displayName:string;description:string;supportedCurrencies:string[];supportedMethods:string[];
  automaticConfirmationSupported:boolean;webhookSupported:boolean;requiredCredentials:GatewayField[];
  configurationFields:GatewayField[];integrationStatus:'AVAILABLE'|'NOT_IMPLEMENTED'|'DISABLED';
  configurationSchema:typeof GATEWAY_CONFIGURATION_SCHEMA;
  version:string;feesSupported:boolean;adapter?:GatewayAdapter;
}
const planned=(code:string,displayName:string):GatewayDefinition=>Object.freeze({
  code,displayName,description:'Planned integration. No provider adapter, API or payment processing is installed.',
  supportedCurrencies:[],supportedMethods:[],automaticConfirmationSupported:false,webhookSupported:false,
  requiredCredentials:[],configurationFields:[],configurationSchema:GATEWAY_CONFIGURATION_SCHEMA,integrationStatus:'NOT_IMPLEMENTED',version:'0.0.0',feesSupported:false,
});
// Metadata intentionally does not invent provider currencies, credentials or API details.
export const gatewayDefinitions:readonly GatewayDefinition[]=Object.freeze([
  planned('paypal','PayPal'),planned('cryptomus','Cryptomus'),planned('usdt_portal','USDT Portal'),
]);
export function gateway(code:string){const d=gatewayDefinitions.find(g=>g.code===code);if(!d)throw new HttpError(404,'Gateway not installed.');return d;}
export function implemented(d:GatewayDefinition){return d.integrationStatus==='AVAILABLE'&&!!d.adapter;}
export function operational(d:GatewayDefinition){if(!implemented(d))throw new HttpError(409,'Gateway is not integrated. No payment can be processed.');return d;}
