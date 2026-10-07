import type { Request, Response, NextFunction } from 'express';
import { transaction } from '../platform';
import { HttpError } from '../auth';
import { classifyPublicPath, resolvePublicDocument, writePublicDocument } from '../public-site';
import { publicScriptSources } from '../public-site/presentation-render';
import { publicStore, products, categories } from './data';
import { renderCommerceDocument } from './public-render';
import { COMMERCE_SCRIPT_HASH } from './public-script';
import { STOREFRONT_HEADER_HASH, STOREFRONT_MENU_HASH } from './storefront-header-script';

/** Optional overlay: unentitled/default home documents remain byte-for-byte V2. */
export async function tryCommerceDocument(req:Request,res:Response,path:unknown):Promise<boolean> {
  if(typeof path!=='string')return false;
  const match=/^\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/(product\/([a-z0-9]+(?:-[a-z0-9]+)*)|cart|checkout|confirmation))?$/.exec(path);
  if(!match||classifyPublicPath(`/${match[1]}`).kind!=='slug')return false;
  const slug=match[1]!,leaf=match[2];
  try {
    const result=await transaction(async client=>{
      let store;
      try{store=await publicStore(slug,client);}catch(error){
        if(error instanceof HttpError&&error.status===404)return null;
        throw error;
      }
      const document=await resolvePublicDocument(`/${slug}`,client);
      if(document.kind!=='site')return {document};
      const view=leaf?.startsWith('product/')?'product':leaf??'home';
      let data:unknown=null;
      if(view==='home')data=await products(store.id,client,{publicOnly:true,featuredFirst:store.settings.featured_first});
      if(view==='product') {
        data=(await products(store.id,client,{publicOnly:true,slug:match[3]})).data[0];
        if(!data)return {document:await resolvePublicDocument('/not/a/public/site',client)};
      }
      return {html:renderCommerceDocument(document.site,slug,store.settings,view as 'home'|'product'|'cart'|'checkout'|'confirmation',data,await categories(store.id,client,true)),site:document.site};
    });
    if(!result) {
      if(!leaf)return false;
      writePublicDocument(req,res,await resolvePublicDocument('/not/a/public/site'));return true;
    }
    if(result.document){writePublicDocument(req,res,result.document);return true;}
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Robots-Tag','noindex, nofollow');
    res.setHeader('Content-Security-Policy',`default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https: data:; script-src ${publicScriptSources(result.site)} ${COMMERCE_SCRIPT_HASH} ${STOREFRONT_HEADER_HASH} ${STOREFRONT_MENU_HASH}; connect-src 'self'; base-uri 'none'; form-action 'self'`);
    res.status(200).type('html').end(result.html);return true;
  }catch(error) {
    req.log.error({code:'COMMERCE_DOCUMENT'},'Public store temporarily unavailable');
    writePublicDocument(req,res,{kind:'unavailable',status:503,errorCode:'COMMERCE'});return true;
  }
}
export async function commerceNavigation(req:Request,res:Response,next:NextFunction):Promise<void> {
  if(!['GET','HEAD'].includes(req.method)||!await tryCommerceDocument(req,res,req.originalUrl.split('?')[0]))next();
}
