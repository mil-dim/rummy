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
 sendMail,
 recipient,
 environment='unspecified',
 version='unknown',
 now=()=>Date.now(),
 minIntervalMs=DEFAULT_MIN_INTERVAL_MS,
 playerLimit=DEFAULT_PLAYER_LIMIT,
 ipLimit=DEFAULT_IP_LIMIT
}={}){
 const byPlayer=new Map(),byIp=new Map();
 const configured=typeof sendMail==='function'&&Boolean(recipient);

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

  // Reserve the attempt before SMTP. Repeated delivery failures must not let a
  // bot hammer the mail provider.
  playerHistory.push(at);ipHistory.push(at);byPlayer.set(playerId,playerHistory);byIp.set(ip||'unknown',ipHistory);
  const context=room?`${cleanLine(room.name,60)} (${cleanLine(room.id,16)}, ${cleanLine(room.gameType,20)}, ${room.game?'in progress':'waiting'})`:'Lobby';
  const body=[
   `Type: ${TYPES.get(type)}`,
   `From: ${cleanLine(name,24)||'Player'}`,
   `Signed in: ${account?'yes':'no'}`,
   `Location in app: ${context}`,
   `Environment: ${cleanLine(environment,40)}`,
   `Version: ${cleanLine(version,30)}`,
   '',
   text
  ].join('\n');
  try{
   await sendMail({to:recipient,subject:`[Tabletop ${cleanLine(environment,40)}] Player feedback`,text:body});
  }catch(error){
   console.error('Feedback delivery failed:',error?.message||error);
   throw Error('Feedback could not be delivered. Please try again later.');
  }
  return {ok:true};
 }

 return {configured,submit};
}
