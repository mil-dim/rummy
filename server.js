import express from "express";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { Server } from "socket.io";
import { newRummy, publicRummy, rummyAction } from "./lib/rummy.js";
import { newBackgammon, backgammonAction } from "./lib/backgammon.js";

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
app.use(express.static("public", { dotfiles: "deny", etag: true, maxAge: "1h" }));
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
    const state = room.game?.kind === "rummy" ? publicRummy(room.game, player.id) : room.game;
    if (player.socketId) {
      io.to(player.socketId).emit("room", {
        id: room.id,
        name: room.name,
        gameType: room.gameType,
        hostId: room.hostId,
        players: room.players.map(playerView),
        game: state
      });
    }
  }
  emitLobby();
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

  socket.emit("lobby", lobby());

  socket.on("identify", (payload, ack) => {
    try {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw Error("Invalid identification.");
      }
      let token = typeof payload.token === "string" ? payload.token.slice(0, 100) : "";
      let player = token ? sessions.get(token) : null;

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

      for (const room of rooms.values()) {
        if (room.players.some(candidate => candidate.id === player.id)) {
          socket.join(room.id);
          emitRoom(room);
        }
      }
      reply(ack, { ok: true, token, player: playerView(player) });
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

  socket.on("startGame", (_payload, ack) => {
    try {
      const player = socket.data.player;
      const room = findPlayerRoom(player?.id);
      if (!room || room.hostId !== player.id) throw Error("Only the host can start.");
      if (room.players.length < 2) throw Error("At least two players are required.");
      room.gameNumber += 1;
      room.game = room.gameType === "rummy"
        ? newRummy(room.players, room.gameNumber)
        : newBackgammon(room.players);
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
      const room = [...rooms.values()].find(candidate => candidate.game?.players.includes(player?.id));
      if (!room) throw Error("Game not found.");
      if (room.game.kind === "rummy") rummyAction(room.game, player.id, action);
      else backgammonAction(room.game, player.id, action);
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
