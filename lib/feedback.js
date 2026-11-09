const DAY_MS=24*60*60*1000;
const DEFAULT_MIN_INTERVAL_MS=10*60*1000;
const DEFAULT_PLAYER_LIMIT=3;
const DEFAULT_IP_LIMIT=10;
const TYPES=new Map([
 ['rules','Rules recommendation'],
 ['recommendation','Feature recommendation'],
 ['opinion','General opinion']
]);

function historyWithin(map,key,now){
 const recent=(map.get(key)||[]).filter(at=>now-at<DAY_MS);
 if(recent.length)map.set(key,recent);else map.delete(key);
 return recent;
}

function cleanLine(value,max=120){
 return String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}

export function createFeedbackService({
 deliver,
 environment='unspecified',
 version='unknown',
 now=()=>Date.now(),
 minIntervalMs=DEFAULT_MIN_INTERVAL_MS,
 playerLimit=DEFAULT_PLAYER_LIMIT,
 ipLimit=DEFAULT_IP_LIMIT
}={}){
 const byPlayer=new Map(),byIp=new Map();
 const configured=typeof deliver==='function';

 async function submit({playerId,ip,name,account,room,type,message,website}={}){
  // Bots commonly fill this visually hidden field. Pretend success so it does
  // not become a probe for the mail configuration.
  if(String(website??'').trim())return {ok:true,ignored:true};
  if(!configured)throw Error('Feedback is temporarily unavailable.');
  if(!playerId)throw Error('Enter the lobby before sending feedback.');
  if(!TYPES.has(type))throw Error('Choose a feedback type.');
  const text=String(message??'').normalize('NFKC').trim();
  if(text.length<20)throw Error('Please write at least 20 characters.');
  if(text.length>2000)throw Error('Feedback is limited to 2000 characters.');

  const at=now(),playerHistory=historyWithin(byPlayer,playerId,at),ipHistory=historyWithin(byIp,ip||'unknown',at);
  if(playerHistory.length&&at-playerHistory.at(-1)<minIntervalMs)throw Error('Please wait before sending more feedback.');
  if(playerHistory.length>=playerLimit)throw Error('Daily feedback limit reached. Please try again tomorrow.');
  if(ipHistory.length>=ipLimit)throw Error('Too many submissions from this network. Please try again tomorrow.');

  // Reserve the attempt before writing. Repeated storage failures must not let
  // a bot hammer the server.
  playerHistory.push(at);ipHistory.push(at);byPlayer.set(playerId,playerHistory);byIp.set(ip||'unknown',ipHistory);
  const record={
   type,
   typeLabel:TYPES.get(type),
   name:cleanLine(name,24)||'Player',
   signedIn:Boolean(account),
   location:room?{scope:'room',name:cleanLine(room.name,60),id:cleanLine(room.id,16),gameType:cleanLine(room.gameType,20),state:room.game?'in progress':'waiting'}:{scope:'lobby'},
   environment:cleanLine(environment,40),
   version:cleanLine(version,30),
   message:text.replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'')
  };
  try{
   await deliver(record);
  }catch(error){
   console.error('Feedback save failed:',error?.message||error);
   throw Error('Feedback could not be saved. Please try again later.');
  }
  return {ok:true};
 }

 return {configured,submit};
}
