import http from 'node:http';
import {writeFileSync,chmodSync} from 'node:fs';
import {randomBytes,timingSafeEqual} from 'node:crypto';
export function startAdmin({port,tokenPath='/tmp/tabletop-admin.token',status,announce,cancel,lock,listAccounts,approveAccount,usageReport}){
 if(!port)return null;
 const token=randomBytes(32).toString('hex');writeFileSync(tokenPath,token,{mode:0o600});chmodSync(tokenPath,0o600);
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  const supplied=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+token);
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){res.statusCode=401;res.end(JSON.stringify({error:'Unauthorized'}));return}
  try{
   const url=new URL(req.url,'http://127.0.0.1');
   if(req.method==='GET'&&url.pathname==='/status'){res.end(JSON.stringify(status()));return}
   if(req.method==='GET'&&url.pathname==='/accounts'){res.end(JSON.stringify({accounts:listAccounts?.()||[]}));return}
   if(req.method==='GET'&&url.pathname==='/reports/usage'){
    const days=Math.max(1,Math.min(3650,Number(url.searchParams.get('days'))||30));res.end(JSON.stringify(usageReport(days)));return;
   }
   if(req.method==='POST'&&url.pathname==='/accounts/approval'){
    let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)throw Error('Request too large')}
    const input=JSON.parse(body);if(typeof input.id!=='string'||typeof input.approved!=='boolean')throw Error('Supply id and approved.');
    res.end(JSON.stringify({account:approveAccount(input.id,input.approved)}));return;
   }
   if(req.method==='POST'&&url.pathname==='/ready'){if(status().safeToDeploy)lock();res.end(JSON.stringify(status()));return}
   if(req.method==='POST'&&url.pathname==='/maintenance'){
    let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)throw Error('Request too large')}
    const input=JSON.parse(body);
    if(input.cancel===true)cancel();else announce(input);
    res.end(JSON.stringify(status()));return;
   }
   res.statusCode=404;res.end(JSON.stringify({error:'Not found'}));
  }catch(error){res.statusCode=400;res.end(JSON.stringify({error:error.message}))}
 });
 // Never bind this listener to an external interface or publish its Docker port.
 server.listen(Number(port),'127.0.0.1');
 return server;
}
