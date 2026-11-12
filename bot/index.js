import { io } from "socket.io-client";
import { chooseAction } from "./strategy.js";

const url = String(process.env.GAME_URL || "http://tabletop:8080");
const token = String(process.env.BOT_TOKEN || "");
const baseName = String(process.env.BOT_NAME || "Tabletop Bot").slice(0, 20);
const count = Math.max(1, Math.min(4, Number(process.env.BOT_COUNT) || 1));
const minimumDelay = Math.max(100, Number(process.env.BOT_MIN_DELAY_MS) || 650);
const maximumDelay = Math.max(minimumDelay, Number(process.env.BOT_MAX_DELAY_MS) || 1400);

if (!token) {
  console.log("Tabletop bot is disabled: set BOT_TOKEN in the environment and recreate both services.");
  setInterval(() => {}, 60 * 60 * 1000);
} else {
  for (let index = 0; index < count; index++) startBot(index);
}

function startBot(index) {
  const name = index ? `${baseName} ${index + 1}` : baseName;
  let sessionToken = "", playerId = "", latestRoom = null, timer = null, inFlight = false, lastAttempt = "";
  const socket = io(url, {
    auth: { botToken: token },
    reconnection: true,
    reconnectionDelay: 750,
    reconnectionDelayMax: 5000,
    transports: ["websocket", "polling"]
  });

  socket.on("connect", () => {
    socket.emit("identify", { token: sessionToken, name, locale: "en", timeZone: "UTC" }, response => {
      if (!response?.ok) return console.error(`${name}: identify failed: ${response?.error || "unknown error"}`);
      sessionToken = response.token;
      playerId = response.player.id;
      console.log(`${name}: connected as ${playerId}`);
    });
  });

  socket.on("connect_error", error => console.error(`${name}: connection failed: ${error.message}`));
  socket.on("disconnect", reason => {
    latestRoom = null;
    if (timer) clearTimeout(timer);
    timer = null;
    inFlight = false;
    console.log(`${name}: disconnected (${reason})`);
  });

  socket.on("gameInvitation", invitation => {
    if (!invitation?.id || !invitation.actionable || latestRoom) return;
    socket.emit("respondInvitation", { id: invitation.id, accept: true }, response => {
      if (!response?.ok) console.error(`${name}: could not accept invitation: ${response?.error}`);
      else console.log(`${name}: joined ${invitation.roomName}`);
    });
  });

  socket.on("roomLeft", () => {
    latestRoom = null;
    lastAttempt = "";
  });

  socket.on("room", room => {
    latestRoom = room;
    consider();
  });

  function consider() {
    if (!playerId || !latestRoom || inFlight || timer) return;
    const action = chooseAction(latestRoom, playerId);
    if (!action) return;
    const attempt = JSON.stringify([latestRoom.id, latestRoom.game, action]);
    if (attempt === lastAttempt) return;
    const delay = minimumDelay + Math.floor(Math.random() * (maximumDelay - minimumDelay + 1));
    timer = setTimeout(() => {
      timer = null;
      inFlight = true;
      lastAttempt = attempt;
      socket.emit("action", action, response => {
        inFlight = false;
        if (!response?.ok) console.error(`${name}: action ${action.type} rejected: ${response?.error}`);
        consider();
      });
    }, delay);
  }
}
