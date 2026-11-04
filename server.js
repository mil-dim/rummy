import express from "express";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { Server } from "socket.io";
import { newRummy, publicRummy, rummyAction, forfeitRummy } from "./lib/rummy.js";
import { newBackgammon, backgammonAction, publicBackgammon, forfeitBackgammon } from "./lib/backgammon.js";

import { startBackgammonMatch, recordBackgammonResult } from "./lib/backgammon-match.js";

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
const PROTOCOL_VERSION = 5;
const configuredOrigins = new Set(
  String(process.env.PUBLIC_ORIGINS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
);

const rooms = new Map();
const sessions = new Map();
const connectionAttempts = new Map();
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
app.get(["/", "/index.html"], (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(indexHtml);
});

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
    started: Boolean(room.game)
  }));
}

function emitLobby() {
  io.emit("lobby", lobby());
}

function playerView(player) {
  return { id: player.id, name: player.name, connected: Boolean(player.socketId) };
}

function findPlayerRoom(playerId) {
  return [...rooms.values()].find(room => room.players.some(player => player.id === playerId));
}

function touchRoom(room) {
  room.lastActive = Date.now();
}

function emitRoom(room) {
  touchRoom(room);
  for (const player of room.players) {
    const state = room.game?.kind === "rummy" ? publicRummy(room.game, player.id)
      : room.game?.kind === "backgammon" ? publicBackgammon(room.game, player.id) : room.game;
    if (player.socketId) {
      io.to(player.socketId).emit("room", {
        protocolVersion: PROTOCOL_VERSION,
        id: room.id,
        name: room.name,
        gameType: room.gameType,
        hostId: room.hostId,
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

  socket.on("identify", (payload, ack) => {
    try {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw Error("Invalid identification.");
      }
      let token = typeof payload.token === "string" ? payload.token.slice(0, 100) : "";
      let player = token ? sessions.get(token) : null;
      const sessionReplaced = Boolean(token && !player);
      if (socket.data.player && player !== socket.data.player)
        throw Error("Already identified. Reconnect to change identity.");

      if (!player) {
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
      player.socketId = socket.id;
      player.lastSeen = Date.now();
      socket.data.player = player;
      socket.data.token = token;

      reply(ack, { ok: true, token, player: playerView(player), sessionReplaced, resumed: Boolean(findPlayerRoom(player.id)) });
      for (const room of rooms.values()) {
        if (room.players.some(candidate => candidate.id === player.id)) {
          socket.join(room.id);
          emitRoom(room);
        }
      }
    } catch (error) {
      reply(ack, { ok: false, error: error.message });
    }
  });

  socket.on("createRoom", (payload, ack) => {
    try {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw Error("Invalid room request.");
      }
      const player = socket.data.player;
      if (!player) throw Error("Choose your name first.");
      if (findPlayerRoom(player.id)) throw Error("Leave your current room first.");
      if (rooms.size >= MAX_ROOMS) throw Error("The room limit has been reached.");

      const gameType = payload.gameType === "backgammon" ? "backgammon" : "rummy";
      const id = makeRoomId();
      const room = {
        id,
        name: cleanText(payload.name, "Game room", 30),
        gameType,
        maxPlayers: gameType === "backgammon"
          ? 2
          : Math.max(2, Math.min(6, Number(payload.maxPlayers) || 4)),
        players: [player],
        hostId: player.id,
        game: null,
        gameNumber: 0,
        match: null,
        lastActive: Date.now()
      };
      rooms.set(id, room);
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

      const currentRoom = findPlayerRoom(player.id);
      if (currentRoom && currentRoom.id !== room.id) throw Error("Leave your current room first.");
      if (!room.players.some(candidate => candidate.id === player.id)) {
        if (room.game || room.players.length >= room.maxPlayers) throw Error("Room is unavailable.");
        room.players.push(player);
      }
      socket.join(room.id);
      emitRoom(room);
      reply(ack, { ok: true });
    } catch (error) {
      reply(ack, { ok: false, error: error.message });
    }
  });

  socket.on("leaveRoom", (_payload, ack) => {
    try {
      const player = socket.data.player;
      if (!player) throw Error("Choose your name first.");
      const room = findPlayerRoom(player.id);
      if (!room) { reply(ack, { ok: true }); return; }
      if (room.game && !room.game.winner) {
        if (room.game.kind === "rummy") forfeitRummy(room.game, player.id);
        else forfeitBackgammon(room.game, player.id);
      }
      if (room.match) {
        room.match.endAfterHand = true;
        room.match.finished = true;
        recordResult(room);
      }
      room.formerPlayers = [...(room.formerPlayers || []), { id: player.id, name: player.name }];
      room.players = room.players.filter(candidate => candidate.id !== player.id);
      // Leave every tab belonging to this session, not just this socket.
      for (const client of io.sockets.sockets.values()) {
        if (client.data.player?.id === player.id) {
          client.leave(room.id);
          client.emit("roomLeft", { id: room.id });
        }
      }
      if (!room.players.length) { rooms.delete(room.id); emitLobby(); }
      else {
        if (room.hostId === player.id) room.hostId = room.players[0].id;
        emitRoom(room);
      }
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
      if (room.game && !room.game.winner) throw Error("The current game is still in progress.");

      let starter = room.game?.winner || null;
      if (room.gameType === "backgammon" && (!room.match || room.match.finished)) {
        startBackgammonMatch(room, payload?.gameCount ?? 5);
        starter = null;
      }
      if (room.gameType === "rummy") {
        if (!room.match || room.match.finished) startRummyMatch(room, payload?.sprintCount);
        if (room.match.finished) throw Error("Start a new match first.");
        if (room.match.completedGames >= room.match.totalGames) throw Error("This match has finished.");
      }
      room.gameNumber += 1;
      room.game = room.gameType === "rummy"
        ? newRummy(room.players, room.gameNumber)
        : newBackgammon(room.players, { gameNumber: room.gameNumber, starter });
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
      else backgammonAction(room.game, player.id, action);
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
    for (const room of rooms.values()) {
      if (room.players.some(candidate => candidate.id === player.id)) emitRoom(room);
    }
  });
});

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  let lobbyChanged = false;

  for (const [id, room] of rooms) {
    if (now - room.lastActive > ROOM_IDLE_MS && room.players.every(player => !player.socketId)) {
      rooms.delete(id);
      lobbyChanged = true;
    }
  }

  for (const [token, player] of sessions) {
    if (!player.socketId && now - player.lastSeen > SESSION_IDLE_MS && !findPlayerRoom(player.id)) {
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
