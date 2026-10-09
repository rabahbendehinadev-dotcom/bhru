import {Router} from 'express';
import {z} from '@workspace/api-zod';
import {subscriberContext} from '../lib/commerce/data';
import {transaction} from '../lib/platform';
import {listGroups,saveGroup,selectDefault,deleteGroup,assignGroup,savePricing,listPricing} from '../lib/client-finance/groups';
import {pricingLock,effectivePrice} from '../lib/client-finance/pricing';
import {serviceRow} from '../lib/client-finance/catalog';
const router=Router(),uuid=z.string().uuid();
router.get('/client-groups',async(req,res)=>res.json(await transaction(db=>listGroups(subscriberContext(req).subscriber_id,db))));
router.post('/client-groups',async(req,res)=>{const o=subscriberContext(req);res.status(201).json(await transaction(db=>saveGroup(o.subscriber_id,undefined,req.body,o.id,db)));});
router.patch('/client-groups/:id',async(req,res)=>{const o=subscriberContext(req);res.json(await transaction(db=>saveGroup(o.subscriber_id,uuid.parse(req.params.id),req.body,o.id,db)));});
router.delete('/client-groups/:id',async(req,res)=>{const o=subscriberContext(req);res.json(await transaction(db=>deleteGroup(o.subscriber_id,uuid.parse(req.params.id),o.id,db)));});
router.post('/client-groups/:id/default',async(req,res)=>{const o=subscriberContext(req);z.object({}).strict().parse(req.body);res.json(await transaction(db=>selectDefault(o.subscriber_id,uuid.parse(req.params.id),o.id,db)));});
router.put('/clients/:id/group',async(req,res)=>{const o=subscriberContext(req);res.json(await transaction(db=>assignGroup(o.subscriber_id,uuid.parse(req.params.id),req.body,o.id,db)));});
for(const [prefix,customer] of [['client-groups',false],['clients',true]] as const){
 router.get(`/${prefix}/:id/pricing`,async(req,res)=>{const o=subscriberContext(req);res.json(await transaction(db=>listPricing(o.subscriber_id,uuid.parse(req.params.id),req.query,db,customer)));});
 router.put(`/${prefix}/:id/pricing/:serviceId`,async(req,res)=>{const o=subscriberContext(req);res.json(await transaction(db=>savePricing(o.subscriber_id,uuid.parse(req.params.id),uuid.parse(req.params.serviceId),req.body,o.id,db,customer)));});
 router.delete(`/${prefix}/:id/pricing/:serviceId`,async(req,res)=>{const o=subscriberContext(req);res.json(await transaction(db=>savePricing(o.subscriber_id,uuid.parse(req.params.id),uuid.parse(req.params.serviceId),{method:'INHERIT_DEFAULT'},o.id,db,customer)));});
}
router.get('/clients/:id/price-preview/:serviceId',async(req,res)=>{const o=subscriberContext(req);res.json(await transaction(async db=>{
 await pricingLock(o.subscriber_id,db);
 return (await effectivePrice(o.subscriber_id,uuid.parse(req.params.id),await serviceRow(o.subscriber_id,uuid.parse(req.params.serviceId),db,true),db)).view;
}));});
export default router;
