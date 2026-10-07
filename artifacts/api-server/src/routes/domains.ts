import {Router} from 'express';
import {AddCustomDomainBody} from '@workspace/api-zod';
import {requireUser,authorizeTenant,HttpError,rateLimit} from '../lib/auth';
import {getSubscriber} from '../lib/platform';
import {configuration,addDomain,modifyDomain,verifyDomain} from '../lib/domains/service';
const router=Router();
const subscriber=(req:Parameters<typeof requireUser>[0])=>{const u=requireUser(req);if(u.admin||!u.subscriber_id)throw new HttpError(403,'Subscriber account required.');return u.subscriber_id;};
router.use('/domains',async(req,_res,next)=>{
  const u=requireUser(req);if(u.admin)throw new HttpError(403,'Use a subscriber account to manage domains.');
  authorizeTenant(req,u.subscriber_id);
  if(Object.keys(req.query).length)throw new HttpError(400,'This endpoint does not accept tenant identifiers or query parameters.');
  const s=await getSubscriber(u.subscriber_id);if(!s?.allowed)throw new HttpError(403,'Your subscription does not allow website management.');
  next();
});
router.get('/domains',async(req,res)=>res.json(await configuration(subscriber(req))));
router.post('/domains',async(req,res)=>{
  const id=subscriber(req);await rateLimit(`domain-add:${id}`,10);
  const input=AddCustomDomainBody.strict().parse(req.body);
  await addDomain(id,input.hostname);res.status(201).json(await configuration(id));
});
router.post('/domains/:id/verify',async(req,res)=>{
  const id=subscriber(req);await rateLimit(`domain-verify:${id}`,20);
  await verifyDomain(id,String(req.params.id));res.json(await configuration(id));
});
for(const [method,path,action] of [['delete','/:id','remove'],['post','/:id/primary','primary'],['post','/:id/renew-verification','renew']] as const){
  router[method](`/domains${path}`,async(req,res)=>{
    const id=subscriber(req);await rateLimit(`domain-change:${id}`,30);await modifyDomain(id,String(req.params.id),action);res.json(await configuration(id));
  });
}
export default router;
