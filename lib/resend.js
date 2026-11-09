const ENDPOINT='https://api.resend.com/emails';

export function createResendSender({apiKey,from,fetchImpl=globalThis.fetch,timeoutMs=15_000}={}){
 if(!apiKey||!from||typeof fetchImpl!=='function')return null;
 return async({to,subject,text})=>{
  const response=await fetchImpl(ENDPOINT,{
   method:'POST',
   headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
   body:JSON.stringify({from,to:[to],subject,text}),
   signal:AbortSignal.timeout(timeoutMs)
  });
  if(response.ok)return response.json();
  let detail='';
  try{const body=await response.json();detail=String(body?.message||body?.name||'').replace(/[\r\n]+/g,' ').slice(0,240)}catch{}
  throw Error(`Resend HTTP ${response.status}${detail?`: ${detail}`:''}`);
 };
}
