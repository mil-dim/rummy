import http from 'node:http';
import {writeFileSync,chmodSync} from 'node:fs';
import {randomBytes,timingSafeEqual} from 'node:crypto';
export function startAdmin({port,tokenPath='/tmp/tabletop-admin.token',status,announce,cancel,lock}){
 if(!port)return null;
 const token=randomBytes(32).toString('hex');writeFileSync(tokenPath,token,{mode:0o600});chmodSync(tokenPath,0o600);
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  const supplied=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+token);
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){res.statusCode=401;res.end(JSON.stringify({error:'Unauthorized'}));return}
  try{
   if(req.method==='GET'&&req.url==='/status'){res.end(JSON.stringify(status()));return}
   if(req.method==='POST'&&req.url==='/ready'){if(status().safeToDeploy)lock();res.end(JSON.stringify(status()));return}
   if(req.method==='POST'&&req.url==='/maintenance'){
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
