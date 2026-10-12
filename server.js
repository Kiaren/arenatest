"use strict";

/**
 * Serves this folder, relays private rooms, and runs matchmaking.
 * Run: node server.js
 * Then open http://127.0.0.1:8780
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const vm = require("vm");

const PORT = Number(process.env.PORT) || 8780;
const ROOT = __dirname;
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".glb": "model/gltf-binary",
};

const rooms = new Map();
const parties = new Map();
const queues = { 1: [], 2: [], 3: [] };
const live = new Map();
const CLASS_IDS = new Set(["warrior", "mage", "hunter", "priest", "warlock", "druid", "rogue", "warden", "binder", "vow", "duelist"]);
let nextId = 1;
let nextMatch = 1;
let simScript = null;

function arenaScript() {
  if (!simScript) simScript = new vm.Script(fs.readFileSync(path.join(ROOT, "game.js"), "utf8"), { filename: "game.js" });
  return simScript;
}

function bootArena() {
  const sandbox = {
    console,
    HEADLESS: true,
    performance: { now: () => Date.now() },
    requestAnimationFrame() {},
    cancelAnimationFrame() {},
    setTimeout,
    clearTimeout,
    Math,
    Date,
    JSON,
    Object,
    Array,
    Number,
    String,
    Boolean,
    parseInt,
    parseFloat,
    isNaN,
    Infinity,
    NaN,
    undefined,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.document = {
    getElementById() { return null; },
    addEventListener() {},
    createElement() { return null; },
  };
  vm.createContext(sandbox);
  arenaScript().runInContext(sandbox);
  return sandbox.Arena;
}

function laneYs(size) {
  if (size === 1) return [20];
  if (size === 2) return [22, 38];
  return [16, 30, 44];
}

function unqueue(member) {
  const size = member.queueSize;
  if (!size || !queues[size]) {
    member.queueSize = 0;
    return 0;
  }
  const q = queues[size];
  const index = q.findIndex((group) => group.members.includes(member));
  if (index >= 0) {
    const group = q[index];
    q.splice(index, 1);
    for (const other of group.members) {
      other.queueSize = 0;
      if (other.party) other.party.queueSize = 0;
    }
  } else member.queueSize = 0;
  return size;
}

function publishQueue(size) {
  const q = queues[size];
  if (!q) return;
  const need = size * 2;
  const waiting = q.reduce((sum, group) => sum + group.members.length, 0);
  for (const group of q) {
    for (const member of group.members) {
      send(member.socket, { t: "queue", id: member.id, size, waiting, need });
    }
  }
}

function takeSide(groups, size) {
  function search(start, remain, picked) {
    if (remain === 0) return picked;
    for (let i = start; i < groups.length; i++) {
      const count = groups[i].members.length;
      if (count < 1 || count > remain) continue;
      const found = search(i + 1, remain - count, picked.concat(i));
      if (found) return found;
    }
    return null;
  }
  const picked = search(0, size, []);
  if (!picked) return null;
  const chosen = new Set(picked);
  return {
    side: picked.map((i) => groups[i]),
    rest: groups.filter((_, i) => !chosen.has(i)),
  };
}

function dropLive(member) {
  const liveMatch = member.live;
  if (!liveMatch) return;
  liveMatch.members.delete(member);
  member.live = null;
  try { liveMatch.arena.dropHuman(member.id); } catch (err) { /* already gone */ }
  if (liveMatch.members.size === 0) live.delete(liveMatch.id);
}

function tryFill(size) {
  const q = queues[size];
  if (!q || !q.length) return;
  const first = takeSide(q, size);
  if (!first) return;
  const second = takeSide(first.rest, size);
  if (!second) return;
  const used = new Set(first.side.concat(second.side));
  queues[size] = q.filter((group) => !used.has(group));
  let blue = first.side;
  let red = second.side;
  if (Math.random() < 0.5) {
    blue = second.side;
    red = first.side;
  }
  const seated = blue.flatMap((group) => group.members).concat(red.flatMap((group) => group.members));
  for (const member of seated) {
    member.queueSize = 0;
    if (member.party) member.party.queueSize = 0;
  }
  const ys = laneYs(size);
  const roster = seated.map((member, i) => {
    const team = i < size ? "ally" : "enemy";
    return {
      id: i + 1,
      classId: member.classId,
      team,
      x: team === "ally" ? 18 : 82,
      y: ys[i % size],
      human: true,
      peerId: member.id,
      name: member.name,
      talents: member.talents,
      tier: member.tier === 2 ? 2 : 1,
    };
  });
  beginLive(seated, roster);
  if (queues[size].length) publishQueue(size);
}

function beginLive(humans, roster) {
  let arena;
  try {
    arena = bootArena();
    for (const row of roster) {
      row.talents = row.human
        ? arena.normalizeTalents(row.classId, row.talents)
        : arena.rollTalents(row.classId);
    }
    arena.createMatch({ roster, netRole: "server" });
  } catch (err) {
    console.error(err);
    for (const member of humans) send(member.socket, { t: "error", text: "The match could not start." });
    return;
  }
  const id = nextMatch++;
  const liveMatch = { id, arena, members: new Set(humans), endTicks: 0 };
  live.set(id, liveMatch);
  for (const member of humans) {
    member.queueSize = 0;
    if (member.party) member.party.queueSize = 0;
    member.live = liveMatch;
    send(member.socket, { t: "msg", from: 0, id: member.id, data: { kind: "start", roster, server: true, map: arena.match.map } });
    if (member.party) sendParty(member.party);
  }
}

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
  return rooms.has(code) || parties.has(code) ? codeOf() : code;
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

function partyMembers(party) {
  return [...party.members.values()].map((m) => ({ id: m.id, name: m.name, classId: m.classId }));
}

function sendParty(party) {
  const members = partyMembers(party);
  for (const member of party.members.values()) {
    send(member.socket, {
      t: "party",
      id: member.id,
      code: party.code,
      leaderId: party.leaderId,
      queued: party.queueSize || 0,
      members,
    });
  }
}

function leaveParty(member) {
  const party = member.party;
  if (!party) return;
  const queued = unqueue(member);
  if (queued) publishQueue(queued);
  party.members.delete(member.id);
  member.party = null;
  send(member.socket, { t: "party", gone: true, id: member.id });
  if (party.members.size === 0) {
    parties.delete(party.code);
    return;
  }
  if (party.leaderId === member.id) party.leaderId = [...party.members.keys()][0];
  sendParty(party);
}

function enqueueGroup(members, size) {
  for (const member of members) {
    dropLive(member);
    const prev = unqueue(member);
    if (prev && prev !== size) publishQueue(prev);
  }
  queues[size].push({ members });
  for (const member of members) member.queueSize = size;
  const party = members[0] && members[0].party;
  if (party) party.queueSize = size;
  publishQueue(size);
  if (party) sendParty(party);
  tryFill(size);
}

function named(member, msg) {
  member.name = String(msg.name || member.name || "Player").slice(0, 16);
  if (msg.classId) member.classId = CLASS_IDS.has(msg.classId) ? msg.classId : member.classId;
  if (Array.isArray(msg.talents)) member.talents = msg.talents.filter((id) => typeof id === "string").slice(0, 8);
  if (msg.tier != null) member.tier = msg.tier === 2 ? 2 : 1;
}

function leaveRoom(member) {
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

function leave(member) {
  leaveParty(member);
  const queued = unqueue(member);
  if (queued) publishQueue(queued);
  dropLive(member);
  leaveRoom(member);
}

function onText(member, text) {
  let msg;
  try { msg = JSON.parse(text); } catch (err) { return; }
  if (!msg || typeof msg !== "object") return;
  if (msg.t === "create") {
    leave(member);
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
    leave(member);
    member.name = String(msg.name || "Player").slice(0, 16);
    room.members.set(member.id, member);
    member.room = room;
    send(member.socket, { t: "joined", code, id: member.id, hostId: room.hostId, members: membersOf(room) });
    broadcast(room, { t: "peer", id: member.id, hostId: room.hostId, members: membersOf(room) }, member.id);
    return;
  }
  if (msg.t === "party-create") {
    leave(member);
    named(member, msg);
    const party = { code: codeOf(), leaderId: member.id, members: new Map(), queueSize: 0 };
    party.members.set(member.id, member);
    member.party = party;
    parties.set(party.code, party);
    sendParty(party);
    return;
  }
  if (msg.t === "party-join") {
    const code = String(msg.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const party = parties.get(code);
    if (!party) {
      send(member.socket, { t: "error", text: "No party with that code." });
      return;
    }
    if (member.party === party) {
      sendParty(party);
      return;
    }
    if (party.queueSize) {
      send(member.socket, { t: "error", text: "That party is already in queue." });
      return;
    }
    if (party.members.size >= 3) {
      send(member.socket, { t: "error", text: "That party is full." });
      return;
    }
    leave(member);
    named(member, msg);
    party.members.set(member.id, member);
    member.party = party;
    sendParty(party);
    return;
  }
  if (msg.t === "party-leave") {
    leaveParty(member);
    return;
  }
  if (msg.t === "party-class") {
    if (!member.party) return;
    named(member, msg);
    sendParty(member.party);
    return;
  }
  if (msg.t === "queue-bots") {
    const party = member.party;
    if (!party || party.leaderId !== member.id) {
      send(member.socket, { t: "error", text: "Only the party leader can start a bot match." });
      return;
    }
    const humans = [...party.members.values()];
    const size = humans.length;
    if (size < 1 || size > 3) return;
    if (member.room) leaveRoom(member);
    const queued = unqueue(member);
    if (queued) publishQueue(queued);
    named(member, msg);
    for (const human of humans) dropLive(human);
    const classes = [...CLASS_IDS];
    const ys = laneYs(size);
    const roster = humans.map((human, i) => ({
      id: i + 1,
      classId: human.classId,
      team: "ally",
      x: 18,
      y: ys[i],
      human: true,
      peerId: human.id,
      name: human.name,
      talents: human.talents,
      tier: human.tier === 2 ? 2 : 1,
    }));
    for (let i = 0; i < size; i++) {
      roster.push({
        id: size + i + 1,
        classId: classes[Math.floor(Math.random() * classes.length)],
        team: "enemy",
        x: 82,
        y: ys[i],
        human: false,
        peerId: null,
        name: null,
      });
    }
    beginLive(humans, roster);
    return;
  }
  if (msg.t === "queue") {
    const size = Number(msg.size);
    if (size !== 1 && size !== 2 && size !== 3) {
      send(member.socket, { t: "error", text: "Pick 1v1, 2v2, or 3v3." });
      return;
    }
    const party = member.party;
    if (party && party.leaderId !== member.id) {
      send(member.socket, { t: "error", text: "Only the party leader can queue." });
      return;
    }
    const group = party ? [...party.members.values()] : [member];
    if (group.length > size) {
      send(member.socket, { t: "error", text: "Your party is too big for that bracket." });
      return;
    }
    if (member.room) leaveRoom(member);
    named(member, msg);
    enqueueGroup(member.party ? [...member.party.members.values()] : [member], size);
    return;
  }
  if (msg.t === "leave-queue") {
    if (member.party && member.party.leaderId !== member.id) {
      send(member.socket, { t: "error", text: "Only the party leader can leave the queue." });
      return;
    }
    const party = member.party;
    const queued = unqueue(member);
    if (queued) publishQueue(queued);
    if (party) sendParty(party);
    return;
  }
  if (msg.t === "play" && member.live && msg.data) {
    if (msg.data.kind === "leave") {
      dropLive(member);
      return;
    }
    if (msg.data.kind === "input") {
      try { member.live.arena.applyNetInput(member.id, msg.data); } catch (err) { /* ignore bad input */ }
    }
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
  const member = { id: nextId++, name: "Player", classId: "warrior", socket, room: null, party: null, queueSize: 0, live: null, buf: Buffer.alloc(0) };
  socket.on("data", (chunk) => {
    member.buf = Buffer.concat([member.buf, chunk]);
    consume(member);
  });
  socket.on("close", () => leave(member));
  socket.on("error", () => leave(member));
});

setInterval(() => {
  for (const [id, liveMatch] of live) {
    if (liveMatch.members.size === 0) {
      live.delete(id);
      continue;
    }
    const sim = liveMatch.arena.match;
    if (!sim) continue;
    try {
      if (sim.phase !== "end") liveMatch.arena.step(0.05);
      const state = liveMatch.arena.pack();
      const msg = { t: "msg", from: 0, data: { kind: "snap", state } };
      for (const member of liveMatch.members) send(member.socket, msg);
      if (sim.phase === "end") {
        liveMatch.endTicks += 1;
        if (liveMatch.endTicks > 40) live.delete(id);
      }
    } catch (err) {
      console.error(err);
      live.delete(id);
    }
  }
}, 50);

server.listen(PORT, () => {
  console.log("Arena is at http://127.0.0.1:" + PORT);
});
