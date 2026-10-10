"use strict";

(function () {
  let ws = null;
  let generation = 0;
  let handler = function () {};

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
          if (msg.t === "hello" || msg.t === "created" || msg.t === "joined") {
            if (msg.id) net.id = msg.id;
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
