"use strict";

/**
 * Serves this folder and relays online rooms.
 * Run: node server.js
 * Then open http://127.0.0.1:8780
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 8780;
const ROOT = __dirname;
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const rooms = new Map();
let nextId = 1;

function sendRaw(socket, text) {
  const payload = Buffer.from(text);
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  if (socket.writable) socket.write(Buffer.concat([header, payload]));
}

function send(socket, obj) {
  try { sendRaw(socket, JSON.stringify(obj)); } catch (err) { /* closed */ }
}

function codeOf() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return rooms.has(code) ? codeOf() : code;
}

function membersOf(room) {
  return [...room.members.values()].map((m) => ({ id: m.id, name: m.name }));
}

function broadcast(room, obj, exceptId) {
  for (const member of room.members.values()) {
    if (member.id === exceptId) continue;
    send(member.socket, obj);
  }
}

function leave(member) {
  const room = member.room;
  if (!room) return;
  room.members.delete(member.id);
  member.room = null;
  if (room.members.size === 0 || member.id === room.hostId) {
    rooms.delete(room.code);
    broadcast(room, { t: "closed", reason: "The host left." });
    for (const other of room.members.values()) other.room = null;
    room.members.clear();
    return;
  }
  broadcast(room, { t: "left", id: member.id, hostId: room.hostId, members: membersOf(room) });
}

function onText(member, text) {
  let msg;
  try { msg = JSON.parse(text); } catch (err) { return; }
  if (!msg || typeof msg !== "object") return;
  if (msg.t === "create") {
    if (member.room) leave(member);
    member.name = String(msg.name || "Player").slice(0, 16);
    const code = codeOf();
    const room = { code, hostId: member.id, members: new Map() };
    room.members.set(member.id, member);
    member.room = room;
    rooms.set(code, room);
    send(member.socket, { t: "created", code, id: member.id, hostId: room.hostId, members: membersOf(room) });
    return;
  }
  if (msg.t === "join") {
    const code = String(msg.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const room = rooms.get(code);
    if (!room) {
      send(member.socket, { t: "error", text: "No room with that code." });
      return;
    }
    if (room.members.size >= 6) {
      send(member.socket, { t: "error", text: "That room is full." });
      return;
    }
    if (member.room) leave(member);
    member.name = String(msg.name || "Player").slice(0, 16);
    room.members.set(member.id, member);
    member.room = room;
    send(member.socket, { t: "joined", code, id: member.id, hostId: room.hostId, members: membersOf(room) });
    broadcast(room, { t: "peer", id: member.id, hostId: room.hostId, members: membersOf(room) }, member.id);
    return;
  }
  if (msg.t === "relay" && member.room) {
    broadcast(member.room, { t: "msg", from: member.id, data: msg.data }, member.id);
  }
}

function consume(member) {
  let buf = member.buf;
  while (buf.length >= 2) {
    const opcode = buf[0] & 0x0f;
    const masked = (buf[1] & 0x80) !== 0;
    let len = buf[1] & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (buf.length < 4) break;
      len = buf.readUInt16BE(2);
      offset = 4;
    } else if (len === 127) {
      if (buf.length < 10) break;
      const hi = buf.readUInt32BE(2);
      len = buf.readUInt32BE(6);
      if (hi !== 0 || len > 1_000_000) {
        member.socket.destroy();
        return;
      }
      offset = 10;
    }
    if (len > 1_000_000) {
      member.socket.destroy();
      return;
    }
    const maskLen = masked ? 4 : 0;
    if (buf.length < offset + maskLen + len) break;
    const mask = masked ? buf.subarray(offset, offset + maskLen) : null;
    offset += maskLen;
    const payload = Buffer.alloc(len);
    for (let i = 0; i < len; i++) payload[i] = buf[offset + i] ^ (mask ? mask[i % 4] : 0);
    buf = buf.subarray(offset + len);
    if (opcode === 0x8) {
      member.socket.end();
      break;
    } else if (opcode === 0x9) {
      const pong = Buffer.concat([Buffer.from([0x8a, payload.length]), payload]);
      if (payload.length < 126 && member.socket.writable) member.socket.write(pong);
    } else if (opcode === 0x1) {
      onText(member, payload.toString("utf8"));
    }
  }
  member.buf = buf;
}

function serveFile(req, res) {
  const raw = decodeURIComponent((req.url || "/").split("?")[0]);
  const rel = raw === "/" ? "index.html" : raw.replace(/^[/\\]+/, "");
  const file = path.resolve(ROOT, rel);
  const root = path.resolve(ROOT);
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(serveFile);

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key || String(req.headers.upgrade || "").toLowerCase() !== "websocket") {
    socket.destroy();
    return;
  }
  const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    "Sec-WebSocket-Accept: " + accept + "\r\n\r\n"
  );
  const member = { id: nextId++, name: "Player", socket, room: null, buf: Buffer.alloc(0) };
  socket.on("data", (chunk) => {
    member.buf = Buffer.concat([member.buf, chunk]);
    consume(member);
  });
  socket.on("close", () => leave(member));
  socket.on("error", () => leave(member));
});

server.listen(PORT, () => {
  console.log("Arena is at http://127.0.0.1:" + PORT);
});
