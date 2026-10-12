/* Arena fighters. Rigged Quaternius characters (CC0) load from assets/heroes.
   The shape builder below is the fallback if those files do not load. */
(function () {
  const geo = {};
  function cyl(r, len, n) {
    const key = "c" + r + "x" + len + "x" + (n || 10);
    if (!geo[key]) geo[key] = new THREE.CylinderGeometry(r, r, len, n || 10);
    return geo[key];
  }
  function sph(r, w, h) {
    const key = "s" + r + "x" + (w || 14) + "x" + (h || 10);
    if (!geo[key]) geo[key] = new THREE.SphereGeometry(r, w || 14, h || 10);
    return geo[key];
  }
  function box(x, y, z) {
    const key = "b" + x + "x" + y + "x" + z;
    if (!geo[key]) geo[key] = new THREE.BoxGeometry(x, y, z);
    return geo[key];
  }
  function cone(r, len) {
    const key = "n" + r + "x" + len;
    if (!geo[key]) geo[key] = new THREE.ConeGeometry(r, len, 8);
    return geo[key];
  }

  const clothTex = new Map();
  function weave(hex) {
    if (clothTex.has(hex)) return clothTex.get(hex);
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const g = canvas.getContext("2d");
    g.fillStyle = hex;
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = "rgba(255,255,255,0.13)";
    g.lineWidth = 1;
    for (let i = 4; i < 64; i += 8) {
      g.beginPath();
      g.moveTo(0, i);
      g.lineTo(64, i);
      g.stroke();
    }
    g.strokeStyle = "rgba(0,0,0,0.16)";
    for (let i = 0; i < 64; i += 8) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 64);
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    clothTex.set(hex, tex);
    return tex;
  }

  function makeMat(opts) {
    const mat = new THREE.MeshStandardMaterial({
      color: opts.color,
      map: opts.map || null,
      roughness: opts.roughness == null ? 0.62 : opts.roughness,
      metalness: opts.metalness || 0,
      emissive: opts.emissive || "#000000",
      emissiveIntensity: opts.emissiveIntensity || 0,
      side: opts.side || THREE.FrontSide,
    });
    mat.userData.base = mat.color.clone();
    return mat;
  }

  const KITS = {
    warrior: { build: "broad", skin: "#c9a27c", hair: "#2a211c", hairStyle: "short", cloth: "#a56a3c", metal: "#f3e2c4", trim: "#d7a15a", leather: "#5a4030", gear: "plate", weapon: "swordShield", head: "helm" },
    mage: { build: "slim", skin: "#efc8aa", hair: "#1a1216", hairStyle: "ponytail", cloth: "#e8eef5", metal: "#7ec8e8", trim: "#2c5d86", leather: "#6a5348", gear: "robe", weapon: "staff", head: "hat" },
    hunter: { build: "medium", skin: "#c89670", hair: "#4a3424", hairStyle: "short", cloth: "#6e9a48", metal: "#d9d3c4", trim: "#e6c36a", leather: "#6a4e38", gear: "leather", weapon: "bow", head: "hood" },
    priest: { build: "slim", skin: "#f2d2b8", hair: "#d9c6a6", hairStyle: "long", cloth: "#f6f3ec", metal: "#e7d39a", trim: "#c6a15a", leather: "#8a7568", gear: "robe", weapon: "mace", head: "circlet" },
    warlock: { build: "medium", skin: "#b7a090", hair: "#161014", hairStyle: "long", cloth: "#3a3058", metal: "#6d5c8e", trim: "#c45ad4", leather: "#2a2430", gear: "robe", weapon: "wand", head: "hood" },
    druid: { build: "medium", skin: "#d0a67c", hair: "#6a3a22", hairStyle: "braid", cloth: "#3e6a34", metal: "#8d6e3e", trim: "#d2a04a", leather: "#6a4a30", gear: "leather", weapon: "axe", head: "antler" },
    rogue: { build: "slim", skin: "#e0b898", hair: "#161412", hairStyle: "short", cloth: "#2c2e32", metal: "#c8c4ae", trim: "#e6d15a", leather: "#3a342c", gear: "leather", weapon: "daggers", head: "mask" },
    warden: { build: "broad", skin: "#d2b090", hair: "#3a2a22", hairStyle: "short", cloth: "#2f6a62", metal: "#d9cbb0", trim: "#8fe0c4", leather: "#4a4034", gear: "plate", weapon: "lantern", head: "helm" },
    binder: { build: "medium", skin: "#c99878", hair: "#241816", hairStyle: "short", cloth: "#6e2430", metal: "#c45a62", trim: "#e8d0a0", leather: "#4a3030", gear: "coat", weapon: "book", head: "none" },
    vow: { build: "slim", skin: "#f3d2bc", hair: "#3a242c", hairStyle: "braid", cloth: "#f8e8ef", metal: "#e7b7c8", trim: "#c45a78", leather: "#8a6870", gear: "robe", weapon: "mace", head: "circlet" },
    duelist: { build: "medium", skin: "#e6c2a4", hair: "#2a2420", hairStyle: "short", cloth: "#24365c", metal: "#d8dbe6", trim: "#7f9cff", leather: "#3a342c", gear: "coat", weapon: "rapier", head: "none" },
  };

  const BUILDS = {
    broad: { shoulder: 0.24, hip: 0.15, chest: 0.2, waist: 0.13, tall: 1 },
    medium: { shoulder: 0.2, hip: 0.13, chest: 0.17, waist: 0.11, tall: 0.98 },
    slim: { shoulder: 0.17, hip: 0.125, chest: 0.15, waist: 0.095, tall: 0.96 },
  };

  const LOOK = {
    warrior: { model: "vanguard", baked: true, fallback: { model: "man", colors: { Shirt: "#2a3358", Pants: "#1c2236", Hair: "#16141a", Socks: "#141820", Skin: "#6f8f3e" } } },
    mage: { model: "woman", colors: { Skin: "#efc8aa", Red: "#1a1216", Brown: "#141014", LimeGreen: "#d7e6f5", Gold: "#2c5d86" } },
    hunter: { model: "man", colors: { Shirt: "#4e7a3a", Pants: "#5a4030", Hair: "#3a2818", Socks: "#d7c07a" } },
    priest: { model: "woman", colors: { Skin: "#f2d2b8", Red: "#c8b496", Brown: "#a89070", LimeGreen: "#f6f3ec", Gold: "#c6a15a" } },
    warlock: { model: "woman", colors: { Skin: "#b7a090", Red: "#161014", Brown: "#100c10", LimeGreen: "#3a3058", Gold: "#c45ad4" } },
    druid: { model: "man", colors: { Shirt: "#3e6a34", Pants: "#6a4a30", Hair: "#6a3a22", Socks: "#d2a04a" } },
    rogue: { model: "woman", colors: { Skin: "#e0b898", Red: "#161412", Brown: "#10100e", LimeGreen: "#2c2e32", Gold: "#e6d15a" } },
    warden: { model: "man", colors: { Shirt: "#2f6a62", Pants: "#3a4038", Hair: "#3a2a22", Socks: "#8fe0c4" } },
    binder: { model: "woman", colors: { Skin: "#c99878", Red: "#241816", Brown: "#1a100e", LimeGreen: "#6e2430", Gold: "#e8d0a0" } },
    vow: { model: "woman", colors: { Skin: "#f3d2bc", Red: "#3a242c", Brown: "#2a1820", LimeGreen: "#f8e8ef", Gold: "#c45a78" } },
    duelist: { model: "man", colors: { Shirt: "#24365c", Pants: "#2a3144", Hair: "#2a2420", Socks: "#7f9cff" } },
  };

  const CLIP_NAMES = {
    woman: { idle: "Idle", run: "Run", jump: "Idle", melee: "Sword_Slash", heavy: "Kick_Right", dual: "Punch_Left", shoot: "Gun_Shoot", cast: "Interact", channel: "Idle_Neutral", death: "Death" },
    man: { idle: "Man_Idle", run: "Man_Run", jump: "Man_Jump", melee: "Man_SwordSlash", heavy: "Man_SwordSlash", dual: "Man_Punch", shoot: "Man_Punch", cast: "Man_Punch", channel: "Man_Idle", death: "Man_Death" },
  };

  // Full armor sets authored in Blender (tools/blender), each built on one of the base bodies.
  // They load on demand, the first time a fighter of that class is needed.
  // Level 10 fighters wear the champion version, stored beside it as <name>_champion.glb.
  const SETS = {
    warrior: { url: "assets/heroes/vanguard.glb", clips: CLIP_NAMES.man },
    mage: { url: "assets/heroes/mage.glb", clips: CLIP_NAMES.woman },
    hunter: { url: "assets/heroes/hunter.glb", clips: CLIP_NAMES.man },
    priest: { url: "assets/heroes/priest.glb", clips: CLIP_NAMES.woman },
    warlock: { url: "assets/heroes/warlock.glb", clips: CLIP_NAMES.woman },
    druid: { url: "assets/heroes/druid.glb", clips: CLIP_NAMES.man },
    rogue: { url: "assets/heroes/rogue.glb", clips: CLIP_NAMES.woman },
    warden: { url: "assets/heroes/warden.glb", clips: CLIP_NAMES.man },
    binder: { url: "assets/heroes/binder.glb", clips: CLIP_NAMES.woman },
    vow: { url: "assets/heroes/vow.glb", clips: CLIP_NAMES.woman },
    duelist: { url: "assets/heroes/duelist.glb", clips: CLIP_NAMES.man },
  };
  const setState = {};

  for (const id of Object.keys(SETS)) {
    const base = LOOK[id];
    LOOK[id] = { model: "set:" + id, baked: true, fallback: base.fallback || base };
  }

  let heroCache = null;
  let status = window.GLTFLoader ? "loading" : "fallback";

  function clipByName(animations, token) {
    return animations.find((clip) => clip.name.split("|").pop() === token);
  }

  function prepHero(gltf, names) {
    const clips = {};
    const idleSrc = clipByName(gltf.animations, names.idle) || gltf.animations[0];
    for (const key of Object.keys(names)) {
      const src = clipByName(gltf.animations, names[key]) || idleSrc;
      const clip = src.clone();
      clip.name = key;
      clip.tracks = clip.tracks.filter((track) => !track.name.endsWith(".position"));
      clips[key] = clip;
    }
    return { scene: gltf.scene, clips };
  }

  function loadHero(url) {
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(url, resolve, undefined, reject);
    });
  }

  const GEAR = {
    warrior: { style: "plate", weapon: "swordShield", head: "helm" },
    mage: { style: "robe", weapon: "staff", head: "hat" },
    hunter: { style: "leather", weapon: "bow", head: "hood" },
    priest: { style: "robe", weapon: "mace", head: "circlet" },
    warlock: { style: "robe", weapon: "wand", head: "hood" },
    druid: { style: "leather", weapon: "axe", head: "antler" },
    rogue: { style: "leather", weapon: "daggers", head: "mask" },
    warden: { style: "plate", weapon: "lantern", head: "helm" },
    binder: { style: "coat", weapon: "book", head: "none" },
    vow: { style: "robe", weapon: "mace", head: "circlet" },
    duelist: { style: "coat", weapon: "rapier", head: "none" },
  };

  function wearRiggedGear(model, classId, look, materials) {
    const gear = GEAR[classId] || GEAR.warrior;
    const clothHex = look.colors.LimeGreen || look.colors.Shirt || "#8d5a32";
    const trimHex = look.colors.Gold || look.colors.Socks || "#d7a15a";
    const leatherHex = look.colors.Pants || look.colors.Brown || "#4a3428";
    function slot(color, roughness, metalness, side) {
      const mat = makeMat({ color, roughness, metalness, side });
      materials.push(mat);
      return mat;
    }
    const steel = slot("#c5ccd4", 0.34, 0.2);
    const trim = slot(trimHex, 0.42, 0.14);
    const cloth = slot(clothHex, 0.84, 0.02, THREE.DoubleSide);
    const leather = slot(leatherHex, 0.74, 0.04);
    const dark = slot("#1a1614", 0.5, 0.02);
    const bone = (name) => model.getObjectByName(name);
    const modelQuat = () => {
      const q = new THREE.Quaternion();
      model.getWorldQuaternion(q);
      return q;
    };
    function placeOnBone(host, mesh, offset) {
      if (!host || !mesh) return null;
      host.updateWorldMatrix(true, false);
      const origin = new THREE.Vector3();
      host.getWorldPosition(origin);
      const world = origin.add(offset.clone().applyQuaternion(modelQuat()));
      mesh.position.copy(host.worldToLocal(world));
      const bq = new THREE.Quaternion();
      host.getWorldQuaternion(bq);
      mesh.quaternion.copy(bq.invert().multiply(modelQuat()));
      const ws = new THREE.Vector3();
      host.getWorldScale(ws);
      mesh.scale.setScalar(1 / Math.max(ws.x, 0.0001));
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      host.add(mesh);
      return mesh;
    }
    function alongBone(host, geo, mat, along) {
      if (!host) return null;
      host.updateWorldMatrix(true, false);
      const mesh = new THREE.Mesh(geo, mat);
      const ws = new THREE.Vector3();
      host.getWorldScale(ws);
      const unit = 1 / Math.max(ws.y, 0.0001);
      mesh.scale.setScalar(unit);
      mesh.position.y = along * unit;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      host.add(mesh);
      return mesh;
    }
    function grip(host) {
      if (!host) return null;
      host.updateWorldMatrix(true, false);
      const g = new THREE.Group();
      const ws = new THREE.Vector3();
      host.getWorldScale(ws);
      g.scale.setScalar(1 / Math.max(ws.y, 0.0001));
      host.add(g);
      return g;
    }
    function put(geo, mat, parent, x, y, z, rx, ry, rz) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      m.rotation.set(rx || 0, ry || 0, rz || 0);
      m.castShadow = true;
      m.frustumCulled = false;
      parent.add(m);
      return m;
    }

    const torso = bone("Chest") || bone("Torso");
    const hips = bone("Hips");
    const head = bone("Head");
    const right = bone("Palm.R") || bone("Wrist.R");
    const left = bone("Palm.L") || bone("Wrist.L");

    if (classId === "warrior") {
      const plate = slot("#3a4468", 0.38, 0.22);
      const plateDark = slot("#23283c", 0.46, 0.16);
      const crimson = slot("#a33a52", 0.42, 0.12);
      const spike = slot("#d5d8e6", 0.32, 0.28);
      const glow = slot("#ff4a58", 0.28, 0.04);
      glow.emissive = new THREE.Color("#ff2030");
      glow.emissiveIntensity = 1.15;
      glow.userData.base = glow.color.clone();
      const edge = slot("#ffd2d6", 0.24, 0.06);
      edge.emissive = new THREE.Color("#ff6674");
      edge.emissiveIntensity = 0.7;
      edge.userData.base = edge.color.clone();
      function mount(host, offset) {
        const g = new THREE.Group();
        placeOnBone(host, g, offset);
        return g;
      }
      function add(parent, geo, mat, x, y, z, rx, ry, rz) {
        if (!parent) return null;
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x || 0, y || 0, z || 0);
        m.rotation.set(rx || 0, ry || 0, rz || 0);
        m.castShadow = true;
        m.frustumCulled = false;
        parent.add(m);
        return m;
      }
      function pauldron(host, side) {
        const pad = mount(host, new THREE.Vector3(side * 0.12, 0.1, 0));
        const shell = add(pad, sph(0.2, 12, 10), plate);
        if (shell) shell.scale.set(1.35, 0.72, 1.15);
        add(pad, box(0.28, 0.08, 0.22), crimson, 0, -0.02, 0.04);
        add(pad, cone(0.045, 0.32), spike, side * 0.02, 0.16, 0.02, -0.15, 0, side * -0.35);
        add(pad, cone(0.035, 0.24), spike, side * -0.08, 0.12, 0.06, 0.2, 0, side * 0.5);
        add(pad, cone(0.03, 0.2), spike, side * 0.1, 0.1, -0.04, -0.3, 0, side * -0.9);
        add(pad, cone(0.05, 0.62), spike, side * -0.04, 0.34, -0.02, -0.55, 0, side * -0.45);
        return pad;
      }
      pauldron(bone("Shoulder.R"), -1);
      pauldron(bone("Shoulder.L"), 1);
      const chest = mount(torso, new THREE.Vector3(0, 0.06, 0.12));
      add(chest, box(0.5, 0.56, 0.14), plate);
      add(chest, box(0.18, 0.32, 0.05), crimson, 0, 0.02, 0.08);
      add(chest, cone(0.055, 0.18), spike, 0, 0.04, 0.14, -Math.PI / 2, 0, 0);
      add(chest, box(0.52, 0.07, 0.1), crimson, 0, -0.24, 0.02);
      add(chest, box(0.16, 0.08, 0.06), spike, 0, -0.24, 0.08);
      const helm = mount(head, new THREE.Vector3(0, 0.12, 0));
      const dome = add(helm, sph(0.17, 14, 12), plateDark);
      if (dome) dome.scale.set(1.2, 0.78, 1.05);
      add(helm, box(0.26, 0.05, 0.08), plate, 0, 0.02, 0.1);
      add(helm, box(0.05, 0.14, 0.06), crimson, -0.11, -0.02, 0.09);
      add(helm, box(0.05, 0.14, 0.06), crimson, 0.11, -0.02, 0.09);
      add(helm, cone(0.04, 0.48), spike, -0.12, 0.2, -0.02, -0.25, 0, -0.7);
      add(helm, cone(0.04, 0.48), spike, 0.12, 0.2, -0.02, -0.25, 0, 0.7);
      add(helm, cone(0.025, 0.16), spike, 0, 0.2, 0.06, -0.4, 0, 0);
      alongBone(bone("UpperArm.R"), cyl(0.08, 0.26, 8), plate, 0.12);
      alongBone(bone("UpperArm.L"), cyl(0.08, 0.26, 8), plate, 0.12);
      alongBone(bone("LowerArm.R"), cyl(0.06, 0.22, 8), plateDark, 0.1);
      alongBone(bone("LowerArm.L"), cyl(0.06, 0.22, 8), plateDark, 0.1);
      alongBone(bone("UpperLeg.R"), cyl(0.1, 0.32, 8), plate, 0.16);
      alongBone(bone("UpperLeg.L"), cyl(0.1, 0.32, 8), plate, 0.16);
      alongBone(bone("LowerLeg.R"), cyl(0.08, 0.3, 8), plateDark, 0.14);
      alongBone(bone("LowerLeg.L"), cyl(0.08, 0.3, 8), plateDark, 0.14);
      const gripR = grip(right);
      if (gripR) {
        put(cyl(0.028, 0.2, 6), dark, gripR, 0, 0.08, 0);
        put(cone(0.05, 0.2), plateDark, gripR, 0.12, 0.2, 0, 0, 0, -Math.PI / 2);
        put(cone(0.04, 0.16), plateDark, gripR, -0.1, 0.2, 0, 0, 0, Math.PI / 2);
        put(box(0.05, 0.16, 0.08), crimson, gripR, 0, 0.2, 0);
        put(box(0.16, 0.78, 0.04), glow, gripR, 0.03, 0.68, 0);
        put(box(0.05, 0.72, 0.055), edge, gripR, 0.1, 0.66, 0);
        put(cone(0.09, 0.26), glow, gripR, 0.03, 1.16, 0);
        for (let i = 0; i < 5; i++) put(cone(0.035, 0.12), edge, gripR, 0.14, 0.38 + i * 0.13, 0, 0, 0, -Math.PI / 2);
      }
      return;
    }

    if (gear.style === "plate") {
      placeOnBone(torso, new THREE.Mesh(box(0.42, 0.48, 0.1), steel), new THREE.Vector3(0, 0.04, 0.12));
      placeOnBone(torso, new THREE.Mesh(box(0.18, 0.08, 0.12), trim), new THREE.Vector3(0, 0.18, 0.15));
      placeOnBone(bone("Shoulder.R"), new THREE.Mesh(sph(0.12, 10, 8), steel), new THREE.Vector3(-0.02, 0.04, 0));
      placeOnBone(bone("Shoulder.L"), new THREE.Mesh(sph(0.12, 10, 8), steel), new THREE.Vector3(0.02, 0.04, 0));
      alongBone(bone("UpperArm.R"), cyl(0.075, 0.24, 8), steel, 0.12);
      alongBone(bone("UpperArm.L"), cyl(0.075, 0.24, 8), steel, 0.12);
      alongBone(bone("LowerArm.R"), cyl(0.055, 0.2, 8), steel, 0.1);
      alongBone(bone("LowerArm.L"), cyl(0.055, 0.2, 8), steel, 0.1);
    } else if (gear.style === "robe") {
      placeOnBone(hips, new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.36, 0.82, 12, 1, true), cloth), new THREE.Vector3(0, -0.32, 0.02));
      placeOnBone(torso, new THREE.Mesh(box(0.36, 0.44, 0.08), cloth), new THREE.Vector3(0, 0.06, 0.09));
      placeOnBone(torso, new THREE.Mesh(box(0.38, 0.06, 0.1), trim), new THREE.Vector3(0, 0.22, 0.1));
    } else {
      placeOnBone(torso, new THREE.Mesh(box(0.4, 0.18, 0.08), leather), new THREE.Vector3(0, 0.02, 0.1));
      placeOnBone(torso, new THREE.Mesh(box(0.42, 0.05, 0.09), trim), new THREE.Vector3(0, 0.14, 0.11));
      placeOnBone(bone("Shoulder.R"), new THREE.Mesh(sph(0.09, 8, 6), leather), new THREE.Vector3(-0.02, 0.03, 0));
      placeOnBone(bone("Shoulder.L"), new THREE.Mesh(sph(0.09, 8, 6), leather), new THREE.Vector3(0.02, 0.03, 0));
    }
    if (torso && gear.style !== "leather") {
      placeOnBone(torso, new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.86), cloth), new THREE.Vector3(0, -0.16, -0.18));
    }

    if (head && gear.head === "helm") {
      const dome = placeOnBone(head, new THREE.Mesh(sph(0.17, 14, 12), steel), new THREE.Vector3(0, 0.12, -0.02));
      if (dome) dome.scale.multiply(new THREE.Vector3(1.08, 0.78, 0.72));
      placeOnBone(head, new THREE.Mesh(box(0.22, 0.045, 0.05), trim), new THREE.Vector3(0, 0.08, 0.1));
    } else if (head && gear.head === "hat") {
      placeOnBone(head, new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 14), cloth), new THREE.Vector3(0, 0.18, 0));
      placeOnBone(head, new THREE.Mesh(cone(0.11, 0.32), cloth), new THREE.Vector3(0, 0.34, 0));
      placeOnBone(head, new THREE.Mesh(cyl(0.12, 0.045, 10), trim), new THREE.Vector3(0, 0.2, 0));
    } else if (head && gear.head === "hood") {
      const hood = placeOnBone(head, new THREE.Mesh(sph(0.17, 12, 10), cloth), new THREE.Vector3(0, 0.1, -0.05));
      if (hood) hood.scale.multiply(new THREE.Vector3(1.05, 1.1, 0.8));
    } else if (head && gear.head === "circlet") {
      const ring = placeOnBone(head, new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.016, 6, 16), trim), new THREE.Vector3(0, 0.16, 0));
      if (ring) ring.rotateX(Math.PI / 2);
    } else if (head && gear.head === "antler") {
      placeOnBone(head, new THREE.Mesh(cyl(0.014, 0.26, 5), leather), new THREE.Vector3(-0.1, 0.26, 0));
      placeOnBone(head, new THREE.Mesh(cyl(0.014, 0.26, 5), leather), new THREE.Vector3(0.1, 0.26, 0));
    } else if (head && gear.head === "mask") {
      placeOnBone(head, new THREE.Mesh(box(0.18, 0.07, 0.03), dark), new THREE.Vector3(0, 0.1, 0.11));
    }

    const gripR = grip(right);
    const gripL = grip(left);
    if (gripR && (gear.weapon === "swordShield" || gear.weapon === "axe")) {
      put(box(0.055, 0.78, 0.02), steel, gripR, 0, 0.48, 0);
      put(box(0.18, 0.035, 0.04), trim, gripR, 0, 0.12, 0);
      put(cyl(0.02, 0.16, 6), leather, gripR, 0, 0.02, 0);
      if (gear.weapon === "axe") put(box(0.24, 0.18, 0.03), steel, gripR, 0.1, 0.72, 0);
    }
    if (left && gear.weapon === "swordShield") {
      const shield = placeOnBone(left, new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 16), steel), new THREE.Vector3(0.04, 0.02, 0.08));
      if (shield) shield.rotateX(Math.PI / 2);
      placeOnBone(left, new THREE.Mesh(cyl(0.07, 0.06, 8), trim), new THREE.Vector3(0.04, 0.02, 0.1));
    }
    if (gripR && gear.weapon === "staff") {
      put(cyl(0.028, 1.4, 8), leather, gripR, 0, 0.4, 0);
      put(sph(0.09, 10, 8), trim, gripR, 0, 1.12, 0);
    }
    if (left && gear.weapon === "bow") {
      const arc = placeOnBone(left, new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.016, 6, 18, Math.PI), leather), new THREE.Vector3(0, 0.05, 0.06));
      if (arc) arc.rotateZ(Math.PI / 2);
    }
    if (gripR && gear.weapon === "mace") {
      put(cyl(0.022, 0.58, 6), leather, gripR, 0, 0.24, 0);
      put(sph(0.09, 8, 6), steel, gripR, 0, 0.56, 0);
    }
    if (gripR && gear.weapon === "wand") {
      put(cyl(0.016, 0.46, 6), dark, gripR, 0, 0.22, 0);
      put(sph(0.045, 8, 6), trim, gripR, 0, 0.46, 0);
    }
    if (gripL && gear.weapon === "book") {
      put(box(0.22, 0.28, 0.05), leather, gripL, 0, 0.06, 0.04);
      put(box(0.18, 0.24, 0.012), trim, gripL, 0, 0.06, 0.07);
    }
    if (gripR && gear.weapon === "daggers") {
      put(box(0.028, 0.4, 0.012), steel, gripR, 0, 0.24, 0);
      if (gripL) put(box(0.028, 0.4, 0.012), steel, gripL, 0, 0.24, 0);
    }
    if (gripR && gear.weapon === "lantern") {
      put(box(0.16, 0.22, 0.16), dark, gripR, 0, 0.18, 0);
      const lamp = put(sph(0.07, 8, 6), trim, gripR, 0, 0.18, 0);
      lamp.material = lamp.material.clone();
      lamp.material.emissive = new THREE.Color("#ffb15a");
      lamp.material.emissiveIntensity = 0.85;
      lamp.material.userData.base = lamp.material.color.clone();
      materials.push(lamp.material);
    }
    if (left && gear.weapon === "lantern") {
      placeOnBone(left, new THREE.Mesh(box(0.32, 0.46, 0.05), steel), new THREE.Vector3(0, 0.04, 0.08));
    }
    if (gripR && gear.weapon === "rapier") {
      put(box(0.02, 0.86, 0.012), steel, gripR, 0, 0.5, 0);
      const guard = put(new THREE.TorusGeometry(0.055, 0.012, 6, 12), trim, gripR, 0, 0.1, 0);
      guard.rotation.x = Math.PI / 2;
    }
  }

  function championAura(unit, actor, materials) {
    const def = typeof CLASSES !== "undefined" ? CLASSES[unit.classId] : null;
    const tint = new THREE.Color(def ? def.color : "#e0c17a");
    // Armor edges catch a pulsing class-colored rim light; glowing gems and runes breathe with it.
    const rim = { value: 0.6 };
    const rimColor = { value: tint };
    const glowing = [];
    for (const mat of materials) {
      if (!mat.isMeshStandardMaterial) continue;
      if (mat.emissive && mat.emissive.getHex() !== 0) glowing.push({ mat, base: mat.emissiveIntensity });
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uRim = rim;
        shader.uniforms.uRimColor = rimColor;
        shader.fragmentShader = shader.fragmentShader
          .replace("void main() {", "uniform float uRim;\nuniform vec3 uRimColor;\nvoid main() {")
          .replace("#include <emissivemap_fragment>",
            "#include <emissivemap_fragment>\n  float rimF = 1.0 - abs(dot(normal, normalize(vViewPosition)));\n  totalEmissiveRadiance += uRimColor * pow(rimF, 2.6) * uRim;");
      };
      mat.customProgramCacheKey = () => "champion-rim";
      mat.needsUpdate = true;
    }
    const ringMat = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 48), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    actor.add(ring);
    const moteMat = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const motes = new THREE.Group();
    const moteGeo = new THREE.SphereGeometry(0.06, 8, 6);
    for (let i = 0; i < 6; i++) {
      const mote = new THREE.Mesh(moteGeo, moteMat);
      mote.userData.phase = (i / 6) * Math.PI * 2;
      motes.add(mote);
    }
    actor.add(motes);
    ring.onBeforeRender = () => {
      const t = performance.now() / 1000;
      const ghost = unit.hp > 0 ? (ringMat.userData.ghost != null ? ringMat.userData.ghost : 1) : 0;
      ringMat.opacity = (0.35 + 0.2 * Math.sin(t * 2.4)) * ghost;
      ringMat.depthWrite = false;
      moteMat.opacity = 0.85 * ghost;
      moteMat.depthWrite = false;
      rim.value = unit.hp > 0 ? 0.55 + 0.3 * Math.sin(t * 2.4) : 0;
      const breath = 0.8 + 0.3 * Math.sin(t * 3.1);
      for (const g of glowing) g.mat.emissiveIntensity = g.base * breath;
      motes.children.forEach((mote, i) => {
        const a = mote.userData.phase + t * 0.9;
        mote.position.set(Math.cos(a) * 0.85, 0.4 + ((t * 0.5 + i / 6) % 1) * 1.9, Math.sin(a) * 0.85);
      });
    };
  }

  function buildRigged(unit, actor) {
    let look = LOOK[unit.classId] || LOOK.warrior;
    let key = look.model;
    if (unit.gearTier === 2 && heroCache[key + ":2"]) key += ":2";
    if (!heroCache[key] && look.fallback) {
      look = look.fallback;
      key = look.model;
    }
    const src = heroCache[key];
    if (!src || !window.SkeletonUtils) return null;
    const model = SkeletonUtils.clone(src.scene);
    const materials = [];
    model.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.frustumCulled = false;
      const list = Array.isArray(obj.material) ? obj.material : [obj.material];
      const next = list.map((mat) => {
        const copy = mat.clone();
        if (look.baked) {
          if (copy.metalness > 0.3 && window.ARENA_ENV) copy.envMap = window.ARENA_ENV;
        } else {
          const hex = look.colors[mat.name];
          if (hex) copy.color.set(hex);
          copy.metalness = mat.name === "Gold" ? 0.16 : 0.02;
          copy.roughness = mat.name === "Gold" ? 0.4 : 0.72;
        }
        copy.userData.base = copy.color.clone();
        materials.push(copy);
        return copy;
      });
      obj.material = Array.isArray(obj.material) ? next : next[0];
    });
    model.updateMatrixWorld(true);
    // Height comes from the skinned body alone, so tall helms and horns don't shrink the fighter.
    const box = new THREE.Box3();
    model.traverse((obj) => {
      if (obj.isSkinnedMesh) box.expandByObject(obj);
    });
    if (box.isEmpty()) box.setFromObject(model);
    const height = Math.max(0.001, box.max.y - box.min.y);
    const scale = 2.15 / height;
    model.scale.setScalar(scale);
    model.position.y = -box.min.y * scale;
    actor.add(model);
    model.updateMatrixWorld(true);
    if (!look.baked) wearRiggedGear(model, unit.classId, look, materials);
    if (unit.gearTier === 2) championAura(unit, actor, materials);
    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const [name, clip] of Object.entries(src.clips)) actions[name] = mixer.clipAction(clip);
    let crown = 2.35;
    if (look.baked) {
      const full = new THREE.Box3().setFromObject(model);
      crown = Math.min(2.95, Math.max(2.35, full.max.y - actor.position.y + 0.12));
    }
    return { materials, actions, mixer, poser: null, crown };
  }

  // True while this class's armor set is still downloading; starts the download on first ask.
  // A champion that fails to load falls back to the starting set.
  function pending(classId, tier) {
    const set = SETS[classId];
    if (!set || !heroCache || status !== "ready") return false;
    const key = tier === 2 ? classId + ":2" : classId;
    const state = setState[key];
    if (state === "failed") return tier === 2 ? pending(classId, 1) : false;
    if (state === "ready") return false;
    if (!state) {
      setState[key] = "loading";
      const url = tier === 2 ? set.url.replace(/\.glb$/, "_champion.glb") : set.url;
      loadHero(url).then((gltf) => {
        heroCache["set:" + key] = prepHero(gltf, set.clips);
        setState[key] = "ready";
      }).catch((err) => {
        console.error(err);
        setState[key] = "failed";
      });
    }
    return true;
  }

  const ready = status === "loading"
    ? Promise.all([
      loadHero("assets/heroes/woman.glb"),
      loadHero("assets/heroes/man.glb"),
    ]).then(([woman, man]) => {
      heroCache = { woman: prepHero(woman, CLIP_NAMES.woman), man: prepHero(man, CLIP_NAMES.man) };
      status = "ready";
    }).catch((err) => {
      console.error(err);
      status = "fallback";
    })
    : Promise.resolve();

  function build(unit, actor) {
    if (heroCache) {
      const rigged = buildRigged(unit, actor);
      if (rigged) return rigged;
    }
    const kit = KITS[unit.classId] || KITS.warrior;
    const body = BUILDS[kit.build];
    const team = unit.team === "ally" ? "#6aa2ff" : "#e15b5b";
    const materials = [];
    const bones = {};
    function track(mat) {
      materials.push(mat);
      return mat;
    }
    const skin = track(makeMat({ color: kit.skin, roughness: 0.52 }));
    const hair = track(makeMat({ color: kit.hair, roughness: 0.42, metalness: 0.04 }));
    const cloth = track(makeMat({ color: kit.cloth, map: weave(kit.cloth), roughness: 0.86 }));
    const metal = track(makeMat({ color: kit.metal, roughness: 0.38, metalness: 0.18 }));
    const trim = track(makeMat({ color: kit.trim, roughness: 0.4, metalness: 0.12 }));
    const leather = track(makeMat({ color: kit.leather, roughness: 0.72, metalness: 0.04 }));
    const sash = track(makeMat({ color: team, roughness: 0.5, metalness: 0.12 }));
    const dark = track(makeMat({ color: "#1a1614", roughness: 0.4 }));
    const steel = track(makeMat({ color: "#b7c0c8", roughness: 0.32, metalness: 0.22 }));
    const eyeWhite = track(makeMat({ color: "#f4f1ea", roughness: 0.35 }));
    const skirtMat = track(makeMat({ color: kit.cloth, map: weave(kit.cloth), roughness: 0.86, side: THREE.DoubleSide }));

    function add(parent, geometry, mat, x, y, z, rx, ry, rz) {
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.set(x || 0, y || 0, z || 0);
      mesh.rotation.set(rx || 0, ry || 0, rz || 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }
    function joint(parent, name, x, y, z) {
      const g = new THREE.Group();
      g.name = name;
      g.position.set(x || 0, y || 0, z || 0);
      g.userData.restPos = g.position.clone();
      parent.add(g);
      bones[name] = g;
      return g;
    }
    function limb(parent, name, length, radius, mat, x, y, z) {
      const g = joint(parent, name, x, y, z);
      add(g, cyl(radius, length, 8), mat, 0, -length / 2, 0);
      g.userData.length = length;
      return g;
    }

    const hips = joint(actor, "hips", 0, 0.9 * body.tall, 0);
    add(hips, sph(body.hip, 12, 10), kit.gear === "robe" ? cloth : leather, 0, 0, 0).scale.set(1.15, 0.72, 0.95);
    const spine = joint(hips, "spine", 0, 0.08, 0);
    add(spine, cyl(body.waist, 0.22, 10), cloth, 0, 0.12, 0);
    const chest = joint(spine, "chest", 0, 0.28, 0);
    const chestMesh = add(chest, sph(body.chest, 14, 12), kit.gear === "plate" ? metal : cloth, 0, 0.06, 0.02);
    chestMesh.scale.set(1.05, 0.82, 0.78);
    add(chest, sph(0.07, 8, 6), skin, 0, 0.2, 0);
    const head = joint(chest, "head", 0, 0.32, 0);
    const skull = add(head, sph(0.132, 16, 14), skin, 0, 0.07, 0.02);
    skull.scale.set(0.94, 1.08, 0.98);
    add(head, cone(0.028, 0.08), skin, 0, 0.07, 0.13, Math.PI / 2, 0, 0);
    for (const side of [-1, 1]) {
      add(head, sph(0.028, 8, 6), eyeWhite, side * 0.05, 0.1, 0.125);
      add(head, sph(0.014, 8, 6), dark, side * 0.052, 0.098, 0.148);
      add(head, box(0.04, 0.012, 0.02), hair, side * 0.05, 0.145, 0.12);
      add(head, sph(0.035, 8, 6), skin, side * 0.13, 0.06, 0);
    }
    add(head, box(0.06, 0.018, 0.02), track(makeMat({ color: kit.skin, roughness: 0.5 })), 0, 0.02, 0.135).color;
    const lip = materials[materials.length - 1];
    lip.color.set(kit.skin).offsetHSL(0, 0.08, -0.08);
    lip.userData.base = lip.color.clone();

    const sleeve = kit.gear === "plate" ? metal : kit.gear === "robe" ? cloth : leather;
    const armL = limb(chest, "armL", 0.32, 0.07, sleeve, body.shoulder, 0.1, 0);
    const foreL = limb(armL, "foreL", 0.28, 0.05, sleeve, 0, -0.32, 0);
    const handL = joint(foreL, "handL", 0, -0.28, 0);
    add(handL, sph(0.055, 8, 6), skin, 0, -0.02, 0);
    const armR = limb(chest, "armR", 0.32, 0.07, sleeve, -body.shoulder, 0.1, 0);
    const foreR = limb(armR, "foreR", 0.28, 0.05, sleeve, 0, -0.32, 0);
    const handR = joint(foreR, "handR", 0, -0.28, 0);
    add(handR, sph(0.055, 8, 6), skin, 0, -0.02, 0);

    const pants = kit.gear === "robe" ? cloth : leather;
    const thighL = limb(hips, "thighL", 0.42, 0.09, pants, 0.1, -0.02, 0);
    const shinL = limb(thighL, "shinL", 0.4, 0.06, pants, 0, -0.42, 0);
    const footL = joint(shinL, "footL", 0, -0.4, 0);
    const thighR = limb(hips, "thighR", 0.42, 0.09, pants, -0.1, -0.02, 0);
    const shinR = limb(thighR, "shinR", 0.4, 0.06, pants, 0, -0.4, 0);
    const footR = joint(shinR, "footR", 0, -0.4, 0);
    for (const foot of [footL, footR]) add(foot, box(0.1, 0.07, 0.2), leather, 0, -0.02, 0.04);

    const cape = joint(chest, "cape", 0, 0.1, -0.24);
    const capeMesh = add(cape, new THREE.PlaneGeometry(0.62, 0.78), skirtMat, 0, -0.36, 0);

    add(chest, box(0.16, 0.05, 0.04), sash, 0, -0.02, body.chest * 0.7);

    if (kit.gear === "plate") {
      add(chest, sph(body.chest * 0.92, 12, 8), metal, 0, 0.04, 0.06).scale.set(1.02, 0.7, 0.42);
      add(chest, sph(0.13, 10, 8), metal, body.shoulder, 0.12, 0).scale.set(1.25, 0.55, 1.05);
      add(chest, sph(0.13, 10, 8), metal, -body.shoulder, 0.12, 0).scale.set(1.25, 0.55, 1.05);
      add(shinL, cyl(0.07, 0.28, 8), metal, 0, -0.18, 0.02);
      add(shinR, cyl(0.07, 0.28, 8), metal, 0, -0.18, 0.02);
      add(foreL, cyl(0.055, 0.16, 8), metal, 0, -0.16, 0);
      add(foreR, cyl(0.055, 0.16, 8), metal, 0, -0.16, 0);
    } else if (kit.gear === "robe") {
      add(hips, new THREE.CylinderGeometry(0.2, 0.4, 0.78, 12, 1, true), skirtMat, 0, -0.36, 0);
      add(chest, box(body.shoulder * 2.1, 0.08, 0.16), trim, 0, 0.08, 0);
    } else if (kit.gear === "leather") {
      add(chest, box(body.chest * 1.5, 0.22, 0.12), leather, 0, 0.02, 0.08);
      add(chest, box(0.08, 0.16, 0.04), trim, 0.1, 0.02, 0.12);
      add(hips, box(0.28, 0.06, 0.16), leather, 0, 0.02, 0);
    } else {
      add(chest, box(body.chest * 1.7, 0.46, 0.16), cloth, 0, -0.02, 0.04);
      add(chest, box(body.shoulder * 1.6, 0.08, 0.18), trim, 0, 0.16, 0);
      add(hips, new THREE.CylinderGeometry(0.16, 0.26, 0.42, 10, 1, true), skirtMat, 0, -0.2, 0);
    }

    wearHead(head, kit, { hair, metal, trim, cloth, dark, leather, steel });
    wearWeapon(kit.weapon, { handL, handR, foreL, metal, trim, leather, cloth, dark, steel, wood: leather });

    const durations = { idle: 2.6, run: 0.62, jump: 0.7, melee: 0.52, heavy: 0.68, dual: 0.42, shoot: 0.58, cast: 0.64, channel: 1.3, death: 0.85, thrust: 0.48 };
    const actions = {};
    for (const name of Object.keys(durations)) {
      actions[name] = {
        enabled: true,
        paused: false,
        _playing: false,
        once: false,
        token: 0,
        time: 0,
        isRunning() { return this._playing && !this.paused; },
        setLoop(mode) { this.once = mode === THREE.LoopOnce; return this; },
        reset() { this.time = 0; this.paused = false; this._playing = false; return this; },
        play() { this._playing = true; this.paused = false; this.token += 1; return this; },
        crossFadeFrom() { return this; },
      };
    }

    const poser = {
      token: 0,
      blend: 1,
      from: null,
      time: 0,
      step(dt, clip) {
        const name = durations[clip] ? clip : "idle";
        const action = actions[name];
        if (action.token !== this.token) {
          this.from = snap(bones);
          this.blend = 0;
          this.token = action.token;
          this.time = 0;
        }
        if (action._playing) this.time += dt;
        if (action.once && this.time >= durations[name]) {
          this.time = durations[name];
          action._playing = false;
          action.paused = true;
        }
        this.blend = Math.min(1, this.blend + dt / 0.16);
        reset(bones);
        pose(name, bones, this.time, durations[name]);
        const to = snap(bones);
        write(bones, mix(this.from || to, to, this.blend));
      },
    };
    actor.scale.setScalar(1.2);
    pose("idle", bones, 0, durations.idle);
    return { materials, actions, poser, crown: 2.45 };
  }

  function reset(bones) {
    for (const bone of Object.values(bones)) {
      bone.rotation.set(0, 0, 0);
      bone.position.copy(bone.userData.restPos);
    }
  }
  function snap(bones) {
    const out = {};
    for (const [name, bone] of Object.entries(bones)) {
      out[name] = [bone.rotation.x, bone.rotation.y, bone.rotation.z, bone.position.y];
    }
    return out;
  }
  function write(bones, data) {
    for (const [name, v] of Object.entries(data)) {
      const bone = bones[name];
      bone.rotation.set(v[0], v[1], v[2]);
      bone.position.y = v[3];
    }
  }
  function mix(a, b, t) {
    const out = {};
    for (const name of Object.keys(b)) {
      const A = a[name] || b[name];
      const B = b[name];
      out[name] = A.map((v, i) => v + (B[i] - v) * t);
    }
    return out;
  }
  function reach(t, dur) {
    const u = Math.min(1, t / Math.max(0.18, dur * 0.38));
    return u * u * (3 - 2 * u);
  }
  function swing(t, dur) {
    return Math.sin(Math.min(1, t / dur) * Math.PI);
  }

  function stand(bones, t) {
    const b = Math.sin(t * 2.1);
    bones.chest.rotation.x = b * 0.025;
    bones.head.rotation.x = -b * 0.02;
    bones.armL.rotation.z = 0.38;
    bones.armR.rotation.z = -0.38;
    bones.armL.rotation.x = 0.22;
    bones.armR.rotation.x = 0.22;
    bones.foreL.rotation.x = -0.55;
    bones.foreR.rotation.x = -0.55;
    bones.cape.rotation.x = 0.12 + b * 0.03;
    bones.hips.position.y = bones.hips.userData.restPos.y + b * 0.012;
  }

  function pose(name, bones, t, dur) {
    if (name === "run") {
      const s = Math.sin((t / dur) * Math.PI * 2);
      bones.thighL.rotation.x = -s * 0.72;
      bones.thighR.rotation.x = s * 0.72;
      bones.shinL.rotation.x = -Math.max(0, s) * 0.95;
      bones.shinR.rotation.x = -Math.max(0, -s) * 0.95;
      bones.footL.rotation.x = -(bones.thighL.rotation.x + bones.shinL.rotation.x);
      bones.footR.rotation.x = -(bones.thighR.rotation.x + bones.shinR.rotation.x);
      bones.armL.rotation.x = s * 0.8;
      bones.armR.rotation.x = -s * 0.8;
      bones.armL.rotation.z = 0.22;
      bones.armR.rotation.z = -0.22;
      bones.foreL.rotation.x = -0.7;
      bones.foreR.rotation.x = -0.7;
      bones.spine.rotation.y = s * 0.1;
      bones.spine.rotation.x = 0.14;
      bones.chest.rotation.y = s * 0.06;
      bones.cape.rotation.x = 0.35 + Math.abs(s) * 0.12;
      bones.hips.position.y = bones.hips.userData.restPos.y + Math.abs(s) * 0.045;
      bones.head.rotation.x = -0.08;
      return;
    }
    if (name === "jump") {
      const u = reach(t, dur);
      bones.thighL.rotation.x = -0.55 * u;
      bones.thighR.rotation.x = -0.2 * u;
      bones.shinL.rotation.x = -0.7 * u;
      bones.shinR.rotation.x = -0.35 * u;
      bones.footL.rotation.x = (0.55 + 0.7) * u;
      bones.footR.rotation.x = (0.2 + 0.35) * u;
      bones.armL.rotation.x = -1.05 * u;
      bones.armR.rotation.x = -1.15 * u;
      bones.armL.rotation.z = 0.25;
      bones.armR.rotation.z = -0.25;
      bones.spine.rotation.x = -0.08 * u;
      bones.cape.rotation.x = 0.55 * u;
      return;
    }
    if (name === "melee" || name === "heavy" || name === "thrust") {
      const s = swing(t, dur);
      const big = name === "heavy" ? 1.2 : 1;
      stand(bones, t);
      bones.armR.rotation.x = 0.55 - s * 2.05 * big;
      bones.armR.rotation.z = -0.22;
      bones.foreR.rotation.x = -0.25 - s * 0.2;
      bones.chest.rotation.y = s * 0.4 * big;
      bones.spine.rotation.y = s * 0.16;
      bones.hips.rotation.y = s * 0.12;
      if (name === "thrust") {
        bones.armR.rotation.x = -0.35 - s * 1.15;
        bones.armR.rotation.z = -0.12;
        bones.foreR.rotation.x = -0.05;
        bones.chest.rotation.y = -s * 0.18;
      }
      return;
    }
    if (name === "dual") {
      const s = swing(t, dur);
      stand(bones, t);
      bones.armR.rotation.x = 0.4 - s * 1.7;
      bones.armL.rotation.x = 0.4 - Math.sin(Math.min(1, t / dur) * Math.PI + 0.7) * 1.45;
      bones.armR.rotation.z = -0.2;
      bones.armL.rotation.z = 0.2;
      bones.foreR.rotation.x = -0.3;
      bones.foreL.rotation.x = -0.3;
      bones.chest.rotation.y = Math.sin(Math.min(1, t / dur) * Math.PI * 2) * 0.18;
      return;
    }
    if (name === "shoot") {
      const u = reach(t, dur);
      const kick = swing(t, dur);
      stand(bones, t);
      bones.armL.rotation.x = -1.35 * u;
      bones.armL.rotation.z = 0.15;
      bones.foreL.rotation.x = 0.15;
      bones.armR.rotation.x = -0.7 * u + kick * 0.35;
      bones.armR.rotation.z = -0.2;
      bones.foreR.rotation.x = 0.9 * u;
      bones.head.rotation.x = -0.05;
      return;
    }
    if (name === "cast" || name === "channel") {
      const u = name === "channel" ? 0.85 + Math.sin(t * 6) * 0.08 : reach(t, dur);
      stand(bones, t);
      bones.armL.rotation.x = -1.15 * u;
      bones.armR.rotation.x = -1.2 * u;
      bones.armL.rotation.z = 0.18;
      bones.armR.rotation.z = -0.18;
      bones.foreL.rotation.x = 0.15;
      bones.foreR.rotation.x = 0.15;
      bones.chest.rotation.x = -0.06 * u;
      bones.head.rotation.x = -0.08 * u;
      return;
    }
    if (name === "death") {
      const u = reach(t, dur * 0.7);
      bones.hips.rotation.z = u * 1.35;
      bones.hips.position.y = bones.hips.userData.restPos.y * (1 - u * 0.72);
      bones.armL.rotation.z = 0.2 + u * 0.4;
      bones.armR.rotation.z = -0.2 - u * 0.3;
      bones.armL.rotation.x = u * 0.4;
      bones.armR.rotation.x = u * 0.2;
      bones.thighL.rotation.x = u * 0.2;
      bones.head.rotation.z = -u * 0.3;
      bones.cape.rotation.x = u * 0.4;
      return;
    }
    stand(bones, t);
  }

  function wearHead(head, kit, m) {
    if (kit.hairStyle === "ponytail") {
      const cap = new THREE.Mesh(sph(0.15, 14, 10), m.hair);
      cap.position.set(0, 0.15, -0.02);
      cap.scale.set(1, 0.72, 1.05);
      cap.castShadow = true;
      head.add(cap);
      const bangs = new THREE.Mesh(box(0.2, 0.07, 0.06), m.hair);
      bangs.position.set(0, 0.16, 0.1);
      bangs.rotation.x = 0.3;
      head.add(bangs);
      const tie = new THREE.Mesh(sph(0.045, 8, 6), m.trim);
      tie.position.set(0, 0.2, -0.1);
      head.add(tie);
      const tail = new THREE.Mesh(cyl(0.045, 0.28, 8), m.hair);
      tail.position.set(0, 0.05, -0.16);
      tail.rotation.x = 0.5;
      tail.castShadow = true;
      head.add(tail);
    } else if (kit.hairStyle === "long") {
      const cap = new THREE.Mesh(sph(0.155, 14, 10), m.hair);
      cap.position.set(0, 0.12, -0.02);
      cap.scale.set(1.02, 0.9, 1.05);
      head.add(cap);
      const back = new THREE.Mesh(box(0.22, 0.34, 0.08), m.hair);
      back.position.set(0, -0.02, -0.1);
      head.add(back);
    } else if (kit.hairStyle === "braid") {
      const cap = new THREE.Mesh(sph(0.15, 12, 10), m.hair);
      cap.position.set(0, 0.14, -0.01);
      cap.scale.y = 0.7;
      head.add(cap);
      const braid = new THREE.Mesh(cyl(0.035, 0.36, 6), m.hair);
      braid.position.set(0.1, -0.02, -0.08);
      braid.rotation.z = 0.15;
      braid.rotation.x = 0.2;
      head.add(braid);
    } else if (kit.head !== "helm" && kit.head !== "hood") {
      const cap = new THREE.Mesh(sph(0.15, 12, 8), m.hair);
      cap.position.set(0, 0.16, -0.01);
      cap.scale.set(1, 0.55, 1);
      head.add(cap);
    }
    if (kit.head === "helm") {
      const dome = new THREE.Mesh(sph(0.16, 16, 12), m.steel);
      dome.position.set(0, 0.1, -0.03);
      dome.scale.set(1.08, 0.92, 0.78);
      dome.castShadow = true;
      head.add(dome);
      const band = new THREE.Mesh(box(0.22, 0.035, 0.08), m.trim);
      band.position.set(0, 0.05, 0.09);
      head.add(band);
    } else if (kit.head === "hat") {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 14), m.cloth);
      brim.position.y = 0.2;
      head.add(brim);
      const point = new THREE.Mesh(cone(0.11, 0.38), m.cloth);
      point.position.y = 0.38;
      point.castShadow = true;
      head.add(point);
      const band = new THREE.Mesh(cyl(0.115, 0.04, 12), m.trim);
      band.position.y = 0.22;
      head.add(band);
    } else if (kit.head === "hood") {
      const hood = new THREE.Mesh(sph(0.2, 14, 12), m.cloth);
      hood.position.set(0, 0.1, -0.06);
      hood.scale.set(1.05, 1.12, 1.05);
      hood.castShadow = true;
      head.add(hood);
    } else if (kit.head === "circlet") {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.012, 6, 16), m.trim);
      ring.position.y = 0.16;
      ring.rotation.x = Math.PI / 2;
      head.add(ring);
    } else if (kit.head === "antler") {
      for (const side of [-1, 1]) {
        const ant = new THREE.Mesh(cone(0.02, 0.22), m.leather);
        ant.position.set(side * 0.08, 0.28, 0);
        ant.rotation.z = side * -0.45;
        head.add(ant);
      }
    } else if (kit.head === "mask") {
      const mask = new THREE.Mesh(box(0.18, 0.06, 0.04), m.dark);
      mask.position.set(0, 0.1, 0.13);
      head.add(mask);
    }
  }

  function wearWeapon(kind, p) {
    if (kind === "swordShield") {
      const sword = new THREE.Mesh(box(0.055, 0.78, 0.02), p.steel);
      sword.position.set(0, -0.28, 0.02);
      sword.castShadow = true;
      p.handR.add(sword);
      const guard = new THREE.Mesh(box(0.14, 0.03, 0.03), p.trim);
      guard.position.set(0, 0.02, 0.02);
      p.handR.add(guard);
      const grip = new THREE.Mesh(cyl(0.02, 0.12, 6), p.leather);
      grip.position.set(0, 0.08, 0.02);
      p.handR.add(grip);
      const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 16), p.steel);
      shield.rotation.x = Math.PI / 2;
      shield.position.set(0.02, -0.02, 0.06);
      shield.castShadow = true;
      p.handL.add(shield);
      const boss = new THREE.Mesh(sph(0.06, 8, 6), p.trim);
      boss.position.set(0.02, -0.02, 0.1);
      p.handL.add(boss);
    } else if (kind === "staff") {
      const staff = new THREE.Mesh(cyl(0.025, 1.55, 8), p.wood);
      staff.position.y = 0.15;
      staff.castShadow = true;
      p.handR.add(staff);
      const crystal = new THREE.Mesh(sph(0.08, 8, 6), p.trim);
      crystal.position.y = 0.95;
      p.handR.add(crystal);
    } else if (kind === "bow") {
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.018, 6, 12, Math.PI), p.wood);
      bow.rotation.y = Math.PI / 2;
      bow.position.set(0, 0, 0.05);
      bow.castShadow = true;
      p.handL.add(bow);
    } else if (kind === "daggers") {
      for (const hand of [p.handL, p.handR]) {
        const blade = new THREE.Mesh(box(0.025, 0.32, 0.012), p.metal);
        blade.position.set(0, -0.12, 0.03);
        blade.castShadow = true;
        hand.add(blade);
      }
    } else if (kind === "wand") {
      const wand = new THREE.Mesh(cyl(0.018, 0.42, 6), p.dark);
      wand.position.set(0, -0.1, 0.04);
      wand.rotation.x = 0.4;
      p.handR.add(wand);
      const book = new THREE.Mesh(box(0.18, 0.24, 0.04), p.leather);
      book.position.set(0, 0.02, 0.06);
      p.handL.add(book);
    } else if (kind === "mace") {
      const haft = new THREE.Mesh(cyl(0.02, 0.55, 6), p.wood);
      haft.position.y = -0.1;
      p.handR.add(haft);
      const head = new THREE.Mesh(sph(0.08, 8, 6), p.metal);
      head.position.y = 0.2;
      p.handR.add(head);
    } else if (kind === "axe") {
      const haft = new THREE.Mesh(cyl(0.025, 0.9, 6), p.wood);
      haft.position.y = -0.15;
      haft.castShadow = true;
      p.handR.add(haft);
      const blade = new THREE.Mesh(box(0.22, 0.16, 0.03), p.metal);
      blade.position.set(0.08, 0.28, 0);
      p.handR.add(blade);
    } else if (kind === "book") {
      const book = new THREE.Mesh(box(0.22, 0.28, 0.05), p.leather);
      book.position.set(0, 0.04, 0.05);
      book.castShadow = true;
      p.handL.add(book);
      const page = new THREE.Mesh(box(0.18, 0.24, 0.01), p.trim);
      page.position.set(0, 0.04, 0.08);
      p.handL.add(page);
      const chain = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 10), p.metal);
      chain.position.set(0, 0.15, 0.1);
      chain.rotation.x = Math.PI / 2;
      p.handR.add(chain);
    } else if (kind === "lantern") {
      const shield = new THREE.Mesh(box(0.34, 0.46, 0.05), p.metal);
      shield.position.set(0.02, 0, 0.05);
      shield.castShadow = true;
      p.handL.add(shield);
      const lamp = new THREE.Mesh(sph(0.09, 10, 8), p.trim);
      lamp.position.set(0, -0.05, 0.08);
      lamp.material = lamp.material.clone();
      lamp.material.emissive = new THREE.Color("#ffb15a");
      lamp.material.emissiveIntensity = 0.85;
      lamp.material.userData.base = lamp.material.color.clone();
      p.handR.add(lamp);
    } else if (kind === "rapier") {
      const blade = new THREE.Mesh(box(0.018, 0.85, 0.01), p.metal);
      blade.position.set(0, -0.32, 0.02);
      blade.castShadow = true;
      p.handR.add(blade);
      const guard = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 6, 10), p.trim);
      guard.rotation.x = Math.PI / 2;
      guard.position.y = 0.04;
      p.handR.add(guard);
    }
  }

  window.ARENA_FIGHTERS = {
    build,
    ready,
    pending,
    get status() { return status; },
  };
})();
