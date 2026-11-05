import {readFileSync} from 'node:fs';
import http from 'node:http';
const [command='status',minutes='10',...words]=process.argv.slice(2);
if(!['status','announce','cancel','ready','accounts','approve','unapprove'].includes(command))throw Error('Usage: admin.mjs status|ready|announce MINUTES [MESSAGE]|cancel|accounts|approve ID|unapprove ID');
const body=command==='announce'?JSON.stringify({minutes:Number(minutes),message:words.join(' ')}):command==='cancel'?JSON.stringify({cancel:true}):null;
const token=readFileSync(process.env.ADMIN_TOKEN_FILE||'/tmp/tabletop-admin.token','utf8');
const result=await new Promise((resolve,reject)=>{
 const approval=['approve','unapprove'].includes(command)?JSON.stringify({id:minutes,approved:command==='approve'}):null;
 const path=command==='ready'?'/ready':command==='accounts'?'/accounts':approval?'/accounts/approval':body?'/maintenance':'/status';
 const req=http.request({hostname:'127.0.0.1',port:Number(process.env.ADMIN_PORT||9090),path,method:body||approval||command==='ready'?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body||approval?{'Content-Type':'application/json'}:{})}},res=>{
  let data='';res.on('data',chunk=>data+=chunk);res.on('end',()=>{if(res.statusCode!==200)reject(Error(data));else resolve(JSON.parse(data))});
 });req.setTimeout(5000,()=>req.destroy(Error('Admin request timed out')));req.on('error',reject);req.end(approval||body);
});
console.log(JSON.stringify(result,null,2));
if(command==='ready'&&!result.safeToDeploy){console.error('Deployment blocked: announce maintenance, wait for the deadline, and wait for users/games to finish.');process.exitCode=1}
