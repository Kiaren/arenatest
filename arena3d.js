"use strict";

/**
 * 3D arena view. Combat stays on the x/y ground plane;
 * Three.js uses x and z for that plane, and y for height.
 */

let yaw = Math.PI;
let distance = 28;
let gfx = null;
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function pillarAabb() {
  const pillar = window.Arena.PILLAR;
  return {
    minX: pillar.x - pillar.hw,
    maxX: pillar.x + pillar.hw,
    minZ: pillar.y - pillar.hh,
    maxZ: pillar.y + pillar.hh,
  };
}

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

function makeFighter(unit) {
  const group = new THREE.Group();
  group.userData.unitId = unit.id;
  const classColor = new THREE.Color(window.Arena.CLASSES[unit.classId].color);
  const teamColor = unit.team === "ally" ? 0x6aa2ff : 0xe15b5b;
  const cloth = new THREE.MeshLambertMaterial({ color: classColor, transparent: true });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd7b396, transparent: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2b241c, transparent: true });
  const metal = new THREE.MeshLambertMaterial({ color: 0xc9ccd1, transparent: true });

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
  for (const side of [-0.2, 0.2]) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.78, side);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.74, 7), dark);
    leg.position.y = -0.37;
    leg.castShadow = true;
    pivot.add(leg);
    group.add(pivot);
    legs.push(pivot);
  }

  const bodyW = unit.classId === "warrior" ? 0.5 : 0.4;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(bodyW * 0.82, bodyW, 1.15, 10), cloth);
  body.position.y = 1.28;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), skin);
  head.position.y = 2.12;
  head.castShadow = true;
  group.add(head);

  if (unit.classId === "warrior") {
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.16), metal);
    sword.position.set(0.7, 1.25, 0.28);
    sword.rotation.z = -0.4;
    sword.castShadow = true;
    group.add(sword);
  } else if (unit.classId === "mage") {
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.1, 6), dark);
    staff.position.set(0.42, 1.2, 0.32);
    staff.castShadow = true;
    group.add(staff);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0x8fd7ff }));
    gem.position.set(0.42, 2.25, 0.32);
    group.add(gem);
  } else if (unit.classId === "hunter") {
    const bow = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.035, 6, 10, Math.PI),
      dark
    );
    bow.position.set(0.35, 1.35, 0.34);
    bow.rotation.z = Math.PI / 2;
    group.add(bow);
  } else if (unit.classId === "warlock") {
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.1, 6), dark);
    staff.position.set(0.42, 1.2, 0.32);
    staff.castShadow = true;
    group.add(staff);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0x6dff9a }));
    gem.position.set(0.42, 2.28, 0.32);
    group.add(gem);
  } else if (unit.classId === "druid") {
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 2.05, 6), new THREE.MeshLambertMaterial({ color: 0x6b4a2a }));
    staff.position.set(0.4, 1.15, 0.3);
    staff.castShadow = true;
    group.add(staff);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshLambertMaterial({ color: 0x7dff9a }));
    leaf.position.set(0.4, 2.2, 0.3);
    group.add(leaf);
  } else if (unit.classId === "rogue") {
    const right = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.1), metal);
    right.position.set(0.52, 1.12, 0.26);
    right.rotation.z = -0.95;
    right.castShadow = true;
    group.add(right);
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.08), metal);
    left.position.set(-0.46, 1.18, 0.2);
    left.rotation.z = 0.85;
    group.add(left);
  } else if (unit.classId === "warden") {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.7, 6), dark);
    pole.position.set(0.42, 1.15, 0.28);
    pole.castShadow = true;
    group.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshBasicMaterial({ color: 0xd8fff6 }));
    lamp.position.set(0.42, 2.05, 0.28);
    group.add(lamp);
  } else if (unit.classId === "binder") {
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.045, 6, 12, Math.PI * 1.2), metal);
    hook.position.set(0.48, 1.35, 0.3);
    hook.rotation.z = -0.6;
    group.add(hook);
  } else if (unit.classId === "vow") {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.035, 6, 16),
      new THREE.MeshBasicMaterial({ color: 0xf2a3c7 })
    );
    band.position.y = 2.15;
    band.rotation.x = Math.PI / 2.4;
    group.add(band);
  } else if (unit.classId === "duelist") {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.035, 0.07), metal);
    blade.position.set(0.62, 1.28, 0.22);
    blade.rotation.z = -0.25;
    blade.castShadow = true;
    group.add(blade);
  } else {
    const stole = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.5), new THREE.MeshLambertMaterial({ color: 0xf0d48a }));
    stole.position.y = 1.35;
    group.add(stole);
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

  group.userData.parts = { cloth, skin, dark, metal, base: classColor.clone(), ring, select, ice, shield, deter, reflect, ember, castOrb, label, head, legs, blob };
  return group;
}

function updateFighter(group, unit, match) {
  const parts = group.userData.parts;
  const dead = unit.hp <= 0;
  const sheep = unit.auras.some((a) => a.id === "polymorph");
  const cyclone = !dead && unit.auras.some((a) => a.id === "cyclone");
  const lift = dead ? 0 : (unit.height || 0);
  const feign = !dead && unit.auras.some((a) => a.feign);
  const moved = group.userData.px != null && Math.hypot(unit.x - group.userData.px, unit.y - group.userData.pz) > 0.02;
  group.userData.px = unit.x;
  group.userData.pz = unit.y;
  const bob = !dead && !feign && moved && lift < 0.05 ? Math.abs(Math.sin(match.time * 11)) * 0.06 : 0;
  group.position.set(unit.x, (dead ? 0.35 : 0) + lift + bob + (cyclone ? 1.35 : 0), unit.y);
  group.rotation.set(0, cyclone ? match.time * 8 : -unit.facing, dead ? 1.25 : 0);
  group.scale.set(sheep ? 1.2 : feign ? 1.15 : 1, dead ? 1 : sheep ? 0.7 : feign ? 0.38 : 1, sheep ? 1.2 : feign ? 1.15 : 1);
  parts.blob.position.y = 0.02 - lift - bob;
  parts.ring.position.y = 0.05 - lift - bob;
  parts.select.position.y = 0.07 - lift - bob;

  const swing = !dead && moved ? Math.sin(match.time * 11) * 0.55 : 0;
  parts.legs[0].rotation.z = swing;
  parts.legs[1].rotation.z = -swing;

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

function groundTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#8a6a4c";
  ctx.fillRect(0, 0, 512, 320);
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = `rgba(${40 + Math.random() * 40}, ${28 + Math.random() * 20}, 18, ${Math.random() * 0.18})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 320, 2, 2);
  }
  ctx.strokeStyle = "rgba(217, 192, 138, 0.28)";
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 492, 300);
  const tex = new THREE.CanvasTexture(canvas);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildScene() {
  const canvas = document.getElementById("arena");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#5c4636");
  scene.fog = new THREE.Fog("#5c4636", 90, 230);

  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 320);

  scene.add(new THREE.HemisphereLight(0xfff0d4, 0x6a5040, 1.35));
  const sun = new THREE.DirectionalLight(0xfff4df, 1.45);
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
    new THREE.MeshLambertMaterial({ map: groundTexture() })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(50, 0, 30);
  ground.receiveShadow = true;
  scene.add(ground);

  const stone = new THREE.MeshLambertMaterial({ color: 0x4a4036 });
  const trim = new THREE.MeshLambertMaterial({ color: 0x8d7348 });
  const addBox = (x, y, z, w, h, d, mat, shadow) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = !!shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  addBox(50, 1.5, -0.7, 104, 3, 1.4, stone, true);
  addBox(50, 1.5, 60.7, 104, 3, 1.4, stone, true);
  addBox(-0.7, 1.5, 30, 1.4, 3, 64, stone, true);
  addBox(100.7, 1.5, 30, 1.4, 3, 64, stone, true);
  for (const [x, z] of [[0, 0], [100, 0], [0, 60], [100, 60], [50, 0], [50, 60]]) {
    addBox(x, 2.6, z, 1.8, 5.2, 1.8, trim, true);
  }

  const box = pillarAabb();
  const pillar = addBox(
    (box.minX + box.maxX) / 2,
    6,
    (box.minZ + box.maxZ) / 2,
    box.maxX - box.minX,
    12,
    box.maxZ - box.minZ,
    new THREE.MeshLambertMaterial({ color: 0x6b5e52 }),
    true
  );
  const cap = addBox(
    pillar.position.x,
    12.15,
    pillar.position.z,
    box.maxX - box.minX + 0.4,
    0.35,
    box.maxZ - box.minZ + 0.4,
    trim,
    true
  );
  void cap;

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
    traps: [],
    lanterns: [],
    floaters: [],
    camPos: null,
  };
  resize();
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
  const box = pillarAabb();
  let d = distance;
  for (let i = 0; i < 12; i++) {
    const x = focus.x + Math.cos(yaw) * d;
    const z = focus.y + Math.sin(yaw) * d;
    const inside = x > box.minX - 1.2 && x < box.maxX + 1.2 && z > box.minZ - 1.2 && z < box.maxZ + 1.2;
    if (!inside) return new THREE.Vector3(x, 12.5, z);
    d *= 0.78;
  }
  return new THREE.Vector3(focus.x, 20, focus.y + 10);
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
    mesh.position.set(trap.x, 0.1, trap.y);
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
    mesh.position.set(lantern.x, 0, lantern.y);
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

function placeLine(line, ax, az, bx, bz) {
  const attr = line.geometry.attributes.position;
  attr.setXYZ(0, ax, 0.12, az);
  attr.setXYZ(1, bx, 0.12, bz);
  attr.needsUpdate = true;
  if (line.computeLineDistances) line.computeLineDistances();
}

function render(match, dt) {
  if (!gfx) buildScene();
  if (!match) return;

  const focus = match.player.hp > 0 ? match.player : { x: 50, y: 30 };
  const goal = cameraGoal(focus);
  if (!gfx.camPos) gfx.camPos = goal.clone();
  const blend = 1 - Math.exp(-7 * Math.max(dt, 0.001));
  gfx.camPos.lerp(goal, blend);
  gfx.camera.position.copy(gfx.camPos);
  gfx.camera.lookAt(focus.x - Math.cos(yaw) * 5, 1.7, focus.y - Math.sin(yaw) * 5);

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
  gfx.rangeRing.visible = radius > 0;
  if (radius > 0) {
    gfx.rangeRing.position.set(match.player.x, 0.08, match.player.y);
    gfx.rangeRing.scale.setScalar(radius);
  }
  const minRange = aiming ? match.groundAim.minRange : hover && hover.minRange;
  gfx.minRing.visible = !!(minRange && match.player.hp > 0);
  if (gfx.minRing.visible) {
    gfx.minRing.position.set(match.player.x, 0.09, match.player.y);
    gfx.minRing.scale.setScalar(minRange);
  }
  const cursor = aiming ? match.groundAim.cursor : null;
  gfx.aimRing.visible = !!cursor;
  if (cursor) {
    gfx.aimRing.position.set(cursor.x, 0.12, cursor.y);
    gfx.aimRing.scale.setScalar((match.groundAim.radius || 3) / 3);
    gfx.aimRing.material.color.set(cursor.ok ? 0x7ddea0 : 0xe15b5b);
  }

  const target = match.units.find((u) => u.id === match.player.targetId);
  const showLine = target && target.hp > 0 && match.player.hp > 0 && target !== match.player;
  gfx.targetLine.visible = false;
  gfx.dashLine.visible = false;
  if (showLine) {
    const los = segmentClear(match.player.x, match.player.y, target.x, target.y);
    const line = los ? gfx.targetLine : gfx.dashLine;
    line.visible = true;
    placeLine(line, match.player.x, match.player.y, target.x, target.y);
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

function segmentClear(x1, z1, x2, z2) {
  const box = pillarAabb();
  const dx = x2 - x1;
  const dz = z2 - z1;
  let tmin = 0;
  let tmax = 1;
  const checks = [
    { p: -dx, q: x1 - box.minX },
    { p: dx, q: box.maxX - x1 },
    { p: -dz, q: z1 - box.minZ },
    { p: dz, q: box.maxZ - z1 },
  ];
  for (const { p, q } of checks) {
    if (Math.abs(p) < 1e-8) {
      if (q < 0) return true;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > tmax) return true;
        if (r > tmin) tmin = r;
      } else {
        if (r < tmin) return true;
        if (r < tmax) tmax = r;
      }
    }
  }
  return !(tmax >= tmin && tmin <= 1 && tmax >= 0);
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
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
  return { x: hit.x, z: hit.z };
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
  resize,
  render,
  groundPoint,
  pickUnitId,
  reset,
  bind,
};
