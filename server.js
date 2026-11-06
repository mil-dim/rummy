import {suggestName,uniqueName} from "./public/room-names.js";
import {createDiceAudit} from "./lib/dice-audit.js";
import {startAdmin} from "./lib/admin.js";
import {createScoreStore} from "./lib/score-store.js";
import {installGoogleAuth} from "./lib/google-auth.js";
import express from "express";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { Server } from "socket.io";
import { newRummy, publicRummy, rummyAction, forfeitRummy } from "./lib/rummy.js";
import { newBackgammon, backgammonAction, publicBackgammon, forfeitBackgammon } from "./lib/backgammon.js";
import {newSantase,publicSantase,santaseAction,forfeitSantase} from "./lib/santase.js";
import {newBlato,publicBlato,blatoAction,forfeitBlato} from "./lib/blato.js";
import {startSantaseMatch,recordSantaseResult,startBlatoMatch,recordBlatoResult} from "./lib/card-matches.js";

import { startBackgammonMatch, recordBackgammonResult, backgammonVariant } from "./lib/backgammon-match.js";

const sourceRoot = new URL("./", import.meta.url);
const buildHash = createHash("sha256");
for (const path of ["server.js", "package.json", "package-lock.json",
  ...["lib", "public"].flatMap(dir => readdirSync(new URL(dir + "/", sourceRoot)).sort().map(name => dir + "/" + name))]) {
  buildHash.update(path).update(readFileSync(new URL(path, sourceRoot)));
}
const buildInfo = {
  environment: String(process.env.APP_ENV || "unspecified").slice(0, 40),
  version: JSON.parse(readFileSync(new URL("package.json", sourceRoot), "utf8")).version,
  build: buildHash.digest("hex").slice(0, 12)
};

const indexHtml = readFileSync(new URL("public/index.html", sourceRoot), "utf8")
  .replaceAll("__APP_BUILD__", buildInfo.build)
  .replaceAll("__APP_VERSION__", buildInfo.version);
const privacyHtml = readFileSync(new URL("public/privacy.html", sourceRoot), "utf8");
const termsHtml = readFileSync(new URL("public/terms.html", sourceRoot), "utf8");

const PORT = Number(process.env.PORT) || 8080;
const MAX_ROOMS = 100;
const MAX_SESSIONS = 1000;
const MAX_CONNECTIONS = 500;
const ROOM_IDLE_MS = 30 * 60 * 1000;
const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;
const EVENT_WINDOW_MS = 10_000;
const MAX_EVENTS_PER_WINDOW = 80;
const CONNECTION_WINDOW_MS = 60_000;
const MAX_CONNECTIONS_PER_WINDOW = 40;
const MAX_WATCHERS = 50;
const WATCHER_IDLE_MS = 10 * 60 * 1000;
const PROTOCOL_VERSION = 12;
const configuredOrigins = new Set(
  String(process.env.PUBLIC_ORIGINS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
);

const rooms = new Map();
const sessions = new Map();
const connectionAttempts = new Map();
let maintenance=null;
const audit=createDiceAudit(process.env.DICE_AUDIT_DIR,buildInfo.environment);
const scoreStore=createScoreStore(process.env.SCORE_DB_PATH||':memory:');
const app = express();
const server = http.createServer(app);

function cleanText(value, fallback, maxLength) {
  const cleaned = String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>&"'\`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return cleaned || fallback;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (configuredOrigins.has(origin)) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function requestIp(req) {
  const remote = req.socket.remoteAddress || "unknown";
  const forwarded = req.headers["x-forwarded-for"];
  const isLoopback = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
  if (process.env.TRUST_PROXY === "1" && isLoopback && typeof forwarded === "string") {
    return forwarded.split(",")[0].trim().slice(0, 64);
  }
  return remote;
}

function connectionAllowed(req) {
  if (!sameOrigin(req)) return false;
  const now = Date.now();
  const ip = requestIp(req);
  let entry = connectionAttempts.get(ip);
  if (!entry || now - entry.startedAt >= CONNECTION_WINDOW_MS) {
    entry = { startedAt: now, count: 0 };
    connectionAttempts.set(ip, entry);
  }
  entry.count += 1;
  return entry.count <= MAX_CONNECTIONS_PER_WINDOW;
}

const io = new Server(server, {
  maxHttpBufferSize: 16 * 1024,
  allowRequest: (req, callback) => callback(null, connectionAllowed(req))
});

app.disable("x-powered-by");
app.use(express.json({limit:'4kb'}));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
  );
  if (_req.secure || _req.headers["x-forwarded-proto"] === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});
const googleAuth=installGoogleAuth({app,store:scoreStore,baseUrl:process.env.PUBLIC_BASE_URL,
 clientId:process.env.GOOGLE_CLIENT_ID,clientSecret:process.env.GOOGLE_CLIENT_SECRET,allowRequest:sameOrigin});
app.get(["/", "/index.html"], (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(indexHtml);
});
app.get("/privacy", (_req, res) => { res.setHeader("Cache-Control", "no-store"); res.type("html").send(privacyHtml); });
app.get("/terms", (_req, res) => { res.setHeader("Cache-Control", "no-store"); res.type("html").send(termsHtml); });

// Revalidate assets on every load, including unversioned URLs used by older
// clients. HTML must always be fetched so it can point to the current assets.
app.use(express.static("public", {
  dotfiles: "deny",
  index: false,
  etag: true,
  maxAge: 0,
  setHeaders: (res, path) => {
    res.setHeader("Cache-Control", path.endsWith(".html")
      ? "no-store" : "private, no-cache, max-age=0, must-revalidate");
  }
}));
app.get("/version", (_req, res) => { res.setHeader("Cache-Control", "no-store"); res.json(buildInfo); });
app.get("/health", (_req, res) => res.json({ ok: true }));

function reply(ack, payload) {
  if (typeof ack === "function") ack(payload);
}

function lobby() {
  return [...rooms.values()].map(room => ({
    id: room.id,
    name: room.name,
    gameType: room.gameType,
    players: room.players.length,
    maxPlayers: room.maxPlayers,
    started: Boolean(room.game),
    status: !room.game ? "waiting" : gameFinished(room.game) ? "finished" : "playing",
    variant: room.game?.variant || null,
    currentGame: room.game ? {
      number: room.game.gameNumber,
      totalGames: room.match?.totalGames || null,
      rated: Boolean(room.match?.rated),
      sprint: Boolean(room.game.sprint),
      variant: room.game.variant || null,
      variantMode: room.game.kind === "backgammon" ? room.match?.variantMode || "rotate" : null,
      round: room.game.kind === "backgammon" && room.match?.variantMode !== "normal" ? Math.ceil(room.game.gameNumber / 3) : null,
      roundCount: room.game.kind === "backgammon" ? room.match?.roundCount || null : null
    } : null,
    playerList: room.players.map(playerView),
    watchers: (room.watchers || []).map(playerView)
  }));
}

function emitLobby() {
  io.emit("lobby", lobby());
  emitPeople();
}

function people(){
 return [...sessions.values()].filter(p=>p.socketId||findMembership(p.id)).map(p=>{
  const seated=findPlayerRoom(p.id),watched=findWatchedRoom(p.id),room=seated||watched;
  return {...playerView(p),activity:!p.socketId?"Disconnected":p.browsingLobby||!room?"In lobby":watched?"Watching":room.game&&!gameFinished(room.game)?"Playing":"At table",roomId:room?.id||null,roomName:room?.name||null};
 });
}
function emitPeople(){io.emit("people",people())}
function invitationView(player){
 const invitation=player.invitation,room=invitation&&rooms.get(invitation.roomId);
 if(!room||room.game||room.players.length>=room.maxPlayers)return null;
 return {id:invitation.id,roomId:room.id,roomName:room.name,gameType:room.gameType,fromName:invitation.fromName,
  actionable:!findMembership(player.id)&&!maintenance};
}
const gameFinished=game=>Boolean(game?.winner||game?.finished);
function emitInvitation(player){
 const view=player.invitation?invitationView(player):null;
 if(player.invitation&&!view)player.invitation=null;
 for(const client of io.sockets.sockets.values())if(client.data.player===player)client.emit("gameInvitation",view);
}
function clearInvitation(player){player.invitation=null;emitInvitation(player)}
function clearRoomInvitations(roomId){
 for(const player of sessions.values())if(player.invitation?.roomId===roomId)clearInvitation(player);
}
function checkMaintenance(){if(maintenance)throw Error("Maintenance announced. New games are paused.")}
function adminStatus(){
 const users=people(),unfinished=[...rooms.values()].filter(r=>r.game&&!gameFinished(r.game));
 return {build:buildInfo,maintenance,onlineUsers:users.filter(p=>p.connected).length,people:users,
  rooms:lobby(),unfinishedGames:unfinished.map(r=>({id:r.id,name:r.name,gameType:r.gameType})),
  safeToDeploy:Boolean(maintenance&&Date.now()>=maintenance.deadline&&users.every(p=>!p.connected)&&!unfinished.length),
  memory:process.memoryUsage(),cpuMicros:process.cpuUsage(),uptimeSeconds:process.uptime(),audit:audit.status(),scores:scoreStore.status()};
}
const admin=startAdmin({port:process.env.ADMIN_PORT,tokenPath:process.env.ADMIN_TOKEN_FILE,status:adminStatus,
 announce:input=>{if(!Number.isFinite(input.minutes)||input.minutes<0||input.minutes>1440)throw Error("Choose 0 to 1440 minutes");maintenance={deadline:Date.now()+input.minutes*60000,message:cleanText(input.message,"Planned server restart",180)};io.emit("maintenance",maintenance)},
 lock:()=>{maintenance.locked=true;io.emit("maintenance",maintenance)},
 cancel:()=>{maintenance=null;io.emit("maintenance",null)},
 listAccounts:()=>scoreStore.listAccounts(),
 approveAccount:(id,approved)=>{const account=scoreStore.setApproved(id,approved);for(const player of sessions.values())if(player.account?.id===id)player.account=account;for(const room of rooms.values())if([...room.players,...(room.watchers||[])].some(player=>player.account?.id===id))emitRoom(room,false);emitPeople();return account}});

function playerView(player) {
  return { id: player.id, name: player.name, connected: Boolean(player.socketId),
    account:player.account?{signedIn:true,approved:Boolean(player.account.approved),displayName:player.account.displayName}:null };
}

function findPlayerRoom(playerId) {
  return [...rooms.values()].find(room => room.players.some(player => player.id === playerId));
}

function findWatchedRoom(playerId) {
  return [...rooms.values()].find(room => (room.watchers || []).some(player => player.id === playerId));
}
function findMembership(playerId) { return findPlayerRoom(playerId) || findWatchedRoom(playerId); }
function notifyRoomLeft(playerId, roomId) {
  for (const client of io.sockets.sockets.values()) {
    if (client.data.player?.id === playerId) {
      client.leave(roomId); client.emit("roomLeft", { id: roomId });
    }
  }
}
function deleteRoom(room) {
  clearRoomInvitations(room.id);
  for (const member of [...room.players,...(room.watchers || [])]) notifyRoomLeft(member.id,room.id);
  rooms.delete(room.id);
}

function touchRoom(room) {
  room.lastActive = Date.now();
}

function emitRoom(room, touch = true) {
  if (touch) touchRoom(room);
  for (const player of [...room.players,...(room.watchers || [])]) {
    const role = room.players.some(member => member.id === player.id) ? "player" : "watcher";
    const viewer = role === "player" ? player.id : null;
    const state = room.game?.kind === "rummy" ? publicRummy(room.game, viewer)
      : room.game?.kind === "backgammon" ? publicBackgammon(room.game, viewer)
      : room.game?.kind === "santase" ? publicSantase(room.game, viewer)
      : room.game?.kind === "blato" ? publicBlato(room.game, viewer) : room.game;
    if (player.socketId) {
      io.to(player.socketId).emit("room", {
        protocolVersion: PROTOCOL_VERSION,
        id: room.id,
        name: room.name,
        gameType: room.gameType,
        maxPlayers: room.maxPlayers,
        hostId: room.hostId,
        role,
        watchers: (room.watchers || []).map(playerView),
        players: room.players.map(playerView),
        formerPlayers: room.formerPlayers || [],
        match: room.match,
        game: state
      });
    }
  }
  emitLobby();
}

function startRummyMatch(room, sprintCount) {
  room.formerPlayers = [];
  const cycles = Math.max(2, Math.min(10, Number(sprintCount) || 2));
  room.gameNumber = 0;
  room.match = {
    sprintCount: cycles,
    totalGames: cycles * (room.players.length + 1),
    completedGames: 0,
    cumulative: Object.fromEntries(room.players.map(player => [player.id, 0])),
    finished: false
  };
}

function recordRummyResult(room) {
  if (room.game?.kind !== "rummy" || !room.game.winner || room.game.resultRecorded) return;
  room.game.resultRecorded = true;
  for (const [id, score] of Object.entries(room.game.scores.players)) {
    room.match.cumulative[id] = (room.match.cumulative[id] || 0) + score.match;
  }
  room.match.completedGames = room.game.gameNumber;
  room.match.finished = Boolean(room.match.endAfterHand) || room.match.completedGames >= room.match.totalGames;
}

function recordResult(room) {
  recordRummyResult(room);
  recordBackgammonResult(room);
  recordSantaseResult(room);
  recordBlatoResult(room);
  if(room.match?.finished&&gameFinished(room.game)&&room.game.resultRecorded&&room.match.rated&&room.ratingContext&&!room.ratingContext.recorded){
   try{
    const result=scoreStore.recordMatch({id:room.ratingContext.id,roomId:room.id,category:room.ratingContext.category,
     participants:room.ratingContext.players.map(item=>({accountId:item.accountId,score:Number(room.match.cumulative[item.playerId]||0)}))});
    room.ratingContext.recorded=true;
    room.match.ratingChanges=result.changes.map(change=>{const item=room.ratingContext.players.find(player=>player.accountId===change.accountId);return {...change,playerId:item.playerId}});
   }catch(error){room.match.ratingError='The match finished, but its rating could not be recorded.';console.error('Rating record failed:',error.message)}
  }
}

function enableRatedMatch(room,rated,category){
 room.match.rated=Boolean(rated);room.ratingContext=null;if(!rated)return;
 const players=room.players.map(player=>({playerId:player.id,account:player.account&&scoreStore.getAccount(player.account.id)}));
 if(players.some(item=>!item.account?.approved))throw Error('Every player must be signed in and approved for a rated match.');
 if(new Set(players.map(item=>item.account.id)).size!==players.length)throw Error('A rated match requires a different account for every player.');
 room.ratingContext={id:randomUUID(),category,recorded:false,players:players.map(item=>({playerId:item.playerId,accountId:item.account.id}))};
}
function validateRatedMatch(room,rated){
 if(!rated)return;const accounts=room.players.map(player=>player.account&&scoreStore.getAccount(player.account.id));
 if(accounts.some(account=>!account?.approved))throw Error('Every player must be signed in and approved for a rated match.');
 if(new Set(accounts.map(account=>account.id)).size!==accounts.length)throw Error('A rated match requires a different account for every player.');
}

function makeRoomId() {
  let id;
  do id = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  while (rooms.has(id));
  return id;
}

function pruneDisconnectedSessions() {
  const disconnected = [...sessions.entries()]
    .filter(([, player]) => !player.socketId)
    .sort((a, b) => a[1].lastSeen - b[1].lastSeen);
  while (sessions.size >= MAX_SESSIONS && disconnected.length) {
    sessions.delete(disconnected.shift()[0]);
  }
}

io.on("connection", socket => {
  if (io.engine.clientsCount > MAX_CONNECTIONS) {
    socket.disconnect(true);
    return;
  }

  socket.data.account=googleAuth.accountFromHeader(socket.handshake.headers.cookie);
  const eventRate = { startedAt: Date.now(), count: 0 };
  socket.use((_packet, next) => {
    const now = Date.now();
    if (now - eventRate.startedAt >= EVENT_WINDOW_MS) {
      eventRate.startedAt = now;
      eventRate.count = 0;
    }
    eventRate.count += 1;
    if (eventRate.count > MAX_EVENTS_PER_WINDOW) {
      socket.disconnect(true);
      return;
    }
    next();
  });

  socket.emit("serverVersion", buildInfo);
  socket.emit("lobby", lobby());
  socket.emit("maintenance",maintenance);
  socket.emit("people",people());

  socket.on("identify", (payload, ack) => {
    try {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw Error("Invalid identification.");
      }
      if(maintenance?.locked)throw Error("Maintenance in progress. Try again after the update.");
      let token = typeof payload.token === "string" ? payload.token.slice(0, 100) : "";
      let player = token ? sessions.get(token) : null;
      const sessionReplaced = Boolean(token && !player);
      if (socket.data.player && player !== socket.data.player)
        throw Error("Already identified. Reconnect to change identity.");

      if (!player) {
        checkMaintenance();
        pruneDisconnectedSessions();
        if (sessions.size >= MAX_SESSIONS) throw Error("Server is busy. Try again later.");
        token = randomUUID();
        player = {
          id: randomUUID(),
          name: cleanText(payload.name, "Player", 24),
          socketId: socket.id,
          lastSeen: Date.now()
        };
        sessions.set(token, player);
      }

      player.name = cleanText(payload.name, player.name, 24);
      player.account=socket.data.account||null;
      player.socketId = socket.id;
      player.lastSeen = Date.now();
      socket.data.player = player;
      socket.data.token = token;

      emitPeople();
      reply(ack, { ok: true, token, player: playerView(player), sessionReplaced, resumed: Boolean(findMembership(player.id)) });
      emitInvitation(player);
      for (const room of rooms.values()) {
        if (room.players.some(candidate => candidate.id === player.id) || (room.watchers || []).some(candidate => candidate.id === player.id)) {
          player.browsingLobby=false;
      socket.join(room.id);
          emitRoom(room, Boolean(findPlayerRoom(player.id)));
        }
      }
    } catch (error) {
      reply(ack, { ok: false, error: error.message });
    }
  });

  socket.on("setView",(payload,ack)=>{
    const player=socket.data.player;if(!player){reply(ack,{ok:false});return}
    player.browsingLobby=payload?.view==="lobby";emitPeople();reply(ack,{ok:true});
  });
  socket.on("rename",(payload,ack)=>{
    const player=socket.data.player;
    if(!player||typeof payload?.name!=="string"||!payload.name.trim()){reply(ack,{ok:false,error:"Enter a name."});return}
    player.name=cleanText(payload.name,"Player",24);
    for(const client of io.sockets.sockets.values())if(client.data.player===player)client.emit("identityChanged",playerView(player));
    const room=findMembership(player.id);if(room)emitRoom(room,false);else emitLobby();
    reply(ack,{ok:true});
  });
  socket.on("signOut",(_payload,ack)=>{
    const player=socket.data.player;
    if(player&&findMembership(player.id)){reply(ack,{ok:false,error:"Leave your table or stop watching before signing out."});return}
    const token=socket.data.token;if(token)sessions.delete(token);
    for(const client of io.sockets.sockets.values())if(token&&client.data.token===token){client.data.player=null;client.data.token=null;client.emit("signedOut")}
    emitPeople();reply(ack,{ok:true});
  });

  socket.on("invitePlayer",(payload,ack)=>{
    try{
      const player=socket.data.player,room=findPlayerRoom(player?.id);
      if(!player||!room)throw Error("Join a table before inviting someone.");
      if(room.game)throw Error("Invitations are available before the game starts.");
      if(room.players.length>=room.maxPlayers)throw Error("This table is full.");
      checkMaintenance();
      const targetId=typeof payload?.playerId==="string"?payload.playerId.slice(0,64):"";
      const target=[...sessions.values()].find(candidate=>candidate.id===targetId);
      if(!target||!target.socketId)throw Error("That person is no longer online.");
      if(target===player)throw Error("You are already at this table.");
      if(findMembership(target.id)?.id===room.id)throw Error("That person is already at this table.");
      target.invitation={id:randomUUID(),roomId:room.id,fromId:player.id,fromName:player.name};
      emitInvitation(target);reply(ack,{ok:true});
    }catch(error){reply(ack,{ok:false,error:error.message})}
  });

  socket.on("respondInvitation",(payload,ack)=>{
    try{
      const player=socket.data.player,invitation=player?.invitation;
      if(!player||!invitation||payload?.id!==invitation.id)throw Error("This invitation is no longer available.");
      if(payload.accept!==true){clearInvitation(player);reply(ack,{ok:true,joined:false});return}
      const room=rooms.get(invitation.roomId);
      if(!room||room.game||room.players.length>=room.maxPlayers)throw Error("This table is no longer available.");
      if(findMembership(player.id))throw Error("Leave your current table first.");
      checkMaintenance();
      clearInvitation(player);room.players.push(player);clearRoomInvitations(room.id);player.browsingLobby=false;socket.join(room.id);emitRoom(room);reply(ack,{ok:true,joined:true});
    }catch(error){if(socket.data.player?.invitation)clearInvitation(socket.data.player);reply(ack,{ok:false,error:error.message})}
  });

  socket.on("createRoom", (payload, ack) => {
    try {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw Error("Invalid room request.");
      }
      const player = socket.data.player;
      if (!player) throw Error("Choose your name first.");
      if (findMembership(player.id)) throw Error("Leave your current room first.");
      checkMaintenance();
      if (rooms.size >= MAX_ROOMS) throw Error("The room limit has been reached.");

      const gameType = ["rummy","backgammon","santase","blato"].includes(payload.gameType) ? payload.gameType : "rummy";
      const id = makeRoomId();
      const room = {
        id,
        name: uniqueName(cleanText(payload.name,suggestName([...rooms.values()].map(r=>r.name),payload.language),30),[...rooms.values()].map(r=>r.name)),
        gameType,
        maxPlayers: ["backgammon","santase"].includes(gameType)
          ? 2 : gameType === "blato" ? 3
          : Math.max(2, Math.min(6, Number(payload.maxPlayers) || 2)),
        players: [player],
        watchers: [],
        hostId: player.id,
        game: null,
        gameNumber: 0,
        match: null,
        lastActive: Date.now()
      };
      rooms.set(id, room);
      if(player.invitation)clearInvitation(player);
      player.browsingLobby=false;
      socket.join(id);
      emitRoom(room);
      reply(ack, { ok: true, id });
    } catch (error) {
      reply(ack, { ok: false, error: error.message });
    }
  });

  socket.on("joinRoom", (payload, ack) => {
    try {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw Error("Invalid room request.");
      }
      const player = socket.data.player;
      const id = typeof payload.id === "string" ? payload.id.trim().toUpperCase().slice(0, 12) : "";
      const room = rooms.get(id);
      if (!player || !room) throw Error("Room not found.");

      if (findWatchedRoom(player.id)) throw Error("Stop watching before joining a table.");
      const currentRoom = findPlayerRoom(player.id);
      if (currentRoom && currentRoom.id !== room.id) throw Error("Leave your current room first.");
      if (!room.players.some(candidate => candidate.id === player.id)) {
        checkMaintenance();
        if (room.game || room.players.length >= room.maxPlayers) throw Error("Room is unavailable.");
        room.players.push(player);
        if(room.players.length>=room.maxPlayers)clearRoomInvitations(room.id);
      }
      if(player.invitation)clearInvitation(player);
      player.browsingLobby=false;
      socket.join(room.id);
      emitRoom(room);
      reply(ack, { ok: true });
    } catch (error) {
      reply(ack, { ok: false, error: error.message });
    }
  });

  socket.on("watchRoom", (payload, ack) => {
    try {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw Error("Invalid room request.");
      const player = socket.data.player;
      if (!player) throw Error("Choose your name first.");
      const id = typeof payload.id === "string" ? payload.id.trim().toUpperCase().slice(0,12) : "";
      const room = rooms.get(id);
      if (!room) throw Error("Room not found.");
      if (findPlayerRoom(player.id)) throw Error("Leave your current room before watching.");
      const current = findWatchedRoom(player.id);
      if (current && current.id !== room.id) throw Error("Stop watching your current room first.");
      room.watchers ||= [];
      if (!current) {
        if (room.watchers.length >= MAX_WATCHERS) throw Error("The watcher limit has been reached.");
        room.watchers.push(player);
      }
      if(player.invitation)clearInvitation(player);
      player.browsingLobby=false;
      socket.join(room.id); emitRoom(room, false); reply(ack,{ok:true});
    } catch (error) { reply(ack,{ok:false,error:error.message}); }
  });

  socket.on("leaveRoom", (_payload, ack) => {
    try {
      const player = socket.data.player;
      if (!player) throw Error("Choose your name first.");
      const watched = findWatchedRoom(player.id);
      if (watched) {
        watched.watchers = watched.watchers.filter(member => member.id !== player.id);
        notifyRoomLeft(player.id,watched.id); emitRoom(watched,false);
        emitInvitation(player);
        reply(ack,{ok:true}); return;
      }
      const room = findPlayerRoom(player.id);
      if (!room) { reply(ack, { ok: true }); return; }
      if (room.game && !gameFinished(room.game)) {
        if (room.game.kind === "rummy") forfeitRummy(room.game, player.id);
        else if(room.game.kind === "backgammon")forfeitBackgammon(room.game, player.id);
        else if(room.game.kind === "santase")forfeitSantase(room.game, player.id);
        else if(room.game.kind === "blato")forfeitBlato(room.game, player.id);
      }
      if (room.match) {
        room.match.endAfterHand = true;
        room.match.finished = true;
        recordResult(room);
      }
      room.formerPlayers = [...(room.formerPlayers || []), { id: player.id, name: player.name }];
      room.players = room.players.filter(candidate => candidate.id !== player.id);
      // Clear every tab for this session, including old tabs after reconnect.
      notifyRoomLeft(player.id,room.id);
      if (!room.players.length) { deleteRoom(room); emitLobby(); }
      else {
        if (room.hostId === player.id) room.hostId = room.players[0].id;
        emitRoom(room);
      }
      emitInvitation(player);
      reply(ack, { ok: true });
    } catch (error) {
      reply(ack, { ok: false, error: error.message });
    }
  });

  socket.on("startGame", (payload, ack) => {
    try {
      if (payload !== undefined && (!payload || typeof payload !== "object" || Array.isArray(payload)))
        throw Error("Invalid start request.");
      const player = socket.data.player;
      const room = findPlayerRoom(player?.id);
      if (!room || room.hostId !== player.id) throw Error("Only the host can start.");
      if (room.players.length < 2) throw Error("At least two players are required.");
      if (room.game && !gameFinished(room.game)) throw Error("The current game is still in progress.");
      if (room.gameType === "blato" && room.players.length !== 3) throw Error("Blato requires exactly three players.");

      checkMaintenance();
      clearRoomInvitations(room.id);
      let starter = room.game?.winner || null;
      if (room.gameType === "backgammon" && (!room.match || room.match.finished)) {
        validateRatedMatch(room,payload?.rated===true);
        startBackgammonMatch(room, payload?.roundCount ?? 3, payload?.variantMode ?? "rotate");
        enableRatedMatch(room,payload?.rated===true,`backgammon-${room.match.variantMode}`);
        starter = null;
      }
      if (room.gameType === "rummy") {
        if (!room.match || room.match.finished){validateRatedMatch(room,payload?.rated===true);startRummyMatch(room, payload?.sprintCount);enableRatedMatch(room,payload?.rated===true,'rummy')}
        if (room.match.finished) throw Error("Start a new match first.");
        if (room.match.completedGames >= room.match.totalGames) throw Error("This match has finished.");
      }
      if(room.gameType==="santase"&&(!room.match||room.match.finished)){
        validateRatedMatch(room,payload?.rated===true);startSantaseMatch(room);enableRatedMatch(room,payload?.rated===true,'santase');
      }
      if(room.gameType==="blato"&&(!room.match||room.match.finished)){
        validateRatedMatch(room,payload?.rated===true);startBlatoMatch(room);enableRatedMatch(room,payload?.rated===true,'blato');
      }
      if(room.match?.finished)throw Error("Start a new match first.");
      room.gameNumber += 1;
      room.game = room.gameType === "rummy" ? newRummy(room.players, room.gameNumber)
        : room.gameType === "backgammon" ? newBackgammon(room.players, { gameNumber: room.gameNumber, starter,
          variant: backgammonVariant(room.gameNumber, room.match?.variantMode) })
        : room.gameType === "santase" ? newSantase(room.players,{gameNumber:room.gameNumber,dealer:room.match.dealer})
        : newBlato(room.players,{gameNumber:room.gameNumber,dealer:(room.gameNumber-1)%3,
          previousScores:room.match.previousScores,passesUsed:room.match.passesUsed});
      emitRoom(room);
      reply(ack, { ok: true });
    } catch (error) {
      reply(ack, { ok: false, error: error.message });
    }
  });

  socket.on("action", (action, ack) => {
    try {
      if (!action || typeof action !== "object" || Array.isArray(action)) {
        throw Error("Invalid action.");
      }
      const player = socket.data.player;
      const room = findPlayerRoom(player?.id);
      if (!room?.game) throw Error("Game not found.");
      if (room.game.kind === "rummy") rummyAction(room.game, player.id, action);
      else if(room.game.kind==="backgammon"){
        const before=room.game.rollNumber;
        backgammonAction(room.game, player.id, action);
        if(action.type==="roll"&&room.game.rollNumber>before)audit.record(room,room.game.rollHistory.at(-1));
      }else if(room.game.kind==="santase")santaseAction(room.game,player.id,action);
      else if(room.game.kind==="blato")blatoAction(room.game,player.id,action);
      recordResult(room);
      emitRoom(room);
      reply(ack, { ok: true });
    } catch (error) {
      reply(ack, { ok: false, error: error.message });
    }
  });

  socket.on("disconnect", () => {
    const player = socket.data.player;
    if (!player) return;
    if (player.socketId === socket.id) player.socketId = null;
    player.lastSeen = Date.now();
    emitPeople();
    for (const room of rooms.values()) {
      if (room.players.some(candidate => candidate.id === player.id)) emitRoom(room);
      else if ((room.watchers || []).some(candidate => candidate.id === player.id)) emitRoom(room,false);
    }
  });
});

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  let lobbyChanged = false;

  for (const [id, room] of rooms) {
    const kept = (room.watchers || []).filter(player => player.socketId || now - player.lastSeen <= WATCHER_IDLE_MS);
    if (kept.length !== (room.watchers || []).length) { room.watchers = kept; emitRoom(room,false); }
    if (now - room.lastActive > ROOM_IDLE_MS && room.players.every(player => !player.socketId)) {
      deleteRoom(room);
      lobbyChanged = true;
    }
  }

  for (const [token, player] of sessions) {
    if (!player.socketId && now - player.lastSeen > SESSION_IDLE_MS && !findMembership(player.id)) {
      sessions.delete(token);
    }
  }

  for (const [ip, entry] of connectionAttempts) {
    if (now - entry.startedAt > CONNECTION_WINDOW_MS * 2) connectionAttempts.delete(ip);
  }

  if (lobbyChanged) emitLobby();
}, 60_000);
cleanupTimer.unref();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Tabletop listening on port ${PORT}`);
});

