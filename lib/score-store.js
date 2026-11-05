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
 CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expires_at);
 CREATE INDEX IF NOT EXISTS matches_finished ON matches(finished_at DESC);
 `);
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
  if(!['rummy','backgammon-normal','backgammon-rotate'].includes(category))throw Error('Invalid rating category.');
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
 function status(){return {accounts:db.prepare('SELECT COUNT(*) count FROM accounts').get().count,matches:db.prepare('SELECT COUNT(*) count FROM matches').get().count,path}}
 function close(){db.close()}
 return {upsertGoogle,createSession,accountForSession,getAccount:id=>publicAccount(getAccount.get(id)),revokeSession,setApproved,listAccounts,scoreboard,recentMatches,recordMatch,status,close};
}
