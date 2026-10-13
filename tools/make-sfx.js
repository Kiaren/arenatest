"use strict";

/**
 * Builds the arena sound effects as 44.1 kHz mono WAV files.
 * Each sound is layered foley: pitched bodies, filtered noise, and a short room.
 * Run: node tools/make-sfx.js
 */

const fs = require("fs");
const path = require("path");

const SR = 44100;
const OUT = path.join(__dirname, "..", "assets", "sfx");

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function coeff(cut) {
  return 1 - Math.exp((-2 * Math.PI * Math.max(25, cut)) / SR);
}

function addTone(data, o) {
  const start = Math.floor((o.start || 0) * SR);
  const freq = o.freq;
  const freqEnd = o.freqEnd == null ? freq : o.freqEnd;
  const dur = o.dur == null ? 1 : o.dur;
  let phase = o.phase || 0;
  for (let i = start; i < data.length; i++) {
    const t = (i - start) / SR;
    const k = t / Math.max(dur, 0.0001);
    const f = freq * Math.pow(freqEnd / Math.max(freq, 1), Math.min(k, 1));
    phase += (2 * Math.PI * f) / SR;
    let e = 1;
    if (t < (o.attack || 0.004)) e = t / (o.attack || 0.004);
    else e = Math.exp(-(t - (o.attack || 0.004)) / (o.decay || 0.18));
    let s = Math.sin(phase);
    if (o.harm) s += o.harm * Math.sin(phase * 2.01);
    if (o.third) s += o.third * Math.sin(phase * 3.03);
    data[i] += s * (o.amp || 0.2) * e;
  }
}

function addNoise(data, rnd, o) {
  const start = Math.floor((o.start || 0) * SR);
  let low = 0;
  let band = 0;
  const dur = o.dur == null ? 0.4 : o.dur;
  for (let i = start; i < data.length; i++) {
    const t = (i - start) / SR;
    const k = Math.min(1, t / Math.max(dur, 0.0001));
    const hp = (o.hp || 180) * Math.pow((o.hpEnd || o.hp || 180) / (o.hp || 180), k);
    const lp = (o.lp || 5000) * Math.pow((o.lpEnd || o.lp || 5000) / (o.lp || 5000), k);
    const white = rnd() * 2 - 1;
    low += (white - low) * coeff(hp);
    const high = white - low;
    band += (high - band) * coeff(lp);
    let e = 1;
    if (t < (o.attack || 0.002)) e = t / (o.attack || 0.002);
    else e = Math.exp(-(t - (o.attack || 0.002)) / (o.decay || 0.12));
    data[i] += band * (o.amp || 0.3) * e;
    if (o.crackle && rnd() < o.crackle) data[i] += (rnd() * 2 - 1) * (o.crackleAmp || 0.4) * e;
  }
}

function reflect(data, amount) {
  const copy = Float32Array.from(data);
  const taps = [[0.013, 0.22], [0.027, 0.14], [0.043, 0.08], [0.071, 0.04]];
  for (const [delay, gain] of taps) {
    const d = Math.floor(delay * SR);
    for (let i = d; i < data.length; i++) data[i] += copy[i - d] * gain * amount;
  }
}

function finish(data, room) {
  const fade = Math.floor(SR * 0.01);
  for (let i = 0; i < fade; i++) data[data.length - 1 - i] *= i / fade;
  if (room) reflect(data, room);
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  const gain = peak > 0.0001 ? 0.86 / peak : 1;
  for (let i = 0; i < data.length; i++) data[i] = Math.tanh(data[i] * gain * 1.25) * 0.9;
}

function buffer(seconds) {
  return new Float32Array(Math.ceil(SR * seconds));
}

function wav(samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((v * 32767) | 0, 44 + i * 2);
  }
  return buf;
}

function save(name, data) {
  fs.writeFileSync(path.join(OUT, name + ".wav"), wav(data));
  let peak = 0;
  let sum = 0;
  let crosses = 0;
  let prev = 0;
  for (let i = 0; i < data.length; i++) {
    peak = Math.max(peak, Math.abs(data[i]));
    sum += data[i] * data[i];
    if ((data[i] >= 0 && prev < 0) || (data[i] < 0 && prev >= 0)) crosses++;
    prev = data[i];
  }
  const rms = Math.sqrt(sum / data.length);
  console.log(`${name.padEnd(16)} ${(data.length / SR).toFixed(2)}s  peak ${peak.toFixed(2)}  rms ${rms.toFixed(3)}  zcr ${(crosses / (data.length / SR)).toFixed(0)}`);
}

const sounds = {
  "ui-click"(rnd) {
    const data = buffer(0.07);
    addNoise(data, rnd, { amp: 0.55, attack: 0.001, decay: 0.018, hp: 1800, lp: 6400, dur: 0.05 });
    addTone(data, { freq: 1480, freqEnd: 980, amp: 0.22, attack: 0.001, decay: 0.03, dur: 0.05 });
    addTone(data, { freq: 2320, amp: 0.08, attack: 0.001, decay: 0.02, dur: 0.04 });
    finish(data, 0);
    return data;
  },
  "ui-deny"(rnd) {
    const data = buffer(0.22);
    addTone(data, { freq: 196, freqEnd: 120, amp: 0.45, attack: 0.004, decay: 0.12, dur: 0.2, harm: 0.2 });
    addTone(data, { freq: 155, freqEnd: 90, amp: 0.2, attack: 0.006, decay: 0.14, dur: 0.2 });
    addNoise(data, rnd, { amp: 0.12, attack: 0.002, decay: 0.05, hp: 200, lp: 900, dur: 0.1 });
    finish(data, 0.35);
    return data;
  },
  gates(rnd) {
    const data = buffer(1.05);
    addTone(data, { freq: 62, freqEnd: 38, amp: 0.7, attack: 0.004, decay: 0.45, dur: 0.7, harm: 0.15 });
    addTone(data, { freq: 92, freqEnd: 54, amp: 0.28, attack: 0.01, decay: 0.35, dur: 0.6 });
    addNoise(data, rnd, { amp: 0.42, attack: 0.03, decay: 0.38, hp: 240, hpEnd: 700, lp: 1800, lpEnd: 900, dur: 0.7 });
    addTone(data, { freq: 740, freqEnd: 520, amp: 0.16, attack: 0.01, decay: 0.22, dur: 0.4, start: 0.06, harm: 0.35 });
    addTone(data, { freq: 1180, amp: 0.07, attack: 0.008, decay: 0.16, dur: 0.3, start: 0.07 });
    finish(data, 0.8);
    return data;
  },
  victory(rnd) {
    const data = buffer(1.7);
    const chord = [196, 247, 294, 392];
    for (const freq of chord) {
      addTone(data, { freq, freqEnd: freq * 1.01, amp: 0.22, attack: 0.22, decay: 0.7, dur: 1.5, harm: 0.08 });
      addTone(data, { freq: freq * 1.004, amp: 0.12, attack: 0.28, decay: 0.65, dur: 1.5 });
    }
    addTone(data, { freq: 784, amp: 0.05, attack: 0.4, decay: 0.5, dur: 1.4, start: 0.15 });
    addNoise(data, rnd, { amp: 0.05, attack: 0.2, decay: 0.6, hp: 2000, lp: 7000, dur: 1.2 });
    finish(data, 0.9);
    return data;
  },
  defeat(rnd) {
    const data = buffer(1.55);
    addTone(data, { freq: 130, freqEnd: 92, amp: 0.4, attack: 0.12, decay: 0.7, dur: 1.4, harm: 0.12 });
    addTone(data, { freq: 155, freqEnd: 108, amp: 0.22, attack: 0.16, decay: 0.65, dur: 1.4 });
    addTone(data, { freq: 196, freqEnd: 140, amp: 0.12, attack: 0.2, decay: 0.55, dur: 1.3 });
    addNoise(data, rnd, { amp: 0.16, attack: 0.08, decay: 0.5, hp: 120, lp: 700, dur: 1.2 });
    finish(data, 0.85);
    return data;
  },
  swing(rnd) {
    const data = buffer(0.26);
    addNoise(data, rnd, { amp: 0.7, attack: 0.02, decay: 0.09, hp: 500, hpEnd: 2200, lp: 2400, lpEnd: 5200, dur: 0.18 });
    addTone(data, { freq: 240, freqEnd: 140, amp: 0.12, attack: 0.01, decay: 0.1, dur: 0.18 });
    finish(data, 0.25);
    return data;
  },
  jump(rnd) {
    const data = buffer(0.28);
    addNoise(data, rnd, { amp: 0.45, attack: 0.015, decay: 0.1, hp: 300, hpEnd: 1400, lp: 2000, lpEnd: 900, dur: 0.2 });
    addTone(data, { freq: 180, freqEnd: 90, amp: 0.28, attack: 0.005, decay: 0.12, dur: 0.22, harm: 0.2 });
    finish(data, 0.3);
    return data;
  },
  hit(rnd) {
    const data = buffer(0.2);
    addTone(data, { freq: 140, freqEnd: 48, amp: 0.7, attack: 0.002, decay: 0.09, dur: 0.16, harm: 0.25 });
    addTone(data, { freq: 86, freqEnd: 40, amp: 0.4, attack: 0.002, decay: 0.12, dur: 0.18 });
    addNoise(data, rnd, { amp: 0.45, attack: 0.001, decay: 0.03, hp: 800, lp: 4200, dur: 0.06 });
    finish(data, 0.4);
    return data;
  },
  "hit-magic"(rnd) {
    const data = buffer(0.24);
    addTone(data, { freq: 880, freqEnd: 640, amp: 0.22, attack: 0.002, decay: 0.08, dur: 0.16 });
    addTone(data, { freq: 1320, amp: 0.12, attack: 0.002, decay: 0.06, dur: 0.12 });
    addTone(data, { freq: 210, freqEnd: 120, amp: 0.28, attack: 0.003, decay: 0.1, dur: 0.18 });
    addNoise(data, rnd, { amp: 0.16, attack: 0.001, decay: 0.04, hp: 2000, lp: 8000, dur: 0.08 });
    finish(data, 0.45);
    return data;
  },
  slash(rnd) {
    const data = buffer(0.28);
    addNoise(data, rnd, { amp: 0.55, attack: 0.004, decay: 0.07, hp: 900, hpEnd: 2400, lp: 6000, lpEnd: 2800, dur: 0.16 });
    const metal = [690, 1040, 1630, 2410];
    metal.forEach((freq, i) => {
      addTone(data, { freq: freq * (0.99 + rnd() * 0.02), amp: 0.16 - i * 0.03, attack: 0.002, decay: 0.07 - i * 0.01, dur: 0.16, harm: 0.15 });
    });
    addTone(data, { freq: 180, freqEnd: 90, amp: 0.18, attack: 0.002, decay: 0.08, dur: 0.14 });
    finish(data, 0.35);
    return data;
  },
  heal(rnd) {
    const data = buffer(0.55);
    addTone(data, { freq: 523, freqEnd: 660, amp: 0.28, attack: 0.06, decay: 0.28, dur: 0.5 });
    addTone(data, { freq: 784, freqEnd: 988, amp: 0.16, attack: 0.08, decay: 0.26, dur: 0.5 });
    addTone(data, { freq: 392, freqEnd: 494, amp: 0.12, attack: 0.05, decay: 0.3, dur: 0.5 });
    addNoise(data, rnd, { amp: 0.04, attack: 0.05, decay: 0.25, hp: 2500, lp: 8000, dur: 0.4 });
    finish(data, 0.55);
    return data;
  },
  gather(rnd) {
    const data = buffer(0.32);
    addTone(data, { freq: 320, freqEnd: 540, amp: 0.2, attack: 0.08, decay: 0.12, dur: 0.28 });
    addTone(data, { freq: 480, freqEnd: 720, amp: 0.1, attack: 0.1, decay: 0.1, dur: 0.28 });
    addNoise(data, rnd, { amp: 0.08, attack: 0.06, decay: 0.12, hp: 600, hpEnd: 1800, lp: 3000, dur: 0.25 });
    finish(data, 0.4);
    return data;
  },
  "cast-arcane"(rnd) {
    const data = buffer(0.4);
    addTone(data, { freq: 660, amp: 0.22, attack: 0.02, decay: 0.18, dur: 0.34, harm: 0.2 });
    addTone(data, { freq: 990, amp: 0.14, attack: 0.03, decay: 0.16, dur: 0.32 });
    addTone(data, { freq: 1485, amp: 0.08, attack: 0.02, decay: 0.12, dur: 0.28 });
    addNoise(data, rnd, { amp: 0.06, attack: 0.01, decay: 0.1, hp: 3000, lp: 9000, dur: 0.2 });
    finish(data, 0.6);
    return data;
  },
  "cast-fire"(rnd) {
    const data = buffer(0.42);
    addTone(data, { freq: 110, freqEnd: 70, amp: 0.4, attack: 0.01, decay: 0.2, dur: 0.35, harm: 0.3 });
    addNoise(data, rnd, { amp: 0.4, attack: 0.01, decay: 0.16, hp: 200, hpEnd: 800, lp: 2200, crackle: 0.04, crackleAmp: 0.5, dur: 0.32 });
    finish(data, 0.5);
    return data;
  },
  "cast-frost"(rnd) {
    const data = buffer(0.36);
    addTone(data, { freq: 1760, freqEnd: 1480, amp: 0.16, attack: 0.004, decay: 0.14, dur: 0.28 });
    addTone(data, { freq: 2340, amp: 0.1, attack: 0.004, decay: 0.1, dur: 0.24 });
    addTone(data, { freq: 880, amp: 0.1, attack: 0.006, decay: 0.16, dur: 0.3 });
    addNoise(data, rnd, { amp: 0.22, attack: 0.001, decay: 0.05, hp: 2500, lp: 9000, dur: 0.08 });
    finish(data, 0.55);
    return data;
  },
  "cast-shadow"(rnd) {
    const data = buffer(0.48);
    addTone(data, { freq: 78, freqEnd: 56, amp: 0.45, attack: 0.06, decay: 0.24, dur: 0.42, harm: 0.1 });
    addTone(data, { freq: 156, amp: 0.12, attack: 0.08, decay: 0.2, dur: 0.4 });
    addNoise(data, rnd, { amp: 0.28, attack: 0.04, decay: 0.2, hp: 80, lp: 500, dur: 0.4 });
    finish(data, 0.7);
    return data;
  },
  "cast-holy"(rnd) {
    const data = buffer(0.46);
    addTone(data, { freq: 523, amp: 0.24, attack: 0.01, decay: 0.24, dur: 0.4, harm: 0.15 });
    addTone(data, { freq: 784, amp: 0.14, attack: 0.012, decay: 0.2, dur: 0.38 });
    addTone(data, { freq: 1046, amp: 0.08, attack: 0.01, decay: 0.16, dur: 0.34 });
    addNoise(data, rnd, { amp: 0.04, attack: 0.01, decay: 0.12, hp: 4000, lp: 10000, dur: 0.2 });
    finish(data, 0.65);
    return data;
  },
  "cast-nature"(rnd) {
    const data = buffer(0.4);
    addTone(data, { freq: 220, freqEnd: 260, amp: 0.28, attack: 0.02, decay: 0.18, dur: 0.34, harm: 0.25 });
    addTone(data, { freq: 330, amp: 0.12, attack: 0.03, decay: 0.16, dur: 0.32 });
    addNoise(data, rnd, { amp: 0.18, attack: 0.01, decay: 0.12, hp: 1200, lp: 5000, crackle: 0.02, crackleAmp: 0.2, dur: 0.25 });
    finish(data, 0.45);
    return data;
  },
  "impact-fire"(rnd) {
    const data = buffer(0.55);
    addTone(data, { freq: 90, freqEnd: 36, amp: 0.75, attack: 0.002, decay: 0.22, dur: 0.4, harm: 0.35 });
    addNoise(data, rnd, { amp: 0.55, attack: 0.001, decay: 0.16, hp: 150, hpEnd: 500, lp: 2400, crackle: 0.06, crackleAmp: 0.55, dur: 0.35 });
    finish(data, 0.6);
    return data;
  },
  "impact-frost"(rnd) {
    const data = buffer(0.34);
    addNoise(data, rnd, { amp: 0.5, attack: 0.001, decay: 0.07, hp: 1800, lp: 9000, dur: 0.12 });
    for (let n = 0; n < 6; n++) {
      addTone(data, { freq: 1400 + rnd() * 2800, amp: 0.08, attack: 0.001, decay: 0.05 + rnd() * 0.05, dur: 0.16, start: rnd() * 0.02 });
    }
    addTone(data, { freq: 420, freqEnd: 180, amp: 0.2, attack: 0.002, decay: 0.12, dur: 0.22 });
    finish(data, 0.5);
    return data;
  },
  "impact-shadow"(rnd) {
    const data = buffer(0.32);
    addTone(data, { freq: 96, freqEnd: 42, amp: 0.6, attack: 0.004, decay: 0.16, dur: 0.26, harm: 0.15 });
    addNoise(data, rnd, { amp: 0.3, attack: 0.004, decay: 0.1, hp: 80, lp: 600, dur: 0.22 });
    finish(data, 0.55);
    return data;
  },
  "impact-holy"(rnd) {
    const data = buffer(0.36);
    addTone(data, { freq: 698, amp: 0.28, attack: 0.002, decay: 0.14, dur: 0.28, harm: 0.2 });
    addTone(data, { freq: 1046, amp: 0.16, attack: 0.002, decay: 0.11, dur: 0.24 });
    addTone(data, { freq: 1568, amp: 0.08, attack: 0.002, decay: 0.08, dur: 0.2 });
    addNoise(data, rnd, { amp: 0.12, attack: 0.001, decay: 0.03, hp: 3000, lp: 9000, dur: 0.06 });
    finish(data, 0.55);
    return data;
  },
  "impact-arcane"(rnd) {
    const data = buffer(0.3);
    addTone(data, { freq: 990, freqEnd: 740, amp: 0.24, attack: 0.002, decay: 0.1, dur: 0.22 });
    addTone(data, { freq: 1480, amp: 0.14, attack: 0.002, decay: 0.08, dur: 0.18 });
    addTone(data, { freq: 2100, amp: 0.07, attack: 0.001, decay: 0.06, dur: 0.14 });
    addNoise(data, rnd, { amp: 0.14, attack: 0.001, decay: 0.025, hp: 2500, lp: 8000, dur: 0.05 });
    finish(data, 0.5);
    return data;
  },
  shot(rnd) {
    const data = buffer(0.28);
    addNoise(data, rnd, { amp: 0.35, attack: 0.001, decay: 0.02, hp: 1200, lp: 6000, dur: 0.04 });
    addNoise(data, rnd, { amp: 0.4, attack: 0.01, decay: 0.1, hp: 700, hpEnd: 200, lp: 2800, lpEnd: 800, dur: 0.2, start: 0.02 });
    addTone(data, { freq: 440, freqEnd: 180, amp: 0.12, attack: 0.005, decay: 0.1, dur: 0.18, start: 0.02 });
    finish(data, 0.3);
    return data;
  },
  trap(rnd) {
    const data = buffer(0.24);
    addNoise(data, rnd, { amp: 0.4, attack: 0.001, decay: 0.012, hp: 1500, lp: 7000, dur: 0.03 });
    addNoise(data, rnd, { amp: 0.28, attack: 0.001, decay: 0.012, hp: 1800, lp: 7000, dur: 0.03, start: 0.045 });
    addTone(data, { freq: 1680, amp: 0.1, attack: 0.001, decay: 0.08, dur: 0.16, start: 0.04 });
    addTone(data, { freq: 240, amp: 0.16, attack: 0.002, decay: 0.06, dur: 0.1 });
    finish(data, 0.35);
    return data;
  },
  bomb(rnd) {
    const data = buffer(0.8);
    addTone(data, { freq: 78, freqEnd: 28, amp: 0.85, attack: 0.002, decay: 0.32, dur: 0.6, harm: 0.4, third: 0.15 });
    addNoise(data, rnd, { amp: 0.7, attack: 0.001, decay: 0.22, hp: 80, hpEnd: 400, lp: 1800, lpEnd: 600, crackle: 0.05, crackleAmp: 0.45, dur: 0.5 });
    addNoise(data, rnd, { amp: 0.2, attack: 0.02, decay: 0.3, hp: 1000, lp: 5000, crackle: 0.03, crackleAmp: 0.25, dur: 0.45, start: 0.05 });
    finish(data, 0.75);
    return data;
  },
  blink(rnd) {
    const data = buffer(0.32);
    addNoise(data, rnd, { amp: 0.15, attack: 0.06, decay: 0.02, hp: 400, hpEnd: 1800, lp: 3000, dur: 0.1 });
    addNoise(data, rnd, { amp: 0.4, attack: 0.002, decay: 0.06, hp: 800, lp: 5000, dur: 0.1, start: 0.09 });
    addTone(data, { freq: 520, freqEnd: 880, amp: 0.16, attack: 0.03, decay: 0.06, dur: 0.12 });
    addTone(data, { freq: 240, freqEnd: 90, amp: 0.2, attack: 0.002, decay: 0.08, dur: 0.14, start: 0.1 });
    finish(data, 0.4);
    return data;
  },
  leap(rnd) {
    const data = buffer(0.4);
    addNoise(data, rnd, { amp: 0.5, attack: 0.04, decay: 0.14, hp: 280, hpEnd: 1600, lp: 2200, lpEnd: 900, dur: 0.32 });
    addTone(data, { freq: 160, freqEnd: 70, amp: 0.22, attack: 0.02, decay: 0.16, dur: 0.3, harm: 0.2 });
    finish(data, 0.35);
    return data;
  },
  stun(rnd) {
    const data = buffer(0.36);
    addTone(data, { freq: 150, freqEnd: 46, amp: 0.7, attack: 0.002, decay: 0.14, dur: 0.28, harm: 0.3 });
    addTone(data, { freq: 420, freqEnd: 220, amp: 0.16, attack: 0.004, decay: 0.12, dur: 0.24 });
    addNoise(data, rnd, { amp: 0.3, attack: 0.001, decay: 0.04, hp: 400, lp: 3000, dur: 0.08 });
    finish(data, 0.5);
    return data;
  },
  interrupt(rnd) {
    const data = buffer(0.14);
    addNoise(data, rnd, { amp: 0.6, attack: 0.001, decay: 0.025, hp: 1600, lp: 7000, dur: 0.05 });
    addTone(data, { freq: 2100, freqEnd: 900, amp: 0.18, attack: 0.001, decay: 0.04, dur: 0.08 });
    addTone(data, { freq: 240, freqEnd: 100, amp: 0.25, attack: 0.001, decay: 0.05, dur: 0.1 });
    finish(data, 0.2);
    return data;
  },
  stealth(rnd) {
    const data = buffer(0.55);
    addNoise(data, rnd, { amp: 0.22, attack: 0.04, decay: 0.28, hp: 400, lp: 2200, dur: 0.45 });
    addNoise(data, rnd, { amp: 0.08, attack: 0.01, decay: 0.12, hp: 1800, lp: 6000, crackle: 0.015, crackleAmp: 0.15, dur: 0.2 });
    addTone(data, { freq: 220, freqEnd: 140, amp: 0.08, attack: 0.05, decay: 0.25, dur: 0.4 });
    finish(data, 0.45);
    return data;
  },
  portal(rnd) {
    const data = buffer(0.7);
    addTone(data, { freq: 110, freqEnd: 146, amp: 0.32, attack: 0.08, decay: 0.32, dur: 0.6, harm: 0.1 });
    addTone(data, { freq: 165, amp: 0.14, attack: 0.1, decay: 0.28, dur: 0.55 });
    addTone(data, { freq: 660, amp: 0.06, attack: 0.12, decay: 0.22, dur: 0.5 });
    addNoise(data, rnd, { amp: 0.1, attack: 0.06, decay: 0.25, hp: 300, lp: 1600, dur: 0.5 });
    finish(data, 0.8);
    return data;
  },
  death(rnd) {
    const data = buffer(0.75);
    addTone(data, { freq: 120, freqEnd: 48, amp: 0.55, attack: 0.004, decay: 0.28, dur: 0.55, harm: 0.2 });
    addNoise(data, rnd, { amp: 0.22, attack: 0.02, decay: 0.3, hp: 150, lp: 900, dur: 0.55 });
    addNoise(data, rnd, { amp: 0.12, attack: 0.08, decay: 0.25, hp: 800, lp: 3000, dur: 0.4, start: 0.05 });
    finish(data, 0.6);
    return data;
  },
  shield(rnd) {
    const data = buffer(0.42);
    addTone(data, { freq: 440, freqEnd: 660, amp: 0.2, attack: 0.03, decay: 0.2, dur: 0.36 });
    addTone(data, { freq: 660, freqEnd: 880, amp: 0.12, attack: 0.04, decay: 0.18, dur: 0.34 });
    addNoise(data, rnd, { amp: 0.1, attack: 0.02, decay: 0.16, hp: 800, hpEnd: 2000, lp: 4000, dur: 0.3 });
    finish(data, 0.5);
    return data;
  },
};

fs.mkdirSync(OUT, { recursive: true });
let seed = 1000;
for (const [name, build] of Object.entries(sounds)) {
  save(name, build(mulberry(seed)));
  seed += 97;
}
console.log(`wrote ${Object.keys(sounds).length} files to ${OUT}`);
