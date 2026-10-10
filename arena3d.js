"use strict";

/**
 * 3D arena view. Combat stays on the x/y ground plane;
 * Three.js uses x and z for that plane, and y for height.
 */

let yaw = Math.PI;
let distance = 28;
let gfx = null;
let pendingMap = "court";
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function makeLabelSprite() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 72;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3.6, 1.01, 1);
  sprite.position.y = 3.35;
  sprite.renderOrder = 20;
  sprite.userData.canvas = canvas;
  sprite.userData.ctx = ctx;
  sprite.userData.tex = tex;
  sprite.userData.key = "";
  return sprite;
}

function paintLabel(sprite, unit) {
  const pct = unit.hpMax ? Math.max(0, unit.hp / unit.hpMax) : 0;
  const key = `${unit.name}|${Math.round(pct * 32)}|${unit.hp <= 0}`;
  if (sprite.userData.key === key) return;
  sprite.userData.key = key;
  const ctx = sprite.userData.ctx;
  const canvas = sprite.userData.canvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "700 28px Segoe UI, Tahoma, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = unit.hp <= 0 ? "#9a9084" : "#fff8ea";
  ctx.fillText(unit.name, 128, 28);
  ctx.fillStyle = "#2a1214";
  ctx.fillRect(54, 40, 148, 12);
  ctx.fillStyle = pct < 0.3 ? "#d45353" : "#46b35a";
  ctx.fillRect(54, 40, 148 * pct, 12);
  sprite.userData.tex.needsUpdate = true;
}

function kitMat(color, roughness, metalness) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    transparent: true,
    opacity: 1,
  });
}

function kitMesh(parent, geometry, material, x, y, z, rx, ry, rz) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x || 0, y || 0, z || 0);
  mesh.rotation.set(rx || 0, ry || 0, rz || 0);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeFighter(unit) {
  const group = new THREE.Group();
  group.userData.unitId = unit.id;
  const classColor = new THREE.Color(window.Arena.CLASSES[unit.classId].color);
  const teamColor = unit.team === "ally" ? 0x6aa2ff : 0xe15b5b;
  const cloth = kitMat(classColor, 0.72, 0.04);
  const skin = kitMat(0xd7b396, 0.64, 0.02);
  const dark = kitMat(0x2a241c, 0.8, 0.08);
  const metal = kitMat(0xd5d8df, 0.38, 0.55);
  const wood = kitMat(0x6b4428, 0.82, 0.02);

  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.72, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  group.add(blob);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.92, 0.045, 8, 28),
    new THREE.MeshBasicMaterial({ color: teamColor, transparent: true })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.05;
  group.add(ring);

  const select = new THREE.Mesh(
    new THREE.TorusGeometry(1.18, 0.03, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xf0d48a })
  );
  select.rotation.x = Math.PI / 2;
  select.position.y = 0.07;
  select.visible = false;
  group.add(select);

  const legs = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.78, side * 0.15);
    kitMesh(pivot, new THREE.CylinderGeometry(0.1, 0.13, 0.7, 8), dark, 0, -0.35, 0);
    kitMesh(pivot, new THREE.BoxGeometry(0.18, 0.1, 0.16), dark, 0.05, -0.72, 0);
    group.add(pivot);
    legs.push(pivot);
  }

  kitMesh(group, new THREE.CylinderGeometry(0.3, 0.36, 0.78, 12), cloth, 0, 1.22, 0);
  kitMesh(group, new THREE.SphereGeometry(0.2, 10, 8), dark, 0, 0.8, 0);

  const arms = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.02, 1.46, side * 0.36);
    kitMesh(pivot, new THREE.CylinderGeometry(0.07, 0.09, 0.56, 8), cloth, 0, -0.28, 0);
    group.add(pivot);
    arms.push(pivot);
  }
  const left = arms[0];
  const right = arms[1];

  const head = kitMesh(group, new THREE.SphereGeometry(0.24, 16, 12), skin, 0, 1.86, 0);
  const gear = new THREE.Group();
  group.add(gear);
  const id = unit.classId;
  const glow = (color) => new THREE.MeshBasicMaterial({ color });

  if (id === "warrior") {
    kitMesh(gear, new THREE.SphereGeometry(0.16, 10, 8), metal, 0, 1.5, -0.42);
    kitMesh(gear, new THREE.SphereGeometry(0.16, 10, 8), metal, 0, 1.5, 0.42);
    kitMesh(gear, new THREE.CylinderGeometry(0.26, 0.28, 0.22, 10), metal, 0, 2.02, 0);
    kitMesh(gear, new THREE.BoxGeometry(0.34, 0.08, 0.08), metal, 0.16, 1.9, 0);
    kitMesh(right, new THREE.BoxGeometry(0.1, 0.07, 0.95), metal, 0.12, -0.42, 0.42);
    kitMesh(left, new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12), metal, 0.05, -0.32, -0.16, Math.PI / 2, 0, 0);
  } else if (id === "mage") {
    kitMesh(gear, new THREE.ConeGeometry(0.34, 0.7, 10), cloth, 0, 2.28, 0);
    kitMesh(gear, new THREE.ConeGeometry(0.42, 0.9, 10), cloth, 0, 0.55, 0);
    kitMesh(right, new THREE.CylinderGeometry(0.04, 0.05, 1.9, 6), wood, 0.1, -0.05, 0.55, 0.15, 0, 0.35);
    kitMesh(right, new THREE.SphereGeometry(0.12, 10, 8), glow(0x8fd7ff), 0.42, 0.7, 0.85);
  } else if (id === "hunter") {
    kitMesh(gear, new THREE.SphereGeometry(0.28, 12, 10), dark, 0, 1.98, 0);
    kitMesh(gear, new THREE.BoxGeometry(0.16, 0.42, 0.22), dark, -0.22, 1.25, 0);
    kitMesh(left, new THREE.TorusGeometry(0.42, 0.035, 6, 14, Math.PI), wood, 0.05, -0.35, 0.28, 0.2, 0.4, 0.8);
  } else if (id === "warlock") {
    kitMesh(gear, new THREE.SphereGeometry(0.28, 12, 10), dark, 0, 1.96, 0);
    kitMesh(gear, new THREE.ConeGeometry(0.08, 0.28, 6), dark, 0, 2.22, -0.16, 0.4, 0, 0);
    kitMesh(gear, new THREE.ConeGeometry(0.08, 0.28, 6), dark, 0, 2.22, 0.16, -0.4, 0, 0);
    kitMesh(right, new THREE.CylinderGeometry(0.04, 0.05, 1.9, 6), dark, 0.1, -0.05, 0.55, 0.15, 0, 0.35);
    kitMesh(right, new THREE.SphereGeometry(0.13, 10, 8), glow(0x6dff9a), 0.42, 0.72, 0.88);
  } else if (id === "druid") {
    kitMesh(gear, new THREE.ConeGeometry(0.06, 0.42, 6), wood, 0, 2.18, -0.12, 0.5, 0, -0.4);
    kitMesh(gear, new THREE.ConeGeometry(0.06, 0.42, 6), wood, 0, 2.18, 0.12, -0.5, 0, 0.4);
    kitMesh(gear, new THREE.SphereGeometry(0.14, 8, 8), kitMat(0x7dff9a, 0.5, 0.02), 0, 1.5, -0.28);
    kitMesh(right, new THREE.CylinderGeometry(0.045, 0.07, 1.85, 6), wood, 0.1, -0.05, 0.5, 0.2, 0, 0.4);
  } else if (id === "rogue") {
    kitMesh(gear, new THREE.SphereGeometry(0.27, 12, 10), dark, 0, 1.96, 0);
    kitMesh(gear, new THREE.BoxGeometry(0.22, 0.06, 0.34), dark, 0.16, 1.82, 0);
    kitMesh(right, new THREE.BoxGeometry(0.07, 0.05, 0.62), metal, 0.08, -0.48, 0.28, 0, 0, -0.4);
    kitMesh(left, new THREE.BoxGeometry(0.06, 0.045, 0.52), metal, 0.08, -0.46, -0.24, 0, 0, 0.4);
  } else if (id === "warden") {
    kitMesh(gear, new THREE.BoxGeometry(0.08, 0.95, 0.55), cloth, -0.16, 1.25, 0);
    kitMesh(right, new THREE.CylinderGeometry(0.035, 0.045, 1.25, 6), dark, 0.08, -0.1, 0.35, 0.35, 0, 0.2);
    kitMesh(right, new THREE.SphereGeometry(0.14, 10, 8), glow(0xd8fff6), 0.22, 0.4, 0.55);
  } else if (id === "binder") {
    kitMesh(gear, new THREE.TorusGeometry(0.34, 0.035, 8, 18), metal, 0, 1.25, 0, 0, 0, Math.PI / 2);
    kitMesh(gear, new THREE.TorusGeometry(0.28, 0.028, 8, 16), metal, 0, 0.95, 0, Math.PI / 3, 0, 0);
    kitMesh(right, new THREE.TorusGeometry(0.24, 0.04, 6, 12, Math.PI * 1.25), metal, 0.28, -0.4, 0, 0, 0, -0.4);
  } else if (id === "vow") {
    kitMesh(gear, new THREE.TorusGeometry(0.32, 0.03, 8, 20), glow(0xf2a3c7), 0, 2.22, 0, Math.PI / 2.3, 0, 0);
    kitMesh(gear, new THREE.BoxGeometry(0.1, 0.85, 0.42), cloth, 0, 1.2, 0);
  } else if (id === "duelist") {
    kitMesh(gear, new THREE.BoxGeometry(0.2, 0.08, 0.36), dark, 0.12, 1.98, 0);
    kitMesh(gear, new THREE.ConeGeometry(0.06, 0.28, 5), kitMat(0xf0d48a, 0.45, 0.1), 0, 2.16, -0.12, 0.8, 0, 0);
    kitMesh(right, new THREE.BoxGeometry(0.05, 0.035, 1.15), metal, 0.1, -0.4, 0.35);
  } else {
    kitMesh(gear, new THREE.BoxGeometry(0.12, 0.9, 0.46), kitMat(0xf0d48a, 0.55, 0.12), 0.08, 1.28, 0);
    kitMesh(gear, new THREE.TorusGeometry(0.2, 0.025, 6, 16), metal, 0, 2.08, 0, Math.PI / 2, 0, 0);
  }

  const ice = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 18, 14),
    new THREE.MeshBasicMaterial({ color: 0xc6f4ff, transparent: true, opacity: 0.38 })
  );
  ice.position.y = 1.25;
  ice.visible = false;
  group.add(ice);

  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(1.15, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.45, wireframe: true })
  );
  shield.position.y = 1.25;
  shield.visible = false;
  group.add(shield);

  const deter = new THREE.Mesh(
    new THREE.SphereGeometry(1.22, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.7, wireframe: true })
  );
  deter.position.y = 1.25;
  deter.visible = false;
  group.add(deter);

  const reflect = new THREE.Mesh(
    new THREE.SphereGeometry(1.18, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0x9ee7ff, transparent: true, opacity: 0.55, wireframe: true })
  );
  reflect.position.y = 1.25;
  reflect.visible = false;
  group.add(reflect);

  const ember = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff7a3c })
  );
  ember.position.y = 2.55;
  ember.visible = false;
  group.add(ember);

  const castOrb = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xf0d48a })
  );
  castOrb.position.set(0.55, 1.35, 0);
  castOrb.visible = false;
  group.add(castOrb);

  const label = makeLabelSprite();
  group.add(label);

  group.userData.parts = { cloth, skin, dark, metal, base: classColor.clone(), ring, select, ice, shield, deter, reflect, ember, castOrb, label, head, legs, arms, gear, blob };
  return group;
}

function updateFighter(group, unit, match) {
  const parts = group.userData.parts;
  const dead = unit.hp <= 0;
  const sheep = unit.auras.some((a) => a.id === "polymorph");
  const cyclone = !dead && unit.auras.some((a) => a.id === "cyclone");
  const lift = dead ? 0 : (unit.height || 0);
  const feign = !dead && unit.auras.some((a) => a.feign);
  const floor = window.Arena.floorAt ? Arena.floorAt(unit.x, unit.y, lift) : 0;
  const moved = group.userData.px != null && Math.hypot(unit.x - group.userData.px, unit.y - group.userData.pz) > 0.02;
  group.userData.px = unit.x;
  group.userData.pz = unit.y;
  const bob = !dead && !feign && moved && Math.abs(lift - floor) < 0.08 ? Math.abs(Math.sin(match.time * 11)) * 0.06 : 0;
  group.position.set(unit.x, (dead ? 0.35 : 0) + lift + bob + (cyclone ? 1.35 : 0), unit.y);
  group.rotation.set(0, cyclone ? match.time * 8 : -unit.facing, dead ? 1.25 : 0);
  group.scale.set(sheep ? 1.2 : feign ? 1.15 : 1, dead ? 1 : sheep ? 0.7 : feign ? 0.38 : 1, sheep ? 1.2 : feign ? 1.15 : 1);
  parts.blob.position.y = floor + 0.02 - group.position.y;
  parts.ring.position.y = floor + 0.05 - group.position.y;
  parts.select.position.y = floor + 0.07 - group.position.y;

  const swing = !dead && moved ? Math.sin(match.time * 11) * 0.55 : 0;
  parts.legs[0].rotation.z = swing;
  parts.legs[1].rotation.z = -swing;
  if (parts.arms) {
    parts.arms[0].rotation.z = -swing * 0.8;
    parts.arms[1].rotation.z = swing * 0.8;
    const hideKit = sheep;
    parts.arms[0].visible = !hideKit && !dead;
    parts.arms[1].visible = !hideKit && !dead;
  }
  if (parts.gear) parts.gear.visible = !sheep;

  parts.select.visible = !dead && match.player.targetId === unit.id;
  parts.ice.visible = !dead && unit.auras.some((a) => a.ice);
  parts.shield.visible = !dead && unit.auras.some((a) => a.absorb);
  const bark = unit.auras.some((a) => a.damageReduce);
  parts.deter.visible = !dead && (unit.auras.some((a) => a.deflect) || bark);
  parts.deter.material.color.set(bark && !unit.auras.some((a) => a.deflect) ? 0x8fd18a : 0xffe08a);
  parts.reflect.visible = !dead && unit.auras.some((a) => a.reflect);
  const hot = unit.auras.find((a) => a.id === "hotStreak");
  const marked = unit.auras.some((a) => a.id === "duelMark");
  const chained = unit.auras.find((a) => a.id === "chain");
  parts.ember.visible = !dead && (!!hot || marked || !!chained);
  if (hot || marked || chained) {
    parts.ember.position.y = 2.55 + Math.sin(match.time * 8) * 0.08;
    if (hot) {
      parts.ember.scale.setScalar(hot.stacks >= 3 ? 5.5 : 2.4 + hot.stacks * 0.7);
      parts.ember.material.color.set(hot.stacks >= 3 ? 0xfff0c2 : 0xff7a3c);
    } else if (marked) {
      parts.ember.scale.setScalar(2.2);
      parts.ember.position.y += 0.15;
      parts.ember.material.color.set(0x7f9cff);
    } else {
      parts.ember.scale.setScalar(1.5 + chained.stacks * 0.35);
      parts.ember.position.y += 0.15;
      parts.ember.material.color.set(0xe23d4a);
    }
  }
  parts.castOrb.visible = !dead && !!unit.cast;
  if (unit.cast) {
    const look = window.Arena.spellLook(unit.cast.ability.id);
    parts.castOrb.material.color.set(look ? look.color : "#f0d48a");
    const heavy = unit.cast.ability.id === "pyroblast" || unit.cast.ability.id === "aimedShot";
    parts.castOrb.scale.setScalar((heavy ? 9 : 5.5) * (1 + Math.sin(match.time * 14) * 0.22));
  }
  parts.head.visible = !sheep && !dead;
  parts.cloth.color.copy(dead ? new THREE.Color("#6a645c") : feign ? new THREE.Color("#8d887f") : sheep ? new THREE.Color("#e7eef2") : cyclone ? new THREE.Color("#d7e7a0") : parts.base);
  const stealthFade = !dead && unit.auras.some((a) => a.stealth);
  const skip = new Set([parts.select, parts.blob, parts.ice, parts.shield, parts.deter, parts.reflect, parts.ember, parts.castOrb]);
  group.traverse((obj) => {
    if (!obj.isMesh || skip.has(obj) || !obj.material) return;
    const ghost = stealthFade ? (obj === parts.ring ? 0.45 : 0.2) : 1;
    if (obj.material.userData.ghost === ghost) {
      obj.castShadow = ghost >= 1;
      return;
    }
    obj.material.userData.ghost = ghost;
    obj.material.transparent = true;
    obj.material.opacity = ghost;
    obj.material.depthWrite = ghost >= 1;
    obj.material.needsUpdate = true;
    obj.castShadow = ghost >= 1;
  });
  parts.label.position.y = feign ? 8.8 : 3.35;
  parts.label.scale.set(3.6, feign ? 2.66 : 1.01, 1);
  parts.label.visible = !dead;
  if (!dead) paintLabel(parts.label, unit);
  parts.ring.visible = !dead;
}

function paintTexture(width, height, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  const tex = new THREE.CanvasTexture(canvas);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function groundTexture(kind) {
  return paintTexture(1024, 614, (ctx, w, h) => {
    ctx.fillStyle = "#b08968";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 7000; i++) {
      const shade = 90 + Math.random() * 80;
      ctx.fillStyle = `rgba(${shade}, ${shade * 0.72}, ${shade * 0.48}, ${0.08 + Math.random() * 0.16})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 4, 2 + Math.random() * 3);
    }
    const blue = ctx.createLinearGradient(0, 0, w * 0.22, 0);
    blue.addColorStop(0, "rgba(70, 120, 190, 0.28)");
    blue.addColorStop(1, "rgba(70, 120, 190, 0)");
    ctx.fillStyle = blue;
    ctx.fillRect(0, 0, w * 0.22, h);
    const red = ctx.createLinearGradient(w, 0, w * 0.78, 0);
    red.addColorStop(0, "rgba(180, 70, 60, 0.28)");
    red.addColorStop(1, "rgba(180, 70, 60, 0)");
    ctx.fillStyle = red;
    ctx.fillRect(w * 0.78, 0, w * 0.22, h);
    ctx.strokeStyle = "rgba(232, 205, 150, 0.55)";
    ctx.lineWidth = 10;
    ctx.strokeRect(28, 28, w - 56, h - 56);
    ctx.lineWidth = 3;
    ctx.strokeRect(48, 48, w - 96, h - 96);
    if (kind === "bridge") {
      const y0 = (25.6 / 60) * h;
      const y1 = (34.4 / 60) * h;
      ctx.fillStyle = "rgba(42, 26, 16, 0.34)";
      ctx.fillRect(70, y0, w - 140, y1 - y0);
    } else if (kind === "pillars") {
      ctx.strokeRect(w * 0.28, h * 0.22, w * 0.44, h * 0.56);
    } else {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 78, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

function plankTexture() {
  return paintTexture(256, 64, (ctx) => {
    ctx.fillStyle = "#6a4630";
    ctx.fillRect(0, 0, 256, 64);
    for (let x = 0; x < 256; x += 28) {
      ctx.fillStyle = `rgba(0,0,0,${0.06 + Math.random() * 0.1})`;
      ctx.fillRect(x, 0, 26, 64);
      ctx.strokeStyle = "rgba(32, 18, 10, 0.7)";
      ctx.strokeRect(x + 0.5, 0.5, 27, 63);
    }
  });
}

function skyTexture() {
  return paintTexture(8, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#1c2740");
    grad.addColorStop(0.42, "#6d5346");
    grad.addColorStop(0.72, "#c4926a");
    grad.addColorStop(1, "#e6c39a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });
}

function stoneTexture(tint) {
  return paintTexture(256, 256, (ctx) => {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) {
      const offset = (y / 32) % 2 ? 16 : 0;
      for (let x = -16; x < 256; x += 48) {
        ctx.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.12})`;
        ctx.fillRect(x + offset + 2, y + 2, 42, 26);
        ctx.strokeStyle = "rgba(255, 230, 190, 0.12)";
        ctx.strokeRect(x + offset + 2, y + 2, 42, 26);
      }
    }
  });
}

function buildScene() {
  const canvas = document.getElementById("arena");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (THREE.ACESFilmicToneMapping) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
  }

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog("#c4926a", 70, 190);

  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 320);

  scene.add(new THREE.HemisphereLight(0xffe2c4, 0x4a3a30, 0.85));
  const sun = new THREE.DirectionalLight(0xfff1dd, 2.4);
  sun.position.set(28, 46, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 140;
  sun.shadow.bias = -0.0008;
  sun.target.position.set(50, 0, 30);
  scene.add(sun);
  scene.add(sun.target);
  const fill = new THREE.DirectionalLight(0xc5d7ea, 0.55);
  fill.position.set(-20, 18, 40);
  scene.add(fill);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 60),
    new THREE.MeshStandardMaterial({ map: groundTexture("court"), roughness: 0.92, metalness: 0.02 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(50, 0, 30);
  ground.receiveShadow = true;
  scene.add(ground);

  const stone = new THREE.MeshStandardMaterial({ map: stoneTexture("#6a5a4c"), roughness: 0.88, metalness: 0.04 });
  const trim = new THREE.MeshStandardMaterial({ map: stoneTexture("#a68455"), roughness: 0.62, metalness: 0.18 });
  const addBox = (x, y, z, w, h, d, mat, shadow) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = !!shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  addBox(50, 2.2, -0.7, 104, 4.4, 1.6, stone, true);
  addBox(50, 2.2, 60.7, 104, 4.4, 1.6, stone, true);
  addBox(-0.7, 2.2, 30, 1.6, 4.4, 64, stone, true);
  addBox(100.7, 2.2, 30, 1.6, 4.4, 64, stone, true);
  for (let x = 4; x <= 96; x += 8) {
    addBox(x, 4.7, -0.7, 3.2, 1.1, 1.7, trim, true);
    addBox(x, 4.7, 60.7, 3.2, 1.1, 1.7, trim, true);
  }
  for (const [x, z] of [[0, 0], [100, 0], [0, 60], [100, 60], [50, 0], [50, 60]]) {
    addBox(x, 3.4, z, 2.2, 6.8, 2.2, trim, true);
  }

  for (const [x, z] of [[0, 0], [100, 0], [0, 60], [100, 60]]) {
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff8a3a }));
    flame.position.set(x, 7.3, z);
    scene.add(flame);
  }

  const gateMat = new THREE.MeshBasicMaterial({
    color: 0xc44747,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const gates = [38, 62].map((x) => {
    const gate = new THREE.Mesh(new THREE.PlaneGeometry(60, 7), gateMat);
    gate.position.set(x, 3.5, 30);
    gate.rotation.y = Math.PI / 2;
    scene.add(gate);
    return gate;
  });

  const ringMat = new THREE.MeshBasicMaterial({ color: 0xe0c17a, side: THREE.DoubleSide, transparent: true, opacity: 0.75 });
  const rangeRing = new THREE.Mesh(new THREE.RingGeometry(0.94, 1.06, 48), ringMat);
  rangeRing.rotation.x = -Math.PI / 2;
  rangeRing.position.y = 0.08;
  rangeRing.visible = false;
  scene.add(rangeRing);
  const minRing = new THREE.Mesh(
    new THREE.RingGeometry(0.94, 1.06, 40),
    new THREE.MeshBasicMaterial({ color: 0xe15b5b, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
  );
  minRing.rotation.x = -Math.PI / 2;
  minRing.position.y = 0.09;
  minRing.visible = false;
  scene.add(minRing);

  const aimRing = new THREE.Mesh(
    new THREE.RingGeometry(2.55, 3.05, 40),
    new THREE.MeshBasicMaterial({ color: 0x7ddea0, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthTest: false })
  );
  aimRing.rotation.x = -Math.PI / 2;
  aimRing.position.y = 0.12;
  aimRing.visible = false;
  aimRing.renderOrder = 6;
  scene.add(aimRing);

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
  const targetLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x7ddea0 }));
  targetLine.visible = false;
  scene.add(targetLine);
  const dashGeo = new THREE.BufferGeometry();
  dashGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
  const dashLine = new THREE.Line(
    dashGeo,
    new THREE.LineDashedMaterial({ color: 0xe15b5b, dashSize: 0.7, gapSize: 0.45 })
  );
  dashLine.visible = false;
  scene.add(dashLine);

  gfx = {
    renderer,
    scene,
    camera,
    canvas,
    fighters: new Map(),
    gates,
    rangeRing,
    minRing,
    aimRing,
    targetLine,
    dashLine,
    ground,
    mapRoot: null,
    walkables: [],
    traps: [],
    lanterns: [],
    floaters: [],
    camPos: null,
  };
  dressMap(pendingMap);
  resize();
}

function disposeGroup(group) {
  if (!group) return;
  const seen = new Set();
  group.traverse((obj) => {
    if (obj.geometry && !seen.has(obj.geometry)) {
      seen.add(obj.geometry);
      obj.geometry.dispose();
    }
    if (!obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (seen.has(mat)) continue;
      seen.add(mat);
      if (mat.map && !seen.has(mat.map)) {
        seen.add(mat.map);
        mat.map.dispose();
      }
      mat.dispose();
    }
  });
  gfx.scene.remove(group);
}

function makeWedge(lowX, highX, z0, z1, h) {
  const verts = new Float32Array([
    lowX, 0, z0,
    lowX, 0, z1,
    highX, 0, z0,
    highX, 0, z1,
    highX, h, z0,
    highX, h, z1,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  geo.setIndex([
    0, 2, 3, 0, 3, 1,
    0, 1, 5, 0, 5, 4,
    2, 4, 5, 2, 5, 3,
    0, 4, 2,
    1, 3, 5,
  ]);
  geo.computeVertexNormals();
  return geo;
}

function dressMap(mapId) {
  if (!gfx) return;
  const maps = window.Arena && Arena.MAPS;
  const map = maps && maps[mapId] ? maps[mapId] : { id: "court", blocks: [{ x: 50, y: 30, hw: 5.2, hh: 7.4 }] };
  disposeGroup(gfx.mapRoot);
  const root = new THREE.Group();
  gfx.scene.add(root);
  gfx.mapRoot = root;
  gfx.walkables = [];
  if (gfx.ground && gfx.ground.material) {
    const mat = gfx.ground.material;
    if (mat.map) mat.map.dispose();
    mat.map = groundTexture(map.id || "court");
    mat.needsUpdate = true;
  }

  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTexture("#7d6c5e"), roughness: 0.8, metalness: 0.06 });
  const trimMat = new THREE.MeshStandardMaterial({ map: stoneTexture("#c4a36a"), roughness: 0.55, metalness: 0.22 });
  const add = (x, y, z, w, h, d, mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };

  if (map.deck) {
    const deck = map.deck;
    const dw = deck.x1 - deck.x0;
    const dd = deck.y1 - deck.y0;
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(dw, deck.thick, dd),
      new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.74, metalness: 0.05 })
    );
    slab.position.set((deck.x0 + deck.x1) / 2, deck.top - deck.thick / 2, (deck.y0 + deck.y1) / 2);
    slab.castShadow = true;
    slab.receiveShadow = true;
    slab.userData.kind = "deck";
    root.add(slab);
    gfx.walkables.push(slab);
    const under = deck.top - deck.thick;
    for (const edge of [deck.y0 + 0.16, deck.y1 - 0.16]) {
      add((deck.x0 + deck.x1) / 2, deck.top + 0.42, edge, dw, 0.84, 0.28, trimMat);
    }
    for (let x = deck.x0 + 3; x <= deck.x1 - 2; x += 8) {
      add(x, deck.top + 0.7, deck.y0 + 0.16, 0.32, 1.4, 0.32, trimMat);
      add(x, deck.top + 0.7, deck.y1 - 0.16, 0.32, 1.4, 0.32, trimMat);
    }
    for (const block of map.blocks) {
      add(block.x, under / 2, block.y, block.hw * 2, under, block.hh * 2, stoneMat);
      add(block.x, under - 0.16, block.y, block.hw * 2 + 0.55, 0.32, block.hh * 2 + 0.55, trimMat);
    }
    const planks = new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.8, metalness: 0.04, side: THREE.DoubleSide });
    for (const ramp of map.ramps || []) {
      const lowX = ramp.high === "end" ? ramp.x0 : ramp.x1;
      const highX = ramp.high === "end" ? ramp.x1 : ramp.x0;
      const mesh = new THREE.Mesh(makeWedge(lowX, highX, ramp.y0, ramp.y1, ramp.top), planks);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.kind = "ramp";
      root.add(mesh);
      gfx.walkables.push(mesh);
    }
    const shade = new THREE.Mesh(
      new THREE.PlaneGeometry(dw - 1.2, dd - 1.2),
      new THREE.MeshBasicMaterial({ color: 0x2a1810, transparent: true, opacity: 0.42, depthWrite: false })
    );
    shade.rotation.x = -Math.PI / 2;
    shade.position.set((deck.x0 + deck.x1) / 2, 0.05, (deck.y0 + deck.y1) / 2);
    root.add(shade);
    return;
  }

  const tall = map.blocks.length < 2;
  for (const block of map.blocks) {
    const w = block.hw * 2;
    const d = block.hh * 2;
    const h = tall ? 12 : 9.4;
    add(block.x, h / 2, block.y, w, h, d, stoneMat);
    add(block.x, h + 0.18, block.y, w + (tall ? 0.4 : 0.7), 0.36, d + (tall ? 0.4 : 0.7), trimMat);
    if (!tall) continue;
    const column = new THREE.CylinderGeometry(0.55, 0.7, 11.2, 8);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const col = new THREE.Mesh(column, trimMat);
      col.position.set(block.x + dx * (w / 2 - 0.35), 5.6, block.y + dz * (d / 2 - 0.35));
      col.castShadow = true;
      root.add(col);
    }
  }
}

function setMap(mapId) {
  pendingMap = mapId && window.Arena && Arena.MAPS && Arena.MAPS[mapId] ? mapId : "court";
  if (gfx) dressMap(pendingMap);
}

function resize() {
  if (!gfx) return;
  const canvas = gfx.canvas;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  gfx.renderer.setSize(w, h, false);
  gfx.camera.aspect = w / h;
  gfx.camera.updateProjectionMatrix();
}

function cameraGoal(focus) {
  const boxes = window.Arena.tallBoxes ? Arena.tallBoxes() : [];
  const lift = window.Arena.floorAt ? Arena.floorAt(focus.x, focus.y, focus.height || 0) : 0;
  let d = distance;
  for (let i = 0; i < 14; i++) {
    const x = focus.x + Math.cos(yaw) * d;
    const z = focus.y + Math.sin(yaw) * d;
    const inside = boxes.some((box) => x > box.minX - 1.2 && x < box.maxX + 1.2 && z > box.minY - 1.2 && z < box.maxY + 1.2);
    if (!inside) return new THREE.Vector3(x, 12.5 + lift * 0.45, z);
    d *= 0.78;
  }
  return new THREE.Vector3(focus.x, 20 + lift * 0.45, focus.y + 10);
}

function syncTraps(match) {
  while (gfx.traps.length > match.traps.length) {
    const mesh = gfx.traps.pop();
    gfx.scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  for (let i = gfx.traps.length; i < match.traps.length; i++) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1.05, 20),
      new THREE.MeshBasicMaterial({ color: 0xb7f4ff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    mesh.rotation.x = -Math.PI / 2;
    gfx.scene.add(mesh);
    gfx.traps.push(mesh);
  }
  match.traps.forEach((trap, i) => {
    const mesh = gfx.traps[i];
    mesh.position.set(trap.x, (trap.h || 0) + 0.1, trap.y);
    mesh.scale.setScalar(trap.radius);
    mesh.material.color.set(trap.arm > 0 ? 0xd0d0d0 : 0x9eecff);
    mesh.material.opacity = trap.arm > 0 ? 0.45 : 0.95;
  });
}

function syncLanterns(match) {
  const list = match.lanterns || [];
  while (gfx.lanterns.length > list.length) {
    const mesh = gfx.lanterns.pop();
    gfx.scene.remove(mesh);
    mesh.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
  for (let i = gfx.lanterns.length; i < list.length; i++) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1.04, 32),
      new THREE.MeshBasicMaterial({ color: 0x5ee0c5, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
    );
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6),
      new THREE.MeshLambertMaterial({ color: 0x2b241c })
    );
    pole.position.y = 0.6;
    group.add(pole);
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xd8fff6 })
    );
    orb.position.y = 1.3;
    group.add(orb);
    group.userData.ring = ring;
    group.userData.orb = orb;
    gfx.scene.add(group);
    gfx.lanterns.push(group);
  }
  list.forEach((lantern, i) => {
    const mesh = gfx.lanterns[i];
    const reach = lantern.beacon > 0 ? lantern.radius * 2 : lantern.radius;
    mesh.position.set(lantern.x, lantern.h || 0, lantern.y);
    mesh.userData.ring.scale.setScalar(reach);
    mesh.userData.orb.material.color.set(lantern.beacon > 0 ? 0xfff6c8 : 0xd8fff6);
    mesh.userData.orb.position.y = 1.3 + Math.sin(match.time * 4) * 0.08;
  });
}

function syncFloaters(match) {
  while (gfx.floaters.length < match.floaters.length) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(2.8, 0.7, 1);
    sprite.userData.ctx = ctx;
    sprite.userData.tex = tex;
    sprite.userData.canvas = canvas;
    sprite.userData.key = "";
    gfx.scene.add(sprite);
    gfx.floaters.push(sprite);
  }
  gfx.floaters.forEach((sprite, i) => {
    const floater = match.floaters[i];
    if (!floater) {
      sprite.visible = false;
      return;
    }
    sprite.visible = true;
    const key = floater.text + floater.color;
    if (sprite.userData.key !== key) {
      sprite.userData.key = key;
      const ctx = sprite.userData.ctx;
      ctx.clearRect(0, 0, 256, 64);
      ctx.font = "700 36px Segoe UI, Tahoma, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = floater.color;
      ctx.fillText(floater.text, 128, 44);
      sprite.userData.tex.needsUpdate = true;
    }
    sprite.material.opacity = Math.max(0, floater.life);
    sprite.position.set(floater.x, 2.3 + (floater.h || 0) + (1.15 - floater.life) * 2.2, floater.y);
  });
}

function placeLine(line, ax, az, bx, bz, y) {
  const attr = line.geometry.attributes.position;
  const h = y == null ? 0.12 : y;
  attr.setXYZ(0, ax, h, az);
  attr.setXYZ(1, bx, h, bz);
  attr.needsUpdate = true;
  if (line.computeLineDistances) line.computeLineDistances();
}

function render(match, dt) {
  if (!gfx) buildScene();
  if (!match) return;

  const focus = match.player.hp > 0 ? match.player : { x: 50, y: 30, height: 0 };
  const goal = cameraGoal(focus);
  if (!gfx.camPos) gfx.camPos = goal.clone();
  const blend = 1 - Math.exp(-7 * Math.max(dt, 0.001));
  gfx.camPos.lerp(goal, blend);
  gfx.camera.position.copy(gfx.camPos);
  const lookLift = window.Arena.floorAt ? Arena.floorAt(focus.x, focus.y, focus.height || 0) : 0;
  gfx.camera.lookAt(focus.x - Math.cos(yaw) * 5, 1.5 + lookLift * 0.45, focus.y - Math.sin(yaw) * 5);

  gfx.gates.forEach((gate) => {
    gate.visible = match.phase === "prep";
  });

  for (const unit of match.units) {
    let obj = gfx.fighters.get(unit.id);
    if (!obj) {
      obj = makeFighter(unit);
      gfx.fighters.set(unit.id, obj);
      gfx.scene.add(obj);
    }
    updateFighter(obj, unit, match);
  }

  const hover = window.Arena.getHover ? Arena.getHover() : null;
  const aiming = match.groundAim && match.player.hp > 0;
  const radius = aiming ? match.groundAim.range : hover && match.player.hp > 0 ? (hover.radius || hover.range || 0) : 0;
  const feet = window.Arena.floorAt ? Arena.floorAt(match.player.x, match.player.y, match.player.height || 0) : 0;
  gfx.rangeRing.visible = radius > 0;
  if (radius > 0) {
    gfx.rangeRing.position.set(match.player.x, feet + 0.08, match.player.y);
    gfx.rangeRing.scale.setScalar(radius);
  }
  const minRange = aiming ? match.groundAim.minRange : hover && hover.minRange;
  gfx.minRing.visible = !!(minRange && match.player.hp > 0);
  if (gfx.minRing.visible) {
    gfx.minRing.position.set(match.player.x, feet + 0.09, match.player.y);
    gfx.minRing.scale.setScalar(minRange);
  }
  const cursor = aiming ? match.groundAim.cursor : null;
  gfx.aimRing.visible = !!cursor;
  if (cursor) {
    gfx.aimRing.position.set(cursor.x, (cursor.h || 0) + 0.12, cursor.y);
    gfx.aimRing.scale.setScalar((match.groundAim.radius || 3) / 3);
    gfx.aimRing.material.color.set(cursor.ok ? 0x7ddea0 : 0xe15b5b);
  }

  const target = match.units.find((u) => u.id === match.player.targetId);
  const showLine = target && target.hp > 0 && match.player.hp > 0 && target !== match.player;
  gfx.targetLine.visible = false;
  gfx.dashLine.visible = false;
  if (showLine) {
    const los = window.Arena.hasLoS ? Arena.hasLoS(match.player, target) : true;
    const line = los ? gfx.targetLine : gfx.dashLine;
    line.visible = true;
    placeLine(line, match.player.x, match.player.y, target.x, target.y, Math.max(match.player.height || 0, target.height || 0) + 0.2);
  }

  syncTraps(match);
  syncLanterns(match);
  syncFloaters(match);
  syncFx(match);
  syncCastLines(match);
  gfx.renderer.render(gfx.scene, gfx.camera);
}

function fxMat(color, opacity, additive) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
}

function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
  });
}

function aimCylinder(mesh, ax, ay, az, bx, by, bz) {
  const dir = new THREE.Vector3(bx - ax, by - ay, bz - az);
  const len = Math.max(0.2, dir.length());
  mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  mesh.scale.set(mesh.userData.girth || 1, len, mesh.userData.girth || 1);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.multiplyScalar(1 / len));
}

function makeFxMesh(effect) {
  const color = new THREE.Color(effect.color || "#f0d48a");
  const group = new THREE.Group();
  group.userData.kind = effect.kind;
  group.renderOrder = 4;
  if (effect.kind === "ring") {
    const outer = new THREE.Mesh(new THREE.RingGeometry(0.78, 1, 40), fxMat(color, 0.85, true));
    const inner = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), fxMat(0xffffff, 0.95, false));
    outer.rotation.x = -Math.PI / 2;
    inner.rotation.x = -Math.PI / 2;
    inner.material.color.copy(color).lerp(new THREE.Color("#ffffff"), 0.45);
    group.add(outer, inner);
    group.userData.parts = { outer, inner };
    return group;
  }
  if (effect.kind === "slash") {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.22, 8, 18, Math.PI * 0.95), fxMat(color, 1, false));
    const glow = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.48, 8, 18, Math.PI * 0.95), fxMat(color, 0.45, true));
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), fxMat(0xffffff, 0.9, true));
    group.add(glow, arc, flash);
    group.userData.parts = { arc, glow, flash };
    return group;
  }
  if (effect.kind === "beam") {
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1, 8), fxMat(color, 0.95, false));
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1, 8), fxMat(color, 0.4, true));
    core.userData.girth = 1;
    glow.userData.girth = 1;
    group.add(glow, core);
    group.userData.parts = { core, glow };
    return group;
  }
  if (effect.kind === "bolt") {
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 10), fxMat(color, 1, false));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1.15, 12, 10), fxMat(color, 0.28, true));
    const trail = [0, 1, 2, 3].map((i) => {
      const bit = new THREE.Mesh(new THREE.SphereGeometry(0.42 - i * 0.06, 8, 6), fxMat(color, 0.55, true));
      group.add(bit);
      return bit;
    });
    const impact = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 28), fxMat(color, 0.9, true));
    impact.rotation.x = -Math.PI / 2;
    group.add(glow, core, impact);
    group.userData.parts = { core, glow, trail, impact };
    return group;
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.95, 14, 12), fxMat(color, 0.95, false));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.55, 14, 12), fxMat(color, 0.32, true));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 1, 32), fxMat(color, 0.8, true));
  ring.rotation.x = -Math.PI / 2;
  group.add(glow, core, ring);
  group.userData.parts = { core, glow, ring };
  return group;
}

function placeFx(group, effect) {
  const t = 1 - Math.max(0, effect.life) / (effect.max || 0.4);
  const fade = 1 - Math.max(0, (t - 0.62) / 0.38);
  const size = effect.size || 1;
  group.visible = true;
  const parts = group.userData.parts;
  if (effect.kind === "bolt") {
    const head = 0.12 + t * 0.88;
    const at = (u) => ({
      x: effect.x + (effect.x2 - effect.x) * u,
      y: effect.h + ((effect.h2 || effect.h) - effect.h) * u,
      z: effect.y + (effect.y2 - effect.y) * u,
    });
    const p = at(head);
    parts.core.position.set(p.x, p.y, p.z);
    parts.glow.position.set(p.x, p.y, p.z);
    const stretch = effect.round ? 1 : 1.85;
    parts.core.scale.set(size, size, size * stretch);
    parts.glow.scale.set(size * 1.2, size * 1.2, size * (effect.round ? 1.2 : 1.55));
    if (!effect.round) {
      parts.core.lookAt(effect.x2, effect.h2 || 1.2, effect.y2);
      parts.glow.lookAt(effect.x2, effect.h2 || 1.2, effect.y2);
    }
    parts.trail.forEach((bit, i) => {
      const q = at(Math.max(0, head - (i + 1) * 0.07));
      bit.position.set(q.x, q.y, q.z);
      bit.scale.setScalar(size * (1 - i * 0.16));
      bit.material.opacity = 0.5 * fade * (1 - i * 0.18);
    });
    const hit = at(1);
    parts.impact.position.set(hit.x, 0.16, hit.z);
    parts.impact.visible = t > 0.72;
    parts.impact.scale.setScalar(size * (1.2 + (t - 0.72) * 8));
    parts.impact.material.opacity = t > 0.72 ? 0.9 * (1 - (t - 0.72) / 0.28) : 0;
    parts.core.material.opacity = fade;
    parts.glow.material.opacity = 0.5 * fade;
    return;
  }
  if (effect.kind === "beam") {
    aimCylinder(parts.core, effect.x, effect.h || 0.8, effect.y, effect.x2, effect.h2 || 0.8, effect.y2);
    aimCylinder(parts.glow, effect.x, effect.h || 0.8, effect.y, effect.x2, effect.h2 || 0.8, effect.y2);
    parts.core.material.opacity = 0.95 * fade;
    parts.glow.material.opacity = 0.45 * fade;
    return;
  }
  if (effect.kind === "slash") {
    group.position.set(effect.x2, effect.h || 1.4, effect.y2);
    const yaw = -Math.atan2(effect.y2 - effect.y, effect.x2 - effect.x);
    group.rotation.set(0.4, yaw, 0.15);
    const s = size * (1.15 + t * 0.55);
    parts.arc.scale.setScalar(s);
    parts.glow.scale.setScalar(s * 1.08);
    parts.arc.rotation.z = t * 0.8;
    parts.glow.rotation.z = t * 0.8;
    parts.flash.scale.setScalar(size * (1.6 - t));
    parts.flash.material.opacity = 0.85 * (1 - t);
    parts.arc.material.opacity = fade;
    parts.glow.material.opacity = 0.45 * fade;
    return;
  }
  if (effect.kind === "ring") {
    group.position.set(effect.x, effect.h || 0.16, effect.y);
    const s = size * (0.72 + t * 0.48);
    parts.outer.scale.setScalar(s);
    parts.inner.scale.setScalar(s * 0.92);
    parts.outer.material.opacity = 0.8 * fade;
    parts.inner.material.opacity = 0.95 * fade;
    return;
  }
  group.position.set(effect.x, effect.h || 1.3, effect.y);
  const s = size * (0.7 + t * 1.15);
  parts.core.scale.setScalar(s);
  parts.glow.scale.setScalar(s * 1.25);
  parts.ring.position.y = -((effect.h || 1.3) - 0.16);
  parts.ring.scale.setScalar(size * (1.4 + t * 2.4));
  parts.core.material.opacity = 0.95 * fade;
  parts.glow.material.opacity = 0.42 * fade;
  parts.ring.material.opacity = 0.75 * (1 - t);
}

function syncFx(match) {
  if (!gfx.fxMeshes) gfx.fxMeshes = new Map();
  const live = new Set();
  (match.fx || []).forEach((effect, index) => {
    const key = effect.id != null ? effect.id : "fx" + index;
    live.add(key);
    let mesh = gfx.fxMeshes.get(key);
    if (mesh && mesh.userData.kind !== effect.kind) {
      gfx.scene.remove(mesh);
      disposeObject(mesh);
      gfx.fxMeshes.delete(key);
      mesh = null;
    }
    if (!mesh) {
      mesh = makeFxMesh(effect);
      gfx.scene.add(mesh);
      gfx.fxMeshes.set(key, mesh);
    }
    placeFx(mesh, effect);
  });
  for (const [id, mesh] of gfx.fxMeshes) {
    if (live.has(id)) continue;
    gfx.scene.remove(mesh);
    disposeObject(mesh);
    gfx.fxMeshes.delete(id);
  }
}

function makeCastBeam() {
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1, 7), fxMat(0xf0d48a, 0.8, false));
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1, 8), fxMat(0xf0d48a, 0.32, true));
  core.userData.girth = 1;
  glow.userData.girth = 1;
  group.add(glow, core);
  group.userData.core = core;
  group.userData.glow = glow;
  return group;
}

function syncCastLines(match) {
  if (!gfx.castLines) gfx.castLines = [];
  const casters = match.units.filter((unit) => unit.hp > 0 && unit.cast && unit.cast.targetId && !unit.cast.channel);
  while (gfx.castLines.length < casters.length) {
    const beam = makeCastBeam();
    gfx.scene.add(beam);
    gfx.castLines.push(beam);
  }
  gfx.castLines.forEach((beam, i) => {
    const unit = casters[i];
    if (!unit) {
      beam.visible = false;
      return;
    }
    const target = match.units.find((u) => u.id === unit.cast.targetId);
    if (!target || target === unit) {
      beam.visible = false;
      return;
    }
    beam.visible = true;
    const look = window.Arena.spellLook(unit.cast.ability.id);
    const color = look ? look.color : "#f0d48a";
    beam.userData.core.material.color.set(color);
    beam.userData.glow.material.color.set(color);
    const y1 = 1.45 + (unit.height || 0);
    const y2 = 1.25 + (target.height || 0);
    aimCylinder(beam.userData.core, unit.x, y1, unit.y, target.x, y2, target.y);
    aimCylinder(beam.userData.glow, unit.x, y1, unit.y, target.x, y2, target.y);
  });
}

function pointerRay(clientX, clientY) {
  if (!gfx) return false;
  const rect = gfx.canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, gfx.camera);
  return true;
}

function groundPoint(clientX, clientY) {
  if (!pointerRay(clientX, clientY)) return null;
  const planeHit = new THREE.Vector3();
  const hitPlane = raycaster.ray.intersectPlane(groundPlane, planeHit);
  const player = window.Arena && Arena.match && Arena.match.player;
  const under = player && Arena.underDeck && Arena.underDeck(player.x, player.y, player.height || 0);
  const hits = !under && gfx.walkables && gfx.walkables.length ? raycaster.intersectObjects(gfx.walkables, false) : [];
  if (hits.length) {
    const p = hits[0].point;
    return { x: p.x, z: p.z, h: p.y };
  }
  if (!hitPlane) return null;
  return { x: planeHit.x, z: planeHit.z, h: 0 };
}

function pickUnitId(clientX, clientY) {
  if (!pointerRay(clientX, clientY) || !gfx.fighters.size) return null;
  const hits = raycaster.intersectObjects([...gfx.fighters.values()], true);
  for (const hit of hits) {
    let obj = hit.object;
    while (obj && obj.userData.unitId == null) obj = obj.parent;
    if (obj) return obj.userData.unitId;
  }
  return null;
}

function reset() {
  if (!gfx) return;
  for (const obj of gfx.fighters.values()) gfx.scene.remove(obj);
  gfx.fighters.clear();
  for (const mesh of gfx.traps) gfx.scene.remove(mesh);
  gfx.traps = [];
  if (gfx.lanterns) {
    for (const mesh of gfx.lanterns) {
      gfx.scene.remove(mesh);
      mesh.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
    }
    gfx.lanterns = [];
  }
  if (gfx.fxMeshes) {
    for (const mesh of gfx.fxMeshes.values()) {
      gfx.scene.remove(mesh);
      disposeObject(mesh);
    }
    gfx.fxMeshes.clear();
  }
  if (gfx.castLines) {
    for (const line of gfx.castLines) {
      line.visible = false;
    }
  }
  gfx.camPos = null;
}

function bind(onLeftClick) {
  const canvas = document.getElementById("arena");
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  let dragging = false;
  let lastX = 0;
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 2) return;
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    yaw += (e.clientX - lastX) * 0.007;
    lastX = e.clientX;
  });
  const stopDrag = () => {
    dragging = false;
  };
  canvas.addEventListener("pointerup", stopDrag);
  canvas.addEventListener("pointercancel", stopDrag);
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    distance = Math.max(14, Math.min(48, distance + e.deltaY * 0.015));
  }, { passive: false });
  canvas.addEventListener("click", onLeftClick);
}

window.ArenaView = {
  getYaw() { return yaw; },
  setMap,
  resize,
  render,
  groundPoint,
  pickUnitId,
  reset,
  bind,
};
