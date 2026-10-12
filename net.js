"use strict";

(function () {
  let ws = null;
  let generation = 0;
  let handler = function () {};
  const tierOf = (classId) => (window.arenaGearTier ? window.arenaGearTier(classId) : 1);

  const net = {
    id: null,
    hostId: null,
    code: null,
    members: [],
    url: "",
    connected: false,
    on(fn) { handler = fn; },
    connect(url) {
      const gen = ++generation;
      return new Promise((resolve, reject) => {
        if (ws) {
          ws.onclose = null;
          ws.close();
          ws = null;
        }
        net.connected = false;
        let settled = false;
        const socket = new WebSocket(url);
        const fail = (err) => {
          if (settled || gen !== generation) return;
          settled = true;
          reject(err);
        };
        socket.onopen = () => {
          if (gen !== generation) return;
          settled = true;
          ws = socket;
          net.connected = true;
          net.url = url;
          resolve();
        };
        socket.onerror = () => fail(new Error("Could not reach the room server"));
        socket.onclose = () => {
          if (gen !== generation) return;
          net.connected = false;
          if (ws === socket) ws = null;
          if (!settled) fail(new Error("Could not reach the room server"));
          else handler({ t: "closed" });
        };
        socket.onmessage = (ev) => {
          if (gen !== generation) return;
          let msg;
          try { msg = JSON.parse(ev.data); } catch (err) { return; }
          if (msg.t === "party" && msg.id) net.id = msg.id;
          if (msg.id && (msg.t === "hello" || msg.t === "created" || msg.t === "joined" || msg.t === "queue" || msg.t === "msg")) {
            net.id = msg.id;
            if (msg.hostId) net.hostId = msg.hostId;
            if (msg.code) net.code = msg.code;
            if (msg.members) net.members = msg.members;
          }
          if (msg.t === "peer" || msg.t === "left") {
            if (msg.hostId) net.hostId = msg.hostId;
            if (msg.members) net.members = msg.members;
          }
          handler(msg);
        };
      });
    },
    create(name) { this._send({ t: "create", name }); },
    join(code, name) { this._send({ t: "join", code, name }); },
    send(data) { this._send({ t: "relay", data }); },
    queue(size, classId, name, talents) { this._send({ t: "queue", size, classId, name, talents, tier: tierOf(classId) }); },
    queueBots(classId, name, talents) { this._send({ t: "queue-bots", classId, name, talents, tier: tierOf(classId) }); },
    leaveQueue() { this._send({ t: "leave-queue" }); },
    partyCreate(name, classId, talents) { this._send({ t: "party-create", name, classId, talents, tier: tierOf(classId) }); },
    partyJoin(code, name, classId, talents) { this._send({ t: "party-join", code, name, classId, talents, tier: tierOf(classId) }); },
    partyLeave() { this._send({ t: "party-leave" }); },
    partyClass(classId, name, talents) { this._send({ t: "party-class", classId, name, talents, tier: tierOf(classId) }); },
    play(data) { this._send({ t: "play", data }); },
    _send(obj) {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
    },
    close() {
      generation += 1;
      net.connected = false;
      net.id = null;
      net.hostId = null;
      net.code = null;
      if (ws) {
        ws.onclose = null;
        ws.close();
        ws = null;
      }
    },
  };

  window.ArenaNet = net;
})();
