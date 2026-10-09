import { Router } from 'express';
import { z } from '@workspace/api-zod';
import { subscriberContext } from '../lib/commerce/data';
import { transaction } from '../lib/platform';
import { HttpError } from '../lib/auth';
import { lockClient, financialSummary, mutateWallet, statement, audit } from '../lib/client-finance/wallet';
import { reconcileWallet } from '../lib/client-finance/reconciliation';
import { serviceRow, serviceView, listServices, saveService } from '../lib/client-finance/catalog';
import { listOrders, orderRow, orderView, transitionOrder } from '../lib/client-finance/orders';
import { randomUUID } from 'node:crypto';
import {pricingLock} from '../lib/client-finance/pricing';
const router=Router(),uuid=z.string().uuid();
router.get('/manual-services',async(req,res)=>res.json(await transaction(db=>listServices(subscriberContext(req).subscriber_id,req.query,db))));
router.post('/manual-services',async(req,res)=>res.status(201).json(await transaction(db=>saveService(subscriberContext(req).subscriber_id,undefined,req.body,db))));
router.get('/manual-services/:id',async(req,res)=>res.json(serviceView(await transaction(db=>serviceRow(subscriberContext(req).subscriber_id,uuid.parse(req.params.id),db)))));
router.patch('/manual-services/:id',async(req,res)=>res.json(await transaction(db=>saveService(subscriberContext(req).subscriber_id,uuid.parse(req.params.id),req.body,db))));
router.patch('/service-groups/:id',async(req,res)=>{
  const owner=subscriberContext(req),id=uuid.parse(req.params.id);
  const input=z.object({enabled:z.boolean()}).strict().parse(req.body);
  res.json(await transaction(async db=>{
    await pricingLock(owner.subscriber_id,db,true);
    const row=(await db.query('UPDATE manual_service_groups SET enabled=$3 WHERE subscriber_id=$1 AND id=$2 RETURNING id,name,enabled',
      [owner.subscriber_id,id,input.enabled])).rows[0];
    if(!row)throw new HttpError(404,'Service group not found.');
    return row;
  }));
});
for(const [path,table] of [['service-groups','manual_service_groups']] as const) {
  router.get(`/${path}`,async(req,res)=>{
    const owner=subscriberContext(req);
    res.json(await transaction(async db=>({data:(await db.query(`SELECT id,name${table==='manual_service_groups'?',enabled':''} FROM ${table} WHERE subscriber_id=$1 ORDER BY name`,[owner.subscriber_id])).rows})));
  });
  router.post(`/${path}`,async(req,res)=>{
    const owner=subscriberContext(req),input=z.object({name:z.string().trim().min(1).max(100)}).strict().parse(req.body);
    res.status(201).json(await transaction(async db=>(await db.query(`INSERT INTO ${table}(id,subscriber_id,name) VALUES($1,$2,$3) RETURNING id,name`,[randomUUID(),owner.subscriber_id,input.name])).rows[0]));
  });
}
router.get('/clients/:id/wallet',async(req,res)=>{
  const owner=subscriberContext(req),id=uuid.parse(req.params.id);
  res.json(await transaction(async db=>{await lockClient(owner.subscriber_id,id,db);return financialSummary(owner.subscriber_id,id,db);}));
});
router.get('/clients/:id/reconciliation',async(req,res)=>{
  const owner=subscriberContext(req),id=uuid.parse(req.params.id);
  res.json(await transaction(db=>reconcileWallet(owner.subscriber_id,id,db)));
});
router.post('/clients/:id/wallet',async(req,res)=>{
  const owner=subscriberContext(req),id=uuid.parse(req.params.id);
  res.json(await transaction(db=>mutateWallet(owner.subscriber_id,id,req.body,owner.id,db)));
});
router.get('/clients/:id/statement',async(req,res)=>{
  const owner=subscriberContext(req),id=uuid.parse(req.params.id);
  res.json(await transaction(async db=>{await lockClient(owner.subscriber_id,id,db);return statement(owner.subscriber_id,id,req.query,db,true);}));
});
router.get('/service-orders',async(req,res)=>res.json(await transaction(db=>listOrders(subscriberContext(req).subscriber_id,req.query,db))));
router.get('/service-orders/:id',async(req,res)=>res.json(orderView(await transaction(db=>orderRow(subscriberContext(req).subscriber_id,uuid.parse(req.params.id),db)),true)));
router.put('/service-orders/:id',async(req,res)=>{
  const owner=subscriberContext(req),id=uuid.parse(req.params.id);
  res.json(await transaction(db=>transitionOrder(owner.subscriber_id,id,req.body,owner.id,db)));
});
export default router;
