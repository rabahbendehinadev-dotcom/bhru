import {Router} from 'express';
import {z} from '@workspace/api-zod';
import {requireAdmin,HttpError} from '../lib/auth';
import {subscriberContext} from '../lib/commerce/data';
import {transaction,audit} from '../lib/platform';
import {gateway} from '../lib/payments/registry';
import {listGateways,policy,gatewayView,configureGateway,validateGateway} from '../lib/payments/catalog';
import {listFunding,fundingRow,fundingView} from '../lib/payments/funding';
import {paymentMonitoring,reconcileFunding,listPaymentReviews} from '../lib/payments/monitoring';
const router=Router(),codeInput=z.string().regex(/^[a-z][a-z0-9_]{1,50}$/),uuid=z.string().uuid();
router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
router.get('/admin/payment-gateways',async(req,res)=>{
  requireAdmin(req);res.json(await transaction(db=>listGateways(db)));
});
router.get('/admin/payment-monitoring',async(req,res)=>{
  requireAdmin(req);res.json(await transaction(paymentMonitoring));
});
router.patch('/admin/payment-gateways/:code',async(req,res)=>{
  const admin=requireAdmin(req),code=codeInput.parse(req.params.code);gateway(code);
  const input=z.object({globalEnabled:z.boolean(),resellerAvailable:z.boolean()}).strict().parse(req.body);
  res.json(await transaction(async db=>{
    await policy(code,db);
    const p=(await db.query('UPDATE payment_gateway_policies SET global_enabled=$2,reseller_available=$3,updated_at=now() WHERE gateway_code=$1 RETURNING *',[code,input.globalEnabled,input.resellerAvailable])).rows[0];
    await audit(db,admin,'Payment gateway availability updated','payment_gateway',code,gateway(code).displayName);
    return gatewayView(code,p);
  }));
});
router.get('/payment-gateways',async(req,res)=>{
  const owner=subscriberContext(req);res.json(await transaction(db=>listGateways(db,owner.subscriber_id)));
});
router.put('/payment-gateways/:code',async(req,res)=>{
  const owner=subscriberContext(req),code=codeInput.parse(req.params.code);
  res.json(await transaction(async db=>{
    const view=await configureGateway(owner.subscriber_id,code,req.body,db);
    await audit(db,owner,'Payment gateway configuration updated','payment_gateway',code,gateway(code).displayName);return view;
  }));
});
router.post('/payment-gateways/:code/validate',async(req,res)=>{
  const owner=subscriberContext(req),code=codeInput.parse(req.params.code);z.object({}).strict().parse(req.body);
  res.json(await validateGateway(owner.subscriber_id,code));
});
router.get('/funding-requests',async(req,res)=>{
  const owner=subscriberContext(req);res.json(await transaction(db=>listFunding(owner.subscriber_id,db,undefined,req.query.page??'1',req.query.filter??'ALL')));
});
router.get('/payment-reviews',async(req,res)=>{
  const owner=subscriberContext(req);res.json(await transaction(db=>listPaymentReviews(owner.subscriber_id,db,req.query.page??'1')));
});
router.get('/funding-requests/:id/reconciliation',async(req,res)=>{
  const owner=subscriberContext(req),id=uuid.parse(req.params.id);res.json(await transaction(db=>reconcileFunding(owner.subscriber_id,id,db)));
});
router.get('/funding-requests/:id',async(req,res)=>{
  const owner=subscriberContext(req),id=uuid.parse(req.params.id);
  res.json(await transaction(async db=>fundingView(await fundingRow(owner.subscriber_id,id,db),db,true)));
});
// No gateway-creation, browser-confirmation, manual mark-paid or universal webhook endpoint.
export default router;
