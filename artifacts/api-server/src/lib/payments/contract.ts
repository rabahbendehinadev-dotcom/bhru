import {z} from '@workspace/api-zod';
/** Provider-specific protocols remain trusted adapter code, never configuration. */
export interface PaymentCapabilities {
  createPayment:boolean; idempotentCreation:boolean; statusLookup:boolean;
  webhookVerification:boolean; cancelPayment:boolean; refundPayment:boolean;
}
export interface PaymentCreation {
  fundingId:string; idempotencyKey:string; merchantScope:string; amountMinor:string;
  currency:string; method:string; expiresAt:string; callbackPath:string;
}
export interface PaymentLookup extends PaymentCreation {providerReference:string|null}
export const normalizedEvent=z.object({
  fundingId:z.string().uuid(),providerReference:z.string().min(1).max(180),eventId:z.string().min(1).max(180),
  merchantScope:z.string().min(1).max(180),amountMinor:z.string().regex(/^(0|[1-9]\d{0,18})$/),
  currency:z.string().regex(/^[A-Z]{3}$/),status:z.enum(['PAID','FAILED','PENDING']),
  occurredAt:z.string().datetime({offset:true}),
}).strict();
export const providerPayment=z.object({
  providerReference:z.string().min(1).max(180),merchantScope:z.string().min(1).max(180),
  amountMinor:z.string().regex(/^[1-9]\d{0,18}$/),currency:z.string().regex(/^[A-Z]{3}$/),
  expiresAt:z.string().datetime({offset:true}),
  paymentUrl:z.string().url().max(2000).nullable(),paymentAddress:z.string().min(1).max(256).nullable(),
  instructions:z.string().max(1000),metadata:z.record(z.string(),z.string().max(256)).default({}),
}).strict();
export type ProviderPayment=z.infer<typeof providerPayment>;
export type ProviderStatus={state:'FOUND';event:z.infer<typeof normalizedEvent>;payment?:ProviderPayment}|{state:'NOT_FOUND'|'UNKNOWN'};
export const providerStatus=z.discriminatedUnion('state',[
  z.object({state:z.literal('FOUND'),event:normalizedEvent,payment:providerPayment.optional()}).strict(),
  z.object({state:z.literal('NOT_FOUND')}).strict(),z.object({state:z.literal('UNKNOWN')}).strict(),
]);
export interface PaymentOperations {
  capabilities:Readonly<PaymentCapabilities>;
  checkoutHosts:readonly string[];
  metadataKeys:readonly string[];
  validateConfiguration?(credentials:Readonly<Record<string,string>>,signal:AbortSignal):Promise<boolean>;
  createPayment?(input:PaymentCreation,credentials:Readonly<Record<string,string>>,signal:AbortSignal):Promise<ProviderPayment>;
  getPaymentStatus?(input:PaymentLookup,credentials:Readonly<Record<string,string>>,signal:AbortSignal):Promise<ProviderStatus>;
  /** Authentication MUST succeed before normalization. No generic signature exists. */
  verifyWebhook?(raw:Buffer,headers:Readonly<Record<string,string>>,credentials:Readonly<Record<string,string>>,signal:AbortSignal):Promise<void>;
  normalizeWebhookEvent?(raw:Buffer,credentials:Readonly<Record<string,string>>):Promise<z.infer<typeof normalizedEvent>>;
  cancelPayment?(input:PaymentLookup,credentials:Readonly<Record<string,string>>,signal:AbortSignal):Promise<void>;
  refundPayment?(input:PaymentLookup,credentials:Readonly<Record<string,string>>,signal:AbortSignal):Promise<void>;
  getSupportedCurrencies?():readonly string[];
}
/** Bounded even if a defective adapter ignores AbortSignal. No transaction spans this call. */
export async function providerCall<T>(fn:(signal:AbortSignal)=>Promise<T>):Promise<T>{
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>;
  const timeout=new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('PROVIDER_TIMEOUT'));},15000);});
  try{return await Promise.race([fn(controller.signal),timeout]);}finally{clearTimeout(timer!);}
}
