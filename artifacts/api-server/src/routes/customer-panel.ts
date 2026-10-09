import { Router, json } from 'express';
import { z } from '@workspace/api-zod';
import { HttpError } from '../lib/auth';
import { transaction } from '../lib/platform';
import { customerContext, customerCsrf } from '../lib/customer-auth/service';
import { financialSummary, statement, lockClient } from '../lib/client-finance/wallet';
import { listServices, serviceRow, serviceView } from '../lib/client-finance/catalog';
import {effectivePrice} from '../lib/client-finance/pricing';
import { displayCurrency } from '../lib/client-finance/wallet';
import { listOrders, orderRow, orderView, orderSummary, quoteService, purchaseService, InsufficientBalance } from '../lib/client-finance/orders';
import { effectiveCustomerProfile } from '../lib/customer-auth/profile';
import { customerAnnouncements } from '../lib/customer-auth/announcements';
import {customerSecurity,changePassword,revokeSession} from '../lib/customer-auth/security';
import {listFunding,fundingRow,fundingView,createFunding,cancelFunding} from '../lib/payments/funding';
import {eligibleGateways,quoteFunding} from '../lib/payments/quote';
import {initiateFunding} from '../lib/payments/initiation';
const router=Router({mergeParams:true}),uuid=z.string().uuid();
router.use(json({limit:'64kb'}));
router.use((req,_res,next)=>{
  const {customer}=customerContext(req);
  if(!customer)throw new HttpError(401,'Sign in to access your client panel.');
  if(!['GET','HEAD'].includes(req.method))customerCsrf(req);
  next();
});
const identity=(req:Parameters<typeof customerContext>[0])=>{
  const {tenant,customer}=customerContext(req);return {sub:tenant.id,id:customer!.id};
};
router.get('/funding/gateways',async(req,res)=>{
  const {sub,id}=identity(req);res.json(await transaction(db=>eligibleGateways(sub,id,db)));
});
router.post('/funding/quote',async(req,res)=>{
  const {sub,id}=identity(req);res.json(await transaction(async db=>{
    await lockClient(sub,id,db,true);const {input:_input,snapshot:_snapshot,...quote}=await quoteFunding(sub,id,req.body,db);return quote;
  }));
});
router.get('/funding',async(req,res)=>{
  const {sub,id}=identity(req);res.json(await transaction(db=>listFunding(sub,db,id,req.query.page??'1')));
});
router.post('/funding',async(req,res)=>{
  const {sub,id}=identity(req);res.status(201).json(await transaction(db=>createFunding(sub,id,req.body,db)));
});
router.post('/funding/initiate',async(req,res)=>{
  const {sub,id}=identity(req);res.status(202).json(await initiateFunding(sub,id,req.body));
});
router.get('/funding/:id',async(req,res)=>{
  const {sub,id}=identity(req),requestId=uuid.parse(req.params.id);
  res.json(await transaction(async db=>fundingView(await fundingRow(sub,requestId,db,id),db)));
});
router.post('/funding/:id/cancel',async(req,res)=>{
  const {sub,id}=identity(req),requestId=uuid.parse(req.params.id);z.object({}).strict().parse(req.body);
  res.json(await transaction(db=>cancelFunding(sub,id,requestId,db)));
});
router.get('/',async(req,res)=>{
  const {sub,id}=identity(req),{customer,tenant}=customerContext(req);
  res.json(await transaction(async db=>({
    financial:await financialSummary(sub,id,db),orderSummary:await orderSummary(sub,db,id),
    recentOrders:(await listOrders(sub,{page:1},db,id)).data.slice(0,5),
    profile:await effectiveCustomerProfile(customer!,db),
    announcements:await customerAnnouncements(sub,db,tenant.customRoot?'/':`/${tenant.slug}`),
  })));
});
router.get('/announcements',async(req,res)=>{
  const {sub}=identity(req),{tenant}=customerContext(req);
  res.json({data:await transaction(db=>customerAnnouncements(sub,db,tenant.customRoot?'/':`/${tenant.slug}`))});
});
router.get('/services',async(req,res)=>{const {sub,id}=identity(req);res.json(await transaction(db=>listServices(sub,req.query,db,id)));});
router.get('/services/:id',async(req,res)=>{
  const {sub,id}=identity(req),service=uuid.parse(req.params.id);
  res.json(await transaction(async db=>{
    const row=await serviceRow(sub,service,db,true),currency=await displayCurrency(sub,id,db,req.query.currency?z.string().regex(/^[A-Z]{3}$/).parse(req.query.currency):undefined);
    return serviceView(row,currency,(await effectivePrice(sub,id,row,db,currency)).view);
  }));
});
router.post('/quote',async(req,res)=>{const {sub,id}=identity(req);res.json(await transaction(db=>quoteService(sub,id,req.body,db)));});
router.get('/orders',async(req,res)=>{const {sub,id}=identity(req);res.json(await transaction(db=>listOrders(sub,req.query,db,id)));});
router.get('/orders/:id',async(req,res)=>{const {sub,id}=identity(req);res.json(orderView(await transaction(db=>orderRow(sub,uuid.parse(req.params.id),db,id))));});
router.post('/orders',async(req,res)=>{
  const {sub,id}=identity(req);
  try {res.status(201).json(await transaction(db=>purchaseService(sub,id,req.body,db)));}
  catch(error) {
    if(error instanceof InsufficientBalance){res.status(409).json({error:error.message,code:'INSUFFICIENT_BALANCE',...error.details});return;}
    throw error;
  }
});
router.get('/statement',async(req,res)=>{const {sub,id}=identity(req);res.json(await transaction(db=>statement(sub,id,req.query,db)));});
router.get('/security',async(req,res)=>res.json(await customerSecurity(req)));
router.post('/security/password',async(req,res)=>res.json(await changePassword(req)));
router.post('/security/sessions/revoke-others',async(req,res)=>res.json(await revokeSession(req)));
router.post('/security/sessions/:session/revoke',async(req,res)=>res.json(await revokeSession(req,z.string().uuid().parse(req.params.session))));
export default router;
