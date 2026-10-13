"use strict";

/**
 * Plays the WAV files in assets/sfx.
 * The context stays suspended until the first click or key, which browsers require.
 */
(function () {
  const NAMES = [
    "ui-click", "ui-deny", "gates", "victory", "defeat", "swing", "jump", "hit", "hit-magic",
    "slash", "heal", "gather", "cast-arcane", "cast-fire", "cast-frost", "cast-shadow", "cast-holy",
    "cast-nature", "impact-fire", "impact-frost", "impact-shadow", "impact-holy", "impact-arcane",
    "shot", "trap", "bomb", "blink", "leap", "stun", "interrupt", "stealth", "portal", "death", "shield",
  ];

  const raw = {};
  const buffers = {};
  const pending = [];
  let ctx = null;
  let master = null;
  let muted = false;
  let plays = 0;
  let loaded = 0;

  try {
    muted = localStorage.getItem("arenaSound") === "off";
  } catch (err) { /* private mode */ }

  function ensure() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    for (const name of NAMES) {
      if (!raw[name] || buffers[name]) continue;
      const copy = raw[name].slice(0);
      ctx.decodeAudioData(copy).then((buffer) => {
        buffers[name] = buffer;
        flush();
      }).catch(() => {});
    }
  }

  function flush() {
    if (!ctx || muted || ctx.state === "suspended") return;
    const still = [];
    for (const item of pending.splice(0, pending.length)) {
      if (!start(item.name, item.opts)) still.push(item);
    }
    pending.push(...still);
  }

  function start(name, opts) {
    const buffer = buffers[name];
    if (!buffer || !ctx || muted || ctx.state === "suspended") return false;
    opts = opts || {};
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const vary = opts.steady ? 0 : (Math.random() - 0.5) * 0.05;
    source.playbackRate.value = Math.max(0.5, (opts.rate || 1) + vary);
    const gain = ctx.createGain();
    let volume = opts.volume == null ? 0.7 : opts.volume;
    let panValue = 0;
    if (opts.x != null && opts.listenerX != null) {
      const dx = opts.x - opts.listenerX;
      const dy = (opts.y || 0) - (opts.listenerY || 0);
      const distance = Math.hypot(dx, dy);
      volume *= Math.max(0.14, 1 - Math.max(0, distance - 8) / 38);
      panValue = Math.max(-0.7, Math.min(0.7, dx / 30));
    }
    gain.gain.value = Math.max(0, volume);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    source.connect(gain);
    if (pan) {
      pan.pan.value = panValue;
      gain.connect(pan);
      pan.connect(master);
    } else {
      gain.connect(master);
    }
    source.start();
    plays += 1;
    return true;
  }

  function play(name, opts) {
    if (muted || !NAMES.includes(name)) return;
    ensure();
    if (!start(name, opts || {}) && pending.length < 32) pending.push({ name, opts: opts || {} });
  }

  function setMuted(next) {
    muted = !!next;
    try { localStorage.setItem("arenaSound", muted ? "off" : "on"); } catch (err) { /* ignore */ }
    paint();
    if (muted) pending.length = 0;
  }

  function paint() {
    const button = document.getElementById("sound-toggle");
    if (!button) return;
    button.textContent = muted ? "Sound off" : "Sound on";
    button.setAttribute("aria-pressed", muted ? "false" : "true");
  }

  function unlock() {
    ensure();
    if (ctx && ctx.state === "suspended") ctx.resume().then(flush);
    else flush();
  }

  NAMES.forEach((name) => {
    fetch("assets/sfx/" + name + ".wav")
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .then((body) => {
        if (!body) return;
        raw[name] = body;
        loaded += 1;
        if (ctx) ensure();
      })
      .catch(() => {});
  });

  window.ArenaSound = {
    play,
    unlock,
    setMuted,
    get muted() { return muted; },
    get plays() { return plays; },
    get loaded() { return loaded; },
  };

  function bind() {
    paint();
    const button = document.getElementById("sound-toggle");
    if (button) {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        unlock();
        if (!muted) {
          play("ui-click", { volume: 0.45, steady: true });
          setMuted(true);
        } else {
          setMuted(false);
          play("ui-click", { volume: 0.45, steady: true });
        }
      });
    }
    document.addEventListener("pointerdown", (event) => {
      unlock();
      const hit = event.target && event.target.closest && event.target.closest("button, .class-card, .chip");
      if (!hit || hit.id === "sound-toggle") return;
      if (hit.closest && hit.closest("#abilities, #unit-frames")) return;
      play("ui-click", { volume: 0.32 });
    }, true);
    window.addEventListener("keydown", unlock, true);
  }

  if (document.readyState === "loading") window.addEventListener("load", bind);
  else bind();
})();
