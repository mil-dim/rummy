import express from "express";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { Server } from "socket.io";
import { newRummy, publicRummy, rummyAction } from "./lib/rummy.js";
import { newBackgammon, backgammonAction } from "./lib/backgammon.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rooms = new Map();
const sessions = new Map();

app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ ok: true, rooms: rooms.size }));

function lobby() {
  return [...rooms.values()].map(r => ({ id: r.id, name: r.name, gameType: r.gameType,
    players: r.players.length, maxPlayers: r.maxPlayers, started: !!r.game }));
}
function emitLobby() { io.emit("lobby", lobby()); }
function playerView(p) { return { id: p.id, name: p.name, connected: !!p.socketId }; }
function emitRoom(room) {
  for (const p of room.players) {
    const state = room.game?.kind === "rummy" ? publicRummy(room.game, p.id) : room.game;
    io.to(p.socketId || "").emit("room", { id: room.id, name: room.name, gameType: room.gameType,
      hostId: room.hostId, players: room.players.map(playerView), game: state });
  }
  emitLobby();
}

io.on("connection", socket => {
  socket.emit("lobby", lobby());
  socket.on("identify", ({ token, name }, ack) => {
    let player = token && sessions.get(token);
    if (!player) {
      token = randomUUID();
      player = { id: randomUUID(), name: String(name || "Player").slice(0, 24), socketId: socket.id };
      sessions.set(token, player);
    }
    player.name = String(name || player.name).slice(0, 24);
    player.socketId = socket.id; socket.data.player = player; socket.data.token = token;
    for (const room of rooms.values()) if (room.players.some(p => p.id === player.id)) {
      socket.join(room.id); emitRoom(room);
    }
    ack?.({ token, player: playerView(player) });
  });
  socket.on("createRoom", ({ name, gameType, maxPlayers }, ack) => {
    try {
      const p = socket.data.player; if (!p) throw Error("Choose your name first.");
      const id = randomUUID().slice(0, 6).toUpperCase();
      const room = { id, name: String(name || "Game room").slice(0, 30),
        gameType: gameType === "backgammon" ? "backgammon" : "rummy",
        maxPlayers: gameType === "backgammon" ? 2 : Math.max(2, Math.min(6, Number(maxPlayers) || 4)),
        players: [p], hostId: p.id, game: null, gameNumber: 0 };
      rooms.set(id, room); socket.join(id); emitRoom(room); ack?.({ ok: true, id });
    } catch (e) { ack?.({ ok: false, error: e.message }); }
  });
  socket.on("joinRoom", ({ id }, ack) => {
    try {
      const p = socket.data.player; const room = rooms.get(String(id).toUpperCase());
      if (!p || !room) throw Error("Room not found.");
      if (!room.players.some(x => x.id === p.id)) {
        if (room.game || room.players.length >= room.maxPlayers) throw Error("Room is unavailable.");
        room.players.push(p);
      }
      socket.join(room.id); emitRoom(room); ack?.({ ok: true });
    } catch (e) { ack?.({ ok: false, error: e.message }); }
  });
  socket.on("startGame", (_data, ack) => {
    try {
      const p = socket.data.player; const room = [...rooms.values()].find(r => r.players.some(x => x.id === p?.id));
      if (!room || room.hostId !== p.id) throw Error("Only the host can start.");
      if (room.players.length < 2) throw Error("At least two players are required.");
      room.gameNumber++;
      room.game = room.gameType === "rummy" ? newRummy(room.players, room.gameNumber) : newBackgammon(room.players);
      emitRoom(room); ack?.({ ok: true });
    } catch (e) { ack?.({ ok: false, error: e.message }); }
  });
  socket.on("action", (action, ack) => {
    try {
      const p = socket.data.player; const room = [...rooms.values()].find(r => r.game?.players.includes(p?.id));
      if (!room) throw Error("Game not found.");
      room.game.kind === "rummy" ? rummyAction(room.game, p.id, action) : backgammonAction(room.game, p.id, action);
      emitRoom(room); ack?.({ ok: true });
    } catch (e) { ack?.({ ok: false, error: e.message }); }
  });
  socket.on("disconnect", () => {
    const p = socket.data.player; if (!p) return; p.socketId = null;
    for (const room of rooms.values()) if (room.players.some(x => x.id === p.id)) emitRoom(room);
  });
});

server.listen(Number(process.env.PORT) || 8080, "0.0.0.0",
  () => console.log(`Tabletop LAN listening on port ${process.env.PORT || 8080}`));
