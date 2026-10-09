import {Router} from 'express';
import {z} from '@workspace/api-zod';
import {subscriberContext} from '../lib/commerce/data';
import {transaction} from '../lib/platform';
import {HttpError} from '../lib/auth';
import {listAccess,updateAccess,resolveCustomerServiceAccess} from '../lib/client-finance/access';
const router=Router(),uuid=z.string().uuid();
for(const [path,customer] of [['client-groups',false],['clients',true]] as const){
 router.get(`/${path}/:id/access`,async(req,res)=>{const o=subscriberContext(req);res.json(await transaction(db=>listAccess(o.subscriber_id,uuid.parse(req.params.id),customer,req.query,db)));});
 router.post(`/${path}/:id/access`,async(req,res)=>{const o=subscriberContext(req);res.json(await transaction(db=>updateAccess(o.subscriber_id,uuid.parse(req.params.id),customer,req.body,o.id,db)));});
}
router.get('/clients/:id/access/:serviceId',async(req,res)=>{
 const o=subscriberContext(req),id=uuid.parse(req.params.id);
 res.json(await transaction(async db=>{
  if(!(await db.query('SELECT 1 FROM public_customer_accounts WHERE subscriber_id=$1 AND id=$2',[o.subscriber_id,id])).rowCount)throw new HttpError(404,'Client not found.');
  if(!(await db.query('SELECT 1 FROM manual_services WHERE subscriber_id=$1 AND id=$2',[o.subscriber_id,uuid.parse(req.params.serviceId)])).rowCount)throw new HttpError(404,'Service not found.');
  return resolveCustomerServiceAccess(o.subscriber_id,id,uuid.parse(req.params.serviceId),db);
 }));
});
export default router;
