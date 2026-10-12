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

const CAST_KIT = {
  warrior: { body: "knight", props: ["1H_Sword", "Round_Shield", "Knight_Helmet", "Knight_Cape"], attack: "melee", tint: "#C79C6E" },
  mage: { body: "mage", props: ["2H_Staff", "Mage_Hat", "Mage_Cape"], attack: "cast", tint: "#69CCF0" },
  hunter: { body: "rogue", props: ["1H_Crossbow", "Rogue_Cape"], attack: "shoot", tint: "#ABD473" },
  priest: { body: "hooded", props: ["Rogue_Cape"], attack: "cast", tint: "#f7f4ff" },
  warlock: { body: "mage", props: ["1H_Wand", "Spellbook", "Mage_Hat", "Mage_Cape"], attack: "cast", tint: "#9482C9" },
  druid: { body: "barbarian", props: ["2H_Axe", "Barbarian_Hat", "Barbarian_Cape"], attack: "heavy", tint: "#FF7D0A" },
  rogue: { body: "rogue", props: ["Knife", "Knife_Offhand", "Rogue_Cape"], attack: "dual", tint: "#FFF569" },
  warden: { body: "knight", props: ["Rectangle_Shield", "Knight_Helmet", "Knight_Cape"], attack: "cast", tint: "#5ee0c5" },
  binder: { body: "mage", props: ["Spellbook_open", "1H_Wand", "Mage_Hat"], attack: "cast", tint: "#e23d4a" },
  vow: { body: "hooded", props: ["Rogue_Cape"], attack: "cast", tint: "#f2a3c7" },
  duelist: { body: "knight", props: ["2H_Sword", "Knight_Helmet", "Knight_Cape"], attack: "heavy", tint: "#7f9cff" },
};

const castTextures = new Map();
let castClips = null;

function castBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function castFloats(b64) {
  const bytes = castBytes(b64);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

function castU16(b64) {
  const bytes = castBytes(b64);
  return new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}

function castTexture(body, b64) {
  let tex = castTextures.get(body);
  if (tex) return tex;
  tex = new THREE.TextureLoader().load("data:image/png;base64," + b64);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  castTextures.set(body, tex);
  return tex;
}

function castGeometry(part, skinned) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(castFloats(part.p), 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(castFloats(part.n), 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(castFloats(part.u), 2));
  geo.setIndex(new THREE.BufferAttribute(castU16(part.i), 1));
  if (skinned && part.si && part.sw) {
    const si = castBytes(part.si);
    const sw = castBytes(part.sw);
    const index = new Uint16Array(si.length);
    const weight = new Float32Array(sw.length);
    for (let i = 0; i < si.length; i++) {
      index[i] = si[i];
      weight[i] = sw[i] / 255;
    }
    geo.setAttribute("skinIndex", new THREE.BufferAttribute(index, 4));
    geo.setAttribute("skinWeight", new THREE.BufferAttribute(weight, 4));
  }
  return geo;
}

function castLibrary() {
  if (castClips || !window.ARENA_CAST) return castClips;
  castClips = {};
  for (const [name, clip] of Object.entries(ARENA_CAST.clips)) {
    const times = castFloats(clip.t);
    const tracks = [];
    for (const [bone, track] of Object.entries(clip.bones)) {
      tracks.push(new THREE.QuaternionKeyframeTrack(bone + ".quaternion", times, castFloats(track.q)));
      tracks.push(new THREE.VectorKeyframeTrack(bone + ".position", times, castFloats(track.p)));
    }
    castClips[name] = new THREE.AnimationClip(name, clip.d, tracks);
  }
  return castClips;
}

function makeSheep() {
  const sheep = new THREE.Group();
  const wool = new THREE.MeshStandardMaterial({ color: 0xf7f4ee, roughness: 0.92 });
  const face = new THREE.MeshStandardMaterial({ color: 0x2c241c, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 12), wool);
  body.scale.set(1.35, 0.82, 0.95);
  body.position.set(0.05, 0.52, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), wool);
  head.position.set(0.42, 0.62, 0);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.12), face);
  snout.position.set(0.58, 0.56, 0);
  sheep.add(body, head, snout);
  for (const [x, z] of [[0.16, 0.16], [0.16, -0.16], [-0.2, 0.16], [-0.2, -0.16]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.28, 6), face);
    leg.position.set(x, 0.14, z);
    sheep.add(leg);
  }
  sheep.visible = false;
  return sheep;
}

function fadeCast(group, name, once, force) {
  const next = group.userData.actions[name];
  if (!next) return;
  const holding = group.userData.clip === name && (next.isRunning() || (once && next.paused));
  if (holding && !force) return;
  const prev = group.userData.actions[group.userData.clip];
  next.enabled = true;
  next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
  next.clampWhenFinished = !!once;
  next.reset().play();
  if (prev && prev !== next) next.crossFadeFrom(prev, 0.14, false);
  group.userData.clip = name;
  group.userData.once = !!once;
}

function makeFighter(unit) {
  const group = new THREE.Group();
  group.userData.unitId = unit.id;
  const kit = CAST_KIT[unit.classId] || CAST_KIT.warrior;
  const pack = window.ARENA_CAST && ARENA_CAST.bodies[kit.body];
  const clips = castLibrary();
  const teamColor = unit.team === "ally" ? 0x6aa2ff : 0xe15b5b;
  const actor = new THREE.Group();
  actor.rotation.y = Math.PI / 2;
  group.add(actor);

  let material = null;
  let built = null;
  if (window.ARENA_FIGHTERS) {
    try { built = ARENA_FIGHTERS.build(unit, actor); }
    catch (err) { built = null; console.error(err); }
  }
  if (built) {
    material = built.materials[0];
    group.userData.actions = built.actions;
    group.userData.poser = built.poser;
    group.userData.mixer = built.mixer || null;
    group.userData.clip = "";
    fadeCast(group, "idle", false);
  } else if (pack && clips) {
    const bones = pack.bones.map((bone) => {
      const node = new THREE.Bone();
      node.name = bone.name;
      node.position.fromArray(bone.p);
      node.quaternion.fromArray(bone.q);
      return node;
    });
    pack.bones.forEach((bone, i) => {
      if (bone.parent >= 0) bones[bone.parent].add(bones[i]);
      else actor.add(bones[i]);
    });
    const skeleton = new THREE.Skeleton(bones);
    const tint = new THREE.Color("#ffffff").lerp(new THREE.Color(kit.tint), 0.2);
    material = new THREE.MeshStandardMaterial({
      map: castTexture(kit.body, pack.tex),
      color: tint,
      roughness: 0.78,
      metalness: 0.02,
    });
    actor.updateMatrixWorld(true);
    for (const part of pack.parts) {
      const mesh = new THREE.SkinnedMesh(castGeometry(part, true), material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      actor.add(mesh);
      mesh.bind(skeleton);
    }
    const boneByName = new Map(bones.map((bone) => [bone.name, bone]));
    const shown = new Set(kit.props);
    for (const prop of pack.props) {
      const parent = boneByName.get(prop.bone);
      if (!parent) continue;
      const mesh = new THREE.Mesh(castGeometry(prop, false), material);
      mesh.position.fromArray(prop.p);
      mesh.quaternion.fromArray(prop.q);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.visible = shown.has(prop.name);
      parent.add(mesh);
    }
    const mixer = new THREE.AnimationMixer(actor);
    const actions = {};
    for (const [name, clip] of Object.entries(clips)) actions[name] = mixer.clipAction(clip);
    group.userData.mixer = mixer;
    group.userData.actions = actions;
    group.userData.clip = "";
    fadeCast(group, "idle", false);
  }

  const sheep = makeSheep();
  group.add(sheep);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1.05, 28),
    new THREE.MeshBasicMaterial({ color: teamColor, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  group.add(ring);

  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.7, 18),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  group.add(blob);

  const select = new THREE.Mesh(
    new THREE.TorusGeometry(1.15, 0.045, 8, 28),
    new THREE.MeshBasicMaterial({ color: 0xf2d48a })
  );
  select.rotation.x = Math.PI / 2;
  select.position.y = 0.08;
  select.visible = false;
  group.add(select);

  const ice = new THREE.Mesh(
    new THREE.SphereGeometry(1.15, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xb7e4ff, transparent: true, opacity: 0.28, depthWrite: false })
  );
  ice.position.y = 1.15;
  ice.visible = false;
  group.add(ice);

  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(1.22, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xf0d48a, transparent: true, opacity: 0.22, depthWrite: false })
  );
  shield.position.y = 1.15;
  shield.visible = false;
  group.add(shield);

  const deter = new THREE.Mesh(
    new THREE.SphereGeometry(1.28, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.16, depthWrite: false })
  );
  deter.position.y = 1.15;
  deter.visible = false;
  group.add(deter);

  const reflect = new THREE.Mesh(
    new THREE.SphereGeometry(1.34, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xc9b6ff, transparent: true, opacity: 0.2, depthWrite: false })
  );
  reflect.position.y = 1.15;
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
  castOrb.position.set(0.7, 1.2, 0);
  castOrb.visible = false;
  group.add(castOrb);

  const label = makeLabelSprite();
  group.add(label);

  group.userData.parts = {
    actor, sheep, material, materials: built && built.materials, crown: built && built.crown, attack: kit.attack,
    tint: material ? material.color.clone() : new THREE.Color(kit.tint),
    ring, select, ice, shield, deter, reflect, ember, castOrb, label, blob,
  };
  group.userData.swing = unit.swing;
  group.userData.hp = unit.hp;
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
  group.position.set(unit.x, lift + (cyclone ? 1.35 : 0), unit.y);
  group.rotation.set(0, cyclone ? match.time * 8 : -unit.facing, 0);
  const concealed = window.Arena.veiledFromViewer && Arena.veiledFromViewer(unit);
  group.visible = !concealed;
  if (concealed) return;
  if (parts.actor) {
    parts.actor.visible = !sheep;
    parts.sheep.visible = sheep && !dead;
  }
  parts.blob.position.y = floor + 0.02 - group.position.y;
  parts.ring.position.y = floor + 0.05 - group.position.y;
  parts.select.position.y = floor + 0.07 - group.position.y;

  const now = match.time;
  const dt = Math.min(0.05, Math.max(0, now - (group.userData.lastTime ?? now)));
  group.userData.lastTime = now;
  if (group.userData.poser) group.userData.poser.step(dt, group.userData.clip);
  else if (group.userData.mixer) group.userData.mixer.update(dt);

  const current = group.userData.actions && group.userData.actions[group.userData.clip];
  const busy = !!(group.userData.once && current && current.isRunning());
  const swingUp = group.userData.swing != null && unit.swing > group.userData.swing + 0.15;
  group.userData.swing = unit.swing;
  const casting = !!unit.cast;
  const startedCast = casting && !group.userData.wasCast;
  group.userData.wasCast = casting;
  const airborne = !dead && !feign && Math.abs(lift - floor) > 0.35;
  if (group.userData.actions) {
    if (dead || feign) fadeCast(group, "death", true);
    else if (swingUp) fadeCast(group, parts.attack || "melee", true, true);
    else if (startedCast) fadeCast(group, unit.cast.channel ? "channel" : "cast", !unit.cast.channel, true);
    else if (casting && unit.cast.channel) {
      if (group.userData.clip !== "channel") fadeCast(group, "channel", false, true);
    } else if (!busy) {
      if (airborne) {
        if (group.userData.clip !== "jump") fadeCast(group, "jump", true);
      } else if (moved) fadeCast(group, "run", false);
      else fadeCast(group, "idle", false);
    }
  }

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
  if (parts.materials) {
    const wash = dead || feign ? new THREE.Color("#8a847c") : cyclone ? new THREE.Color("#d7e7a0") : null;
    for (const mat of parts.materials) {
      if (!mat.userData.base) continue;
      if (!wash) mat.color.copy(mat.userData.base);
      else mat.color.copy(mat.userData.base).lerp(wash, 0.72);
    }
  } else if (parts.material) {
    const tint = dead || feign ? new THREE.Color("#8a847c") : cyclone ? new THREE.Color("#d7e7a0") : parts.tint;
    parts.material.color.copy(tint);
  }
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
  parts.label.position.y = sheep ? 1.45 : (parts.crown || 2.8);
  parts.label.scale.set(3.6, 1.01, 1);
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

function armorEnvironment(renderer) {
  if (!THREE.PMREMGenerator) return null;
  const room = new THREE.Scene();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: "varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "varying vec3 vDir; void main() { float h = vDir.y; vec3 sky = mix(vec3(0.55, 0.45, 0.38), vec3(0.85, 0.8, 0.78), smoothstep(0.0, 0.8, h)); vec3 ground = vec3(0.22, 0.16, 0.12); gl_FragColor = vec4(h > 0.0 ? sky : ground, 1.0); }",
    })
  );
  room.add(shell);
  const panel = (color, x, y, z, w, h) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    room.add(mesh);
  };
  panel(new THREE.Color(3.2, 3.0, 2.7), 5, 7, 3, 5, 3);
  panel(new THREE.Color(1.4, 1.6, 2.0), -6, 3, -5, 4, 3);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(room, 0.04).texture;
  pmrem.dispose();
  return tex;
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

  window.ARENA_ENV = armorEnvironment(renderer);

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
    const floaterUnit = floater.unitId != null && match.units.find((u) => u.id === floater.unitId);
    if (floaterUnit && window.Arena.veiledFromViewer && Arena.veiledFromViewer(floaterUnit)) {
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
      if (window.ARENA_FIGHTERS && (ARENA_FIGHTERS.status === "loading" || (ARENA_FIGHTERS.pending && ARENA_FIGHTERS.pending(unit.classId, unit.gearTier)))) continue;
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
  const concealedTarget = target && window.Arena.veiledFromViewer && Arena.veiledFromViewer(target);
  const showLine = target && target.hp > 0 && match.player.hp > 0 && target !== match.player && !concealedTarget;
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

function sparkTexture() {
  if (sparkTexture.tex) return sparkTexture.tex;
  sparkTexture.tex = paintTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.22, "rgba(255,255,255,0.9)");
    g.addColorStop(0.5, "rgba(255,255,255,0.28)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  return sparkTexture.tex;
}

function fxSpark(color, size) {
  const spark = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sparkTexture(),
    color,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  spark.scale.setScalar(size || 0.8);
  return spark;
}

function addMotes(group, color, count, size) {
  const motes = [];
  for (let i = 0; i < count; i++) {
    const mote = fxSpark(color, size);
    group.add(mote);
    motes.push(mote);
  }
  return motes;
}

function makeBoltHead(style, color) {
  const head = new THREE.Group();
  const tint = new THREE.Color(color);
  if (style === "frost") {
    const ice = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.45, 6), fxMat(0xc5ecff, 0.96, false));
    const back = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.7, 6), fxMat(0xf4fbff, 0.9, false));
    back.rotation.x = Math.PI;
    back.position.y = -0.08;
    head.add(ice, back);
    for (let i = 0; i < 4; i++) {
      const shard = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.7, 5), fxMat(0xe7f6ff, 0.95, false));
      const ang = (i / 4) * Math.PI * 2;
      const outward = new THREE.Vector3(Math.cos(ang), 0.15, Math.sin(ang)).normalize();
      shard.position.copy(outward).multiplyScalar(0.38);
      shard.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
      head.add(shard);
    }
  } else if (style === "pyro" || style === "fire") {
    const big = style === "pyro";
    const hot = new THREE.Mesh(new THREE.SphereGeometry(big ? 0.48 : 0.32, 14, 12), fxMat(0xfff6d0, 1, true));
    const mid = new THREE.Mesh(new THREE.SphereGeometry(big ? 0.74 : 0.5, 14, 12), fxMat(0xff8a1e, 0.92, true));
    const outer = new THREE.Mesh(new THREE.SphereGeometry(big ? 1.08 : 0.72, 14, 12), fxMat(tint, 0.4, true));
    const tongues = [];
    const n = big ? 8 : 5;
    for (let i = 0; i < n; i++) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(big ? 0.28 : 0.16, big ? 0.9 : 0.55, 6), fxMat(i % 2 ? 0xff3d0e : 0xffd36a, 0.84, true));
      const ang = (i / n) * Math.PI * 2;
      const outward = new THREE.Vector3(Math.cos(ang), big ? 0.22 : 0.45, Math.sin(ang)).normalize();
      flame.position.copy(outward).multiplyScalar(big ? 0.78 : 0.48);
      flame.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
      tongues.push(flame);
      head.add(flame);
    }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(big ? 0.58 : 0.32, big ? 1.6 : 0.9, 8), fxMat(0xff4a12, 0.72, true));
    tail.position.y = big ? -1.2 : -0.72;
    tail.rotation.x = Math.PI;
    tongues.push(tail);
    head.add(outer, mid, hot, tail);
    head.userData.tongues = tongues;
  } else if (style === "arrow") {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.55, 6), fxMat(0xc4a36a, 1, false));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 7), fxMat(tint, 1, false));
    tip.position.y = 1.02;
    const fletchA = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.36, 0.06), fxMat(0xf4efe4, 0.96, false));
    const fletchB = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, 0.62), fxMat(0xf4efe4, 0.96, false));
    fletchA.position.y = fletchB.position.y = -0.7;
    head.add(shaft, tip, fletchA, fletchB);
  } else if (style === "shadow") {
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), fxMat(0x14081f, 0.96, false));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), fxMat(tint, 0.42, true));
    head.add(glow, core);
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.52, 5), fxMat(tint, 0.85, true));
      const ang = (i / 5) * Math.PI * 2;
      const outward = new THREE.Vector3(Math.cos(ang), Math.sin(i * 2) * 0.4, Math.sin(ang)).normalize();
      spike.position.copy(outward).multiplyScalar(0.78);
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
      head.add(spike);
    }
    head.userData.spin = [core];
  } else if (style === "mind") {
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), fxMat(0xf6ecff, 1, true));
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 8, 24), fxMat(tint, 0.92, true));
    const ringB = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.05, 8, 22), fxMat(0xffffff, 0.8, true));
    ringA.rotation.x = Math.PI / 2;
    ringB.rotation.z = Math.PI / 2;
    head.add(ringA, ringB, core);
    head.userData.spin = [ringA, ringB];
  } else if (style === "nature") {
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), fxMat(0xe9ffb4, 0.95, true));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), fxMat(tint, 0.35, true));
    head.add(glow, core);
    for (let i = 0; i < 4; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 4), fxMat(0x86c84e, 0.92, false));
      const ang = (i / 4) * Math.PI * 2;
      const outward = new THREE.Vector3(Math.cos(ang), 0.25, Math.sin(ang)).normalize();
      leaf.position.copy(outward).multiplyScalar(0.4);
      leaf.scale.z = 0.35;
      leaf.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
      head.add(leaf);
    }
  } else if (style === "holy") {
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), fxMat(0xfff6d2, 1, true));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.58, 12, 10), fxMat(tint, 0.42, true));
    head.add(glow, core);
    for (let i = 0; i < 4; i++) {
      const ray = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 0.08), fxMat(0xfff6d2, 0.85, true));
      const ang = (i / 4) * Math.PI;
      ray.rotation.z = ang;
      head.add(ray);
    }
    head.userData.spin = [head.children[head.children.length - 1]];
  } else if (style === "fear") {
    const wisps = [];
    for (let i = 0; i < 6; i++) {
      const wisp = fxSpark(tint, 1.2);
      wisps.push(wisp);
      head.add(wisp);
    }
    head.userData.wisps = wisps;
  } else if (style === "chain") {
    for (let i = 0; i < 5; i++) {
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 6, 14), fxMat(0xd9d3c4, 0.96, false));
      link.position.y = -0.72 + i * 0.34;
      link.rotation.y = i % 2 ? Math.PI / 2 : 0;
      head.add(link);
    }
  } else if (style === "lash") {
    const whip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.55, 5), fxMat(tint, 0.95, true));
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), fxMat(0xfff1f3, 0.95, true));
    tip.position.y = 0.82;
    head.add(whip, tip);
  } else if (style === "barb") {
    for (let i = 0; i < 3; i++) {
      const barb = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.75, 5), fxMat(tint, 0.96, false));
      barb.position.set((i - 1) * 0.24, 0, 0);
      barb.rotation.z = (i - 1) * 0.4;
      head.add(barb);
    }
  } else if (style === "siphon") {
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), fxMat(0xdfffd4, 0.95, true));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.46, 10, 8), fxMat(tint, 0.4, true));
    head.add(glow, core);
  } else {
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), fxMat(0xffffff, 1, true));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 10), fxMat(tint, 0.55, true));
    core.material.color.copy(tint).lerp(new THREE.Color("#ffffff"), 0.65);
    head.add(glow, core);
  }
  return head;
}

function makeImpact(style, color) {
  const impact = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.88, 28), fxMat(color, 0.95, true));
  ring.rotation.x = -Math.PI / 2;
  impact.add(ring);
  impact.userData.ring = ring;
  const bits = [];
  if (style === "frost") {
    for (let i = 0; i < 6; i++) {
      const chip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.46, 5), fxMat(0xe8fbff, 0.92, true));
      chip.userData.ang = (i / 6) * Math.PI * 2;
      bits.push(chip);
      impact.add(chip);
    }
  } else if (style === "pyro" || style === "fire") {
    const flash = new THREE.Mesh(new THREE.SphereGeometry(style === "pyro" ? 0.85 : 0.5, 10, 8), fxMat(0xfff1c4, 0.95, true));
    impact.add(flash);
    impact.userData.flash = flash;
  }
  impact.userData.bits = bits;
  return impact;
}

function burstExtras(style, color) {
  const extras = [];
  const tint = new THREE.Color(color);
  if (style === "fire") {
    for (let i = 0; i < 6; i++) {
      extras.push(new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.75, 6), fxMat(i % 2 ? 0xff3d0e : 0xffd36a, 0.86, true)));
    }
  } else if (style === "frost") {
    for (let i = 0; i < 6; i++) extras.push(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.55, 5), fxMat(0xe7f7ff, 0.92, false)));
  } else if (style === "nature") {
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 4), fxMat(0x86c84e, 0.9, false));
      leaf.scale.z = 0.35;
      extras.push(leaf);
    }
  } else if (style === "holy" || style === "heal") {
    const barA = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), fxMat(style === "heal" ? 0xf4fff6 : 0xfff6d2, 0.9, true));
    const barB = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.12), fxMat(style === "heal" ? 0xf4fff6 : 0xfff6d2, 0.9, true));
    extras.push(barA, barB);
  } else if (style === "arcane") {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.06, 8, 24), fxMat(tint, 0.9, true));
    extras.push(ring);
  } else if (style === "shadow") {
    for (let i = 0; i < 4; i++) extras.push(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.48, 5), fxMat(tint, 0.8, true)));
  }
  return extras;
}

function makeFxMesh(effect) {
  const color = new THREE.Color(effect.color || "#f0d48a");
  const group = new THREE.Group();
  group.userData.kind = effect.kind;
  group.renderOrder = 4;
  if (effect.kind === "ring") {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 32), fxMat(color, 0.22, true));
    const outer = new THREE.Mesh(new THREE.RingGeometry(0.78, 1, 40), fxMat(color, 0.85, true));
    const inner = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), fxMat(0xffffff, 0.95, false));
    disc.rotation.x = outer.rotation.x = inner.rotation.x = -Math.PI / 2;
    inner.material.color.copy(color).lerp(new THREE.Color("#ffffff"), 0.45);
    const motes = addMotes(group, color, 8, 0.7);
    const spikes = [];
    if (effect.style === "frost" || effect.style === "nature" || effect.style === "fire") {
      const count = effect.style === "frost" ? 10 : 8;
      for (let i = 0; i < count; i++) {
        const spike = new THREE.Mesh(
          new THREE.ConeGeometry(effect.style === "nature" ? 0.16 : 0.1, effect.style === "fire" ? 0.7 : 0.5, 5),
          fxMat(effect.style === "nature" ? 0x86c84e : color, 0.9, effect.style !== "nature")
        );
        if (effect.style === "nature") spike.scale.z = 0.4;
        spikes.push(spike);
        group.add(spike);
      }
    }
    group.add(disc, outer, inner);
    group.userData.parts = { disc, outer, inner, motes, spikes };
    return group;
  }
  if (effect.kind === "slash") {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.16, 8, 22, Math.PI * 1.15), fxMat(color, 1, false));
    const edge = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.07, 6, 18, Math.PI * 0.8), fxMat(0xffffff, 0.9, true));
    const glow = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.46, 8, 18, Math.PI * 1.15), fxMat(color, 0.4, true));
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), fxMat(0xffffff, 0.9, true));
    edge.material.color.copy(color).lerp(new THREE.Color("#ffffff"), 0.55);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.28), fxMat(0xf7f4ee, 0.96, false));
    const motes = addMotes(group, color, 7, 0.55);
    group.add(glow, arc, edge, flash, blade);
    group.userData.parts = { arc, edge, glow, flash, blade, motes };
    return group;
  }
  if (effect.kind === "trail" || effect.kind === "beam") {
    const motes = addMotes(group, color, 10, 0.85);
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), fxMat(color, 0.4, true));
    group.add(puff);
    group.userData.parts = { motes, puff };
    return group;
  }
  if (effect.kind === "bolt") {
    const style = effect.style || "orb";
    const head = makeBoltHead(style, color);
    const trail = [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const bit = fxSpark(style === "frost" ? 0xe8fbff : color, 1.2 - i * 0.1);
      group.add(bit);
      return bit;
    });
    const impact = makeImpact(style, color);
    group.add(head, impact);
    group.userData.parts = { head, trail, impact };
    return group;
  }
  const nova = effect.kind === "nova";
  const core = new THREE.Mesh(new THREE.SphereGeometry(nova ? 0.7 : 0.85, 14, 12), fxMat(color, 0.95, false));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(nova ? 1.2 : 1.45, 14, 12), fxMat(color, 0.32, true));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 1, 36), fxMat(color, 0.85, true));
  const shock = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.08, 36), fxMat(color, 0.55, true));
  ring.rotation.x = shock.rotation.x = -Math.PI / 2;
  const style = effect.style || "";
  if (style === "frost") {
    core.geometry.dispose();
    core.geometry = new THREE.OctahedronGeometry(0.8, 0);
    core.material.color.set(0xe8fbff);
    core.material.blending = THREE.NormalBlending;
  } else if (style === "fire") {
    core.material.color.set(0xffe08a);
    core.material.blending = THREE.AdditiveBlending;
  } else if (style === "shield") {
    core.material.opacity = 0.28;
    core.material.blending = THREE.AdditiveBlending;
    glow.scale.setScalar(1.35);
  } else if (style === "smoke") {
    core.material.opacity = 0.12;
    glow.material.opacity = 0.18;
  } else if (style === "shadow") {
    core.material.color.set(0x1a1028);
    core.material.blending = THREE.NormalBlending;
  } else if (style === "heal") {
    core.material.color.set(0xf4fff4);
  } else if (style === "holy") {
    core.material.color.set(0xfff6d2);
  }
  const extras = burstExtras(style, color);
  extras.forEach((extra) => group.add(extra));
  const motes = addMotes(group, color, nova ? 14 : 8, nova ? 0.9 : 0.6);
  group.add(glow, core, ring, shock);
  group.userData.parts = { core, glow, ring, shock, motes, extras };
  return group;
}

function placeFx(group, effect) {
  const t = 1 - Math.max(0, effect.life) / (effect.max || 0.4);
  const fade = 1 - Math.max(0, (t - 0.62) / 0.38);
  const size = effect.size || 1;
  group.visible = true;
  const parts = group.userData.parts;
  if (effect.kind === "bolt") {
    const headU = 0.1 + t * 0.88;
    const at = (u) => ({
      x: effect.x + (effect.x2 - effect.x) * u,
      y: effect.h + ((effect.h2 || effect.h) - effect.h) * u,
      z: effect.y + (effect.y2 - effect.y) * u,
    });
    const p = at(headU);
    const next = at(Math.min(1, headU + 0.05));
    parts.head.position.set(p.x, p.y, p.z);
    parts.head.scale.setScalar(size);
    const dir = new THREE.Vector3(next.x - p.x, next.y - p.y, next.z - p.z);
    if (dir.lengthSq() > 1e-6) {
      parts.head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    }
    (parts.head.userData.spin || []).forEach((mesh, i) => {
      mesh.rotation.y = t * 14 + i;
    });
    (parts.head.userData.tongues || []).forEach((flame, i) => {
      const flick = 0.72 + Math.sin(t * 28 + i * 1.3) * 0.28;
      flame.scale.set(flick, 0.65 + flick * 0.7, flick);
    });
    (parts.head.userData.wisps || []).forEach((wisp, i) => {
      const ang = t * 12 + i * 1.05;
      wisp.position.set(Math.cos(ang) * 0.5, Math.sin(ang * 1.4) * 0.28, Math.sin(ang) * 0.5);
      wisp.material.opacity = 0.85 * fade;
    });
    parts.trail.forEach((bit, i) => {
      const q = at(Math.max(0, headU - (i + 1) * 0.06));
      bit.position.set(q.x, q.y, q.z);
      bit.scale.setScalar(size * (0.55 - i * 0.05));
      bit.material.opacity = 0.8 * fade * (1 - i * 0.1);
    });
    const hit = at(1);
    const landed = t > 0.72;
    parts.impact.visible = landed;
    parts.impact.position.set(hit.x, (effect.h2 || 0.2) + 0.08, hit.z);
    const spread = size * (1 + (t - 0.72) * 8);
    parts.impact.scale.setScalar(Math.max(0.2, spread));
    if (parts.impact.userData.ring) parts.impact.userData.ring.material.opacity = landed ? 0.9 * (1 - (t - 0.72) / 0.28) : 0;
    (parts.impact.userData.bits || []).forEach((chip) => {
      const ang = chip.userData.ang || 0;
      chip.position.set(Math.cos(ang) * 0.45, 0.25, Math.sin(ang) * 0.45);
      chip.material.opacity = landed ? 0.85 * (1 - (t - 0.72) / 0.28) : 0;
    });
    if (parts.impact.userData.flash) {
      parts.impact.userData.flash.material.opacity = landed ? 0.8 * (1 - (t - 0.72) / 0.28) : 0;
    }
    return;
  }
  if (effect.kind === "trail" || effect.kind === "beam") {
    parts.motes.forEach((mote, i) => {
      const u = i / Math.max(1, parts.motes.length - 1);
      mote.position.set(
        effect.x + (effect.x2 - effect.x) * u,
        (effect.h || 0.5) + ((effect.h2 || effect.h || 0.5) - (effect.h || 0.5)) * u + Math.sin(t * 14 + i) * 0.18,
        effect.y + (effect.y2 - effect.y) * u
      );
      mote.scale.setScalar((effect.size || 1) * (0.95 - u * 0.35));
      mote.material.opacity = 0.8 * fade * (1 - u * 0.35);
    });
    parts.puff.position.set(effect.x, effect.h || 0.5, effect.y);
    parts.puff.scale.setScalar(1 + t * 1.5);
    parts.puff.material.opacity = 0.4 * (1 - t);
    return;
  }
  if (effect.kind === "slash") {
    group.position.set(effect.x2, effect.h || 1.4, effect.y2);
    const yaw = -Math.atan2(effect.y2 - effect.y, effect.x2 - effect.x);
    group.rotation.set(0.35, yaw, 0.1);
    const s = size * (1.05 + t * 0.7);
    parts.arc.scale.setScalar(s);
    parts.edge.scale.setScalar(s * 0.92);
    parts.glow.scale.setScalar(s * 1.08);
    parts.arc.rotation.z = parts.edge.rotation.z = parts.glow.rotation.z = parts.blade.rotation.z = -0.6 + t * 1.5;
    parts.blade.scale.setScalar(s);
    parts.flash.scale.setScalar(size * (1.5 - t));
    parts.flash.material.opacity = 0.85 * (1 - t);
    parts.motes.forEach((mote, i) => {
      const ang = -0.4 + t * 1.6 + i * 0.22;
      const rad = s * (0.7 + (i % 3) * 0.18);
      mote.position.set(Math.cos(ang) * rad, Math.sin(i + t * 8) * 0.25, Math.sin(ang) * rad * 0.35);
      mote.material.opacity = 0.8 * fade;
    });
    parts.arc.material.opacity = fade;
    parts.edge.material.opacity = 0.9 * fade;
    parts.glow.material.opacity = 0.4 * fade;
    return;
  }
  if (effect.kind === "ring") {
    group.position.set(effect.x, effect.h || 0.16, effect.y);
    const s = size * (0.55 + t * 0.7);
    parts.disc.scale.setScalar(s * 0.96);
    parts.outer.scale.setScalar(s);
    parts.inner.scale.setScalar(s * 0.9);
    parts.disc.material.opacity = 0.28 * fade;
    parts.outer.material.opacity = 0.85 * fade;
    parts.inner.material.opacity = 0.95 * fade;
    parts.motes.forEach((mote, i) => {
      const ang = (i / parts.motes.length) * Math.PI * 2;
      mote.position.set(Math.cos(ang) * s * 0.85, 0.25 + t * 1.4 + (i % 3) * 0.15, Math.sin(ang) * s * 0.85);
      mote.scale.setScalar(0.45 + (i % 2) * 0.3);
      mote.material.opacity = 0.75 * fade;
    });
    (parts.spikes || []).forEach((spike, i) => {
      const ang = (i / parts.spikes.length) * Math.PI * 2;
      spike.position.set(Math.cos(ang) * s * 0.92, 0.35, Math.sin(ang) * s * 0.92);
      spike.scale.set(spike.scale.x, 0.8 + t * 0.4, spike.scale.z);
      spike.material.opacity = 0.85 * fade;
    });
    return;
  }
  const nova = effect.kind === "nova";
  group.position.set(effect.x, effect.h || 1.3, effect.y);
  const s = size * (nova ? 0.25 + t * 1.05 : 0.55 + t * 0.9);
  parts.core.scale.setScalar(nova ? size * (0.35 + (1 - t) * 0.4) : s);
  parts.glow.scale.setScalar((nova ? size * 0.45 : s) * 1.3);
  const ground = -((effect.h || 1.3) - 0.16);
  parts.ring.position.y = parts.shock.position.y = ground;
  parts.ring.scale.setScalar(size * (nova ? 0.2 + t * 1.15 : 0.8 + t * 1.6));
  parts.shock.scale.setScalar(size * (nova ? t * 1.35 : 0.4 + t * 2.2));
  parts.motes.forEach((mote, i) => {
    const ang = (i / parts.motes.length) * Math.PI * 2 + t * (nova ? 0.4 : 2.2);
    const rad = size * (nova ? 0.15 + t * 0.95 : 0.3 + t * 1.1);
    mote.position.set(Math.cos(ang) * rad, (nova ? 0.4 : 0.2) + Math.sin(i * 1.7 + t * 7) * 0.35, Math.sin(ang) * rad);
    mote.scale.setScalar((nova ? 1.1 : 0.7) * (1 - t * 0.35));
    mote.material.opacity = 0.85 * fade;
  });
  parts.core.material.opacity = (nova ? 0.7 : 0.95) * fade * (effect.style === "smoke" ? 0.25 : effect.style === "shield" ? 0.45 : 1);
  parts.glow.material.opacity = 0.4 * fade;
  parts.ring.material.opacity = 0.8 * (1 - t * 0.35);
  parts.shock.material.opacity = 0.45 * (1 - t);
  (parts.extras || []).forEach((extra, i) => {
    if (effect.style === "holy" || effect.style === "heal" || effect.style === "arcane") {
      extra.position.set(0, 0.25, 0);
      extra.rotation.y = t * 4;
      extra.scale.setScalar(size * (0.9 + t * 0.25));
    } else {
      const ang = (i / Math.max(1, parts.extras.length)) * Math.PI * 2 + t;
      const rad = size * (0.15 + t * 0.95);
      extra.position.set(Math.cos(ang) * rad, 0.15 + t * 0.7, Math.sin(ang) * rad);
      const s = size * (0.85 - t * 0.25);
      extra.scale.set(s, s, effect.style === "nature" ? s * 0.35 : s);
    }
    extra.material.opacity = 0.85 * fade;
  });
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
    const concealedFx = effect.conceal && match.player && effect.conceal !== match.player.team;
    mesh.visible = !concealedFx;
    if (concealedFx) return;
    placeFx(mesh, effect);
  });
  for (const [id, mesh] of gfx.fxMeshes) {
    if (live.has(id)) continue;
    gfx.scene.remove(mesh);
    disposeObject(mesh);
    gfx.fxMeshes.delete(id);
  }
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
