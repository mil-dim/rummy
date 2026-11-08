import {DatabaseSync} from 'node:sqlite';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {dirname} from 'node:path';
import {mkdirSync} from 'node:fs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const publicAccount=row=>row?{id:row.id,displayName:row.display_name,email:row.email,avatarUrl:row.avatar_url||null,approved:Boolean(row.approved)}:null;
const expected=(a,b)=>1/(1+10**((b-a)/400));

export function createScoreStore(path=':memory:'){
 if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
 const db=new DatabaseSync(path);db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
 db.exec(`
 CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,provider TEXT NOT NULL,provider_subject TEXT NOT NULL,
  email TEXT NOT NULL,display_name TEXT NOT NULL,avatar_url TEXT,approved INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,last_login_at INTEGER NOT NULL,UNIQUE(provider,provider_subject));
 CREATE TABLE IF NOT EXISTS auth_sessions(token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS ratings(account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,category TEXT NOT NULL,
  rating REAL NOT NULL DEFAULT 1200,games INTEGER NOT NULL DEFAULT 0,wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,draws INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(account_id,category));
 CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,category TEXT NOT NULL,finished_at INTEGER NOT NULL,
  result_json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS match_players(match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id),score REAL NOT NULL,place INTEGER NOT NULL,
  pre_rating REAL NOT NULL,delta REAL NOT NULL,post_rating REAL NOT NULL,PRIMARY KEY(match_id,account_id));
 CREATE TABLE IF NOT EXISTS usage_visits(id TEXT PRIMARY KEY,player_id TEXT NOT NULL,account_id TEXT,
  display_name TEXT NOT NULL,country TEXT,locale TEXT,time_zone TEXT,started_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,ended_at INTEGER);
 CREATE TABLE IF NOT EXISTS usage_events(id INTEGER PRIMARY KEY AUTOINCREMENT,visit_id TEXT NOT NULL REFERENCES usage_visits(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,room_id TEXT,game_type TEXT,game_number INTEGER,variant TEXT,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS usage_games(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,room_name TEXT NOT NULL,
  game_type TEXT NOT NULL,variant TEXT,game_number INTEGER NOT NULL,started_at INTEGER NOT NULL,
  finished_at INTEGER,completed INTEGER NOT NULL DEFAULT 0,winner_player_id TEXT,result_json TEXT);
 CREATE TABLE IF NOT EXISTS usage_game_players(game_id TEXT NOT NULL REFERENCES usage_games(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,account_id TEXT,display_name TEXT NOT NULL,PRIMARY KEY(game_id,player_id));
 CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expires_at);
 CREATE INDEX IF NOT EXISTS matches_finished ON matches(finished_at DESC);
 CREATE INDEX IF NOT EXISTS usage_visits_started ON usage_visits(started_at DESC);
 CREATE INDEX IF NOT EXISTS usage_events_created ON usage_events(created_at DESC);
 CREATE INDEX IF NOT EXISTS usage_games_started ON usage_games(started_at DESC);
 `);
 // A process restart cannot close live browser visits cleanly. Preserve their last
 // heartbeat as the end time instead of making them look active forever.
 db.prepare('UPDATE usage_visits SET ended_at=last_seen_at WHERE ended_at IS NULL').run();
 const usageCutoff=Date.now()-730*86400000;
 db.prepare('DELETE FROM usage_visits WHERE started_at<?').run(usageCutoff);
 db.prepare('DELETE FROM usage_games WHERE started_at<?').run(usageCutoff);
 const getAccount=db.prepare('SELECT * FROM accounts WHERE id=?');
 const getProvider=db.prepare('SELECT * FROM accounts WHERE provider=? AND provider_subject=?');
 const getRating=db.prepare('SELECT * FROM ratings WHERE account_id=? AND category=?');
 const ensureRating=db.prepare('INSERT OR IGNORE INTO ratings(account_id,category) VALUES(?,?)');
 function upsertGoogle({sub,email,name,picture}){
  if(!sub||!email)throw Error('Google did not provide a verified identity.');const now=Date.now();let row=getProvider.get('google',sub);
  if(row)db.prepare('UPDATE accounts SET email=?,display_name=?,avatar_url=?,last_login_at=? WHERE id=?').run(email,name||email,picture||null,now,row.id);
  else{const id=randomUUID();db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?,?,?,?,?)').run(id,'google',sub,email,name||email,picture||null,0,now,now);row={id}}
  return publicAccount(getAccount.get(row.id));
 }
 function createSession(accountId,days=30){
  const token=randomBytes(32).toString('base64url'),now=Date.now(),expiresAt=now+days*86400000;
  db.prepare('INSERT INTO auth_sessions VALUES(?,?,?,?)').run(hash(token),accountId,expiresAt,now);return {token,expiresAt};
 }
 function accountForSession(token){
  if(!token)return null;const row=db.prepare(`SELECT a.* FROM auth_sessions s JOIN accounts a ON a.id=s.account_id
   WHERE s.token_hash=? AND s.expires_at>?`).get(hash(token),Date.now());return publicAccount(row);
 }
 function revokeSession(token){if(token)db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(hash(token))}
 function setApproved(id,approved){const result=db.prepare('UPDATE accounts SET approved=? WHERE id=?').run(approved?1:0,id);if(!result.changes)throw Error('Account not found.');return publicAccount(getAccount.get(id))}
 function listAccounts(){return db.prepare(`SELECT a.id,a.email,a.display_name,a.approved,a.created_at,a.last_login_at,
   COALESCE(SUM(r.games),0) rated_games FROM accounts a LEFT JOIN ratings r ON r.account_id=a.id
   GROUP BY a.id ORDER BY a.created_at DESC`).all().map(row=>({...row,approved:Boolean(row.approved)}))}
 function scoreboard(){
  const rows=db.prepare(`SELECT r.category,r.rating,r.games,r.wins,r.losses,r.draws,a.display_name
   FROM ratings r JOIN accounts a ON a.id=r.account_id WHERE a.approved=1 AND r.games>0
   ORDER BY r.category,r.rating DESC,r.games DESC,a.display_name`).all();
  return rows.map(row=>({...row,rating:Math.round(row.rating)}));
 }
 function recentMatches(limit=25){
  return db.prepare('SELECT id,room_id,category,finished_at FROM matches ORDER BY finished_at DESC LIMIT ?').all(Math.max(1,Math.min(100,limit)))
   .map(row=>({...row,players:db.prepare(`SELECT a.display_name,mp.score,mp.place,ROUND(mp.delta) delta
    FROM match_players mp JOIN accounts a ON a.id=mp.account_id WHERE mp.match_id=? ORDER BY mp.place,a.display_name`).all(row.id)}));
 }
 function recordMatch({id=randomUUID(),roomId,category,participants,finishedAt=Date.now()}){
  if(!['rummy','backgammon-normal','backgammon-rotate','santase','blato'].includes(category))throw Error('Invalid rating category.');
  if(!Array.isArray(participants)||participants.length<2)throw Error('A rated match needs at least two players.');
  if(new Set(participants.map(p=>p.accountId)).size!==participants.length)throw Error('A rated match requires distinct accounts.');
  if(db.prepare('SELECT 1 FROM matches WHERE id=?').get(id))return {recorded:false,changes:[]};
  const accounts=participants.map(p=>getAccount.get(p.accountId));
  if(accounts.some(row=>!row||!row.approved))throw Error('Every rated player must be approved.');
  const state=participants.map((p,index)=>{ensureRating.run(p.accountId,category);const r=getRating.get(p.accountId,category);return {...p,index,rating:r.rating,games:r.games,delta:0}});
  const divisor=Math.max(1,state.length-1);
  for(let i=0;i<state.length;i++)for(let j=i+1;j<state.length;j++){
   const a=state[i],b=state[j],actual=a.score===b.score ? .5 : a.score>b.score ? 1 : 0;
   // Provisional accounts deliberately transfer little rating until they have ten rated matches.
   const k=(a.games<10||b.games<10?8:24)/divisor,change=k*(actual-expected(a.rating,b.rating));a.delta+=change;b.delta-=change;
  }
  const ordered=[...state].sort((a,b)=>b.score-a.score),placeById=new Map();let place=1;
  ordered.forEach((item,index)=>{if(index&&item.score<ordered[index-1].score)place=index+1;placeById.set(item.accountId,place)});
  try{db.exec('BEGIN IMMEDIATE');
   db.prepare('INSERT INTO matches VALUES(?,?,?,?,?)').run(id,roomId,category,finishedAt,JSON.stringify(participants.map(p=>({accountId:p.accountId,score:p.score}))));
   for(const item of state){const post=item.rating+item.delta,place=placeById.get(item.accountId),top=place===1,tied=ordered.filter(p=>p.score===item.score).length>1;
    db.prepare(`UPDATE ratings SET rating=?,games=games+1,wins=wins+?,losses=losses+?,draws=draws+? WHERE account_id=? AND category=?`)
     .run(post,top&&!tied?1:0,!top&&!tied?1:0,tied?1:0,item.accountId,category);
    db.prepare('INSERT INTO match_players VALUES(?,?,?,?,?,?,?)').run(id,item.accountId,item.score,place,item.rating,item.delta,post);
   }db.exec('COMMIT');
  }catch(error){try{db.exec('ROLLBACK')}catch{}throw error}
  return {recorded:true,changes:state.map(item=>({accountId:item.accountId,pre:Math.round(item.rating),delta:Math.round(item.delta),post:Math.round(item.rating+item.delta),place:placeById.get(item.accountId)}))};
 }
 function startUsageVisit({playerId,accountId=null,displayName,country=null,locale=null,timeZone=null,startedAt=Date.now()}){
  const id=randomUUID();db.prepare('INSERT INTO usage_visits VALUES(?,?,?,?,?,?,?,?,?,NULL)')
   .run(id,playerId,accountId,displayName,country,locale,timeZone,startedAt,startedAt);return id;
 }
 function touchUsageVisit(id,{displayName,accountId,lastSeenAt=Date.now()}={}){
  if(!id)return;db.prepare(`UPDATE usage_visits SET last_seen_at=?,display_name=COALESCE(?,display_name),
   account_id=COALESCE(?,account_id) WHERE id=? AND ended_at IS NULL`).run(lastSeenAt,displayName||null,accountId||null,id);
 }
 function endUsageVisit(id,endedAt=Date.now()){
  if(id)db.prepare('UPDATE usage_visits SET last_seen_at=?,ended_at=? WHERE id=? AND ended_at IS NULL').run(endedAt,endedAt,id);
 }
 function recordUsageEvent(visitId,eventType,{roomId=null,gameType=null,gameNumber=null,variant=null,createdAt=Date.now()}={}){
  if(!visitId)return;touchUsageVisit(visitId,{lastSeenAt:createdAt});db.prepare('INSERT INTO usage_events(visit_id,event_type,room_id,game_type,game_number,variant,created_at) VALUES(?,?,?,?,?,?,?)')
   .run(visitId,eventType,roomId,gameType,gameNumber,variant,createdAt);
 }
 function startUsageGame({roomId,roomName,gameType,variant=null,gameNumber,players,startedAt=Date.now()}){
  const id=randomUUID();try{db.exec('BEGIN IMMEDIATE');db.prepare('INSERT INTO usage_games VALUES(?,?,?,?,?,?,?,NULL,0,NULL,NULL)')
   .run(id,roomId,roomName,gameType,variant,gameNumber,startedAt);
   for(const player of players)db.prepare('INSERT INTO usage_game_players VALUES(?,?,?,?)').run(id,player.playerId,player.accountId||null,player.displayName);
   db.exec('COMMIT');return id;
  }catch(error){try{db.exec('ROLLBACK')}catch{}throw error}
 }
 function finishUsageGame(id,{winnerPlayerId=null,result=null,finishedAt=Date.now()}={}){
  if(!id)return false;return Boolean(db.prepare(`UPDATE usage_games SET finished_at=?,completed=1,winner_player_id=?,result_json=?
   WHERE id=? AND completed=0`).run(finishedAt,winnerPlayerId,JSON.stringify(result||{}),id).changes);
 }
 function usageReport(days=30,now=Date.now()){
  days=Math.max(1,Math.min(3650,Number(days)||30));const since=now-days*86400000;
  const visits=db.prepare('SELECT * FROM usage_visits WHERE started_at>=? ORDER BY started_at').all(since);
  const events=db.prepare(`SELECT e.* FROM usage_events e JOIN usage_visits v ON v.id=e.visit_id WHERE v.started_at>=? ORDER BY e.created_at`).all(since);
  const games=db.prepare('SELECT * FROM usage_games WHERE started_at>=? ORDER BY started_at').all(since);
  const gamePlayers=db.prepare(`SELECT gp.* FROM usage_game_players gp JOIN usage_games g ON g.id=gp.game_id WHERE g.started_at>=?`).all(since);
  const visitById=new Map(visits.map(row=>[row.id,row])),gameById=new Map(games.map(row=>[row.id,row]));
  const personKey=(accountId,playerId)=>accountId?'account:'+accountId:'guest:'+playerId,people=new Map();
  function person(accountId,playerId,name){const key=personKey(accountId,playerId);let row=people.get(key);if(!row){row={key,name,country:null,locale:null,timeZone:null,firstSeen:null,lastSeen:null,visits:0,activeSeconds:0,roomsCreated:0,roomsJoined:0,watches:0,gamesPlayed:0,gamesFinished:0,wins:0,gameTypes:{}};people.set(key,row)}return row}
  for(const visit of visits){const row=person(visit.account_id,visit.player_id,visit.display_name),end=Math.min(now,Number(visit.ended_at||visit.last_seen_at||now));row.name=visit.display_name;row.country=visit.country||row.country;row.locale=visit.locale||row.locale;row.timeZone=visit.time_zone||row.timeZone;row.firstSeen=row.firstSeen===null?visit.started_at:Math.min(row.firstSeen,visit.started_at);row.lastSeen=Math.max(row.lastSeen||0,end);row.visits++;row.activeSeconds+=Math.max(0,Math.round((end-visit.started_at)/1000))}
  for(const event of events){const visit=visitById.get(event.visit_id);if(!visit)continue;const row=person(visit.account_id,visit.player_id,visit.display_name);if(event.event_type==='room-created')row.roomsCreated++;else if(event.event_type==='room-joined')row.roomsJoined++;else if(event.event_type==='watch-started')row.watches++}
  for(const gp of gamePlayers){const game=gameById.get(gp.game_id);if(!game)continue;const row=person(gp.account_id,gp.player_id,gp.display_name),type=game.game_type+(game.variant?':'+game.variant:'');row.gamesPlayed++;row.gameTypes[type]=(row.gameTypes[type]||0)+1;if(game.completed)row.gamesFinished++;if(game.completed&&game.winner_player_id===gp.player_id)row.wins++}
  const countries=new Map();for(const row of people.values()){const key=row.country||'Unknown';let group=countries.get(key);if(!group){group={country:key,visitors:0,visits:0,activeSeconds:0,completedPlayerGames:0};countries.set(key,group)}group.visitors++;group.visits+=row.visits;group.activeSeconds+=row.activeSeconds;group.completedPlayerGames+=row.gamesFinished}
  const gameGroups=new Map();for(const game of games){const key=game.game_type+(game.variant?':'+game.variant:'');let group=gameGroups.get(key);if(!group){group={gameType:game.game_type,variant:game.variant||null,started:0,finished:0,totalFinishedSeconds:0};gameGroups.set(key,group)}group.started++;if(game.completed){group.finished++;group.totalFinishedSeconds+=Math.max(0,Math.round((game.finished_at-game.started_at)/1000))}}
  const gameSummary=[...gameGroups.values()].map(({totalFinishedSeconds,...group})=>({...group,averageDurationSeconds:group.finished?Math.round(totalFinishedSeconds/group.finished):null})).sort((a,b)=>b.started-a.started);
  const recentGames=[...games].sort((a,b)=>b.started_at-a.started_at).slice(0,100).map(game=>{const players=gamePlayers.filter(p=>p.game_id===game.id);return {roomId:game.room_id,roomName:game.room_name,gameType:game.game_type,variant:game.variant||null,gameNumber:game.game_number,startedAt:game.started_at,finishedAt:game.finished_at||null,durationSeconds:game.finished_at?Math.max(0,Math.round((game.finished_at-game.started_at)/1000)):null,completed:Boolean(game.completed),winner:players.find(p=>p.player_id===game.winner_player_id)?.display_name||null,players:players.map(p=>p.display_name)}});
  const activeSeconds=[...people.values()].reduce((sum,row)=>sum+row.activeSeconds,0),finished=games.filter(game=>game.completed).length;
  return {generatedAt:now,since,days,totals:{visitors:people.size,visits:visits.length,activeSeconds,gamesStarted:games.length,gamesFinished:finished,completionRate:games.length?finished/games.length:0},countries:[...countries.values()].sort((a,b)=>b.visitors-a.visitors||a.country.localeCompare(b.country)),games:gameSummary,people:[...people.values()].map(({key,...row})=>row).sort((a,b)=>b.lastSeen-a.lastSeen),recentGames};
 }
 function status(){return {accounts:db.prepare('SELECT COUNT(*) count FROM accounts').get().count,matches:db.prepare('SELECT COUNT(*) count FROM matches').get().count,usageVisits:db.prepare('SELECT COUNT(*) count FROM usage_visits').get().count,usageGames:db.prepare('SELECT COUNT(*) count FROM usage_games').get().count,path}}
 function close(){db.close()}
 return {upsertGoogle,createSession,accountForSession,getAccount:id=>publicAccount(getAccount.get(id)),revokeSession,setApproved,listAccounts,scoreboard,recentMatches,recordMatch,startUsageVisit,touchUsageVisit,endUsageVisit,recordUsageEvent,startUsageGame,finishUsageGame,usageReport,status,close};
}
