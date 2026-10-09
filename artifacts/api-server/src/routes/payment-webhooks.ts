import {Router,raw} from 'express';
import {z} from '@workspace/api-zod';
import {HttpError} from '../lib/auth';
import {transaction} from '../lib/platform';
import {gateway,operational} from '../lib/payments/registry';
import {verifyGatewayCallback,AuthenticatedWebhookMismatch} from '../lib/payments/verification';
import {enqueueVerified,enqueueMerchantReview} from '../lib/payments/queue';
export const paymentWebhookRouter=Router();
// Narrow provider route only: no owner/customer session or CSRF bypass elsewhere.
paymentWebhookRouter.post('/api/payments/webhooks/:code/:binding',(_req,res,next)=>{res.set('Cache-Control','no-store');next();},
  (req,_res,next)=>{
    const d=operational(gateway(z.string().regex(/^[a-z][a-z0-9_]{1,50}$/).parse(req.params.code)));
    if(!d.adapter?.capabilities?.webhookVerification||!d.adapter.verifyWebhook||!d.adapter.normalizeWebhookEvent)
      throw new HttpError(409,'Authenticated callbacks are not implemented for this gateway.');
    next();
  },raw({type:()=>true,limit:'256kb',inflate:false}),async(req,res)=>{
    const code=z.string().parse(req.params.code),binding=z.string().uuid().parse(req.params.binding);
    const config=await transaction(async db=>(await db.query('SELECT subscriber_id FROM reseller_payment_gateways WHERE gateway_code=$1 AND callback_binding=$2',[code,binding])).rows[0]);
    if(!config)throw new HttpError(404,'Callback binding not found.');
    const headers=Object.fromEntries(Object.entries(req.headers).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
    if(!Buffer.isBuffer(req.body))throw new HttpError(400,'Raw callback body required.');
    let proof;
    try{proof=await verifyGatewayCallback(config.subscriber_id,code,req.body,headers);}
    catch(error){
      if(!(error instanceof AuthenticatedWebhookMismatch))throw error;
      const accepted=await transaction(db=>enqueueMerchantReview(error,db));
      res.status(202).json({received:true,authenticated:true,queued:true,duplicate:accepted.duplicate,reviewRequired:true});return;
    }
    const accepted=await transaction(db=>enqueueVerified(proof,db));
    // Durable receipt acknowledgement, NOT settlement/payment success.
    res.status(202).json({received:true,authenticated:true,queued:true,duplicate:accepted.duplicate});
  });
