// Test-only HTTPS/DNS simulation. This file never performs network I/O.
import {EventEmitter} from 'node:events';
export const state={status:200,body:'{"status":"success","code":200,"data":{}}',encoding:'identity',
 contentType:'application/json',records:[{address:'8.8.8.8',family:4}],dnsCalls:0,requests:0,captured:null,networkError:false,hang:false};
export async function lookup(){state.dnsCalls++;return state.records;}
export function request(url,options,onResponse){
 state.requests++;state.captured={url:String(url),options,address:null};
 const req=new EventEmitter();req.destroy=()=>{};
 req.end=(body)=>{
  state.captured.body=body??null;
  if(state.hang)return;
  options.lookup(url.hostname,{all:true},(_err,addresses)=>{
   state.captured.address=addresses[0].address;
   if(state.networkError){queueMicrotask(()=>req.emit('error',Error('authorization: fixture-token')));return;}
   const res=new EventEmitter();res.statusCode=state.status;res.destroy=()=>{};
   res.headers={'content-type':state.contentType,'content-encoding':state.encoding};
   queueMicrotask(()=>{onResponse(res);if(res.statusCode>=200&&res.statusCode<300){res.emit('data',Buffer.from(state.body));res.emit('end');}});
  });
 };
 return req;
}
