import {createHash,randomBytes} from 'node:crypto';

const cookieValue=(header,name)=>String(header||'').split(';').map(part=>part.trim()).find(part=>part.startsWith(name+'='))?.slice(name.length+1)||'';
const challenge=value=>createHash('sha256').update(value).digest('base64url');

export function installGoogleAuth({app,store,baseUrl,clientId,clientSecret,allowRequest=()=>true}){
 const configured=Boolean(baseUrl&&clientId&&clientSecret),states=new Map(),secure=String(baseUrl||'').startsWith('https://');
 const cookieHeader=(token,maxAge)=>`tabletop_auth=${token||''}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; ${secure?'Secure; ':''}`;
 const accountFromHeader=header=>store.accountForSession(cookieValue(header,'tabletop_auth'));
 app.get('/api/account',(req,res)=>{res.setHeader('Cache-Control','no-store');res.json({configured,account:accountFromHeader(req.headers.cookie)})});
 app.get('/api/scoreboard',(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json({ratings:store.scoreboard(),recent:store.recentMatches(20)})});
 app.get('/auth/google',(req,res)=>{
  if(!configured){res.status(503).send('Google sign-in is not configured.');return}
  const state=randomBytes(24).toString('base64url'),verifier=randomBytes(32).toString('base64url');states.set(state,{verifier,expiresAt:Date.now()+600000});
  const params=new URLSearchParams({client_id:clientId,redirect_uri:new URL('/auth/google/callback',baseUrl).href,response_type:'code',scope:'openid email profile',state,code_challenge:challenge(verifier),code_challenge_method:'S256',prompt:'select_account'});
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?'+params);
 });
 app.get('/auth/google/callback',async(req,res)=>{
  const saved=states.get(String(req.query.state||''));states.delete(String(req.query.state||''));
  if(!configured||!saved||saved.expiresAt<Date.now()||typeof req.query.code!=='string'){res.status(400).send('Invalid or expired sign-in request.');return}
  try{
   const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:req.query.code,client_id:clientId,client_secret:clientSecret,redirect_uri:new URL('/auth/google/callback',baseUrl).href,grant_type:'authorization_code',code_verifier:saved.verifier}),signal:AbortSignal.timeout(10000)});
   if(!tokenResponse.ok)throw Error('Google token exchange failed.');const tokens=await tokenResponse.json();
   const userResponse=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+tokens.access_token},signal:AbortSignal.timeout(10000)});
   if(!userResponse.ok)throw Error('Google profile request failed.');const user=await userResponse.json();
   if(user.email_verified!==true)throw Error('Google email is not verified.');const account=store.upsertGoogle(user),session=store.createSession(account.id);
   res.setHeader('Set-Cookie',cookieHeader(session.token,30*86400));res.redirect('/?auth=success');
  }catch(error){res.status(502).type('text').send(error.message)}
 });
 app.post('/auth/logout',(req,res)=>{if(!allowRequest(req)){res.status(403).json({error:'Invalid origin.'});return}const token=cookieValue(req.headers.cookie,'tabletop_auth');store.revokeSession(token);res.setHeader('Set-Cookie',cookieHeader('',0));res.json({ok:true})});
 const timer=setInterval(()=>{const now=Date.now();for(const [key,value] of states)if(value.expiresAt<now)states.delete(key)},60000);timer.unref();
 return {configured,accountFromHeader};
}
