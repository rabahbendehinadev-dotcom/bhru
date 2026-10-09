import { Router } from 'express';
import { z } from '@workspace/api-zod';
import { subscriberContext } from '../lib/commerce/data';
import { transaction } from '../lib/platform';
import { listClients, clientDetail, updateClientProfile, changeClientStatus, addClientNote } from '../lib/customer-auth/clients';
import { listActivity } from '../lib/customer-auth/activity';
import {securityView,forceLogout} from '../lib/customer-auth/security';

const router=Router();
const uuid=z.string().uuid();
const query=z.object({
  page:z.coerce.number().int().min(1).max(100000).default(1),
  search:z.string().trim().max(100).optional(),status:z.enum(['active','blocked']).optional(),
}).strict();
router.get('/clients',async(req,res)=>{
  const owner=subscriberContext(req);
  res.json(await transaction(db=>listClients(owner.subscriber_id,query.parse(req.query),db)));
});
router.get('/clients/:id',async(req,res)=>{
  const owner=subscriberContext(req),id=uuid.parse(req.params.id);
  res.json(await transaction(db=>clientDetail(owner.subscriber_id,id,db)));
});
router.get('/clients/:id/activity',async(req,res)=>{
  const owner=subscriberContext(req),id=uuid.parse(req.params.id);
  res.json(await transaction(db=>listActivity(owner.subscriber_id,id,req.query,db)));
});
router.get('/clients/:id/security',async(req,res)=>{
  const owner=subscriberContext(req),id=uuid.parse(req.params.id);
  res.json(await transaction(db=>securityView(owner.subscriber_id,id,db)));
});
router.post('/clients/:id/security/force-logout',async(req,res)=>{
  const owner=subscriberContext(req),id=uuid.parse(req.params.id);
  z.object({}).strict().parse(req.body);
  res.json(await transaction(db=>forceLogout(owner.subscriber_id,id,owner.id,db)));
});
router.patch('/clients/:id',async(req,res)=>{
  const owner=subscriberContext(req),id=uuid.parse(req.params.id);
  await transaction(db=>updateClientProfile(owner.subscriber_id,id,req.body,owner.id,db));
  res.json({ok:true});
});
router.put('/clients/:id/status',async(req,res)=>{
  const owner=subscriberContext(req),id=uuid.parse(req.params.id);
  const input=z.object({enabled:z.boolean(),reason:z.string().trim().max(1000).regex(/^[^\u0000-\u001f\u007f]*$/).optional()}).strict().parse(req.body);
  await transaction(db=>changeClientStatus(owner.subscriber_id,id,input.enabled,owner.id,db,input.reason));
  res.json({ok:true});
});
router.post('/clients/:id/notes',async(req,res)=>{
  const owner=subscriberContext(req),id=uuid.parse(req.params.id);
  const input=z.object({body:z.string().trim().min(1).max(4000).regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/)}).strict().parse(req.body);
  await transaction(db=>addClientNote(owner.subscriber_id,id,input.body,owner.id,db));
  res.status(201).json({ok:true});
});
export default router;
