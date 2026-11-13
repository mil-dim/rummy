import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { io } from "socket.io-client";

const send = (socket, event, payload = {}) => socket.timeout(3000).emitWithAck(event, payload);
const waitEvent = (socket, name, predicate = () => true) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { socket.off(name, listener); reject(Error(`Timed out waiting for ${name}`)); }, 5000);
  const listener = value => { if (predicate(value)) { clearTimeout(timer); socket.off(name, listener); resolve(value); } };
  socket.on(name, listener);
});

test("companion bot accepts a normal invitation and makes a projected game action", { timeout: 15000 }, async t => {
  const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: "18111", BOT_TOKEN: "client-test-secret" },
    stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => server.kill()); await once(server.stdout, "data");
  const human = io("http://127.0.0.1:18111", { transports: ["websocket"], forceNew: true, reconnection: false });
  t.after(() => human.disconnect()); await once(human, "connect");
  human.on("room", value => human.room = value);
  const identity = await send(human, "identify", { name: "Human" });
  const botAppeared = waitEvent(human, "people", list => list.some(person => person.bot));
  const bot = spawn(process.execPath, ["bot/index.js"], { env: { ...process.env, GAME_URL: "http://127.0.0.1:18111",
    BOT_TOKEN: "client-test-secret", BOT_NAME: "Test Bot", BOT_MIN_DELAY_MS: "10", BOT_MAX_DELAY_MS: "20" },
    stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => bot.kill());
  const people = await botAppeared;
  const botPlayer = people.find(person => person.bot);
  assert.equal(botPlayer.name, "Test Bot");

  const made = await send(human, "createRoom", { name: "Bot test", gameType: "backgammon" });
  const joined = waitEvent(human, "room", value => value.id === made.id && value.players.length === 2);
  assert.equal((await send(human, "invitePlayer", { playerId: botPlayer.id })).ok, true);
  const joinedRoom = await joined;
  const botId = joinedRoom.players.find(player => player.bot).id;
  const botRolled = waitEvent(human, "room", value => value.game?.rollHistory?.some(roll => roll.playerId === botId));
  assert.equal((await send(human, "startGame", { roundCount: 1, variantMode: "normal" })).ok, true);
  assert.equal((await send(human, "action", { type: "roll" })).ok, true);
  const afterRoll = await botRolled;
  assert.ok(afterRoll.game.rollHistory.some(roll => roll.playerId === botId && roll.kind === "opening"));
  assert.equal(identity.player.bot, false);

  const emptyLobby = waitEvent(human, "lobby", rooms => !rooms.some(room => room.id === made.id));
  assert.equal((await send(human, "leaveRoom")).ok, true);
  await emptyLobby; // The bot does not keep an abandoned one-player room alive.
});
