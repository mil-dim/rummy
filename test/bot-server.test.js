import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import { io } from "socket.io-client";

const send = (socket, event, payload = {}) => socket.timeout(3000).emitWithAck(event, payload);

test("authenticated external bots are marked and do not block an otherwise safe deploy", { timeout: 12000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "tabletop-bot-"));
  const tokenPath = join(directory, "admin.token");
  const child = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: "18109", ADMIN_PORT: "18110",
    ADMIN_TOKEN_FILE: tokenPath, BOT_TOKEN: "test-bot-secret" }, stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => { child.kill(); rmSync(directory, { recursive: true, force: true }); });
  await once(child.stdout, "data");

  const clients = [];
  t.after(() => clients.forEach(client => client.disconnect()));
  async function connect(name, auth = {}) {
    const socket = io("http://127.0.0.1:18109", { transports: ["websocket"], forceNew: true, reconnection: false, auth });
    clients.push(socket); await once(socket, "connect");
    const identity = await send(socket, "identify", { name });
    assert.equal(identity.ok, true); return { socket, identity };
  }
  const human = await connect("Human");
  const bot = await connect("Tabletop Bot", { botToken: "test-bot-secret" });
  assert.equal(bot.identity.player.bot, true);
  assert.equal(human.identity.player.bot, false);

  const admin = (method, path, body) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: 18110, method, path,
      headers: { Authorization: "Bearer " + readFileSync(tokenPath, "utf8") } }, response => {
      let data = ""; response.on("data", chunk => data += chunk);
      response.on("end", () => resolve(JSON.parse(data)));
    });
    req.on("error", reject); req.end(body ? JSON.stringify(body) : null);
  });
  let status = await admin("GET", "/status");
  assert.equal(status.onlineUsers, 1);
  assert.equal(status.people.find(person => person.bot).name, "Tabletop Bot");

  await send(human.socket, "signOut");
  await admin("POST", "/maintenance", { minutes: 0, message: "Test" });
  status = await admin("GET", "/status");
  assert.equal(status.onlineUsers, 0);
  assert.equal(status.safeToDeploy, true);
});
