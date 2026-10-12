"use strict";

/**
 * Arena prototype.
 * Tune feel in TUNE and the CLASSES ability numbers.
 * Each class: spells on 1–4, E, Q, R, plus a break charm (T) and a signature (F).
 */

const TUNE = {
  gcd: 1,
  prep: 4,
  dampDelay: 12,
  dampEvery: 8,
  dampStep: 0.02,
  dampCap: 0.5,
  worldW: 100,
  worldH: 60,
  drTime: 18,
  gravity: 32,
  jumpVelocity: 11.5,
};

const PILLAR = { x: 50, y: 30, hw: 5.2, hh: 7.4 };

const MAP_ORDER = ["court", "bridge", "pillars"];

const MAPS = {
  court: {
    id: "court",
    name: "Sand Court",
    blocks: [{ x: 50, y: 30, hw: 5.2, hh: 7.4 }],
  },
  bridge: {
    id: "bridge",
    name: "The Span",
    blocks: [
      { x: 32, y: 30, hw: 1.7, hh: 1.7, below: 4.85 },
      { x: 50, y: 30, hw: 1.7, hh: 1.7, below: 4.85 },
      { x: 68, y: 30, hw: 1.7, hh: 1.7, below: 4.85 },
    ],
    deck: { x0: 16, x1: 84, y0: 25.6, y1: 34.4, top: 5.6, thick: 0.8 },
    ramps: [
      { x0: 8, x1: 16, y0: 25.6, y1: 34.4, top: 5.6, high: "end" },
      { x0: 84, x1: 92, y0: 25.6, y1: 34.4, top: 5.6, high: "start" },
    ],
  },
  pillars: {
    id: "pillars",
    name: "Four Pillars",
    blocks: [
      { x: 36, y: 20, hw: 3.05, hh: 3.05 },
      { x: 64, y: 20, hw: 3.05, hh: 3.05 },
      { x: 36, y: 40, hw: 3.05, hh: 3.05 },
      { x: 64, y: 40, hw: 3.05, hh: 3.05 },
    ],
  },
};

let trainMap = "court";

const SPELL_KEYS = ["1", "2", "3", "4", "e", "q", "r", "c", "x", "z"];

const CLASS_COLORS = {
  warrior: "#C79C6E",
  mage: "#69CCF0",
  hunter: "#ABD473",
  priest: "#FFFFFF",
  warlock: "#9482C9",
  druid: "#FF7D0A",
  rogue: "#FFF569",
  warden: "#5ee0c5",
  binder: "#e23d4a",
  vow: "#f2a3c7",
  duelist: "#7f9cff",
};

let nextId = 1;
let match = null;
let netSend = 0;
let inputSend = 0;
const netCmds = { jump: 0, cancel: 0, cast: 0, castMsg: null };
let keysDown = new Set();
let lastPointer = null;
let hoverAbility = null;
const playerInput = { x: 0, y: 0 };

const $ = (id) => document.getElementById(id);

function spell(def) {
  def.effect = def.effect || function () {};
  return def;
}

function trinket() {
  return spell({
    id: "trinket",
    name: "Break Charm",
    short: "Trinket",
    tag: "Trinket",
    cost: 0,
    cd: 90,
    castTime: 0,
    gcd: false,
    school: "none",
    target: "self",
    blurb: "Clears stun, figment, fear, root, and silence. Does not remove slows or interrupt lockouts. 90 sec cooldown.",
    effect(source) {
      const had = source.auras.some((a) => a.control || a.silence) || source.silence > 0;
      source.auras = source.auras.filter((a) => !a.control && !a.silence);
      source.silence = 0;
      floater(source, "Trinket", "#b8fff0");
      combat(`${nameOf(source)} uses Break Charm${had ? "" : " (no control effect)"}.`);
    },
  });
}

const CLASSES = {
  warrior: {
    name: "Vanguard",
    color: CLASS_COLORS.warrior,
    role: "Melee",
    blurb: "Gap closer with a healing cut. Wins by staying on a target.",
    hp: 3400,
    speed: 12.5,
    melee: true,
    auto: { damage: 82, interval: 2.0, range: 5, minRange: 0 },
    resource: { id: "rage", name: "Rage", color: "#d64545", start: 25, max: 100, regen: 0 },
    abilities: [
      spell({
        id: "charge",
        name: "Rush",
        short: "Rush",
        cost: 0,
        cd: 15,
        gcd: false,
        castTime: 0,
        range: 25,
        minRange: 8,
        school: "physical",
        target: "enemy",
        blurb: "Rush an enemy 8–25 yards away, stunning them for 1.5 sec and generating 20 Rage. Clears your roots. Off the global cooldown.",
        effect(source, target) {
          const ang = Math.atan2(target.y - source.y, target.x - source.x);
          source.dash = {
            x: target.x - Math.cos(ang) * 2.4,
            y: target.y - Math.sin(ang) * 2.4,
            t: 0.2,
            stunId: target.id,
          };
          source.vx = 0;
          source.vy = 0;
          source.resource = Math.min(100, source.resource + 20);
          source.auras = source.auras.filter((a) => a.control !== "root");
          combat(`${nameOf(source)} charges ${nameOf(target)}.`);
        },
      }),
      spell({
        id: "mortalStrike",
        name: "Sundering Blow",
        short: "Sunder",
        cost: 25,
        cd: 6,
        castTime: 0,
        range: 5,
        school: "physical",
        target: "enemy",
        blurb: "A heavy strike that cuts healing received by 50% for 8 sec.",
        effect(source, target) {
          const n = dealDamage(source, target, 250, { direct: true, school: "physical", name: "Sundering Blow" });
          if (n > 0) addAura(target, {
            id: "mortalWounds",
            name: "Sundered",
            short: "MW",
            type: "debuff",
            remaining: 8,
            healReduce: 0.5,
          });
        },
      }),
      spell({
        id: "hamstring",
        name: "Cripple",
        short: "Crip",
        cost: 10,
        cd: 0,
        castTime: 0,
        gcd: false,
        range: 5,
        school: "physical",
        target: "enemy",
        blurb: "Light damage and a 50% slow for 6 sec. Off the global cooldown. The slow is physical and cannot be dispelled.",
        effect(source, target) {
          dealDamage(source, target, 48, { direct: true, school: "physical", name: "Cripple" });
          addAura(target, {
            id: "hamstring",
            name: "Cripple",
            short: "Sn",
            type: "debuff",
            remaining: 6,
            slow: 0.5,
          });
        },
      }),
      spell({
        id: "overpower",
        name: "Press",
        short: "Press",
        cost: 10,
        cd: 4,
        castTime: 0,
        range: 5,
        school: "physical",
        target: "enemy",
        blurb: "A quick strike. Short cooldown, light Rage cost.",
        effect(source, target) {
          dealDamage(source, target, 155, { direct: true, school: "physical", name: "Press" });
        },
      }),
      spell({
        id: "execute",
        name: "Finish",
        short: "Finish",
        cost: 20,
        cd: 0,
        castTime: 0,
        range: 5,
        school: "physical",
        target: "enemy",
        blurb: "Only usable below 20% health. A large finisher.",
        extra(_source, target) {
          if (!target || target.hp / target.hpMax > 0.2) return "Needs a target below 20%";
          return null;
        },
        effect(source, target) {
          dealDamage(source, target, 430, { direct: true, school: "physical", name: "Finish" });
        },
      }),
      spell({
        id: "pummel",
        name: "Bash",
        short: "Bash",
        cost: 10,
        cd: 10,
        castTime: 0,
        gcd: false,
        range: 5,
        school: "physical",
        target: "enemy",
        blurb: "Interrupts a cast and locks cast-time and magic abilities for 4 sec. Off the global cooldown.",
        extra(_source, target) {
          if (!target?.cast) return "Target isn't casting";
          return null;
        },
        effect(source, target) {
          interruptUnit(source, target, 4);
        },
      }),
      spell({
        id: "heroicLeap",
        name: "Vault",
        short: "Vault",
        cost: 0,
        cd: 30,
        gcdTime: 1,
        castTime: 0,
        range: 40,
        minRange: 8,
        marker: 1.5,
        school: "physical",
        target: "ground",
        blurb: "Aim a spot 8–40 yards away and leap there, clearing roots. You arc over walls and the bridge.",
        effect(source) {
          const raw = source.aimPoint || { x: source.x + Math.cos(source.facing) * 12, y: source.y + Math.sin(source.facing) * 12 };
          let dx = raw.x - source.x;
          let dy = raw.y - source.y;
          let d = Math.hypot(dx, dy) || 0.001;
          if (d > 40) {
            dx *= 40 / d;
            dy *= 40 / d;
            d = 40;
          }
          const spot = { x: source.x + dx, y: source.y + dy };
          const travel = clamp(d / 26, 0.28, 0.85);
          const aimFeet = source.aimPoint && typeof source.aimPoint.h === "number" ? source.aimPoint.h : source.height;
          const floor1 = standSurface(spot.x, spot.y, aimFeet + 0.5);
          source.dash = {
            x: spot.x,
            y: spot.y,
            t: travel,
            dur: travel,
            leap: true,
            arc: 1.8 + Math.min(3.2, d * 0.05),
            floor0: source.height,
            floor1: floor1 == null ? 0 : floor1,
          };
          source.vx = 0;
          source.vy = 0;
          source.vz = 0;
          source.knock = 0;
          source.facing = Math.atan2(dy, dx);
          source.auras = source.auras.filter((a) => a.control !== "root");
          combat(`${nameOf(source)} leaps.`);
        },
      }),
      spell({
        id: "brace",
        name: "Brace",
        short: "Brace",
        cost: 20,
        cd: 20,
        castTime: 0,
        school: "physical",
        target: "self",
        blurb: "Harden for 4 sec, taking 30% less damage. Physical, so it cannot be purged.",
        effect(source) {
          addAura(source, {
            id: "brace",
            name: "Brace",
            short: "Brc",
            type: "buff",
            remaining: 4,
            damageReduce: 0.3,
          });
          floater(source, "Brace", "#e7c98a");
          combat(`${nameOf(source)} braces.`);
        },
      }),
      spell({
        id: "quake",
        name: "Quake",
        short: "Quake",
        cost: 15,
        cd: 35,
        castTime: 0,
        school: "physical",
        target: "aoe",
        radius: 8,
        blurb: "Stuns enemies within 8 yards for 2 sec. Shares stun diminishing returns with Rush and Blindside.",
        extra(source) {
          const radius = this.radius || 8;
          const hits = unitsInRadius(source, radius, (u) => u.team !== source.team && u.hp > 0 && !isHidden(u) && hasLoS(source, u));
          if (!hits.length) return "Nobody in range";
          return null;
        },
        effect(source) {
          const radius = this.radius || 8;
          const hits = unitsInRadius(source, radius, (u) => u.team !== source.team && u.hp > 0 && !isHidden(u) && hasLoS(source, u));
          for (const foe of hits) {
            applyControl(source, foe, {
              id: "quake",
              name: "Quake",
              short: "Stun",
              control: "stun",
              dr: "stun",
              duration: this.stunTime || 2,
              dispellable: false,
            });
          }
          combat(`${nameOf(source)} quakes the ground.`);
        },
      }),
      trinket(),
      spell({
        id: "spellReflection",
        name: "Mirror Ward",
        short: "Reflect",
        tag: "Signature",
        cost: 0,
        cd: 25,
        castTime: 0,
        gcd: false,
        school: "physical",
        target: "self",
        blurb: "Reflect the next single-target harmful magic spell back at its caster. Lasts 5 sec. Off the global cooldown.",
        effect(source) {
          addAura(source, {
            id: "spellReflection",
            name: "Mirror Ward",
            short: "Ref",
            type: "buff",
            remaining: 5,
            reflect: true,
            dispellable: true,
          });
          combat(`${nameOf(source)} raises Mirror Ward.`);
        },
      }),
    ],
  },
  mage: {
    name: "Channeler",
    color: CLASS_COLORS.mage,
    role: "Ranged caster",
    blurb: "Control and kite. Figment shares diminishing returns with Snare Trap.",
    hp: 2300,
    speed: 12,
    melee: false,
    auto: { damage: 42, interval: 2.1, range: 30, minRange: 0 },
    resource: { id: "mana", name: "Mana", color: "#4c8fe8", start: 100, max: 100, regen: 5 },
    abilities: [
      spell({
        id: "frostbolt",
        name: "Chill Spike",
        short: "Chill",
        cost: 16,
        cd: 0,
        castTime: 2,
        range: 30,
        school: "magic",
        target: "enemy",
        reflectable: true,
        harmful: true,
        blurb: "2 sec cast. Damage and a 40% magic slow for 4 sec. The slow can be dispelled.",
        effect(source, target) {
          if (tryReflect(source, target, this)) return;
          const n = dealDamage(source, target, 185, { direct: true, school: "magic", name: "Chill Spike" });
          if (n >= 0 && target.hp > 0 && !immune(target)) {
            addAura(target, {
              id: "frostboltSlow",
              name: "Chill Spike",
              short: "Sl",
              type: "debuff",
              remaining: 4,
              slow: 0.4,
              dispellable: true,
            });
          }
        },
      }),
      spell({
        id: "fireBlast",
        name: "Ember Burst",
        short: "Blast",
        cost: 12,
        cd: 8,
        castTime: 0,
        range: 20,
        school: "magic",
        target: "enemy",
        reflectable: true,
        harmful: true,
        blurb: "Instant fire damage on a short cooldown. Usable while moving.",
        effect(source, target) {
          if (tryReflect(source, target, this)) return;
          dealDamage(source, target, 155, { direct: true, school: "magic", name: "Ember Burst" });
        },
      }),
      spell({
        id: "polymorph",
        name: "Figment",
        short: "Figment",
        cost: 18,
        cd: 0,
        castTime: 1.5,
        range: 30,
        school: "magic",
        target: "enemy",
        reflectable: true,
        harmful: true,
        blurb: "1.5 sec cast. Turns the target into a harmless figment for up to 5 sec. Breaks on damage. Incapacitate diminishing returns — shared with Snare Trap. Any damage-over-time tick breaks it.",
        effect(source, target) {
          if (tryReflect(source, target, this)) return;
          applyControl(source, target, {
            id: "polymorph",
            name: "Figment",
            short: "Fig",
            control: "incap",
            dr: "incap",
            duration: 5,
            breakOnDamage: true,
            dispellable: true,
          });
        },
      }),
      spell({
        id: "counterspell",
        name: "Quell",
        short: "Quell",
        cost: 10,
        cd: 16,
        castTime: 0,
        gcd: false,
        range: 30,
        school: "magic",
        target: "enemy",
        blurb: "Interrupts a cast and locks cast-time and magic abilities for 4 sec. Off the global cooldown. A locked chill school also prevents Glacier.",
        extra(_source, target) {
          if (!target?.cast) return "Target isn't casting";
          return null;
        },
        effect(source, target) {
          interruptUnit(source, target, 4);
        },
      }),
      spell({
        id: "blink",
        name: "Shift",
        short: "Shift",
        cost: 8,
        cd: 15,
        castTime: 0,
        range: 0,
        school: "magic",
        target: "self",
        blurb: "Teleport forward 14 yards. Clears roots and slows. Blocked by silence and interrupt lockouts.",
        effect(source) {
          const ang = source.facing;
          blinkMove(source, Math.cos(ang), Math.sin(ang), 14);
          source.auras = source.auras.filter((a) => a.control !== "root" && !a.slow);
          combat(`${nameOf(source)} blinks.`);
        },
      }),
      spell({
        id: "frostNova",
        name: "Rime",
        short: "Nova",
        cost: 12,
        cd: 25,
        castTime: 0,
        school: "magic",
        target: "aoe",
        radius: 8,
        blurb: "Roots nearby enemies for up to 4 sec. Root diminishing returns. Magic, so it can be dispelled. Does not hit through walls or the bridge deck.",
        extra(source) {
          const radius = this.radius || 8;
          const hits = unitsInRadius(source, radius, (u) => u.team !== source.team && u.hp > 0 && hasLoS(source, u));
          if (!hits.length) return "Nobody in range";
          return null;
        },
        effect(source) {
          const radius = this.radius || 8;
          const hits = unitsInRadius(source, radius, (u) => u.team !== source.team && u.hp > 0 && hasLoS(source, u));
          if (!hits.length) {
            if (source.human) feedback(source, "Nobody in range");
            return;
          }
          for (const target of hits) {
            applyControl(source, target, {
              id: "frostNova",
              name: "Rime",
              short: "Root",
              control: "root",
              dr: "root",
              duration: 4,
              dispellable: true,
            });
          }
        },
      }),
      spell({
        id: "scorch",
        name: "Sear",
        short: "Sear",
        cost: 8,
        cd: 0,
        castTime: 1.5,
        moveCast: true,
        range: 35,
        school: "magic",
        target: "enemy",
        reflectable: true,
        harmful: true,
        blurb: "1.5 sec cast while moving. Fire damage and a Wildfire stack for 15 sec. At 3 stacks, Inferno is instant.",
        effect(source, target) {
          if (tryReflect(source, target, this)) return;
          dealDamage(source, target, 130, { direct: true, school: "magic", name: "Sear" });
          if (match.reflectLock) return;
          const prev = source.auras.find((a) => a.id === "hotStreak");
          const cap = source.hotNeed || 3;
          const stacks = Math.min(cap, (prev?.stacks || 0) + 1);
          addAura(source, {
            id: "hotStreak",
            name: "Wildfire",
            short: stacks >= cap ? "Hot!" : `Hot ${stacks}`,
            type: "buff",
            remaining: 15,
            stacks,
          });
          floater(source, stacks >= cap ? "Wildfire" : `Hot ${stacks}`, "#ffb45a");
        },
      }),
      spell({
        id: "pyroblast",
        name: "Inferno",
        short: "Inferno",
        cost: 16,
        cd: 0,
        castTime: 2.5,
        range: 35,
        school: "magic",
        target: "enemy",
        reflectable: true,
        harmful: true,
        blurb: "2.5 sec cast. Heavy fire damage. Instant after 3 Wildfire stacks, which this spends.",
        effect(source, target) {
          if (!match.reflectLock && hotStreakReady(source)) {
            source.auras = source.auras.filter((a) => a.id !== "hotStreak");
          }
          if (tryReflect(source, target, this)) return;
          dealDamage(source, target, 380, { direct: true, school: "magic", name: "Inferno" });
        },
      }),
      spell({
        id: "emberWard",
        name: "Ember Ward",
        short: "Ward",
        cost: 18,
        cd: 25,
        castTime: 0,
        school: "magic",
        target: "self",
        blurb: "A fire shell absorbs damage for 8 sec. Magic, so it can be purged. Dampening reduces the absorb.",
        effect(source) {
          const amount = Math.round(240 * (1 - currentDamp()));
          addAura(source, {
            id: "emberWard",
            name: "Ember Ward",
            short: "Wd",
            type: "buff",
            remaining: 8,
            absorb: amount,
            dispellable: true,
          });
          floater(source, "Ward", "#ff7a3c");
          combat(`${nameOf(source)} raises an Ember Ward.`);
        },
      }),
      trinket(),
      spell({
        id: "iceBlock",
        name: "Glacier",
        short: "Glacier",
        tag: "Signature",
        cost: 0,
        cd: 90,
        castTime: 0,
        school: "magic",
        target: "self",
        blurb: "Immune for 4 sec and clears debuffs. You cannot act. Press F again to cancel early. Cannot be used while silenced or school-locked.",
        effect(source) {
          source.auras = source.auras.filter((a) => a.type === "buff");
          source.silence = 0;
          cancelCast(source, false);
          addAura(source, {
            id: "iceBlock",
            name: "Glacier",
            short: "IB",
            type: "buff",
            remaining: 4,
            ice: true,
          });
          combat(`${nameOf(source)} enters Glacier.`);
        },
      }),
    ],
  },
  hunter: {
    name: "Ranger",
    color: CLASS_COLORS.hunter,
    role: "Ranged physical",
    blurb: "A dead zone inside 8 yards. Longshot can be kicked. Traps share incapacitate DR with Figment.",
    hp: 2700,
    speed: 12.2,
    melee: false,
    auto: { damage: 68, interval: 2.0, range: 35, minRange: 8 },
    resource: { id: "focus", name: "Focus", color: "#e09a3e", start: 100, max: 100, regen: 8 },
    abilities: [
      spell({
        id: "aimedShot",
        name: "Longshot",
        short: "Long",
        cost: 30,
        cd: 0,
        castTime: 2.1,
        moveCast: true,
        range: 35,
        minRange: 8,
        school: "magic",
        target: "enemy",
        reflectable: true,
        harmful: true,
        blurb: "2.1 sec aimed shot you can cast while moving. Heavy damage. Treated as interruptible magic so kicks matter. Cannot be used inside 8 yards.",
        effect(source, target) {
          if (tryReflect(source, target, this)) return;
          dealDamage(source, target, 270, { direct: true, school: "physical", name: "Longshot" });
        },
      }),
      spell({
        id: "concussiveShot",
        name: "Dazing Shot",
        short: "Daze",
        cost: 10,
        cd: 6,
        castTime: 0,
        range: 35,
        minRange: 8,
        school: "physical",
        target: "enemy",
        blurb: "Instant shot that slows by 50% for 5 sec. Physical slow. Dead zone inside 8 yards.",
        effect(source, target) {
          dealDamage(source, target, 36, { direct: true, school: "physical", name: "Dazing Shot" });
          addAura(target, {
            id: "concussive",
            name: "Dazing Shot",
            short: "Sn",
            type: "debuff",
            remaining: 5,
            slow: 0.5,
          });
        },
      }),
      spell({
        id: "freezingTrap",
        name: "Snare Trap",
        short: "Trap",
        cost: 15,
        cd: 28,
        castTime: 0,
        range: 30,
        radius: 3,
        school: "physical",
        target: "ground",
        blurb: "Aim a ground circle within 30 yards, then click to place it. After 0.7 sec it arms and freezes the first enemy who steps on it for up to 5 sec. Breaks on damage. Shares incapacitate DR with Figment.",
        effect(source) {
          const spot = source.aimPoint || { x: source.x, y: source.y };
          match.traps = match.traps.filter((t) => t.ownerId !== source.id);
          const trapH = standSurface(spot.x, spot.y, (typeof spot.h === "number" ? spot.h : source.height) + 0.4);
          match.traps.push({
            ownerId: source.id,
            team: source.team,
            x: spot.x,
            y: spot.y,
            h: trapH == null ? 0 : trapH,
            arm: 0.7,
            life: 25,
            radius: 3,
          });
          combat(`${nameOf(source)} places a Snare Trap.`);
        },
      }),
      spell({
        id: "wingClip",
        name: "Ankle Cut",
        short: "Ankle",
        cost: 15,
        cd: 0,
        castTime: 0,
        range: 5,
        school: "physical",
        target: "enemy",
        blurb: "Melee range. Damage and a 50% physical slow for 6 sec. Your answer inside the dead zone.",
        effect(source, target) {
          dealDamage(source, target, 55, { direct: true, school: "physical", name: "Ankle Cut" });
          addAura(target, {
            id: "wingClip",
            name: "Ankle Cut",
            short: "Sn",
            type: "debuff",
            remaining: 6,
            slow: 0.5,
          });
        },
      }),
      spell({
        id: "silencingShot",
        name: "Quiet Shot",
        short: "Quiet",
        cost: 20,
        cd: 16,
        castTime: 0,
        range: 35,
        minRange: 8,
        school: "physical",
        target: "enemy",
        blurb: "Interrupts and silences magic for 3 sec. Physical shot, so you can still use it while silenced. Dead zone inside 8 yards.",
        extra(_source, target) {
          if (!target?.cast) return "Target isn't casting";
          return null;
        },
        effect(source, target) {
          silenceUnit(source, target, 3);
          dealDamage(source, target, 50, { direct: true, school: "physical", name: "Quiet Shot" });
        },
      }),
      spell({
        id: "disengage",
        name: "Backstep",
        short: "Back",
        cost: 5,
        cd: 20,
        castTime: 0,
        school: "physical",
        target: "self",
        blurb: "Shoves you backward. Your current speed is kept, so jumping first carries you farther. Clears roots.",
        effect(source) {
          const airborne = source.height > 0.2 || source.vz > 1;
          launchBackward(source);
          combat(`${nameOf(source)} disengages${airborne ? " from the air" : ""}.`);
        },
      }),
      spell({
        id: "feignDeath",
        name: "Play Dead",
        short: "Play",
        cost: 0,
        cd: 30,
        castTime: 0,
        school: "physical",
        target: "self",
        blurb: "Drop hostile targeting for 3 sec. Enemies aimed at you lose their target and their cast. Allies can still heal you.",
        effect(source) {
          feignDeath(source);
        },
      }),
      spell({
        id: "pin",
        name: "Pin",
        short: "Pin",
        cost: 20,
        cd: 18,
        castTime: 0,
        range: 35,
        minRange: 8,
        school: "physical",
        target: "enemy",
        blurb: "A pinning shot roots the target for up to 3 sec. Root diminishing returns. Physical, so it cannot be dispelled. No effect inside 8 yards.",
        effect(source, target) {
          applyControl(source, target, {
            id: "pin",
            name: "Pin",
            short: "Root",
            control: "root",
            dr: "root",
            duration: 3,
            dispellable: false,
          });
        },
      }),
      spell({
        id: "finishShot",
        name: "Finish Shot",
        short: "Finish",
        cost: 35,
        cd: 10,
        castTime: 0,
        range: 35,
        minRange: 8,
        school: "physical",
        target: "enemy",
        blurb: "A heavy shot, only against a target at or below 20% health. No effect inside 8 yards.",
        extra(_source, target) {
          if (!target || target.hp / target.hpMax > 0.2) return "Target above 20%";
          return null;
        },
        effect(source, target) {
          dealDamage(source, target, 320, { direct: true, school: "physical", name: "Finish Shot" });
        },
      }),
      trinket(),
      spell({
        id: "deterrence",
        name: "Deflect",
        short: "Deflect",
        tag: "Signature",
        cost: 0,
        cd: 90,
        castTime: 0,
        school: "physical",
        target: "self",
        blurb: "For 4 sec, attacks and hostile spells against you fail. Does not break existing crowd control. Usable while silenced.",
        effect(source) {
          addAura(source, {
            id: "deterrence",
            name: "Deflect",
            short: "Def",
            type: "buff",
            remaining: 4,
            deflect: true,
          });
          combat(`${nameOf(source)} uses Deflect.`);
        },
      }),
    ],
  },
  priest: {
    name: "Cleric",
    color: CLASS_COLORS.priest,
    role: "Healer",
    blurb: "Keep your partner upright. Sundering Blow and dampening both cut your heals.",
    hp: 2500,
    speed: 12,
    melee: false,
    auto: { damage: 36, interval: 2.2, range: 30, minRange: 0 },
    resource: { id: "mana", name: "Mana", color: "#4c8fe8", start: 100, max: 100, regen: 6 },
    abilities: [
      spell({
        id: "flashHeal",
        name: "Salve",
        short: "Salve",
        cost: 20,
        cd: 0,
        castTime: 1.5,
        range: 35,
        school: "magic",
        target: "friend",
        blurb: "1.5 sec heal. If an enemy is targeted, it heals you. Click your partner's frame, or use your next-ally key, to heal them. Reduced by dampening and Sundering Blow.",
        effect(source, target) {
          heal(source, target, 400, "Salve");
        },
      }),
      spell({
        id: "powerWordShield",
        name: "Aegis",
        short: "Shield",
        cost: 18,
        cd: 0,
        castTime: 0,
        range: 35,
        school: "magic",
        target: "friend",
        blurb: "Absorbs damage for 15 sec. Leaves Spent Soul for 12 sec, preventing another shield. The shield is magic and can be purged. Dampening reduces the absorb.",
        extra(_source, target) {
          if (!target) return "No target";
          if (hasAura(target, "weakenedSoul")) return "Spent Soul";
          if (hasAura(target, "powerWordShield")) return "Already shielded";
          return null;
        },
        effect(source, target) {
          if (immune(target)) {
            floater(target, "Immune", "#ddd");
            return;
          }
          const amount = Math.round(300 * (1 - currentDamp()));
          addAura(target, {
            id: "powerWordShield",
            name: "Aegis",
            short: "Sh",
            type: "buff",
            remaining: 15,
            absorb: amount,
            dispellable: true,
          });
          addAura(target, {
            id: "weakenedSoul",
            name: "Spent Soul",
            short: "WS",
            type: "debuff",
            remaining: 12,
          });
          floater(target, `+${amount} shield`, "#9fd0ff");
          combat(`${nameOf(source)} shields ${nameOf(target)} for ${amount}.`);
        },
      }),
      spell({
        id: "shadowWordPain",
        name: "Aching",
        short: "Ache",
        cost: 12,
        cd: 0,
        castTime: 0,
        range: 30,
        school: "magic",
        target: "enemy",
        reflectable: true,
        harmful: true,
        blurb: "Magic damage over time: six ticks over 12 sec. Ticks break Figment and Snare Trap. Dispels off.",
        effect(source, target) {
          if (tryReflect(source, target, this)) return;
          if (immune(target)) {
            floater(target, "Immune", "#ddd");
            return;
          }
          addAura(target, {
            id: "swp",
            name: "Aching",
            short: "P",
            type: "debuff",
            remaining: 12,
            dispellable: true,
            dot: { damage: 38, every: 2, tick: 2, school: "magic", name: "Aching", sourceId: source.id },
          });
          combat(`${nameOf(source)} afflicts ${nameOf(target)} with Aching.`);
        },
      }),
      spell({
        id: "psychicScream",
        name: "Wail",
        short: "Wail",
        cost: 14,
        cd: 30,
        castTime: 0,
        school: "magic",
        target: "aoe",
        radius: 8,
        blurb: "Fears nearby enemies for up to 4 sec. Fear diminishing returns. Magic, so it can be dispelled. Does not hit through walls or the bridge deck.",
        extra(source) {
          const hits = unitsInRadius(source, 8, (u) => u.team !== source.team && u.hp > 0 && hasLoS(source, u));
          if (!hits.length) return "Nobody in range";
          return null;
        },
        effect(source) {
          const hits = unitsInRadius(source, 8, (u) => u.team !== source.team && u.hp > 0 && hasLoS(source, u));
          if (!hits.length) {
            if (source.human) feedback(source, "Nobody in range");
            return;
          }
          for (const target of hits) {
            applyControl(source, target, {
              id: "psychicScream",
              name: "Wail",
              short: "Fear",
              control: "fear",
              dr: "fear",
              duration: 4,
              dispellable: true,
            });
          }
        },
      }),
      spell({
        id: "dispelMagic",
        name: "Cleanse",
        short: "Dispel",
        cost: 16,
        cd: 8,
        castTime: 0,
        range: 30,
        school: "magic",
        target: "any",
        blurb: "On an ally, removes one harmful magic effect (figment, dread, updraft, root, aching, curses). Dispelling Volatile Curse damages you. On an enemy, purges a shield, Mirror Ward, or a heal over time.",
        extra(source, target) {
          if (!target) return "No target";
          const mode = target.team === source.team ? "help" : "harm";
          if (!pickDispel(target, mode)) return mode === "help" ? "Nothing to dispel" : "Nothing to purge";
          return null;
        },
        effect(source, target) {
          const mode = target.team === source.team ? "help" : "harm";
          const aura = pickDispel(target, mode);
          if (!aura) return;
          target.auras = target.auras.filter((a) => a !== aura);
          floater(target, mode === "help" ? "Dispelled" : "Purged", "#d7c4ff");
          combat(`${nameOf(source)} removes ${aura.name} from ${nameOf(target)}.`);
          if (mode === "help" && aura.backlash) {
            const owner = unitById(aura.dot?.sourceId) || target;
            dealDamage(owner, source, aura.backlash, { direct: true, school: "magic", name: aura.name });
          }
        },
      }),
      spell({
        id: "mindBlast",
        name: "Thought Spike",
        short: "Spike",
        cost: 16,
        cd: 8,
        castTime: 1.5,
        range: 30,
        school: "magic",
        target: "enemy",
        reflectable: true,
        harmful: true,
        blurb: "1.5 sec cast. Solid shadow damage when nobody needs a heal.",
        effect(source, target) {
          if (tryReflect(source, target, this)) return;
          dealDamage(source, target, 175, { direct: true, school: "magic", name: "Thought Spike" });
        },
      }),
      spell({
        id: "penance",
        name: "Litany",
        short: "Litany",
        cost: 16,
        cd: 9,
        castTime: 2,
        moveCast: true,
        channel: true,
        pulses: 3,
        range: 30,
        school: "magic",
        target: "any",
        reflectable: true,
        blurb: "2 sec channel you can cast while moving. Three bolts. Heals an ally or damages an enemy. Line of sight is required to start it. The bolts still land if you step behind the pillar.",
        effect(source, target) {
          if (!target || target.hp <= 0) return;
          if (target.team === source.team) {
            heal(source, target, 150, "Litany");
            return;
          }
          if (tryReflect(source, target, this)) return;
          dealDamage(source, target, 90, { direct: true, school: "magic", name: "Litany" });
        },
      }),
      spell({
        id: "blessing",
        name: "Blessing",
        short: "Bless",
        cost: 18,
        cd: 25,
        castTime: 0,
        range: 40,
        school: "magic",
        target: "friend",
        blurb: "An ally takes 20% less damage for 6 sec. Magic, so it can be purged.",
        effect(source, target) {
          addAura(target, {
            id: "blessing",
            name: "Blessing",
            short: "Bls",
            type: "buff",
            remaining: 6,
            dispellable: true,
            damageReduce: 0.2,
          });
          floater(target, "Blessed", "#f7f4ff");
          combat(`${nameOf(source)} blesses ${nameOf(target)}.`);
        },
      }),
      spell({
        id: "speedBlessing",
        name: "Speed Blessing",
        short: "Speed",
        cost: 12,
        charges: 3,
        recharge: 18,
        castTime: 0,
        range: 40,
        school: "magic",
        target: "friend",
        blurb: "The ally moves 50% faster for 8 sec. Three charges, and one charge returns every 18 sec. Cast it on yourself if you have yourself targeted. Magic, so it can be purged.",
        effect(source, target) {
          addAura(target, {
            id: "speedBlessing",
            name: "Speed Blessing",
            short: "Spd",
            type: "buff",
            remaining: 8,
            speed: 0.5,
            dispellable: true,
          });
          floater(target, "Speed", "#f7f4ff");
          combat(`${nameOf(source)} blesses ${nameOf(target)} with speed.`);
        },
      }),
      trinket(),
      spell({
        id: "desperatePrayer",
        name: "Last Plea",
        short: "Plea",
        tag: "Signature",
        cost: 0,
        cd: 90,
        castTime: 0,
        school: "magic",
        target: "self",
        blurb: "Instant heal on yourself. Still reduced by dampening and Sundering Blow. 90 sec cooldown.",
        effect(source) {
          heal(source, source, 560, "Last Plea");
        },
      }),
    ],
  },
  warlock: {
    name: "Hexer",
    color: CLASS_COLORS.warlock,
    role: "DoT caster",
    blurb: "Stacks curses and lets them tick. Fear the enemy who is not dotted, or your own damage breaks it.",
    hp: 2450,
    speed: 12,
    melee: false,
    auto: { damage: 36, interval: 2.2, range: 30, minRange: 0 },
    resource: { id: "mana", name: "Mana", color: "#4c8fe8", start: 100, max: 100, regen: 6 },
    abilities: [
      spell({
        id: "shadowBolt",
        name: "Gloom Bolt",
        short: "Bolt",
        cost: 14,
        cd: 0,
        castTime: 2,
        range: 35,
        school: "magic",
        target: "enemy",
        reflectable: true,
        harmful: true,
        blurb: "2 sec cast. Shadow damage. Your filler once the curses are rolling.",
        effect(source, target) {
          if (tryReflect(source, target, this)) return;
          dealDamage(source, target, 165, { direct: true, school: "magic", name: "Gloom Bolt" });
        },
      }),
      spell({
        id: "corruption",
        name: "Rot",
        short: "Rot",
        cost: 12,
        cd: 0,
        castTime: 0,
        range: 35,
        school: "magic",
        target: "enemy",
        reflectable: true,
        harmful: true,
        blurb: "Instant curse. Ticks for 18 sec. Magic, so it can be dispelled. Ticks break figment, updraft, and traps.",
        effect(source, target) {
          if (tryReflect(source, target, this)) return;
          if (immune(target)) {
            floater(target, "Immune", "#ddd");
            return;
          }
          addAura(target, {
            id: "corruption",
            name: "Rot",
            short: "Cor",
            type: "debuff",
            remaining: 18,
            dispellable: true,
            dot: { damage: 24, every: 2, tick: 2, school: "magic", name: "Rot", sourceId: source.id, fx: "#7d5cff" },
          });
          combat(`${nameOf(source)} corrupts ${nameOf(target)}.`);
        },
      }),
      spell({
        id: "agony",
        name: "Torment",
        short: "Torment",
        cost: 14,
        cd: 0,
        castTime: 0,
        range: 35,
        school: "magic",
        target: "enemy",
        reflectable: true,
        harmful: true,
        blurb: "Instant curse. Heavier ticks for 14 sec. Dispels off. Ticks break crowd control.",
        effect(source, target) {
          if (tryReflect(source, target, this)) return;
          if (immune(target)) {
            floater(target, "Immune", "#ddd");
            return;
          }
          addAura(target, {
            id: "agony",
            name: "Torment",
            short: "Torm",
            type: "debuff",
            remaining: 14,
            dispellable: true,
            dot: { damage: 32, every: 2, tick: 2, school: "magic", name: "Torment", sourceId: source.id, fx: "#c084fc" },
          });
          combat(`${nameOf(source)} agonizes ${nameOf(target)}.`);
        },
      }),
      spell({
        id: "unstableAffliction",
        name: "Volatile Curse",
        short: "Vol",
        cost: 16,
        cd: 0,
        castTime: 0,
        range: 35,
        school: "magic",
        target: "enemy",
        reflectable: true,
        harmful: true,
        blurb: "Instant curse. Hard ticks for 8 sec, and your other curses tick 35% harder while it lasts. Dispelling it blasts the dispeller.",
        effect(source, target) {
          if (tryReflect(source, target, this)) return;
          if (immune(target)) {
            floater(target, "Immune", "#ddd");
            return;
          }
          addAura(target, {
            id: "unstableAffliction",
            name: "Volatile Curse",
            short: "Vol",
            type: "debuff",
            remaining: 8,
            dispellable: true,
            backlash: 120,
            dotAmp: 0.35,
            dotAmpSource: source.id,
            dot: { damage: 50, every: 2, tick: 2, school: "magic", name: "Volatile Curse", sourceId: source.id, fx: "#6dff9a" },
          });
          combat(`${nameOf(source)} afflicts ${nameOf(target)} with Volatile Curse.`);
        },
      }),
      spell({
        id: "fear",
        name: "Dread",
        short: "Dread",
        cost: 14,
        cd: 0,
        castTime: 1.5,
        range: 25,
        school: "magic",
        target: "enemy",
        reflectable: true,
        harmful: true,
        blurb: "1.5 sec cast. Fears one enemy for up to 4 sec. Breaks on any damage, including your own curses. Shares fear diminishing returns with Wail.",
        effect(source, target) {
          if (tryReflect(source, target, this)) return;
          applyControl(source, target, {
            id: "fear",
            name: "Dread",
            short: "Fear",
            control: "fear",
            dr: "fear",
            duration: 4,
            breakOnDamage: true,
            dispellable: true,
          });
        },
      }),
      spell({
        id: "spellLock",
        name: "Hex Lock",
        short: "Lock",
        cost: 10,
        cd: 16,
        castTime: 0,
        gcd: false,
        range: 30,
        school: "magic",
        target: "enemy",
        blurb: "Interrupts a cast and locks cast-time and magic abilities for 4 sec. Off the global cooldown. 16 sec cooldown.",
        extra(_source, target) {
          if (!target?.cast) return "Target isn't casting";
          return null;
        },
        effect(source, target) {
          interruptUnit(source, target, 4);
        },
      }),
      spell({
        id: "drainLife",
        name: "Siphon",
        short: "Siphon",
        cost: 16,
        cd: 0,
        castTime: 2,
        channel: true,
        pulses: 3,
        range: 30,
        school: "magic",
        target: "enemy",
        reflectable: true,
        blurb: "2 sec channel. Three pulses of damage. Each pulse returns health to you.",
        effect(source, target) {
          if (!target || target.hp <= 0) return;
          if (tryReflect(source, target, this)) return;
          const dealt = dealDamage(source, target, 55, { direct: true, school: "magic", name: "Siphon" });
          if (dealt > 0) heal(source, source, 40, "Siphon", true);
        },
      }),
      spell({
        id: "wither",
        name: "Wither",
        short: "Wither",
        cost: 14,
        cd: 15,
        castTime: 0,
        range: 30,
        school: "magic",
        target: "enemy",
        reflectable: true,
        harmful: true,
        blurb: "A curse that cuts the target's damage done by 20% for 8 sec. Magic, so it can be dispelled.",
        effect(source, target) {
          if (tryReflect(source, target, this)) return;
          if (immune(target)) {
            floater(target, "Immune", "#ddd");
            return;
          }
          addAura(target, {
            id: "wither",
            name: "Wither",
            short: "Wth",
            type: "debuff",
            remaining: 8,
            dispellable: true,
            damageDoneCut: 0.2,
          });
          floater(target, "Withered", "#6b4cff");
          combat(`${nameOf(source)} withers ${nameOf(target)}.`);
        },
      }),
      spell({
        id: "umbralShell",
        name: "Umbral Shell",
        short: "Shell",
        cost: 16,
        cd: 25,
        castTime: 0,
        school: "magic",
        target: "self",
        blurb: "A shadow shell absorbs damage for 8 sec. Magic, so it can be purged. Dampening reduces the absorb.",
        effect(source) {
          const amount = Math.round(260 * (1 - currentDamp()));
          addAura(source, {
            id: "umbralShell",
            name: "Umbral Shell",
            short: "Sh",
            type: "buff",
            remaining: 8,
            absorb: amount,
            dispellable: true,
          });
          floater(source, "Shell", "#6b4cff");
          combat(`${nameOf(source)} raises an Umbral Shell.`);
        },
      }),
      trinket(),
      spell({
        id: "healthstone",
        name: "Vita Stone",
        short: "Vita",
        tag: "Signature",
        cost: 0,
        cd: 90,
        castTime: 0,
        school: "magic",
        target: "self",
        blurb: "Swallow a stone and heal yourself. Still reduced by dampening and Sundering Blow. 90 sec cooldown.",
        effect(source) {
          heal(source, source, 540, "Vita Stone");
        },
      }),
    ],
  },
  druid: {
    name: "Grovekeeper",
    color: CLASS_COLORS.druid,
    role: "HoT healer",
    blurb: "Blankets allies in healing over time, then blooms or swiftmends when the damage lands.",
    hp: 2500,
    speed: 12.2,
    melee: false,
    auto: { damage: 28, interval: 2.2, range: 30, minRange: 0 },
    resource: { id: "mana", name: "Mana", color: "#4c8fe8", start: 100, max: 100, regen: 7 },
    abilities: [
      spell({
        id: "rejuvenation",
        name: "Renewal",
        short: "Renew",
        cost: 14,
        cd: 0,
        castTime: 0,
        range: 40,
        school: "magic",
        target: "friend",
        blurb: "Instant heal over time for 12 sec. An enemy cleric can purge it.",
        effect(source, target) {
          addAura(target, {
            id: "rejuvenation",
            name: "Renewal",
            short: "Rj",
            type: "buff",
            remaining: 12,
            dispellable: true,
            hot: { heal: 42, every: 2, tick: 2, name: "Renewal", sourceId: source.id },
          });
          combat(`${nameOf(source)} rejuvenates ${nameOf(target)}.`);
        },
      }),
      spell({
        id: "lifebloom",
        name: "Heartbloom",
        short: "Bloom",
        cost: 16,
        cd: 0,
        castTime: 0,
        range: 40,
        school: "magic",
        target: "friend",
        blurb: "Instant heal over time for 8 sec. When it expires, it blooms into a larger heal. Refreshing it delays the bloom.",
        effect(source, target) {
          addAura(target, {
            id: "lifebloom",
            name: "Heartbloom",
            short: "Lb",
            type: "buff",
            remaining: 8,
            dispellable: true,
            hot: { heal: 24, every: 2, tick: 2, name: "Heartbloom", sourceId: source.id },
            bloom: { heal: 220, name: "Heartbloom", sourceId: source.id },
          });
          combat(`${nameOf(source)} plants Heartbloom on ${nameOf(target)}.`);
        },
      }),
      spell({
        id: "regrowth",
        name: "Regrow",
        short: "Regrow",
        cost: 20,
        cd: 0,
        castTime: 1.5,
        range: 40,
        school: "magic",
        target: "friend",
        blurb: "1.5 sec cast. A direct heal plus a short heal over time.",
        effect(source, target) {
          heal(source, target, 260, "Regrow");
          if (target.hp <= 0) return;
          addAura(target, {
            id: "regrowth",
            name: "Regrow",
            short: "Rg",
            type: "buff",
            remaining: 6,
            dispellable: true,
            hot: { heal: 28, every: 2, tick: 2, name: "Regrow", sourceId: source.id },
          });
        },
      }),
      spell({
        id: "wildGrowth",
        name: "Canopy",
        short: "Canopy",
        cost: 18,
        cd: 8,
        castTime: 0,
        range: 40,
        school: "magic",
        target: "self",
        blurb: "Instant heal over time on you and your partner if they are in line of sight. Lasts 6 sec.",
        effect(source) {
          const friends = friendsOf(source).filter((friend) => dist(source, friend) <= 40 && hasLoS(source, friend));
          for (const friend of friends) {
            addAura(friend, {
              id: "wildGrowth",
              name: "Canopy",
              short: "WG",
              type: "buff",
              remaining: 6,
              dispellable: true,
              hot: { heal: 30, every: 2, tick: 2, name: "Canopy", sourceId: source.id },
            });
          }
          combat(`${nameOf(source)} blooms Canopy on ${friends.length} ${friends.length === 1 ? "ally" : "allies"}.`);
        },
      }),
      spell({
        id: "swiftmend",
        name: "Burst Bloom",
        short: "Burst",
        cost: 12,
        cd: 12,
        castTime: 0,
        range: 40,
        school: "magic",
        target: "friend",
        blurb: "Consumes one heal over time on an ally and turns it into a big instant heal. Prefers Renewal or Regrow over Heartbloom.",
        extra(_source, target) {
          if (!target || !target.auras.some((a) => a.hot)) return "No heal over time";
          return null;
        },
        effect(source, target) {
          const hot = target.auras.find((a) => a.hot && a.id !== "lifebloom") || target.auras.find((a) => a.hot);
          if (!hot) return;
          target.auras = target.auras.filter((a) => a !== hot);
          heal(source, target, 360, "Burst Bloom");
          combat(`${nameOf(source)} consumes ${hot.name}.`);
        },
      }),
      spell({
        id: "cyclone",
        name: "Updraft",
        short: "Up",
        cost: 16,
        cd: 0,
        castTime: 1.5,
        range: 25,
        school: "magic",
        target: "enemy",
        reflectable: true,
        harmful: true,
        blurb: "1.5 sec cast. Lifts an enemy into an updraft for up to 5 sec. Breaks on damage. Incapacitate diminishing returns — shared with Figment and Snare Trap.",
        effect(source, target) {
          if (tryReflect(source, target, this)) return;
          applyControl(source, target, {
            id: "cyclone",
            name: "Updraft",
            short: "Up",
            control: "incap",
            dr: "incap",
            duration: 5,
            breakOnDamage: true,
            dispellable: true,
          });
        },
      }),
      spell({
        id: "wrath",
        name: "Thornbolt",
        short: "Thornbolt",
        cost: 12,
        cd: 0,
        castTime: 1.5,
        range: 35,
        school: "magic",
        target: "enemy",
        reflectable: true,
        harmful: true,
        blurb: "1.5 sec cast. Nature damage when both allies are healthy.",
        effect(source, target) {
          if (tryReflect(source, target, this)) return;
          dealDamage(source, target, 145, { direct: true, school: "magic", name: "Thornbolt" });
        },
      }),
      spell({
        id: "thicket",
        name: "Thicket",
        short: "Root",
        cost: 16,
        cd: 20,
        castTime: 0,
        range: 30,
        school: "magic",
        target: "enemy",
        reflectable: true,
        harmful: true,
        blurb: "Roots an enemy in vines for up to 4 sec. Root diminishing returns. Magic, so it can be dispelled.",
        effect(source, target) {
          if (tryReflect(source, target, this)) return;
          applyControl(source, target, {
            id: "thicket",
            name: "Thicket",
            short: "Root",
            control: "root",
            dr: "root",
            duration: 4,
            dispellable: true,
          });
        },
      }),
      spell({
        id: "clearbloom",
        name: "Clearbloom",
        short: "Clear",
        cost: 12,
        cd: 8,
        castTime: 0,
        range: 40,
        school: "magic",
        target: "friend",
        blurb: "Removes one harmful magic effect from an ally. Dispelling Volatile Curse damages you.",
        extra(_source, target) {
          if (!target) return "No target";
          if (!pickDispel(target, "help")) return "Nothing to dispel";
          return null;
        },
        effect(source, target) {
          dispelHelp(source, target);
        },
      }),
      trinket(),
      spell({
        id: "ironbark",
        name: "Heartwood",
        short: "Bark",
        tag: "Signature",
        cost: 0,
        cd: 90,
        castTime: 0,
        range: 40,
        school: "magic",
        target: "friend",
        blurb: "Wraps an ally in bark, reducing damage taken by 40% for 8 sec. Can be purged. 90 sec cooldown.",
        effect(source, target) {
          addAura(target, {
            id: "ironbark",
            name: "Heartwood",
            short: "Bark",
            type: "buff",
            remaining: 8,
            dispellable: true,
            damageReduce: 0.4,
          });
          floater(target, "Bark", "#c6e58a");
          combat(`${nameOf(source)} guards ${nameOf(target)} with Heartwood.`);
        },
      }),
    ],
  },
  rogue: {
    name: "Shade",
    color: CLASS_COLORS.rogue,
    role: "Melee",
    blurb: "Opens from the veil with a stun, then sticks to a target. Veil needs you out of combat. Fade is the one you use during a fight.",
    hp: 2950,
    speed: 13,
    melee: true,
    auto: { damage: 72, interval: 2.0, range: 5, minRange: 0 },
    resource: { id: "energy", name: "Energy", color: "#fff569", start: 100, max: 100, regen: 10 },
    abilities: [
      spell({
        id: "sinisterStrike",
        name: "Slice",
        short: "Slice",
        cost: 25,
        cd: 0,
        castTime: 0,
        range: 5,
        school: "physical",
        target: "enemy",
        blurb: "Instant melee strike. Your filler once the opener lands.",
        effect(source, target) {
          dealDamage(source, target, 145, { direct: true, school: "physical", name: "Slice" });
        },
      }),
      spell({
        id: "eviscerate",
        name: "Gut",
        short: "Gut",
        cost: 35,
        cd: 6,
        castTime: 0,
        range: 5,
        school: "physical",
        target: "enemy",
        blurb: "A heavier melee strike on a short cooldown.",
        effect(source, target) {
          dealDamage(source, target, 240, { direct: true, school: "physical", name: "Gut" });
        },
      }),
      spell({
        id: "cheapShot",
        name: "Blindside",
        short: "Blind",
        cost: 40,
        cd: 0,
        castTime: 0,
        range: 5,
        school: "physical",
        target: "enemy",
        blurb: "Only from the veil. Stuns for 4 sec. Stun diminishing returns — shared with Rush. Breaks the veil.",
        extra(source) {
          if (!isVeiled(source)) return "Must be veiled";
          return null;
        },
        effect(source, target) {
          applyControl(source, target, {
            id: "cheapShot",
            name: "Blindside",
            short: "Stun",
            control: "stun",
            dr: "stun",
            duration: 4,
            dispellable: false,
          });
          breakVeil(source);
        },
      }),
      spell({
        id: "kick",
        name: "Stifle",
        short: "Stifle",
        cost: 15,
        cd: 10,
        castTime: 0,
        gcd: false,
        range: 5,
        school: "physical",
        target: "enemy",
        blurb: "Interrupts a cast and locks cast-time and magic abilities for 4 sec. Off the global cooldown.",
        extra(_source, target) {
          if (!target?.cast) return "Target isn't casting";
          return null;
        },
        effect(source, target) {
          interruptUnit(source, target, 4);
          breakVeil(source);
        },
      }),
      spell({
        id: "gouge",
        name: "Eye Jab",
        short: "Eye Jab",
        cost: 25,
        cd: 0,
        castTime: 0,
        range: 5,
        school: "physical",
        target: "enemy",
        blurb: "Incapacitates for up to 4 sec. Breaks on damage. Incapacitate diminishing returns — shared with Figment, Snare Trap, and Updraft.",
        effect(source, target) {
          applyControl(source, target, {
            id: "gouge",
            name: "Eye Jab",
            short: "Eye Jab",
            control: "incap",
            dr: "incap",
            duration: 4,
            breakOnDamage: true,
            dispellable: false,
          });
          breakVeil(source);
        },
      }),
      spell({
        id: "sprint",
        name: "Burst",
        short: "Burst",
        cost: 0,
        cd: 20,
        castTime: 0,
        gcd: false,
        school: "physical",
        target: "self",
        blurb: "Move 70% faster for 6 sec. Off the global cooldown. Roots still hold you.",
        effect(source) {
          addAura(source, {
            id: "sprint",
            name: "Burst",
            short: "Sp",
            type: "buff",
            remaining: 6,
            speed: 0.7,
          });
          floater(source, "Burst", "#fff569");
          combat(`${nameOf(source)} sprints.`);
        },
      }),
      spell({
        id: "stealth",
        name: "Veil",
        short: "Veil",
        cost: 0,
        cd: 6,
        castTime: 0,
        school: "physical",
        target: "self",
        blurb: "Fade out and drop enemy targeting. Lasts 20 sec. Only usable out of combat. Attacking reveals you. A direct hit reveals you. Blindside requires the veil.",
        extra(source) {
          if (isVeiled(source)) return "Already veiled";
          if (inCombat(source)) return "In combat";
          return null;
        },
        effect(source) {
          enterVeil(source, 20);
          combat(`${nameOf(source)} enters the veil.`);
        },
      }),
      spell({
        id: "step",
        name: "Step",
        short: "Step",
        cost: 15,
        cd: 18,
        castTime: 0,
        range: 20,
        school: "physical",
        target: "enemy",
        blurb: "Step to an enemy within 20 yards and clear your roots. Does not break the veil.",
        effect(source, target) {
          const ang = Math.atan2(target.y - source.y, target.x - source.x);
          const travel = Math.max(0, dist(source, target) - 2.4);
          source.auras = source.auras.filter((a) => a.control !== "root");
          blinkMove(source, Math.cos(ang), Math.sin(ang), travel);
          combat(`${nameOf(source)} steps to ${nameOf(target)}.`);
        },
      }),
      spell({
        id: "tendon",
        name: "Tendon",
        short: "Tendon",
        cost: 15,
        cd: 0,
        castTime: 0,
        range: 5,
        school: "physical",
        target: "enemy",
        blurb: "Melee cut. Light damage and a 50% slow for 6 sec. The slow is physical and cannot be dispelled.",
        effect(source, target) {
          dealDamage(source, target, 40, { direct: true, school: "physical", name: "Tendon" });
          addAura(target, {
            id: "tendon",
            name: "Tendon",
            short: "Tn",
            type: "debuff",
            remaining: 6,
            slow: 0.5,
          });
        },
      }),
      trinket(),
      spell({
        id: "vanish",
        name: "Fade",
        short: "Fade",
        tag: "Signature",
        cost: 0,
        cd: 90,
        castTime: 0,
        gcd: false,
        school: "physical",
        target: "self",
        blurb: "Use during a fight. Drops combat, clears slows and roots, and enters the veil for 8 sec. 90 sec cooldown. Off the global cooldown.",
        effect(source) {
          source.auras = source.auras.filter((a) => a.control !== "root" && !a.slow);
          dropCombat(source);
          enterVeil(source, 8);
          floater(source, "Fade", "#fff569");
          combat(`${nameOf(source)} fades into the veil.`);
        },
      }),
    ],
  },
  warden: {
    name: "Warden",
    color: CLASS_COLORS.warden,
    role: "Healer",
    blurb: "Plant a lantern and heal whoever stands in its light. Flare and slow punish enemies who walk into it.",
    hp: 2500,
    speed: 12,
    melee: false,
    auto: { damage: 34, interval: 2.2, range: 30, minRange: 0 },
    resource: { id: "mana", name: "Mana", color: "#4c8fe8", start: 100, max: 100, regen: 6 },
    abilities: [
      spell({
        id: "kindle",
        name: "Kindle",
        short: "Kindle",
        cost: 12,
        cd: 0,
        castTime: 0,
        range: 30,
        marker: 8,
        school: "magic",
        target: "ground",
        blurb: "Aim a circle within 30 yards, then click to place a lantern for 12 sec. Allies inside it are healed every 1.5 sec. Casting it again moves the lantern.",
        effect(source) {
          const spot = source.aimPoint || { x: source.x, y: source.y };
          const beacon = source.auras.find((a) => a.id === "beacon");
          match.lanterns = (match.lanterns || []).filter((l) => l.ownerId !== source.id);
          const lanternH = standSurface(spot.x, spot.y, (typeof spot.h === "number" ? spot.h : source.height) + 0.4);
          match.lanterns.push({
            ownerId: source.id,
            team: source.team,
            x: spot.x,
            y: spot.y,
            h: lanternH == null ? 0 : lanternH,
            life: 12,
            radius: 8,
            tick: 0.6,
            beacon: beacon ? beacon.remaining : 0,
          });
          combat(`${nameOf(source)} plants a lantern.`);
        },
      }),
      spell({
        id: "soothe",
        name: "Soothe",
        short: "Soothe",
        cost: 16,
        cd: 0,
        castTime: 0,
        range: 35,
        school: "magic",
        target: "friend",
        blurb: "Instant heal. Full strength if the ally is inside your lantern, about two-thirds if they are outside.",
        effect(source, target) {
          heal(source, target, standingInLantern(source, target) ? 280 : 186, "Soothe");
        },
      }),
      spell({
        id: "shelter",
        name: "Shelter",
        short: "Sheltr",
        cost: 16,
        cd: 8,
        castTime: 0,
        range: 35,
        school: "magic",
        target: "friend",
        blurb: "Absorbs damage for 12 sec. Larger if the ally is inside your lantern. Dampening reduces the absorb. Magic, so it can be purged.",
        effect(source, target) {
          if (immune(target)) {
            floater(target, "Immune", "#ddd");
            return;
          }
          const raw = standingInLantern(source, target) ? 340 : 220;
          const amount = Math.round(raw * (1 - currentDamp()));
          addAura(target, {
            id: "shelter",
            name: "Shelter",
            short: "Sh",
            type: "buff",
            remaining: 12,
            absorb: amount,
            dispellable: true,
          });
          floater(target, `+${amount}`, "#9fd0ff");
          combat(`${nameOf(source)} shelters ${nameOf(target)} for ${amount}.`);
        },
      }),
      spell({
        id: "hush",
        name: "Hush",
        short: "Hush",
        cost: 14,
        cd: 0,
        castTime: 0,
        range: 35,
        school: "magic",
        target: "friend",
        blurb: "Removes one harmful magic effect from an ally. Dispelling Volatile Curse damages you.",
        extra(_source, target) {
          if (!target) return "No target";
          if (!pickDispel(target, "help")) return "Nothing to dispel";
          return null;
        },
        effect(source, target) {
          dispelHelp(source, target);
        },
      }),
      spell({
        id: "flare",
        name: "Flare",
        short: "Flare",
        cost: 16,
        cd: 24,
        castTime: 0,
        school: "magic",
        target: "self",
        blurb: "Enemies standing in your lantern are feared for 2 sec. Shares fear diminishing returns with Wail and Dread. Stepping into the light reveals a veiled fighter.",
        extra(source) {
          const lantern = lanternOf(source);
          if (!lantern) return "No lantern";
          const hit = foesOf(source).some((f) => dist(f, lantern) <= lanternReach(lantern) && hasLoS(lantern, f));
          if (!hit) return "Nobody in the lantern";
          return null;
        },
        effect(source) {
          const lantern = lanternOf(source);
          if (!lantern) return;
          const reach = lanternReach(lantern);
          for (const foe of foesOf(source)) {
            if (dist(foe, lantern) > reach || !hasLoS(lantern, foe)) continue;
            if (isVeiled(foe)) breakVeil(foe);
            applyControl(source, foe, {
              id: "flare",
              name: "Flare",
              short: "Fear",
              control: "fear",
              dr: "fear",
              duration: 2,
              dispellable: true,
            });
          }
        },
      }),
      spell({
        id: "mend",
        name: "Mend",
        short: "Mend",
        cost: 20,
        cd: 0,
        castTime: 1.5,
        range: 35,
        school: "magic",
        target: "friend",
        blurb: "1.5 sec heal. The reliable cast when an ally cannot reach the lantern. Reduced by dampening and Sundering Blow.",
        effect(source, target) {
          heal(source, target, 360, "Mend");
        },
      }),
      spell({
        id: "snuff",
        name: "Snuff",
        short: "Snuff",
        cost: 10,
        cd: 12,
        castTime: 0,
        school: "magic",
        target: "self",
        blurb: "Enemies in your lantern are slowed by 50% for 4 sec. The light reveals a veiled fighter.",
        extra(source) {
          const lantern = lanternOf(source);
          if (!lantern) return "No lantern";
          const hit = foesOf(source).some((f) => dist(f, lantern) <= lanternReach(lantern) && hasLoS(lantern, f));
          if (!hit) return "Nobody in the lantern";
          return null;
        },
        effect(source) {
          const lantern = lanternOf(source);
          if (!lantern) return;
          const reach = lanternReach(lantern);
          for (const foe of foesOf(source)) {
            if (dist(foe, lantern) > reach || !hasLoS(lantern, foe)) continue;
            if (isVeiled(foe)) breakVeil(foe);
            addAura(foe, {
              id: "snuff",
              name: "Snuff",
              short: "Sn",
              type: "debuff",
              remaining: 4,
              slow: 0.5,
            });
            floater(foe, "Slowed", "#e6d3b0");
          }
          combat(`${nameOf(source)} snuffs the lantern light.`);
        },
      }),
      spell({
        id: "tend",
        name: "Tend",
        short: "Tend",
        cost: 14,
        cd: 6,
        castTime: 0,
        range: 40,
        school: "magic",
        target: "friend",
        blurb: "A strong instant heal, only if that ally is standing in your lantern.",
        extra(source, target) {
          if (!standingInLantern(source, target)) return "Outside the lantern";
          return null;
        },
        effect(source, target) {
          if (!standingInLantern(source, target)) {
            if (source.human) feedback(source, "Outside the lantern");
            return;
          }
          heal(source, target, 320, "Tend");
        },
      }),
      spell({
        id: "wickstep",
        name: "Wickstep",
        short: "Step",
        cost: 8,
        cd: 20,
        castTime: 0,
        school: "magic",
        target: "self",
        blurb: "Teleport to your lantern and clear your roots. Blocked by silence and interrupt lockouts.",
        extra(source) {
          const lantern = lanternOf(source);
          if (!lantern) return "No lantern";
          if (dist(source, lantern) < 2) return "Already there";
          return null;
        },
        effect(source) {
          const lantern = lanternOf(source);
          if (!lantern) return;
          source.x = lantern.x;
          source.y = lantern.y;
          source.height = lantern.h || 0;
          source.vx = 0;
          source.vy = 0;
          source.auras = source.auras.filter((a) => a.control !== "root");
          clampUnit(source);
          combat(`${nameOf(source)} steps to the lantern.`);
        },
      }),
      trinket(),
      spell({
        id: "beacon",
        name: "Beacon",
        short: "Beacon",
        tag: "Signature",
        cost: 0,
        cd: 90,
        castTime: 0,
        school: "magic",
        target: "self",
        blurb: "For 6 sec the lantern doubles in size. If either ally stands in it, both of you are healed by its pulse. 90 sec cooldown.",
        extra(source) {
          if (!lanternOf(source)) return "No lantern";
          return null;
        },
        effect(source) {
          const lantern = lanternOf(source);
          if (!lantern) return;
          lantern.beacon = 6;
          lantern.life = Math.max(lantern.life, 6);
          addAura(source, {
            id: "beacon",
            name: "Beacon",
            short: "Bec",
            type: "buff",
            remaining: 6,
          });
          floater(source, "Beacon", "#fff1b0");
          combat(`${nameOf(source)} flares the lantern into a beacon.`);
        },
      }),
    ],
  },
  binder: {
    name: "Binder",
    color: CLASS_COLORS.binder,
    role: "Ranged caster",
    blurb: "Stack a chain on one enemy, then yank them to you. Sever spends the chain. Bind roots both enemies if they stay together.",
    hp: 2550,
    speed: 12,
    melee: false,
    auto: { damage: 36, interval: 2.2, range: 30, minRange: 0 },
    resource: { id: "mana", name: "Mana", color: "#4c8fe8", start: 100, max: 100, regen: 6 },
    abilities: [
      spell({
        id: "lash",
        name: "Lash",
        short: "Lash",
        cost: 10,
        cd: 0,
        castTime: 0,
        range: 30,
        school: "magic",
        target: "enemy",
        reflectable: true,
        harmful: true,
        blurb: "Instant damage and a chain stack, up to 3. Stacks last 12 sec. Magic, so it can be reflected.",
        effect(source, target) {
          if (tryReflect(source, target, this)) return;
          if (immune(target)) {
            floater(target, "Immune", "#ddd");
            return;
          }
          dealDamage(source, target, 80, { direct: true, school: "magic", name: "Lash" });
          const stacks = addChain(source, target);
          combat(`${nameOf(source)} chains ${nameOf(target)} (${stacks}).`);
        },
      }),
      spell({
        id: "brand",
        name: "Brand",
        short: "Brand",
        cost: 14,
        cd: 0,
        castTime: 0,
        range: 30,
        school: "magic",
        target: "enemy",
        reflectable: true,
        harmful: true,
        blurb: "A bleed for 10 sec. It ticks harder for each chain stack already on the target. Can be dispelled.",
        effect(source, target) {
          if (tryReflect(source, target, this)) return;
          if (immune(target)) {
            floater(target, "Immune", "#ddd");
            return;
          }
          const stacks = chainStacks(source, target);
          const per = 18 + stacks * 14;
          addAura(target, {
            id: "brand",
            name: "Brand",
            short: "Br",
            type: "debuff",
            remaining: 10,
            dispellable: true,
            dot: { damage: per, every: 2, tick: 2, school: "magic", name: "Brand", sourceId: source.id, fx: "#e23d4a" },
          });
          combat(`${nameOf(source)} brands ${nameOf(target)}.`);
        },
      }),
      spell({
        id: "yank",
        name: "Yank",
        short: "Yank",
        cost: 10,
        cd: 20,
        castTime: 0,
        range: 30,
        school: "physical",
        target: "enemy",
        blurb: "Pulls an enemy to you from up to 30 yards and clears their roots. At 3 chain stacks, also stuns them for 1.5 sec. Shares stun diminishing returns with Rush and Blindside.",
        effect(source, target) {
          if (immune(target)) {
            floater(target, "Immune", "#ddd");
            combat(`${nameOf(target)} is immune to Yank.`);
            return;
          }
          const ang = Math.atan2(target.y - source.y, target.x - source.x);
          const travel = clamp(dist(source, target) / 40, 0.18, 0.45);
          cancelCast(target, true);
          target.auras = target.auras.filter((a) => a.control !== "root");
          target.vx = 0;
          target.vy = 0;
          target.vz = 0;
          target.knock = 0;
          target.dash = {
            x: source.x + Math.cos(ang) * 2.3,
            y: source.y + Math.sin(ang) * 2.3,
            t: travel,
            yank: true,
            yankFrom: source.id,
            stun: chainStacks(source, target) >= (source.yankStunAt || 3),
          };
          combat(`${nameOf(source)} yanks ${nameOf(target)}.`);
        },
      }),
      spell({
        id: "sever",
        name: "Sever",
        short: "Sever",
        cost: 14,
        cd: 6,
        castTime: 0,
        range: 30,
        school: "magic",
        target: "enemy",
        reflectable: true,
        harmful: true,
        blurb: "Consumes your chain stacks for a burst. One stack is a poke. Three stacks is the heavy hit.",
        extra(source, target) {
          if (!chainStacks(source, target)) return "No chain";
          return null;
        },
        effect(source, target) {
          if (tryReflect(source, target, this)) return;
          const stacks = chainStacks(source, target);
          target.auras = target.auras.filter((a) => !(a.id === "chain" && a.sourceId === source.id));
          const damage = [0, 100, 180, 300][stacks] || 0;
          if (!damage) return;
          dealDamage(source, target, damage, { direct: true, school: "magic", name: "Sever" });
        },
      }),
      spell({
        id: "silenceLash",
        name: "Silence Lash",
        short: "Silence",
        cost: 10,
        cd: 16,
        castTime: 0,
        gcd: false,
        range: 30,
        school: "magic",
        target: "enemy",
        blurb: "Interrupts a cast and locks cast-time and magic abilities for 4 sec. 16 sec cooldown. Off the global cooldown.",
        extra(_source, target) {
          if (!target?.cast) return "Target isn't casting";
          return null;
        },
        effect(source, target) {
          interruptUnit(source, target, 4);
        },
      }),
      spell({
        id: "hobble",
        name: "Hobble",
        short: "Hobble",
        cost: 8,
        cd: 6,
        castTime: 0,
        range: 30,
        school: "magic",
        target: "enemy",
        reflectable: true,
        harmful: true,
        blurb: "Instant damage and a 50% slow for 6 sec.",
        effect(source, target) {
          if (tryReflect(source, target, this)) return;
          dealDamage(source, target, 30, { direct: true, school: "magic", name: "Hobble" });
          addAura(target, {
            id: "hobble",
            name: "Hobble",
            short: "Sn",
            type: "debuff",
            remaining: 6,
            slow: 0.5,
          });
        },
      }),
      spell({
        id: "reel",
        name: "Reel",
        short: "Reel",
        cost: 8,
        cd: 18,
        gcdTime: 1,
        castTime: 0,
        range: 20,
        minRange: 6,
        marker: 1.5,
        school: "physical",
        target: "ground",
        blurb: "Aim a spot 6–20 yards away and dash there. Stops at the pillar. Clears roots.",
        effect(source) {
          const raw = source.aimPoint || { x: source.x + Math.cos(source.facing) * 12, y: source.y + Math.sin(source.facing) * 12 };
          let dx = raw.x - source.x;
          let dy = raw.y - source.y;
          let d = Math.hypot(dx, dy) || 0.001;
          if (d > 20) {
            dx *= 20 / d;
            dy *= 20 / d;
            d = 20;
          }
          source.auras = source.auras.filter((a) => a.control !== "root");
          blinkMove(source, dx, dy, d);
          combat(`${nameOf(source)} reels across the ground.`);
        },
      }),
      spell({
        id: "barbs",
        name: "Barbs",
        short: "Barbs",
        cost: 12,
        cd: 8,
        castTime: 0,
        range: 30,
        school: "magic",
        target: "enemy",
        reflectable: true,
        harmful: true,
        blurb: "Magic damage and one chain stack, up to 3. Chain stacks make Yank stun and Sever hit harder.",
        effect(source, target) {
          if (tryReflect(source, target, this)) return;
          dealDamage(source, target, 70, { direct: true, school: "magic", name: "Barbs" });
          if (target.hp > 0 && !immune(target)) addChain(source, target);
        },
      }),
      spell({
        id: "bulwark",
        name: "Bulwark",
        short: "Wall",
        cost: 14,
        cd: 25,
        castTime: 0,
        school: "magic",
        target: "self",
        blurb: "A chained ward absorbs damage for 8 sec. Magic, so it can be purged. Dampening reduces the absorb.",
        effect(source) {
          const amount = Math.round(220 * (1 - currentDamp()));
          addAura(source, {
            id: "bulwark",
            name: "Bulwark",
            short: "Bw",
            type: "buff",
            remaining: 8,
            absorb: amount,
            dispellable: true,
          });
          floater(source, "Bulwark", "#e23d4a");
          combat(`${nameOf(source)} raises a Bulwark.`);
        },
      }),
      trinket(),
      spell({
        id: "bind",
        name: "Bind",
        short: "Bind",
        tag: "Signature",
        cost: 0,
        cd: 90,
        castTime: 0,
        school: "magic",
        target: "self",
        blurb: "If both enemies are within 12 yards of each other, roots them for 2 sec. Shares root diminishing returns with Rime. 90 sec cooldown.",
        extra(source) {
          const foes = foesOf(source);
          if (foes.length < 2) return "Need both enemies";
          if (dist(foes[0], foes[1]) > 12) return "Enemies are split";
          return null;
        },
        effect(source) {
          const foes = foesOf(source);
          if (foes.length < 2 || dist(foes[0], foes[1]) > 12) return;
          for (const foe of foes) {
            applyControl(source, foe, {
              id: "bind",
              name: "Bind",
              short: "Root",
              control: "root",
              dr: "root",
              duration: 2,
              dispellable: true,
            });
          }
        },
      }),
    ],
  },
  vow: {
    name: "Vow",
    color: CLASS_COLORS.vow,
    role: "Healer",
    blurb: "Swear an oath so your heals reach your partner too. Link splits the damage between you.",
    hp: 2500,
    speed: 12,
    melee: false,
    auto: { damage: 34, interval: 2.2, range: 30, minRange: 0 },
    resource: { id: "mana", name: "Mana", color: "#4c8fe8", start: 100, max: 100, regen: 6 },
    abilities: [
      spell({
        id: "oath",
        name: "Oath",
        short: "Oath",
        cost: 6,
        cd: 0,
        castTime: 0,
        range: 40,
        school: "magic",
        target: "friend",
        blurb: "Binds an ally. Your direct heals also heal them for half. Lasts until you bind again. If you have yourself targeted, it binds your partner.",
        extra(source, target) {
          if (!oathTarget(source, target)) return "No partner";
          return null;
        },
        effect(source, target) {
          const partner = oathTarget(source, target);
          if (!partner) return;
          addAura(source, {
            id: "oath",
            name: "Oath",
            short: "Oth",
            type: "buff",
            remaining: 1,
            hold: true,
            partnerId: partner.id,
          });
          combat(`${nameOf(source)} swears an oath to ${nameOf(partner)}.`);
        },
      }),
      spell({
        id: "pulse",
        name: "Pulse",
        short: "Pulse",
        cost: 16,
        cd: 0,
        castTime: 0,
        range: 35,
        school: "magic",
        target: "friend",
        blurb: "Instant heal. Your oath copies half of it onto the bound ally. Unity copies the full heal.",
        effect(source, target) {
          healLinked(source, target, 250, "Pulse");
        },
      }),
      spell({
        id: "link",
        name: "Link",
        short: "Link",
        cost: 12,
        cd: 25,
        castTime: 0,
        school: "magic",
        target: "self",
        blurb: "For 8 sec, damage you or your partner takes is split evenly. Can be purged. 25 sec cooldown.",
        extra(source) {
          if (!livingPartner(source)) return "No partner";
          return null;
        },
        effect(source) {
          const partner = livingPartner(source);
          if (!partner) return;
          const spec = (selfId, otherId) => ({
            id: "link",
            name: "Link",
            short: "Lnk",
            type: "buff",
            remaining: 8,
            link: true,
            partnerId: otherId,
            dispellable: true,
          });
          addAura(source, spec(source.id, partner.id));
          addAura(partner, spec(partner.id, source.id));
          floater(source, "Link", "#f2a3c7");
          floater(partner, "Link", "#f2a3c7");
          combat(`${nameOf(source)} links with ${nameOf(partner)}.`);
        },
      }),
      spell({
        id: "unravel",
        name: "Unravel",
        short: "Unravel",
        cost: 14,
        cd: 0,
        castTime: 0,
        range: 35,
        school: "magic",
        target: "friend",
        blurb: "Removes one harmful magic effect from an ally. Dispelling Volatile Curse damages you.",
        extra(_source, target) {
          if (!target) return "No target";
          if (!pickDispel(target, "help")) return "Nothing to dispel";
          return null;
        },
        effect(source, target) {
          dispelHelp(source, target);
        },
      }),
      spell({
        id: "chorus",
        name: "Chorus",
        short: "Chorus",
        cost: 22,
        cd: 0,
        castTime: 1.5,
        range: 35,
        school: "magic",
        target: "friend",
        blurb: "1.5 sec heal. Your oath copies half of it onto the bound ally. Reduced by dampening and Sundering Blow.",
        effect(source, target) {
          healLinked(source, target, 340, "Chorus");
        },
      }),
      spell({
        id: "rebuke",
        name: "Rebuke",
        short: "Rebuke",
        cost: 12,
        cd: 8,
        castTime: 0,
        range: 30,
        school: "magic",
        target: "enemy",
        reflectable: true,
        harmful: true,
        blurb: "Instant magic damage and a 50% slow for 4 sec.",
        effect(source, target) {
          if (tryReflect(source, target, this)) return;
          dealDamage(source, target, 90, { direct: true, school: "magic", name: "Rebuke" });
          addAura(target, {
            id: "rebuke",
            name: "Rebuke",
            short: "Sn",
            type: "debuff",
            remaining: 4,
            slow: 0.5,
          });
        },
      }),
      spell({
        id: "thread",
        name: "Thread",
        short: "Thread",
        cost: 14,
        cd: 0,
        castTime: 0,
        range: 40,
        school: "magic",
        target: "friend",
        blurb: "A heal over time on the target and on your oath partner. Lasts 8 sec. Can be purged.",
        effect(source, target) {
          const partners = [target];
          const bound = oathPartner(source);
          if (bound && bound !== target) partners.push(bound);
          for (const ally of partners) {
            addAura(ally, {
              id: "thread",
              name: "Thread",
              short: "Th",
              type: "buff",
              remaining: 8,
              dispellable: true,
              hot: { heal: 26, every: 2, tick: 2, name: "Thread", sourceId: source.id },
            });
          }
          combat(`${nameOf(source)} threads a mend across the oath.`);
        },
      }),
      spell({
        id: "comfort",
        name: "Comfort",
        short: "Comf",
        cost: 16,
        cd: 8,
        castTime: 0,
        school: "magic",
        target: "self",
        blurb: "Heals you and your oath partner.",
        effect(source) {
          heal(source, source, 160, "Comfort");
          const partner = oathPartner(source);
          if (partner && partner.hp > 0) heal(source, partner, 160, "Comfort");
        },
      }),
      spell({
        id: "exchange",
        name: "Exchange",
        short: "Swap",
        cost: 0,
        cd: 30,
        castTime: 0,
        range: 40,
        school: "magic",
        target: "friend",
        blurb: "Trade places with an ally and clear both of your roots. If you have yourself targeted, it swaps you with your partner.",
        extra(source, target) {
          const partner = target && target !== source ? target : livingPartner(source);
          if (!partner) return "No ally";
          return null;
        },
        effect(source, target) {
          const partner = target && target !== source ? target : livingPartner(source);
          if (!partner) return;
          const spot = { x: source.x, y: source.y, h: source.height || 0 };
          source.x = partner.x;
          source.y = partner.y;
          source.height = partner.height || 0;
          partner.x = spot.x;
          partner.y = spot.y;
          partner.height = spot.h;
          source.vx = source.vy = partner.vx = partner.vy = 0;
          source.auras = source.auras.filter((a) => a.control !== "root");
          partner.auras = partner.auras.filter((a) => a.control !== "root");
          clampUnit(source);
          clampUnit(partner);
          floater(source, "Swap", "#f2a3c7");
          floater(partner, "Swap", "#f2a3c7");
          combat(`${nameOf(source)} exchanges places with ${nameOf(partner)}.`);
        },
      }),
      trinket(),
      spell({
        id: "unity",
        name: "Unity",
        short: "Unity",
        tag: "Signature",
        cost: 0,
        cd: 90,
        castTime: 0,
        school: "magic",
        target: "self",
        blurb: "For 6 sec your oath copies heals in full, and both of you take 30% less damage. The guard can be purged. 90 sec cooldown.",
        effect(source) {
          addAura(source, {
            id: "unity",
            name: "Unity",
            short: "Uni",
            type: "buff",
            remaining: 6,
          });
          for (const friend of friendsOf(source)) {
            addAura(friend, {
              id: "unityGuard",
              name: "Unity",
              short: "Uni",
              type: "buff",
              remaining: 6,
              damageReduce: 0.3,
              dispellable: true,
            });
            floater(friend, "Unity", "#f2a3c7");
          }
          combat(`${nameOf(source)} binds the pair in Unity.`);
        },
      }),
    ],
  },
  duelist: {
    name: "Duelist",
    color: CLASS_COLORS.duelist,
    role: "Melee",
    blurb: "Mark one enemy and fight them. Riposte stuns if they hit you back. Your damage falls off on anyone else.",
    hp: 3150,
    speed: 13,
    melee: true,
    auto: { damage: 74, interval: 2.0, range: 5, minRange: 0 },
    resource: { id: "momentum", name: "Momentum", color: "#8eb0ff", start: 30, max: 100, regen: 4 },
    abilities: [
      spell({
        id: "mark",
        name: "Mark",
        short: "Mark",
        cost: 0,
        cd: 0,
        castTime: 0,
        range: 30,
        school: "physical",
        target: "enemy",
        blurb: "Brands an enemy for 20 sec. You deal more damage to them and less to anyone else. Only one mark at a time.",
        effect(source, target) {
          for (const unit of match.units) {
            unit.auras = unit.auras.filter((a) => !(a.id === "duelMark" && a.sourceId === source.id));
          }
          addAura(target, {
            id: "duelMark",
            name: "Mark",
            short: "Mk",
            type: "debuff",
            remaining: 20,
            sourceId: source.id,
          });
          floater(target, "Marked", "#7f9cff");
          combat(`${nameOf(source)} marks ${nameOf(target)}.`);
        },
      }),
      spell({
        id: "fleche",
        name: "Fleche",
        short: "Fleche",
        cost: 0,
        cd: 0,
        castTime: 0,
        range: 5,
        school: "physical",
        target: "enemy",
        blurb: "A quick melee strike. Builds 20 Momentum if it hits your mark.",
        effect(source, target) {
          dealDamage(source, target, 120, { direct: true, school: "physical", name: "Fleche" });
          if (isDuelMark(source, target) && !immune(target)) gainMomentum(source, 20);
        },
      }),
      spell({
        id: "riposte",
        name: "Riposte",
        short: "Ripost",
        cost: 0,
        cd: 10,
        castTime: 0,
        range: 5,
        school: "physical",
        target: "enemy",
        blurb: "If your mark hit you in the last 3 sec, stuns them for 1.5 sec. Otherwise a normal hit. Shares stun diminishing returns with Rush and Blindside. Builds Momentum on your mark.",
        effect(source, target) {
          const marked = isDuelMark(source, target);
          const answered = marked && source.lastHitId === target.id && match.time - (source.lastHitTime || 0) <= 3;
          dealDamage(source, target, answered ? 160 : 120, { direct: true, school: "physical", name: "Riposte" });
          if (marked && !immune(target)) gainMomentum(source, 15);
          if (answered) {
            applyControl(source, target, {
              id: "riposte",
              name: "Riposte",
              short: "Stun",
              control: "stun",
              dr: "stun",
              duration: 1.5,
              dispellable: false,
            });
          }
        },
      }),
      spell({
        id: "lunge",
        name: "Lunge",
        short: "Lunge",
        cost: 0,
        cd: 15,
        castTime: 0,
        gcd: false,
        range: 20,
        minRange: 8,
        school: "physical",
        target: "enemy",
        blurb: "Dash to your mark from 8–20 yards. No stun. Builds Momentum when you arrive. Clears roots. Off the global cooldown.",
        effect(source, target) {
          const ang = Math.atan2(target.y - source.y, target.x - source.x);
          source.dash = {
            x: target.x - Math.cos(ang) * 2.3,
            y: target.y - Math.sin(ang) * 2.3,
            t: 0.22,
            lunge: true,
            markId: target.id,
            momentum: 15,
          };
          source.vx = 0;
          source.vy = 0;
          source.auras = source.auras.filter((a) => a.control !== "root");
          combat(`${nameOf(source)} lunges at ${nameOf(target)}.`);
        },
      }),
      spell({
        id: "crosscut",
        name: "Crosscut",
        short: "Cross",
        cost: 40,
        cd: 6,
        castTime: 0,
        range: 5,
        school: "physical",
        target: "enemy",
        blurb: "Costs 40 Momentum. A heavy hit on your mark, heavier below 30% health.",
        extra(source, target) {
          if (!isDuelMark(source, target)) return "Not your mark";
          return null;
        },
        effect(source, target) {
          const low = target.hp / target.hpMax <= 0.3;
          dealDamage(source, target, low ? 340 : 210, { direct: true, school: "physical", name: "Crosscut" });
        },
      }),
      spell({
        id: "parry",
        name: "Parry",
        short: "Parry",
        cost: 0,
        cd: 10,
        castTime: 0,
        gcd: false,
        range: 5,
        school: "physical",
        target: "enemy",
        blurb: "Interrupts a cast and locks cast-time and magic abilities for 4 sec. Off the global cooldown.",
        extra(_source, target) {
          if (!target?.cast) return "Target isn't casting";
          return null;
        },
        effect(source, target) {
          interruptUnit(source, target, 4);
        },
      }),
      spell({
        id: "feint",
        name: "Feint",
        short: "Feint",
        cost: 0,
        cd: 18,
        castTime: 0,
        range: 5,
        school: "physical",
        target: "enemy",
        blurb: "Incapacitates an enemy for 3 sec. Breaks on damage. Shares incapacitate diminishing returns with Figment, Eye Jab, Updraft, and Snare Trap.",
        effect(source, target) {
          applyControl(source, target, {
            id: "feint",
            name: "Feint",
            short: "Feint",
            control: "incap",
            dr: "incap",
            duration: 3,
            breakOnDamage: true,
            dispellable: false,
          });
        },
      }),
      spell({
        id: "flourish",
        name: "Flourish",
        short: "Flrsh",
        cost: 40,
        cd: 8,
        castTime: 0,
        range: 5,
        school: "physical",
        target: "enemy",
        blurb: "Spend Momentum for a heavy strike. Hits harder against your marked target.",
        effect(source, target) {
          const marked = isDuelMark(source, target);
          dealDamage(source, target, marked ? 230 : 150, { direct: true, school: "physical", name: "Flourish" });
        },
      }),
      spell({
        id: "tempo",
        name: "Tempo",
        short: "Tempo",
        cost: 20,
        cd: 12,
        castTime: 0,
        school: "physical",
        target: "self",
        blurb: "Spend Momentum to move 50% faster for 5 sec. Physical, so it cannot be purged.",
        effect(source) {
          addAura(source, {
            id: "tempo",
            name: "Tempo",
            short: "Tmp",
            type: "buff",
            remaining: 5,
            speed: 0.5,
          });
          floater(source, "Tempo", "#8eb0ff");
          combat(`${nameOf(source)} finds their tempo.`);
        },
      }),
      trinket(),
      spell({
        id: "isolate",
        name: "Isolate",
        short: "Isolat",
        tag: "Signature",
        cost: 0,
        cd: 90,
        castTime: 0,
        range: 30,
        school: "physical",
        target: "enemy",
        blurb: "For 6 sec your mark takes 20% more damage from you and your partner, and is slowed by 30%. 90 sec cooldown.",
        extra(source, target) {
          if (!isDuelMark(source, target)) return "Not your mark";
          return null;
        },
        effect(source, target) {
          addAura(target, {
            id: "isolate",
            name: "Isolate",
            short: "Iso",
            type: "debuff",
            remaining: 6,
            slow: 0.3,
            sourceTeam: source.team,
            damageAmp: 0.2,
          });
          floater(target, "Isolated", "#7f9cff");
          combat(`${nameOf(source)} isolates ${nameOf(target)}.`);
        },
      }),
    ],
  },
};

for (const cls of Object.values(CLASSES)) {
  let spellKey = 0;
  for (const ability of cls.abilities) {
    if (ability.id === "trinket") ability.key = "t";
    else if (ability.tag === "Signature") ability.key = "f";
    else ability.key = SPELL_KEYS[spellKey++];
    ability.tag = ability.tag || (ability.id === "trinket" ? "Trinket" : "Spell");
  }
}

function opt(id, name, text, apply) {
  return { id, name, text, apply };
}
function row(id, name, choices) {
  return { id, name, choices };
}
function spellOf(unit, id) {
  return unit.abilities.find((a) => a.id === id);
}
function giveCharges(ability, count, recharge) {
  ability.charges = count;
  ability.recharge = recharge == null ? (ability.recharge || ability.cd || 8) : recharge;
  ability.cd = 0;
}
function retouch(ability, fn) {
  const prev = ability.effect;
  ability.effect = function (source, target) {
    prev.call(this, source, target);
    fn(source, target);
  };
}
function stretch(host, id, extra, fields) {
  const aura = host && host.auras && host.auras.find((a) => a.id === id);
  if (!aura) return;
  if (extra) aura.remaining += extra;
  if (fields) Object.assign(aura, fields);
}
function refundCharge(unit, abilityId) {
  const ability = spellOf(unit, abilityId);
  if (!ability || !ability.charges) return;
  const max = ability.charges;
  const cur = unit.charges[abilityId] == null ? max : unit.charges[abilityId];
  if (cur >= max) return;
  unit.charges[abilityId] = cur + 1;
  if (unit.charges[abilityId] >= max) unit.recharge[abilityId] = 0;
}

function hasSlow(target) {
  return !!(target && target.hp > 0 && target.auras.some((a) => a.slow));
}

function hasRoot(target) {
  return !!(target && target.hp > 0 && target.auras.some((a) => a.control === "root"));
}

function clearSlows(unit) {
  if (!unit) return;
  unit.auras = unit.auras.filter((a) => !a.slow);
}

function clearRoots(unit) {
  if (!unit) return;
  unit.auras = unit.auras.filter((a) => a.control !== "root");
}

function procReady(source, key, targetId, seconds) {
  if (!source.talentIcd) source.talentIcd = {};
  const slot = `${key}:${targetId}`;
  const at = source.talentIcd[slot];
  if (at != null && match.time - at < seconds) return false;
  source.talentIcd[slot] = match.time;
  return true;
}

function pressControl(source, target, key, name, control, seconds) {
  if (!target || target.hp <= 0) return;
  if (!procReady(source, key, target.id, 15)) return;
  applyControl(source, target, {
    id: key,
    name,
    short: control === "stun" ? "Stun" : control === "fear" ? "Fear" : control === "silence" ? "Si" : "Root",
    control,
    dr: control,
    duration: seconds || 2,
    dispellable: control !== "stun" && control !== "root",
  });
}

function chainInstant(spell, fn) {
  const prev = spell.instantWhen;
  spell.instantWhen = (unit, on) => !!(prev && prev(unit, on)) || !!fn(unit, on);
}

function grantSpeed(target, seconds, amount) {
  addAura(target, {
    id: "talentSpeed",
    name: "Haste",
    short: "Spd",
    type: "buff",
    remaining: seconds,
    speed: amount,
    dispellable: true,
  });
}

const TALENTS = {
  warrior: [
    row("damage", "Damage", [
      opt("sunderCharges", "Twin Sunder", "Sundering Blow has 2 charges.", (unit) => {
        const spell = spellOf(unit, "mortalStrike");
        giveCharges(spell, 2, 6);
        spell.blurb = "Two charges. A heavy strike that cuts healing received by 50% for 8 sec. Each charge returns after 6 sec.";
      }),
      opt("pressReset", "Press the Wound", "Press has 2 charges. Sundering Blow restores 1 charge of Press.", (unit) => {
        const press = spellOf(unit, "overpower");
        giveCharges(press, 2, 4);
        press.blurb = "Two charges. A quick strike. Each charge returns after 4 sec. Sundering Blow restores one charge.";
        retouch(spellOf(unit, "mortalStrike"), (source) => refundCharge(source, "overpower"));
      }),
      opt("deepFinish", "Early Finish", "Finish can be used below 35% health.", (unit) => {
        const spell = spellOf(unit, "execute");
        spell.extra = function (_source, target) {
          if (!target || target.hp / target.hpMax > 0.35) return "Needs a target below 35%";
          return null;
        };
        spell.blurb = "Only usable below 35% health. A large finisher.";
      }),
    ]),
    row("movement", "Movement", [
      opt("rushClose", "Close the Gap", "Rush works from 5 yards and its cooldown is 12 sec.", (unit) => {
        const spell = spellOf(unit, "charge");
        spell.minRange = 5;
        spell.cd = 12;
        spell.blurb = "Rush an enemy 5–25 yards away, stunning them for 1.5 sec and generating 20 Rage. Clears your roots. Off the global cooldown.";
      }),
      opt("vaultReady", "Second Vault", "Vault's cooldown is 22 sec and it reaches 48 yards.", (unit) => {
        const spell = spellOf(unit, "heroicLeap");
        spell.cd = 22;
        spell.range = 48;
        spell.blurb = "Aim a spot 8–48 yards away and leap there, clearing roots. You arc over walls and the bridge. 22 sec cooldown.";
      }),
      opt("clearPath", "Break Free", "Rush and Vault also clear slows.", (unit) => {
        retouch(spellOf(unit, "charge"), (source) => { source.auras = source.auras.filter((a) => !a.slow); });
        retouch(spellOf(unit, "heroicLeap"), (source) => { source.auras = source.auras.filter((a) => !a.slow); });
      }),
    ]),
    row("utility", "Utility", [
      opt("longBash", "Heavy Bash", "Bash locks cast-time and magic abilities for 6 sec.", (unit) => {
        const spell = spellOf(unit, "pummel");
        spell.effect = function (source, target) { interruptUnit(source, target, 6); };
        spell.blurb = "Interrupts a cast and locks cast-time and magic abilities for 6 sec. Off the global cooldown.";
      }),
      opt("longCripple", "Hobble", "Crippling a target who is already crippled roots them for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "hamstring");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const already = !!(target && target.hp > 0 && target.auras.some((a) => a.id === "hamstring"));
          prev.call(this, source, target);
          if (!already) return;
          if (!source.hobbleAt) source.hobbleAt = {};
          if (source.hobbleAt[target.id] != null && match.time - source.hobbleAt[target.id] < 15) return;
          source.hobbleAt[target.id] = match.time;
          applyControl(source, target, {
            id: "hobbleRoot",
            name: "Hobble",
            short: "Root",
            control: "root",
            dr: "root",
            duration: 2,
            dispellable: false,
          });
        };
        spell.blurb = "Light damage and a 50% slow for 6 sec. Off the global cooldown. If they are already crippled, they are rooted for 2 sec. That root can happen once every 15 sec on each target. The slow is physical and cannot be dispelled.";
      }),
      opt("wideQuake", "Wide Quake", "Quake reaches enemies within 11 yards.", (unit) => {
        const spell = spellOf(unit, "quake");
        spell.radius = 11;
        spell.blurb = "Stuns enemies within 11 yards for 2 sec. Shares stun diminishing returns with Rush and Blindside.";
      }),
    ]),
    row("defense", "Defense", [
      opt("thickBrace", "Iron Brace", "Brace reduces damage by 40% for 5 sec.", (unit) => {
        retouch(spellOf(unit, "brace"), (source) => stretch(source, "brace", 1, { damageReduce: 0.4 }));
      }),
      opt("longWard", "Held Mirror", "Mirror Ward lasts 8 sec.", (unit) => {
        retouch(spellOf(unit, "spellReflection"), (source) => stretch(source, "spellReflection", 3));
      }),
      opt("cheapBrace", "Last Brace", "Brace costs no Rage below 40% health.", (unit) => {
        const spell = spellOf(unit, "brace");
        spell.costOf = (caster) => (caster.hp / caster.hpMax < 0.4 ? 0 : spell.cost);
        spell.blurb = "Harden for 4 sec, taking 30% less damage. Costs no Rage below 40% health. Physical, so it cannot be purged.";
      }),
    ]),
    row("pressure", "Pressure", [
      opt("deepSunder", "Deep Cut", "Sundered lasts 12 sec.", (unit) => {
        retouch(spellOf(unit, "mortalStrike"), (_source, target) => stretch(target, "mortalWounds", 4));
      }),
      opt("quakeLock", "Aftershock", "Quake stuns for 3 sec.", (unit) => {
        const spell = spellOf(unit, "quake");
        spell.stunTime = 3;
        spell.blurb = `Stuns enemies within ${spell.radius || 8} yards for 3 sec. Shares stun diminishing returns with Rush and Blindside.`;
      }),
      opt("heavyHands", "Battle Rhythm", "Auto attacks generate 18 Rage.", (unit) => { unit.rageOnSwing = 18; }),
    ]),
  ],
  mage: [
    row("damage", "Damage", [
      opt("bitterChill", "Deep Freeze", "Chill Spike roots a target who is already slowed for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "frostbolt");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const primed = hasSlow(target);
          prev.call(this, source, target);
          if (primed) pressControl(source, target, "deepFreeze", "Deep Freeze", "root");
        };
        spell.blurb = "2 sec cast. Damage and a slow. If they are already slowed, they are rooted for 2 sec. That root can happen once every 15 sec on each target.";
      }),
      opt("quickSear", "Heat Bank", "Ember Burst has 2 charges. Sear restores one charge.", (unit) => {
        const burst = spellOf(unit, "fireBlast");
        giveCharges(burst, 2, 8);
        burst.blurb = "Two charges. Instant fire damage. Each charge returns after 8 sec. Sear restores one charge. Usable while moving.";
        const sear = spellOf(unit, "scorch");
        const prev = sear.effect;
        sear.effect = function (source, target) {
          prev.call(this, source, target);
          refundCharge(source, "fireBlast");
        };
      }),
      opt("earlyInferno", "Kindling", "Inferno is instant at 2 Wildfire stacks.", (unit) => {
        unit.hotNeed = 2;
        spellOf(unit, "scorch").blurb = "1.5 sec cast while moving. Fire damage and a Wildfire stack for 15 sec. At 2 stacks, Inferno is instant.";
        spellOf(unit, "pyroblast").blurb = "2.5 sec cast. Heavy fire damage. Instant after 2 Wildfire stacks, which this spends.";
      }),
    ]),
    row("movement", "Movement", [
      opt("longShift", "Winter Step", "Shift roots enemies within 8 yards of the spot you left.", (unit) => {
        const spell = spellOf(unit, "blink");
        const prev = spell.effect;
        spell.effect = function (source) {
          const spot = { x: source.x, y: source.y, height: source.height, team: source.team };
          prev.call(this, source);
          for (const foe of unitsInRadius(spot, 8, (u) => u.team !== source.team && u.hp > 0)) {
            applyControl(source, foe, { id: "winterStep", name: "Winter Step", short: "Root", control: "root", dr: "root", duration: 2, dispellable: true });
          }
        };
        spell.blurb = "Teleport forward. Clears roots and slows. Enemies within 8 yards of where you left are rooted for 2 sec.";
      }),
      opt("quickShift", "Twin Shift", "Shift has 2 charges.", (unit) => {
        const spell = spellOf(unit, "blink");
        giveCharges(spell, 2, 15);
        spell.blurb = "Two charges. Teleport forward 14 yards. Clears roots and slows. Each charge returns after 15 sec.";
      }),
      opt("wideRime", "Shatter Rime", "Rime stuns enemies who are already slowed for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "frostNova");
        const prev = spell.effect;
        spell.effect = function (source) {
          const radius = spell.radius || 8;
          const primed = foesOf(source).filter((foe) => hasSlow(foe) && dist(source, foe) <= radius && hasLoS(source, foe));
          prev.call(this, source);
          for (const foe of primed) pressControl(source, foe, "shatterRime", "Rime", "stun");
        };
        spell.blurb = "Roots nearby enemies. Enemies who were already slowed are also stunned for 2 sec, once every 15 sec on each target.";
      }),
    ]),
    row("utility", "Utility", [
      opt("longQuell", "Quell Heat", "Ember Burst has 2 charges. A successful Quell restores one.", (unit) => {
        const burst = spellOf(unit, "fireBlast");
        giveCharges(burst, 2, 8);
        const spell = spellOf(unit, "counterspell");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const casting = !!(target && target.cast);
          prev.call(this, source, target);
          if (casting) refundCharge(source, "fireBlast");
        };
      }),
      opt("longFigment", "Brittle Image", "Figment is instant against a slowed target.", (unit) => {
        const spell = spellOf(unit, "polymorph");
        spell.instantOnSlow = true;
        spell.blurb = "1.5 sec cast, instant if the target is slowed. Turns them into a harmless figment for up to 5 sec. Breaks on damage.";
      }),
      opt("burstCharges", "Cold Inferno", "Inferno is instant against a slowed target.", (unit) => {
        const spell = spellOf(unit, "pyroblast");
        spell.instantOnSlow = true;
        spell.blurb = "2.5 sec cast. Instant after Wildfire, and also instant against a slowed target. Heavy fire damage.";
      }),
    ]),
    row("defense", "Defense", [
      opt("thickWard", "Ward Chill", "Ember Ward slows enemies within 8 yards when you cast it.", (unit) => {
        retouch(spellOf(unit, "emberWard"), (source) => {
          for (const foe of unitsInRadius(source, 8, (u) => u.team !== source.team && u.hp > 0)) {
            addAura(foe, { id: "wardChill", name: "Ward Chill", short: "Sn", type: "debuff", remaining: 4, slow: 0.5, dispellable: true });
          }
        });
      }),
      opt("deepGlacier", "Through Silence", "Glacier can be used while silenced or school-locked.", (unit) => {
        const spell = spellOf(unit, "iceBlock");
        spell.ignoreLock = true;
        spell.blurb = "You become immune. Usable while silenced or school-locked. You cannot act while it holds.";
      }),
      opt("readyWard", "Ward Step", "Shift has 2 charges. Ember Ward restores one.", (unit) => {
        const shift = spellOf(unit, "blink");
        giveCharges(shift, 2, 15);
        retouch(spellOf(unit, "emberWard"), (source) => refundCharge(source, "blink"));
      }),
    ]),
    row("pressure", "Pressure", [
      opt("punishChill", "Rime Fear", "Rime fears enemies who are already rooted for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "frostNova");
        const prev = spell.effect;
        spell.effect = function (source) {
          const radius = spell.radius || 8;
          const primed = foesOf(source).filter((foe) => hasRoot(foe) && dist(source, foe) <= radius);
          prev.call(this, source);
          for (const foe of primed) pressControl(source, foe, "rimeFear", "Rime", "fear");
        };
      }),
      opt("quickQuell", "Quell Slow", "Quell also applies a 50% slow for 4 sec.", (unit) => {
        retouch(spellOf(unit, "counterspell"), (source, target) => {
          if (!target || target.hp <= 0) return;
          addAura(target, { id: "quellSlow", name: "Quell", short: "Sn", type: "debuff", remaining: 4, slow: 0.5, dispellable: true });
        });
      }),
      opt("rimeChill", "Banked Sear", "Sear has 2 charges. Chill Spike restores one.", (unit) => {
        const sear = spellOf(unit, "scorch");
        giveCharges(sear, 2, 6);
        sear.blurb = "Two charges. 1.5 sec cast while moving. Chill Spike restores one charge.";
        const bolt = spellOf(unit, "frostbolt");
        const prev = bolt.effect;
        bolt.effect = function (source, target) {
          prev.call(this, source, target);
          refundCharge(source, "scorch");
        };
      }),
    ]),
  ],
  hunter: [
    row("damage", "Damage", [
      opt("heavyAim", "Open Shot", "Longshot is instant if the target is slowed or rooted.", (unit) => {
        const spell = spellOf(unit, "aimedShot");
        spell.instantOnSlow = true;
        spell.instantOnRoot = true;
        spell.blurb = "2.1 sec cast while moving, instant if the target is slowed or rooted. Heavy damage.";
      }),
      opt("twinDaze", "Twin Daze", "Dazing Shot has 2 charges.", (unit) => {
        const spell = spellOf(unit, "concussiveShot");
        giveCharges(spell, 2, 6);
        spell.blurb = "Two charges. Instant shot that slows by 50% for 5 sec. Each charge returns after 6 sec. Dead zone inside 8 yards.";
      }),
      opt("openFinish", "Any Finish", "Finish Shot can be used at any health.", (unit) => {
        const spell = spellOf(unit, "finishShot");
        spell.extra = function () { return null; };
        spell.blurb = "Instant heavy shot. Usable at any health. Dead zone inside 8 yards.";
      }),
    ]),
    row("movement", "Movement", [
      opt("quickBack", "Trap Step", "Backstep drops a Snare Trap where you were standing.", (unit) => {
        const spell = spellOf(unit, "disengage");
        const prev = spell.effect;
        spell.effect = function (source) {
          const old = { x: source.x, y: source.y, h: source.height || 0 };
          prev.call(this, source);
          match.traps = match.traps.filter((t) => t.ownerId !== source.id);
          match.traps.push({
            ownerId: source.id, team: source.team, x: old.x, y: old.y, h: old.h,
            arm: 0.7, life: 25, radius: 3, silence: !!source.trapSilence,
          });
        };
        spell.blurb = "Shoves you backward and leaves a Snare Trap where you were. Clears roots.";
      }),
      opt("clearBack", "Slip Away", "Backstep also clears slows.", (unit) => {
        retouch(spellOf(unit, "disengage"), (source) => clearSlows(source));
      }),
      opt("closePin", "Point Blank", "Pin can be used inside the dead zone.", (unit) => {
        const spell = spellOf(unit, "pin");
        spell.minRange = 0;
        spell.blurb = "A pinning shot roots the target for up to 3 sec. Root diminishing returns. Physical, so it cannot be dispelled. Works at any range up to 35 yards.";
      }),
    ]),
    row("utility", "Utility", [
      opt("longQuiet", "Quiet Root", "Quiet Shot roots a target who is already slowed for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "silencingShot");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const primed = hasSlow(target);
          prev.call(this, source, target);
          if (primed) pressControl(source, target, "quietRoot", "Quiet Shot", "root");
        };
      }),
      opt("longPin", "Pin Down", "Pinning a target who is already rooted stuns them for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "pin");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const primed = hasRoot(target);
          prev.call(this, source, target);
          if (primed) pressControl(source, target, "pinStun", "Pin", "stun");
        };
      }),
      opt("readyTrap", "Gag Trap", "Your Snare Trap also silences the victim for 3 sec.", (unit) => {
        unit.trapSilence = true;
        retouch(spellOf(unit, "freezingTrap"), (source) => {
          const trap = [...match.traps].reverse().find((t) => t.ownerId === source.id);
          if (trap) trap.silence = true;
        });
      }),
    ]),
    row("defense", "Defense", [
      opt("longDeflect", "Slip Deflect", "Deflect also clears roots and slows.", (unit) => {
        retouch(spellOf(unit, "deterrence"), (source) => { clearRoots(source); clearSlows(source); });
      }),
      opt("readyPlay", "Drop and Slip", "Play Dead also clears roots and slows.", (unit) => {
        retouch(spellOf(unit, "feignDeath"), (source) => { clearRoots(source); clearSlows(source); });
      }),
      opt("cheapBack", "Deflect Rush", "Deflect also grants 50% movement speed for 4 sec.", (unit) => {
        retouch(spellOf(unit, "deterrence"), (source) => grantSpeed(source, 4, 0.5));
      }),
    ]),
    row("pressure", "Pressure", [
      opt("longDaze", "Daze Lock", "Dazing Shot stuns a rooted target for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "concussiveShot");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const primed = hasRoot(target);
          prev.call(this, source, target);
          if (primed) pressControl(source, target, "dazeStun", "Dazing Shot", "stun");
        };
      }),
      opt("ankleLong", "Hobble Cut", "Ankle Cutting a target who is already cut roots them for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "wingClip");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const already = !!(target && target.auras.some((a) => a.id === "wingClip"));
          prev.call(this, source, target);
          if (already) pressControl(source, target, "ankleRoot", "Ankle Cut", "root");
        };
      }),
      opt("finishReady", "Follow Through", "Finish Shot resets Pin.", (unit) => {
        retouch(spellOf(unit, "finishShot"), (source) => { source.cd.pin = 0; });
      }),
    ]),
  ],
  priest: [
    row("damage", "Damage", [
      opt("quickSalve", "Crisis Salve", "Salve is instant on a target at or below 35% health.", (unit) => {
        const spell = spellOf(unit, "flashHeal");
        spell.instantLow = 0.35;
        spell.blurb = "1.5 sec heal, instant at or below 35% health. If an enemy is targeted, it heals you.";
      }),
      opt("longAche", "Second Ache", "Aching a target who already has it silences them for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "shadowWordPain");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const already = !!(target && target.auras.some((a) => a.id === "swp"));
          prev.call(this, source, target);
          if (already && target && procReady(source, "acheSilence", target.id, 15)) silenceUnit(source, target, 2);
        };
      }),
      opt("spikeCharges", "Banked Spike", "Thought Spike has 2 charges. Aegis restores one.", (unit) => {
        const spike = spellOf(unit, "mindBlast");
        giveCharges(spike, 2, 8);
        spike.blurb = "Two charges. Aegis restores one charge.";
        retouch(spellOf(unit, "powerWordShield"), (source) => refundCharge(source, "mindBlast"));
      }),
    ]),
    row("movement", "Movement", [
      opt("longSpeed", "Unstoppable", "Speed Blessing also clears roots and slows.", (unit) => {
        retouch(spellOf(unit, "speedBlessing"), (_source, target) => { clearRoots(target); clearSlows(target); });
      }),
      opt("extraSpeed", "Shared Speed", "Speed Blessing on an ally also speeds you.", (unit) => {
        retouch(spellOf(unit, "speedBlessing"), (source, target) => {
          if (!target || target === source) return;
          addAura(source, { id: "speedBlessing", name: "Speed Blessing", short: "Spd", type: "buff", remaining: 8, speed: 0.5, dispellable: true });
        });
      }),
      opt("quickWail", "Wail Lock", "Wail stuns enemies who are already slowed for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "psychicScream");
        const prev = spell.effect;
        spell.effect = function (source) {
          const primed = foesOf(source).filter((foe) => hasSlow(foe) && dist(source, foe) <= 8);
          prev.call(this, source);
          for (const foe of primed) pressControl(source, foe, "wailStun", "Wail", "stun");
        };
      }),
    ]),
    row("utility", "Utility", [
      opt("quickCleanse", "Cleanse Step", "A Cleanse that removes a control also grants 50% speed for 4 sec.", (unit) => {
        const spell = spellOf(unit, "dispelMagic");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const aura = target && pickDispel(target, "help");
          const control = aura && aura.control;
          prev.call(this, source, target);
          if (control) grantSpeed(target, 4, 0.5);
        };
      }),
      opt("openAegis", "Open Aegis", "Aegis does not apply Spent Soul.", (unit) => {
        const spell = spellOf(unit, "powerWordShield");
        spell.extra = function (_source, target) {
          if (!target) return "No target";
          if (hasAura(target, "powerWordShield")) return "Already shielded";
          return null;
        };
        const prev = spell.effect;
        spell.effect = function (source, target) {
          prev.call(this, source, target);
          if (target) target.auras = target.auras.filter((a) => a.id !== "weakenedSoul");
        };
        spell.blurb = "Absorbs damage for 15 sec. Does not leave Spent Soul. The shield is magic and can be purged.";
      }),
      opt("longBless", "Blessed Salve", "Salve is instant on an ally with Blessing.", (unit) => {
        chainInstant(spellOf(unit, "flashHeal"), (_unit, on) => !!(on && on.auras.some((a) => a.id === "blessing")));
      }),
    ]),
    row("defense", "Defense", [
      opt("readyPlea", "Plea Cleanse", "Last Plea also removes a harmful magic effect from you.", (unit) => {
        retouch(spellOf(unit, "desperatePrayer"), (source) => dispelHelp(source, source));
      }),
      opt("quickLitany", "Crisis Litany", "Litany is instant on a target at or below 40% health.", (unit) => {
        const spell = spellOf(unit, "penance");
        spell.instantLow = 0.4;
        spell.blurb = "2 sec channel, instant at or below 40% health. Three bolts. Heals an ally or damages an enemy.";
      }),
      opt("thickAegis", "Burst Aegis", "When Aegis breaks, that ally gains 50% speed for 3 sec.", (unit) => {
        retouch(spellOf(unit, "powerWordShield"), (_source, target) => {
          const aura = target && target.auras.find((a) => a.id === "powerWordShield");
          if (aura) aura.breakSpeed = 0.5;
        });
      }),
    ]),
    row("pressure", "Pressure", [
      opt("longWail", "Wail Slow", "Wail also slows enemies by 50% for 4 sec.", (unit) => {
        retouch(spellOf(unit, "psychicScream"), (source) => {
          for (const foe of foesOf(source)) {
            if (dist(source, foe) > 8 || foe.hp <= 0) continue;
            addAura(foe, { id: "wailSlow", name: "Wail", short: "Sn", type: "debuff", remaining: 4, slow: 0.5, dispellable: true });
          }
        });
      }),
      opt("cheapSpike", "Execute Spike", "Thought Spike is instant on a target at or below 30% health.", (unit) => {
        const spell = spellOf(unit, "mindBlast");
        spell.instantLow = 0.3;
      }),
      opt("salveBloom", "Shielded Salve", "Salve is instant on an ally who has Aegis.", (unit) => {
        chainInstant(spellOf(unit, "flashHeal"), (_unit, on) => !!(on && on.auras.some((a) => a.id === "powerWordShield")));
      }),
    ]),
  ],
  warlock: [
    row("damage", "Damage", [
      opt("quickGloom", "Cursed Bolt", "Gloom Bolt is instant if the target has Rot, Torment, and Volatile Curse.", (unit) => {
        const spell = spellOf(unit, "shadowBolt");
        spell.instantOnCurses = true;
        spell.blurb = "2 sec cast, instant if the target has Rot, Torment, and Volatile Curse.";
      }),
      opt("longRot", "Rot Fear", "Rotting a target who already has Rot fears them for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "corruption");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const already = !!(target && target.auras.some((a) => a.id === "corruption"));
          prev.call(this, source, target);
          if (already) pressControl(source, target, "rotFear", "Rot", "fear");
        };
      }),
      opt("harshTorment", "Wither Silence", "Wither silences a target who has Rot for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "wither");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const rot = !!(target && target.auras.some((a) => a.id === "corruption"));
          prev.call(this, source, target);
          if (rot && target && procReady(source, "witherSilence", target.id, 15)) silenceUnit(source, target, 2);
        };
      }),
    ]),
    row("movement", "Movement", [
      opt("longSiphon", "Moving Siphon", "Siphon can be channeled while moving.", (unit) => {
        const spell = spellOf(unit, "drainLife");
        spell.moveCast = true;
        spell.blurb = "Channel while moving. Pulses damage and heals you for part of it.";
      }),
      opt("quickDread", "Dread on the Slow", "Dread is instant against a slowed target.", (unit) => {
        const spell = spellOf(unit, "fear");
        spell.instantOnSlow = true;
        spell.blurb = "1.5 sec cast, instant if the target is slowed. Fears the target.";
      }),
      opt("readyLock", "Lock Slow", "Hex Lock also applies a 50% slow for 4 sec.", (unit) => {
        retouch(spellOf(unit, "spellLock"), (source, target) => {
          if (!target || target.hp <= 0) return;
          addAura(target, { id: "lockSlow", name: "Hex Lock", short: "Sn", type: "debuff", remaining: 4, slow: 0.5, dispellable: true });
        });
      }),
    ]),
    row("utility", "Utility", [
      opt("longLock", "Lock Root", "Hex Lock roots a target who is already slowed for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "spellLock");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const primed = hasSlow(target);
          prev.call(this, source, target);
          if (primed) pressControl(source, target, "lockRoot", "Hex Lock", "root");
        };
      }),
      opt("readyWither", "Wither Root", "Wither roots a target who is already slowed for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "wither");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const primed = hasSlow(target);
          prev.call(this, source, target);
          if (primed) pressControl(source, target, "witherRoot", "Wither", "root");
        };
      }),
      opt("longDread", "Dread Lock", "Dreading a target who is already feared stuns them for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "fear");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const primed = !!(target && target.auras.some((a) => a.control === "fear"));
          prev.call(this, source, target);
          if (primed) pressControl(source, target, "dreadStun", "Dread", "stun");
        };
      }),
    ]),
    row("defense", "Defense", [
      opt("thickShell", "Shell Chill", "Umbral Shell slows enemies within 8 yards when you cast it.", (unit) => {
        retouch(spellOf(unit, "umbralShell"), (source) => {
          for (const foe of unitsInRadius(source, 8, (u) => u.team !== source.team && u.hp > 0)) {
            addAura(foe, { id: "shellSlow", name: "Umbral Shell", short: "Sn", type: "debuff", remaining: 4, slow: 0.5, dispellable: true });
          }
        });
      }),
      opt("readyStone", "Stone Cleanse", "Vita Stone also removes a harmful magic effect from you.", (unit) => {
        retouch(spellOf(unit, "healthstone"), (source) => dispelHelp(source, source));
      }),
      opt("readyShell", "Silent Shell", "Umbral Shell can be used while silenced or school-locked.", (unit) => {
        const spell = spellOf(unit, "umbralShell");
        spell.ignoreLock = true;
        spell.blurb = "A shadow shell absorbs damage. Usable while silenced or school-locked. Magic, so it can be purged.";
      }),
    ]),
    row("pressure", "Pressure", [
      opt("longCurses", "Third Curse", "Landing Rot, Torment, and Volatile Curse together stuns for 2 sec. 15 sec cooldown per target.", (unit) => {
        for (const id of ["corruption", "agony", "unstableAffliction"]) {
          const spell = spellOf(unit, id);
          const prev = spell.effect;
          spell.effect = function (source, target) {
            prev.call(this, source, target);
            if (!target || target.hp <= 0) return;
            const ready = ["corruption", "agony", "unstableAffliction"].every((curse) => target.auras.some((a) => a.id === curse));
            if (ready) pressControl(source, target, "curseStun", "Curses", "stun");
          };
        }
      }),
      opt("longWither", "Cursed Siphon", "Siphon is instant if the target has Rot, Torment, and Volatile Curse.", (unit) => {
        const spell = spellOf(unit, "drainLife");
        spell.instantOnCurses = true;
        spell.blurb = "Channel, instant if the target has Rot, Torment, and Volatile Curse. Pulses damage and heals you.";
      }),
      opt("cheapGloom", "Siphon Root", "Siphon roots a cursed target for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "drainLife");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const cursed = !!(target && target.auras.some((a) => a.id === "corruption" || a.id === "agony" || a.id === "unstableAffliction"));
          prev.call(this, source, target);
          if (cursed) pressControl(source, target, "siphonRoot", "Siphon", "root");
        };
      }),
    ]),
  ],
  druid: [
    row("damage", "Damage", [
      opt("longRenewal", "Second Renewal", "Renewing a target who already has Renewal removes a harmful magic effect. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "rejuvenation");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const already = !!(target && target.auras.some((a) => a.id === "rejuvenation"));
          prev.call(this, source, target);
          if (already && target && procReady(source, "renewDispel", target.id, 15)) dispelHelp(source, target);
        };
      }),
      opt("biggerBurst", "Ready Regrow", "Regrow is instant on an ally who has Renewal.", (unit) => {
        chainInstant(spellOf(unit, "regrowth"), (_unit, on) => !!(on && on.auras.some((a) => a.id === "rejuvenation")));
        spellOf(unit, "regrowth").blurb = "1.5 sec heal, instant if the ally has Renewal.";
      }),
      opt("quickRegrow", "Rooted Thorn", "Thornbolt is instant against a rooted target.", (unit) => {
        const spell = spellOf(unit, "wrath");
        spell.instantOnRoot = true;
        spell.blurb = "1.5 sec cast, instant if the target is rooted. Nature damage when both allies are healthy.";
      }),
    ]),
    row("movement", "Movement", [
      opt("readyRoot", "Thicket Lock", "Thicketing a target who is already rooted stuns them for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "thicket");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const primed = hasRoot(target);
          prev.call(this, source, target);
          if (primed) pressControl(source, target, "thicketStun", "Thicket", "stun");
        };
      }),
      opt("quickUp", "Rooted Updraft", "Updraft is instant against a rooted target.", (unit) => {
        const spell = spellOf(unit, "cyclone");
        spell.instantOnRoot = true;
        spell.blurb = "1.5 sec cast, instant if the target is rooted. Lifts them into an incapacitating wind.";
      }),
      opt("readyCanopy", "Canopy Step", "Canopy also grants 30% movement speed for 4 sec.", (unit) => {
        retouch(spellOf(unit, "wildGrowth"), (source) => {
          for (const friend of friendsOf(source)) {
            if (friend.auras.some((a) => a.id === "wildGrowth")) grantSpeed(friend, 4, 0.3);
          }
        });
      }),
    ]),
    row("utility", "Utility", [
      opt("quickClear", "Clear Step", "Clearbloom grants 50% speed for 4 sec if it removed a control.", (unit) => {
        const spell = spellOf(unit, "clearbloom");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const aura = target && pickDispel(target, "help");
          const control = aura && aura.control;
          prev.call(this, source, target);
          if (control) grantSpeed(target, 4, 0.5);
        };
      }),
      opt("longRoot", "Moving Updraft", "Updraft can be cast while moving.", (unit) => {
        const spell = spellOf(unit, "cyclone");
        spell.moveCast = true;
      }),
      opt("longUp", "Updraft Root", "Updraft roots a target who is already slowed for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "cyclone");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const primed = hasSlow(target);
          prev.call(this, source, target);
          if (primed) pressControl(source, target, "updraftRoot", "Updraft", "root");
        };
      }),
    ]),
    row("defense", "Defense", [
      opt("readyBark", "Bark Cleanse", "Heartwood also removes a harmful magic effect.", (unit) => {
        retouch(spellOf(unit, "ironbark"), (source, target) => { if (target) dispelHelp(source, target); });
      }),
      opt("longBark", "Barked Regrow", "Regrow is instant on an ally with Heartwood.", (unit) => {
        chainInstant(spellOf(unit, "regrowth"), (_unit, on) => !!(on && on.auras.some((a) => a.id === "ironbark")));
      }),
      opt("canopyHeal", "Crisis Canopy", "Canopy also heals an ally below 50% health for 160.", (unit) => {
        retouch(spellOf(unit, "wildGrowth"), (source) => {
          for (const friend of friendsOf(source)) {
            if (friend.hp / friend.hpMax <= 0.5 && friend.auras.some((a) => a.id === "wildGrowth")) heal(source, friend, 160, "Canopy");
          }
        });
      }),
    ]),
    row("pressure", "Pressure", [
      opt("burstSeed", "Bloom Again", "Burst Bloom leaves a 6 sec Renewal behind.", (unit) => {
        retouch(spellOf(unit, "swiftmend"), (source, target) => {
          if (!target || target.hp <= 0) return;
          addAura(target, { id: "rejuvenation", name: "Renewal", short: "Rn", type: "buff", remaining: 6, dispellable: true, hot: { heal: 42, every: 2, tick: 2, name: "Renewal", sourceId: source.id } });
        });
      }),
      opt("heavyThorn", "Thorn Root", "Thornbolt roots a target who is already slowed for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "wrath");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const primed = hasSlow(target);
          prev.call(this, source, target);
          if (primed) pressControl(source, target, "thornRoot", "Thornbolt", "root");
        };
      }),
      opt("longCanopy", "Canopy Cleanse", "Canopy removes slows from allies it reaches.", (unit) => {
        retouch(spellOf(unit, "wildGrowth"), (source) => {
          for (const friend of friendsOf(source)) {
            if (friend.auras.some((a) => a.id === "wildGrowth")) clearSlows(friend);
          }
        });
      }),
    ]),
  ],
  rogue: [
    row("damage", "Damage", [
      opt("gutCharges", "Twin Gut", "Gut has 2 charges.", (unit) => {
        const spell = spellOf(unit, "eviscerate");
        giveCharges(spell, 2, 6);
        spell.blurb = "Two charges. A heavier melee strike. Each charge returns after 6 sec.";
      }),
      opt("heavySlice", "Slice the Tendon", "Slice roots a target who has Tendon for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "sinisterStrike");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const primed = !!(target && target.auras.some((a) => a.id === "tendon"));
          prev.call(this, source, target);
          if (primed) pressControl(source, target, "sliceRoot", "Slice", "root");
        };
      }),
      opt("longTendon", "Second Tendon", "Tendon on a target who already has it roots them for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "tendon");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const already = !!(target && target.auras.some((a) => a.id === "tendon"));
          prev.call(this, source, target);
          if (already) pressControl(source, target, "tendonRoot", "Tendon", "root");
        };
      }),
    ]),
    row("movement", "Movement", [
      opt("farStep", "Long Step", "Step reaches 28 yards.", (unit) => {
        const spell = spellOf(unit, "step");
        spell.range = 28;
        spell.blurb = "Step to an enemy within 28 yards and clear your roots. Does not break the veil.";
      }),
      opt("longBurst", "Burst Free", "Burst also clears roots.", (unit) => {
        retouch(spellOf(unit, "sprint"), (source) => clearRoots(source));
        spellOf(unit, "sprint").blurb = "Move 70% faster for 6 sec and clear roots. Off the global cooldown.";
      }),
      opt("readyBurst", "Clean Step", "Step also clears slows.", (unit) => {
        retouch(spellOf(unit, "step"), (source) => clearSlows(source));
      }),
    ]),
    row("utility", "Utility", [
      opt("longStifle", "Stifle Step", "A successful Stifle resets Step.", (unit) => {
        const spell = spellOf(unit, "kick");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const casting = !!(target && target.cast);
          prev.call(this, source, target);
          if (casting) source.cd.step = 0;
        };
      }),
      opt("longJab", "Held Jab", "Eye Jab on a slowed target does not break when they take damage.", (unit) => {
        const spell = spellOf(unit, "gouge");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const primed = hasSlow(target);
          prev.call(this, source, target);
          if (!primed || !target) return;
          const aura = target.auras.find((a) => a.id === "gouge");
          if (aura) aura.breakOnDamage = false;
        };
      }),
      opt("longBlind", "Open Blind", "Blindside stuns a slowed target for 2 sec even out of the veil. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "cheapShot");
        const prevExtra = spell.extra;
        spell.extra = function (source, target) {
          if (isVeiled(source) || hasSlow(target)) return null;
          return prevExtra ? prevExtra.call(this, source, target) : "Must be veiled";
        };
        const prev = spell.effect;
        spell.effect = function (source, target) {
          if (!isVeiled(source) && hasSlow(target)) {
            pressControl(source, target, "openBlind", "Blindside", "stun", 2);
            return;
          }
          prev.call(this, source, target);
        };
        spell.blurb = "From the veil, stuns for 4 sec. Against a slowed target, stuns for 2 sec once every 15 sec even out of the veil.";
      }),
    ]),
    row("defense", "Defense", [
      opt("longFade", "Fade Burst", "Fade also grants Burst's movement speed for 4 sec.", (unit) => {
        retouch(spellOf(unit, "vanish"), (source) => {
          addAura(source, { id: "sprint", name: "Burst", short: "Sp", type: "buff", remaining: 4, speed: 0.7 });
        });
      }),
      opt("quickVeil", "Quiet Hands", "Slice and Tendon do not break your veil.", (unit) => {
        for (const id of ["sinisterStrike", "tendon"]) {
          const spell = spellOf(unit, id);
          const prev = spell.effect;
          spell.effect = function (source, target) {
            source.veilSafe = true;
            try { prev.call(this, source, target); }
            finally { source.veilSafe = false; }
          };
        }
      }),
      opt("longVeil", "Quiet Jab", "Eye Jab does not break your veil.", (unit) => {
        const spell = spellOf(unit, "gouge");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          source.veilSafe = true;
          try { prev.call(this, source, target); }
          finally { source.veilSafe = false; }
        };
      }),
    ]),
    row("pressure", "Pressure", [
      opt("cheapSlice", "Tendon Gut", "Gut against a target with Tendon restores 40 Energy.", (unit) => {
        const spell = spellOf(unit, "eviscerate");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const primed = !!(target && target.auras.some((a) => a.id === "tendon"));
          prev.call(this, source, target);
          if (primed) source.resource = Math.min(100, source.resource + 40);
        };
      }),
      opt("cheapGut", "Fed Gut", "Gut has 2 charges. Slice restores one.", (unit) => {
        const gut = spellOf(unit, "eviscerate");
        giveCharges(gut, 2, 6);
        const slice = spellOf(unit, "sinisterStrike");
        const prev = slice.effect;
        slice.effect = function (source, target) {
          prev.call(this, source, target);
          refundCharge(source, "eviscerate");
        };
      }),
      opt("cheapJab", "Stifle Gut", "Gut has 2 charges. A successful Stifle restores one.", (unit) => {
        const gut = spellOf(unit, "eviscerate");
        giveCharges(gut, 2, 6);
        const spell = spellOf(unit, "kick");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const casting = !!(target && target.cast);
          prev.call(this, source, target);
          if (casting) refundCharge(source, "eviscerate");
        };
      }),
    ]),
  ],
  warden: [
    row("damage", "Damage", [
      opt("longLantern", "Lantern Mend", "Mend is instant on an ally inside your lantern.", (unit) => {
        const spell = spellOf(unit, "mend");
        spell.instantLantern = true;
        spell.blurb = "1.5 sec heal, instant if the ally is inside your lantern.";
      }),
      opt("strongSoothe", "Soothe Cleanse", "Soothe on an ally inside your lantern also removes a harmful magic effect.", (unit) => {
        const spell = spellOf(unit, "soothe");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          prev.call(this, source, target);
          if (target && standingInLantern(source, target)) dispelHelp(source, target);
        };
      }),
      opt("thickShelter", "Lantern Shelter", "Shelter on an ally inside your lantern also heals them for 100.", (unit) => {
        const spell = spellOf(unit, "shelter");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const inside = !!(target && standingInLantern(source, target));
          prev.call(this, source, target);
          if (inside) heal(source, target, 100, "Shelter");
        };
      }),
    ]),
    row("movement", "Movement", [
      opt("readyStep", "Slip Step", "Wickstep also clears roots and slows.", (unit) => {
        retouch(spellOf(unit, "wickstep"), (source) => { clearRoots(source); clearSlows(source); });
      }),
      opt("farKindle", "Leave the Light", "Wickstep leaves your lantern where you were standing.", (unit) => {
        const spell = spellOf(unit, "wickstep");
        const prev = spell.effect;
        spell.effect = function (source) {
          const old = { x: source.x, y: source.y, h: source.height || 0 };
          prev.call(this, source);
          const lantern = lanternOf(source);
          if (!lantern) return;
          lantern.x = old.x;
          lantern.y = old.y;
          lantern.h = old.h;
        };
      }),
      opt("clearStep", "Reveal Root", "Snuff roots a veiled enemy it reveals for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "snuff");
        const prev = spell.effect;
        spell.effect = function (source) {
          const lantern = lanternOf(source);
          const veiled = lantern ? foesOf(source).filter((foe) => isVeiled(foe) && dist(foe, lantern) <= lanternReach(lantern)) : [];
          prev.call(this, source);
          for (const foe of veiled) pressControl(source, foe, "snuffRoot", "Snuff", "root");
        };
      }),
    ]),
    row("utility", "Utility", [
      opt("wideLantern", "Slow Light", "Enemies inside your lantern are slowed by 30%.", (unit) => {
        retouch(spellOf(unit, "kindle"), (source) => {
          const lantern = lanternOf(source);
          if (lantern) lantern.slowFoes = true;
        });
      }),
      opt("farSoothe", "Flare Root", "Flare roots enemies in the lantern who are already slowed for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "flare");
        const prev = spell.effect;
        spell.effect = function (source) {
          const lantern = lanternOf(source);
          const primed = lantern ? foesOf(source).filter((foe) => hasSlow(foe) && dist(foe, lantern) <= lanternReach(lantern)) : [];
          prev.call(this, source);
          for (const foe of primed) pressControl(source, foe, "flareRoot", "Flare", "root");
        };
      }),
      opt("readyFlare", "Hush Step", "Hush grants 50% speed for 4 sec if it removed a control.", (unit) => {
        const spell = spellOf(unit, "hush");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const aura = target && pickDispel(target, "help");
          const control = aura && aura.control;
          prev.call(this, source, target);
          if (control) grantSpeed(target, 4, 0.5);
        };
      }),
    ]),
    row("defense", "Defense", [
      opt("longShelter", "Burst Shelter", "When Shelter breaks, that ally gains 50% speed for 3 sec.", (unit) => {
        retouch(spellOf(unit, "shelter"), (_source, target) => {
          const aura = target && target.auras.find((a) => a.absorb && a.id === "shelter");
          if (aura) aura.breakSpeed = 0.5;
        });
      }),
      opt("readyShelter", "Personal Light", "The lantern heals you even when you stand outside it.", (unit) => {
        retouch(spellOf(unit, "kindle"), (source) => {
          const lantern = lanternOf(source);
          if (lantern) lantern.healOwner = true;
        });
      }),
      opt("longBeacon", "Silent Shelter", "Shelter can be used while silenced or school-locked.", (unit) => {
        const spell = spellOf(unit, "shelter");
        spell.ignoreLock = true;
      }),
    ]),
    row("pressure", "Pressure", [
      opt("brightLantern", "Low Soothe", "Soothe on an ally at or below 40% health also grants 50% speed for 4 sec.", (unit) => {
        const spell = spellOf(unit, "soothe");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const low = !!(target && target.hp / target.hpMax <= 0.4);
          prev.call(this, source, target);
          if (low) grantSpeed(target, 4, 0.5);
        };
      }),
      opt("farHush", "Lantern Hush", "Hush costs no mana on an ally inside your lantern.", (unit) => {
        const spell = spellOf(unit, "hush");
        spell.costOf = (source) => {
          const on = unitById(source.targetId);
          const ally = on && on.hp > 0 && on.team === source.team ? on : source;
          return standingInLantern(source, ally) ? 0 : (spell.cost || 14);
        };
      }),
      opt("readyMend", "Crisis Mend", "Mend is instant on an ally at or below 35% health.", (unit) => {
        const spell = spellOf(unit, "mend");
        spell.instantLow = 0.35;
        spell.blurb = "1.5 sec heal, instant at or below 35% health.";
      }),
    ]),
  ],
  binder: [
    row("damage", "Damage", [
      opt("doubleLash", "Double Lash", "Lash applies a second chain stack.", (unit) => {
        retouch(spellOf(unit, "lash"), (source, target) => { if (target && target.hp > 0 && !match.reflectLock) addChain(source, target); });
      }),
      opt("longBrand", "Brand Lock", "Brand stuns a target for 2 sec when they reach 3 chain stacks. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "brand");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          prev.call(this, source, target);
          if (target && chainStacks(source, target) >= 3) pressControl(source, target, "brandStun", "Brand", "stun");
        };
      }),
      opt("readyYank", "Early Yank", "Yank stuns at 2 chain stacks.", (unit) => {
        unit.yankStunAt = 2;
        spellOf(unit, "yank").blurb = "Pulls an enemy to you from up to 30 yards and clears their roots. At 2 chain stacks, also stuns them for 1.5 sec.";
      }),
    ]),
    row("movement", "Movement", [
      opt("farYank", "Long Yank", "Yank reaches 40 yards.", (unit) => {
        const spell = spellOf(unit, "yank");
        spell.range = 40;
        spell.blurb = "Pulls an enemy to you from up to 40 yards and clears their roots. At 3 chain stacks, also stuns them for 1.5 sec.";
      }),
      opt("readyReel", "Slip Reel", "Reel also clears roots and slows.", (unit) => {
        retouch(spellOf(unit, "reel"), (source) => { clearRoots(source); clearSlows(source); });
      }),
      opt("longHobble", "Chain Hobble", "Hobble roots a target who has your chain for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "hobble");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const chained = chainStacks(source, target) > 0;
          prev.call(this, source, target);
          if (chained) pressControl(source, target, "chainHobble", "Hobble", "root");
        };
      }),
    ]),
    row("utility", "Utility", [
      opt("longSilence", "Silence Root", "Silence Lash roots a target who has your chain for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "silenceLash");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const chained = chainStacks(source, target) > 0;
          prev.call(this, source, target);
          if (chained) pressControl(source, target, "silenceRoot", "Silence Lash", "root");
        };
      }),
      opt("cheapSever", "Sever Lock", "Sever stuns for 2 sec when it consumes 3 chain stacks.", (unit) => {
        const spell = spellOf(unit, "sever");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const stacks = chainStacks(source, target);
          prev.call(this, source, target);
          if (stacks >= 3) {
            applyControl(source, target, { id: "severStun", name: "Sever", short: "Stun", control: "stun", dr: "stun", duration: 2, dispellable: false });
          }
        };
      }),
      opt("readyBind", "Binding Chains", "Bind also applies a chain stack to each enemy it roots.", (unit) => {
        retouch(spellOf(unit, "bind"), (source) => {
          for (const foe of foesOf(source)) {
            if (foe.auras.some((a) => a.id === "bind")) addChain(source, foe);
          }
        });
      }),
    ]),
    row("defense", "Defense", [
      opt("thickWall", "Burst Wall", "When Bulwark breaks, you gain 50% speed for 3 sec.", (unit) => {
        retouch(spellOf(unit, "bulwark"), (source) => {
          const aura = source.auras.find((a) => a.id === "bulwark");
          if (aura) aura.breakSpeed = 0.5;
        });
      }),
      opt("readyWall", "Silent Wall", "Bulwark can be used while silenced or school-locked.", (unit) => {
        spellOf(unit, "bulwark").ignoreLock = true;
      }),
      opt("sharpBarbs", "Barbs Lock", "Barbs stuns for 2 sec when the target reaches 3 chain stacks. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "barbs");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          prev.call(this, source, target);
          if (target && chainStacks(source, target) >= 3) pressControl(source, target, "barbsStun", "Barbs", "stun");
        };
      }),
    ]),
    row("pressure", "Pressure", [
      opt("longChain", "Yank Reset", "The strike that puts a target at 3 chain stacks resets Yank.", (unit) => {
        for (const id of ["lash", "brand", "barbs"]) {
          const spell = spellOf(unit, id);
          const prev = spell.effect;
          spell.effect = function (source, target) {
            const before = chainStacks(source, target);
            prev.call(this, source, target);
            if (target && before < 3 && chainStacks(source, target) >= 3) source.cd.yank = 0;
          };
        }
      }),
      opt("cheapLash", "Brand Yank", "Brand resets Yank the first time that target reaches 3 stacks.", (unit) => {
        const spell = spellOf(unit, "brand");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const before = chainStacks(source, target);
          prev.call(this, source, target);
          if (target && before < 3 && chainStacks(source, target) >= 3) source.cd.yank = 0;
        };
      }),
      opt("hotBrand", "Second Brand", "Branding a target who already has Brand fears them for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "brand");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const already = !!(target && target.auras.some((a) => a.id === "brand"));
          prev.call(this, source, target);
          if (already) pressControl(source, target, "brandFear", "Brand", "fear");
        };
      }),
    ]),
  ],
  vow: [
    row("damage", "Damage", [
      opt("strongPulse", "Clutch Pulse", "Pulse on an ally at or below 35% health resets Comfort.", (unit) => {
        const spell = spellOf(unit, "pulse");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const low = !!(target && target.hp > 0 && target.hp / target.hpMax <= 0.35);
          prev.call(this, source, target);
          if (low) source.cd.comfort = 0;
        };
      }),
      opt("cheapPulse", "Full Pulse", "Pulse on an ally at or below 35% health is copied in full to your oath partner.", (unit) => {
        const spell = spellOf(unit, "pulse");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const low = !!(target && target.hp > 0 && target.hp / target.hpMax <= 0.35);
          if (low) source.fullOath = true;
          try { prev.call(this, source, target); }
          finally { if (low) source.fullOath = false; }
        };
      }),
      opt("strongComfort", "Comfort Cleanse", "Comfort also removes a harmful magic effect from you and your oath partner.", (unit) => {
        retouch(spellOf(unit, "comfort"), (source) => {
          dispelHelp(source, source);
          const partner = oathPartner(source);
          if (partner) dispelHelp(source, partner);
        });
      }),
    ]),
    row("movement", "Movement", [
      opt("readySwap", "Silent Swap", "Exchange can be used while silenced or school-locked.", (unit) => {
        spellOf(unit, "exchange").ignoreLock = true;
      }),
      opt("readyLink", "Linked Step", "Link also grants you and your oath partner 40% movement speed.", (unit) => {
        retouch(spellOf(unit, "link"), (source) => {
          grantSpeed(source, 8, 0.4);
          const partner = oathPartner(source);
          if (partner) grantSpeed(partner, 8, 0.4);
        });
      }),
      opt("clearSwap", "Clean Swap", "Exchange clears roots and slows on both of you.", (unit) => {
        retouch(spellOf(unit, "exchange"), (source) => {
          clearRoots(source);
          clearSlows(source);
          const partner = oathPartner(source);
          clearRoots(partner);
          clearSlows(partner);
        });
      }),
    ]),
    row("utility", "Utility", [
      opt("longRebuke", "Rebuke Root", "Rebuke roots a target who is already slowed for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "rebuke");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const primed = hasSlow(target);
          prev.call(this, source, target);
          if (primed) pressControl(source, target, "rebukeRoot", "Rebuke", "root");
        };
      }),
      opt("quickChorus", "Crisis Chorus", "Chorus is instant on an ally at or below 40% health.", (unit) => {
        const spell = spellOf(unit, "chorus");
        spell.instantLow = 0.4;
        spell.blurb = "1.5 sec heal, instant at or below 40% health. Your oath copies part of it.";
      }),
      opt("farUnravel", "Unravel Mend", "Unravel on your oath partner also heals them for 140.", (unit) => {
        const spell = spellOf(unit, "unravel");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          prev.call(this, source, target);
          if (target && oathPartner(source) === target) heal(source, target, 140, "Unravel");
        };
      }),
    ]),
    row("defense", "Defense", [
      opt("longLink", "Linked Chorus", "Chorus is instant while Link is active.", (unit) => {
        chainInstant(spellOf(unit, "chorus"), (source) => source.auras.some((a) => a.id === "link"));
      }),
      opt("longUnity", "Unity Chorus", "Chorus is instant during Unity.", (unit) => {
        spellOf(unit, "chorus").instantInUnity = true;
      }),
      opt("cheapComfort", "Last Comfort", "Comfort costs no mana at or below 30% health.", (unit) => {
        const spell = spellOf(unit, "comfort");
        spell.costOf = (source) => (source.hp / source.hpMax <= 0.3 ? 0 : 16);
      }),
    ]),
    row("pressure", "Pressure", [
      opt("pulseSpeed", "Pulse Step", "Pulse also grants 30% movement speed to the target and your oath partner.", (unit) => {
        retouch(spellOf(unit, "pulse"), (source, target) => {
          if (target) grantSpeed(target, 3, 0.3);
          const partner = oathPartner(source);
          if (partner && partner !== target) grantSpeed(partner, 3, 0.3);
        });
      }),
      opt("strongChorus", "Chorus Cleanse", "Chorus removes slows from the ally and your oath partner.", (unit) => {
        retouch(spellOf(unit, "chorus"), (source, target) => {
          clearSlows(target);
          const partner = oathPartner(source);
          if (partner && partner !== target) clearSlows(partner);
        });
      }),
      opt("farExchange", "Swap Link", "Exchange resets Link.", (unit) => {
        retouch(spellOf(unit, "exchange"), (source) => { source.cd.link = 0; });
      }),
    ]),
  ],
  duelist: [
    row("damage", "Damage", [
      opt("longMark", "Second Mark", "Marking your current mark roots them for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "mark");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const already = isDuelMark(source, target);
          prev.call(this, source, target);
          if (already) pressControl(source, target, "markRoot", "Mark", "root");
        };
      }),
      opt("richFleche", "Fleche Reset", "Fleche against your mark resets Riposte.", (unit) => {
        const spell = spellOf(unit, "fleche");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const marked = isDuelMark(source, target);
          prev.call(this, source, target);
          if (marked) source.cd.riposte = 0;
        };
      }),
      opt("readyRiposte", "Open Riposte", "Riposte stuns your mark for 2 sec even if they have not hit you. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "riposte");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const marked = isDuelMark(source, target);
          const answered = marked && source.lastHitId === target.id && match.time - (source.lastHitTime || 0) <= 3;
          prev.call(this, source, target);
          if (marked && !answered) pressControl(source, target, "openRiposte", "Riposte", "stun");
        };
      }),
    ]),
    row("movement", "Movement", [
      opt("farLunge", "Long Lunge", "Lunge reaches from 5 to 28 yards.", (unit) => {
        const spell = spellOf(unit, "lunge");
        spell.range = 28;
        spell.minRange = 5;
        spell.blurb = "Dash to your mark from 5–28 yards. No stun. Builds Momentum when you arrive. Clears roots. Off the global cooldown.";
      }),
      opt("longTempo", "Clean Tempo", "Tempo clears roots and slows.", (unit) => {
        retouch(spellOf(unit, "tempo"), (source) => { clearRoots(source); clearSlows(source); });
      }),
      opt("readyTempo", "Stunning Lunge", "Lunge stuns your mark for 1.5 sec when you arrive.", (unit) => {
        const spell = spellOf(unit, "lunge");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          prev.call(this, source, target);
          if (source.dash && source.dash.lunge && isDuelMark(source, target)) source.dash.stunMark = true;
        };
        spell.blurb = "Dash to your mark. Stuns them for 1.5 sec when you arrive. Builds Momentum. Clears roots. Off the global cooldown.";
      }),
    ]),
    row("utility", "Utility", [
      opt("readyParry", "Parry Stun", "Parry stuns your mark for 1.5 sec if they hit you in the last 3 sec.", (unit) => {
        const spell = spellOf(unit, "parry");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const answered = isDuelMark(source, target) && source.lastHitId === target.id && match.time - (source.lastHitTime || 0) <= 3;
          prev.call(this, source, target);
          if (!answered || !target) return;
          applyControl(source, target, { id: "parryStun", name: "Parry", short: "Stun", control: "stun", dr: "stun", duration: 1.5, dispellable: false });
        };
      }),
      opt("longIsolate", "Isolate Root", "Isolate also roots your mark for 2 sec.", (unit) => {
        retouch(spellOf(unit, "isolate"), (source, target) => {
          applyControl(source, target, { id: "isolateRoot", name: "Isolate", short: "Root", control: "root", dr: "root", duration: 2, dispellable: false });
        });
      }),
      opt("earlyCross", "Early Cross", "Crosscut's heavier hit starts below 45% health.", (unit) => {
        const spell = spellOf(unit, "crosscut");
        spell.effect = function (source, target) {
          const low = target.hp / target.hpMax <= 0.45;
          dealDamage(source, target, low ? 340 : 210, { direct: true, school: "physical", name: "Crosscut" });
        };
        spell.blurb = "Costs 40 Momentum. A heavy hit on your mark, heavier below 45% health.";
      }),
    ]),
    row("defense", "Defense", [
      opt("longFeint", "Long Feint", "Feint reaches 12 yards.", (unit) => {
        const spell = spellOf(unit, "feint");
        spell.range = 12;
        spell.blurb = "Incapacitates an enemy within 12 yards. Breaks on damage.";
      }),
      opt("clearTempo", "Feint Slip", "Feint also clears your roots and slows.", (unit) => {
        retouch(spellOf(unit, "feint"), (source) => { clearRoots(source); clearSlows(source); });
      }),
      opt("readyFeint", "Held Feint", "Feint on your mark does not break when they take damage.", (unit) => {
        const spell = spellOf(unit, "feint");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const marked = isDuelMark(source, target);
          prev.call(this, source, target);
          if (!marked || !target) return;
          const aura = target.auras.find((a) => a.id === "feint");
          if (aura) aura.breakOnDamage = false;
        };
      }),
    ]),
    row("pressure", "Pressure", [
      opt("longRiposte", "Riposte Lunge", "A Riposte stun resets Lunge.", (unit) => {
        const spell = spellOf(unit, "riposte");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const marked = isDuelMark(source, target);
          const answered = marked && source.lastHitId === target.id && match.time - (source.lastHitTime || 0) <= 3;
          prev.call(this, source, target);
          if (answered) source.cd.lunge = 0;
        };
      }),
      opt("cheapCross", "Cross Reset", "Crosscut on a mark below 30% health resets Lunge.", (unit) => {
        const spell = spellOf(unit, "crosscut");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const low = !!(target && target.hp / target.hpMax <= 0.3);
          prev.call(this, source, target);
          if (low) source.cd.lunge = 0;
        };
      }),
      opt("readyFlourish", "Flourish Root", "Flourish roots your mark for 2 sec. 15 sec cooldown per target.", (unit) => {
        const spell = spellOf(unit, "flourish");
        const prev = spell.effect;
        spell.effect = function (source, target) {
          const marked = isDuelMark(source, target);
          prev.call(this, source, target);
          if (marked) pressControl(source, target, "flourishRoot", "Flourish", "root");
        };
      }),
    ]),
  ],
};

let talentPicks = {};

try {
  talentPicks = JSON.parse(localStorage.getItem("arenaTalents") || "{}") || {};
} catch (err) {
  talentPicks = {};
}

function saveTalents() {
  try { localStorage.setItem("arenaTalents", JSON.stringify(talentPicks)); } catch (err) { /* ignore */ }
}

const LEVEL_CAP = 10;
const XP_WIN = 100;
const XP_LOSS = 40;
let classXp = {};

try {
  classXp = JSON.parse(localStorage.getItem("arenaLevels") || "{}") || {};
} catch (err) {
  classXp = {};
}

function xpToNext(level) {
  return 100 + 50 * (level - 1);
}

function levelInfo(classId) {
  let xp = Math.max(0, Number(classXp[classId]) || 0);
  let level = 1;
  while (level < LEVEL_CAP && xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level++;
  }
  const need = level >= LEVEL_CAP ? 0 : xpToNext(level);
  return { level, xp: need ? xp : 0, need };
}

function gearTier(classId) {
  return levelInfo(classId).level >= LEVEL_CAP ? 2 : 1;
}

function addClassXp(classId, amount) {
  const before = levelInfo(classId).level;
  classXp[classId] = (Number(classXp[classId]) || 0) + amount;
  try { localStorage.setItem("arenaLevels", JSON.stringify(classXp)); } catch (err) { /* ignore */ }
  const after = levelInfo(classId);
  return { amount, before, ...after };
}

window.arenaGearTier = gearTier;

function normalizeTalents(classId, picks) {
  const nodes = TALENTS[classId];
  if (!nodes) return [];
  const list = Array.isArray(picks) ? picks : [];
  return nodes.map((node, i) => {
    const id = list[i];
    return node.choices.some((c) => c.id === id) ? id : node.choices[0].id;
  });
}

function rollTalents(classId) {
  const nodes = TALENTS[classId] || [];
  return nodes.map((node) => node.choices[Math.floor(Math.random() * node.choices.length)].id);
}

function picksFor(classId) {
  return normalizeTalents(classId, talentPicks[classId]);
}

function applyTalents(unit, picks) {
  const chosen = normalizeTalents(unit.classId, picks);
  unit.talents = chosen;
  const nodes = TALENTS[unit.classId] || [];
  chosen.forEach((id, i) => {
    const choice = nodes[i] && nodes[i].choices.find((c) => c.id === id);
    if (choice) choice.apply(unit);
  });
}

function setTalent(nodeIndex, choiceId) {
  const nodes = TALENTS[setup.player];
  if (!nodes || !nodes[nodeIndex]) return;
  if (!nodes[nodeIndex].choices.some((c) => c.id === choiceId)) return;
  const next = picksFor(setup.player);
  next[nodeIndex] = choiceId;
  talentPicks[setup.player] = next;
  saveTalents();
  renderLobby();
  if (party && window.ArenaNet && ArenaNet.connected) ArenaNet.partyClass(setup.player, playerName, next);
  if (room && window.ArenaNet && ArenaNet.connected) {
    const mine = (room.slots || []).findIndex((slot) => slot.peerId === ArenaNet.id);
    if (mine >= 0) {
      if (iAmHost()) {
        claimSlot(mine, ArenaNet.id, playerName, setup.player, next, gearTier(setup.player));
        broadcastLobby();
      } else ArenaNet.send({ kind: "claim", slot: mine, classId: setup.player, name: playerName, talents: next, tier: gearTier(setup.player) });
    }
  }
}

const BIND_CODES = {
  Digit1: "1", Digit2: "2", Digit3: "3", Digit4: "4", Digit5: "5", Digit6: "6",
  Numpad1: "1", Numpad2: "2", Numpad3: "3", Numpad4: "4", Numpad5: "5", Numpad6: "6",
  KeyQ: "q", KeyE: "e", KeyR: "r", KeyT: "t", KeyF: "f", KeyG: "g",
  KeyZ: "z", KeyX: "x", KeyC: "c", KeyV: "v", KeyB: "b", KeyY: "y", KeyH: "h",
};
const TARGET_ACTIONS = [
  { id: "target:next", name: "Next enemy", code: "Tab" },
  { id: "target:prev", name: "Previous enemy", code: "" },
  { id: "target:self", name: "Target self", code: "F1" },
  { id: "target:friend", name: "Next ally", code: "F2" },
  { id: "target:enemy1", name: "Enemy 1", code: "" },
  { id: "target:enemy2", name: "Enemy 2", code: "" },
  { id: "target:enemy3", name: "Enemy 3", code: "" },
  { id: "target:ally1", name: "Ally 1", code: "" },
  { id: "target:ally2", name: "Ally 2", code: "" },
];
const LETTER_CODES = {
  "1": "Digit1", "2": "Digit2", "3": "Digit3", "4": "Digit4", "5": "Digit5", "6": "Digit6",
  q: "KeyQ", e: "KeyE", r: "KeyR", t: "KeyT", f: "KeyF", g: "KeyG",
  z: "KeyZ", x: "KeyX", c: "KeyC", v: "KeyV", b: "KeyB", y: "KeyY", h: "KeyH",
};
const MOUSE_LABELS = {
  Mouse0: ["Left click", "LMB"],
  Mouse1: ["Middle click", "MMB"],
  Mouse2: ["Right click", "RMB"],
  Mouse3: ["Mouse 4", "M4"],
  Mouse4: ["Mouse 5", "M5"],
  WheelUp: ["Wheel up", "WU"],
  WheelDown: ["Wheel down", "WD"],
};
let binds = {};
let rebinding = null;
let bindNote = "";
try {
  binds = JSON.parse(localStorage.getItem("arenaBinds") || "{}") || {};
} catch (err) { binds = {}; }

function bindFor(ability) {
  const saved = binds[ability.id];
  return typeof saved === "string" && saved ? saved : ability.key;
}

function targetCode(id) {
  if (Object.prototype.hasOwnProperty.call(binds, id)) return binds[id] || "";
  const action = TARGET_ACTIONS.find((a) => a.id === id);
  return action ? action.code : "";
}

function isMouseBind(token) {
  return typeof token === "string" && (token.startsWith("Mouse") || token.startsWith("Wheel"));
}

function spellTokenFromCode(code) {
  if (BIND_CODES[code]) return BIND_CODES[code];
  if (isMouseBind(code)) return code;
  return "";
}

function codeFromSpellToken(token) {
  if (LETTER_CODES[token]) return LETTER_CODES[token];
  if (isMouseBind(token)) return token;
  return "";
}

function codeLabel(code) {
  if (!code) return "—";
  if (MOUSE_LABELS[code]) return MOUSE_LABELS[code][0];
  if (BIND_CODES[code]) return BIND_CODES[code].toUpperCase();
  return code;
}

function bindLabel(ability, compact) {
  const key = bindFor(ability);
  if (MOUSE_LABELS[key]) return MOUSE_LABELS[key][compact ? 1 : 0];
  return String(key).toUpperCase();
}

function bindPrompt(picked) {
  if (bindNote) return bindNote;
  if (!rebinding) return "Click a row, then press a key, a mouse button, or the scroll wheel. Saved in this browser.";
  const target = TARGET_ACTIONS.find((a) => a.id === rebinding);
  const spell = picked.abilities.find((a) => a.id === rebinding);
  return `Press a key, a mouse button, or the scroll wheel for ${target ? target.name : spell.name}.`;
}

function saveBinds() {
  try { localStorage.setItem("arenaBinds", JSON.stringify(binds)); } catch (err) { /* ignore */ }
}

function setBind(abilityId, key) {
  const list = CLASSES[setup.player].abilities;
  const mine = list.find((a) => a.id === abilityId);
  if (!mine) return;
  const taken = list.find((a) => a.id !== abilityId && bindFor(a) === key);
  if (taken) binds[taken.id] = bindFor(mine);
  const code = codeFromSpellToken(key);
  const otherTarget = TARGET_ACTIONS.find((a) => code && targetCode(a.id) === code);
  if (otherTarget) binds[otherTarget.id] = codeFromSpellToken(bindFor(mine)) || "";
  binds[abilityId] = key;
  saveBinds();
}

function setTargetBind(id, code) {
  const previous = targetCode(id);
  const other = TARGET_ACTIONS.find((a) => a.id !== id && targetCode(a.id) === code);
  if (other) binds[other.id] = previous;
  const letter = spellTokenFromCode(code);
  if (letter) {
    const taken = CLASSES[setup.player].abilities.find((a) => bindFor(a) === letter);
    if (taken) {
      const prevLetter = spellTokenFromCode(previous);
      const prevFree = prevLetter && !CLASSES[setup.player].abilities.some((a) => a !== taken && bindFor(a) === prevLetter);
      if (prevFree) binds[taken.id] = prevLetter;
      else {
        const used = new Set(CLASSES[setup.player].abilities.map((a) => bindFor(a)));
        const next = Object.values(LETTER_CODES).map((c) => BIND_CODES[c]).find((k) => k && k !== letter && !used.has(k));
        if (next) binds[taken.id] = next;
      }
    }
  }
  binds[id] = code;
  saveBinds();
}

function resetBinds() {
  for (const ability of CLASSES[setup.player].abilities) delete binds[ability.id];
  for (const action of TARGET_ACTIONS) delete binds[action.id];
  rebinding = null;
  bindNote = "Keys reset.";
  saveBinds();
}

function targetActionFor(code, shift) {
  if (shift && targetCode("target:next") === code) return "target:prev";
  const hit = TARGET_ACTIONS.find((a) => targetCode(a.id) === code);
  return hit ? hit.id : null;
}

function doTargetAction(id) {
  if (!match || !match.player) return;
  const player = match.player;
  if (id === "target:next") {
    cycleTarget(1);
    return;
  }
  if (id === "target:prev") {
    cycleTarget(-1);
    return;
  }
  if (id === "target:self") {
    if (player.hp > 0) player.targetId = player.id;
    if (match.netRole === "client") sendInput();
    return;
  }
  if (id === "target:friend") {
    cycleFriend();
    return;
  }
  const enemySlot = /^target:enemy(\d)$/.exec(id);
  const allySlot = /^target:ally(\d)$/.exec(id);
  const list = enemySlot
    ? match.units.filter((u) => u.team !== player.team)
    : match.units.filter((u) => u.team === player.team && u !== player);
  const index = Number((enemySlot || allySlot)[1]) - 1;
  const unit = list[index];
  if (!unit || unit.hp <= 0 || (enemySlot && isHidden(unit))) return;
  player.targetId = unit.id;
  if (match.netRole === "client") sendInput();
}

function hotStreakReady(unit) {
  const aura = unit?.auras.find((a) => a.id === "hotStreak");
  return !!(aura && aura.stacks >= (unit.hotNeed || 3));
}

function castTimeOf(unit, ability) {
  if (ability.id === "pyroblast" && hotStreakReady(unit)) return 0;
  const on = castSubject(unit, ability);
  if (ability.instantOnSlow && hasSlow(on)) return 0;
  if (ability.instantOnRoot && hasRoot(on)) return 0;
  if (ability.instantLow && on && on.hp > 0 && on.hp / on.hpMax <= ability.instantLow) return 0;
  if (ability.instantLantern && standingInLantern(unit, on || unit)) return 0;
  if (ability.instantInUnity && unit.auras.some((a) => a.id === "unity")) return 0;
  if (ability.instantOnAura && on && on.auras.some((a) => a.id === ability.instantOnAura)) return 0;
  if (ability.instantOnCurses && on && ["corruption", "agony", "unstableAffliction"].every((id) => on.auras.some((a) => a.id === id))) return 0;
  if (ability.instantWhen && ability.instantWhen(unit, on)) return 0;
  return ability.castTime || 0;
}

function castSubject(unit, ability) {
  if (!ability || ability.target === "self") return unit;
  const on = unitById(unit.targetId);
  if (ability.target === "friend" && (!on || on.hp <= 0 || on.team !== unit.team)) return unit;
  return on;
}

function isFeigning(unit) {
  return !!unit?.auras.some((a) => a.feign);
}

function isVeiled(unit) {
  return !!unit?.auras.some((a) => a.stealth);
}

function isHidden(unit) {
  return isFeigning(unit) || isVeiled(unit);
}

function veiledFromViewer(unit) {
  if (!unit || unit.hp <= 0 || !isVeiled(unit) || !match || !match.player) return false;
  return unit.team !== match.player.team;
}

function touchCombat(unit) {
  if (!unit || !match) return;
  unit.fought = match.time;
}

function inCombat(unit) {
  return !!unit && unit.fought != null && match.time - unit.fought < 6;
}

function dropCombat(unit) {
  if (unit) unit.fought = null;
}

function dropHostileTarget(source) {
  for (const unit of match.units) {
    if (unit === source || unit.team === source.team) continue;
    if (unit.targetId === source.id) {
      unit.targetId = null;
      unit.goal = null;
    }
    if (unit.cast && unit.cast.targetId === source.id) cancelCast(unit, true);
  }
}

function enterVeil(source, seconds) {
  dropHostileTarget(source);
  addAura(source, {
    id: "stealth",
    name: "Veil",
    short: "Stl",
    type: "buff",
    remaining: seconds,
    stealth: true,
  });
}

function breakVeil(unit) {
  if (!isVeiled(unit)) return;
  unit.auras = unit.auras.filter((a) => !a.stealth);
  floater(unit, "Revealed", "#e6d3b0");
}

function feignDeath(source) {
  cancelCast(source, true);
  for (const unit of match.units) {
    if (unit === source || unit.team === source.team) continue;
    if (unit.targetId === source.id) {
      unit.targetId = null;
      unit.goal = null;
    }
    if (unit.cast && unit.cast.targetId === source.id) cancelCast(unit, true);
  }
  addAura(source, {
    id: "feignDeath",
    name: "Play Dead",
    short: "Play",
    type: "buff",
    remaining: 3,
    feign: true,
  });
  floater(source, "Play Dead", "#d7d2bf");
  combat(`${nameOf(source)} plays dead and drops targeting.`);
}

function nameOf(unit) {
  return unit ? unit.name : "Unknown";
}

function footOf(u) {
  if (!u) return 0;
  if (typeof u.height === "number") return u.height;
  if (typeof u.h === "number") return u.h;
  return 0;
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = footOf(a) - footOf(b);
  if (Math.abs(dz) < 2.2) return Math.hypot(dx, dy);
  return Math.hypot(dx, dy, dz);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function unitById(id) {
  return match?.units.find((u) => u.id === id) || null;
}

function hasAura(unit, id) {
  return unit?.auras.some((a) => a.id === id);
}

function immune(unit) {
  return unit?.auras.some((a) => a.ice || a.deflect);
}

function fightSeconds() {
  if (!match) return 0;
  return Math.max(0, match.time - TUNE.prep);
}

function currentDamp() {
  const t = fightSeconds();
  if (t < TUNE.dampDelay) return 0;
  const steps = Math.floor((t - TUNE.dampDelay) / TUNE.dampEvery);
  return Math.min(TUNE.dampCap, steps * TUNE.dampStep);
}

function hardLocked(unit) {
  return unit.auras.some((a) => a.ice || a.control === "stun" || a.control === "incap" || a.control === "fear");
}

function speedMul(unit) {
  if (unit.hp <= 0 || hardLocked(unit) || unit.auras.some((a) => a.control === "root") || unit.dash) return 0;
  let slow = 0;
  let bonus = 0;
  for (const aura of unit.auras) {
    if (aura.slow) slow = Math.max(slow, aura.slow);
    if (aura.speed) bonus = Math.max(bonus, aura.speed);
  }
  return (1 - slow) * (1 + bonus);
}

function rollMap() {
  return MAP_ORDER[Math.floor(Math.random() * MAP_ORDER.length)];
}

function activeMap() {
  if (match && MAPS[match.map]) return MAPS[match.map];
  return MAPS.court;
}

function inRect(x, y, rect) {
  return x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
}

function rampTop(ramp, x, y) {
  if (!inRect(x, y, ramp)) return null;
  const t = (x - ramp.x0) / (ramp.x1 - ramp.x0 || 1);
  const u = ramp.high === "start" ? 1 - t : t;
  return ramp.top * clamp(u, 0, 1);
}

function standSurface(x, y, feet) {
  const map = activeMap();
  let surface = 0;
  let blocked = false;
  for (const ramp of map.ramps || []) {
    const h = rampTop(ramp, x, y);
    if (h == null) continue;
    if (h <= feet + 0.9) surface = Math.max(surface, h);
    else blocked = true;
  }
  const deck = map.deck;
  if (deck && inRect(x, y, deck) && feet >= deck.top - deck.thick - 0.45) {
    surface = Math.max(surface, deck.top);
  }
  if (blocked && surface <= feet + 0.05) return null;
  return surface;
}

function underDeck(x, y, feet) {
  const deck = activeMap().deck;
  if (!deck || !inRect(x, y, deck)) return false;
  return feet < deck.top - deck.thick - 0.45;
}

function blockAabb(block, pad = 0) {
  return {
    minX: block.x - block.hw - pad,
    maxX: block.x + block.hw + pad,
    minY: block.y - block.hh - pad,
    maxY: block.y + block.hh + pad,
    minZ: 0,
    maxZ: block.below != null ? block.below : 16,
  };
}

function tallBoxes() {
  return activeMap().blocks.filter((block) => block.below == null).map((block) => blockAabb(block, 0));
}

function segmentHitsBox(x1, y1, z1, x2, y2, z2, box) {
  const delta = [x2 - x1, y2 - y1, z2 - z1];
  const origin = [x1, y1, z1];
  const min = [box.minX, box.minY, box.minZ];
  const max = [box.maxX, box.maxY, box.maxZ];
  let tmin = 0;
  let tmax = 1;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(delta[i]) < 1e-8) {
      if (origin[i] < min[i] || origin[i] > max[i]) return false;
    } else {
      let t1 = (min[i] - origin[i]) / delta[i];
      let t2 = (max[i] - origin[i]) / delta[i];
      if (t1 > t2) {
        const swap = t1;
        t1 = t2;
        t2 = swap;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
  }
  return tmax >= 0 && tmin <= 1;
}

function eyeOf(unit) {
  const h = typeof unit.height === "number"
    ? unit.height
    : (typeof unit.h === "number" ? unit.h : (standSurface(unit.x, unit.y, 0) || 0));
  return { x: unit.x, y: unit.y, z: h + 1.25 };
}

function hasLoS(a, b) {
  if (!a || !b) return false;
  const from = eyeOf(a);
  const to = eyeOf(b);
  if (Math.hypot(from.x - to.x, from.y - to.y) < 0.3 && Math.abs(from.z - to.z) < 2) return true;
  const map = activeMap();
  for (const block of map.blocks) {
    if (segmentHitsBox(from.x, from.y, from.z, to.x, to.y, to.z, blockAabb(block, 0.35))) return false;
  }
  const deck = map.deck;
  if (deck) {
    const slab = {
      minX: deck.x0 - 0.15,
      maxX: deck.x1 + 0.15,
      minY: deck.y0 - 0.15,
      maxY: deck.y1 + 0.15,
      minZ: deck.top - deck.thick,
      maxZ: deck.top + 0.05,
    };
    if (segmentHitsBox(from.x, from.y, from.z, to.x, to.y, to.z, slab)) return false;
  }
  return true;
}

function hitsBlock(x, y, r, feet, block) {
  if (block.below != null && feet >= block.below - 0.15) return false;
  const box = blockAabb(block, 0);
  const cx = clamp(x, box.minX, box.maxX);
  const cy = clamp(y, box.minY, box.maxY);
  return Math.hypot(x - cx, y - cy) < r;
}

function solidAt(x, y, r, feet) {
  return activeMap().blocks.some((block) => hitsBlock(x, y, r, feet, block));
}

function clampUnit(unit, ignoreBlocks) {
  unit.x = clamp(unit.x, unit.r + 1, TUNE.worldW - unit.r - 1);
  unit.y = clamp(unit.y, unit.r + 1, TUNE.worldH - unit.r - 1);
  if (match.phase === "prep") {
    if (unit.team === "ally") unit.x = Math.min(unit.x, 38);
    else unit.x = Math.max(unit.x, 62);
  }
  if (ignoreBlocks) return;
  for (let pass = 0; pass < 2; pass++) {
    for (const block of activeMap().blocks) {
      if (!hitsBlock(unit.x, unit.y, unit.r, unit.height, block)) continue;
      const box = blockAabb(block, 0);
      const left = Math.abs(unit.x - box.minX);
      const right = Math.abs(box.maxX - unit.x);
      const top = Math.abs(unit.y - box.minY);
      const bottom = Math.abs(box.maxY - unit.y);
      const m = Math.min(left, right, top, bottom);
      if (m === left) unit.x = box.minX - unit.r;
      else if (m === right) unit.x = box.maxX + unit.r;
      else if (m === top) unit.y = box.minY - unit.r;
      else unit.y = box.maxY + unit.r;
    }
  }
  unit.x = clamp(unit.x, unit.r + 1, TUNE.worldW - unit.r - 1);
  unit.y = clamp(unit.y, unit.r + 1, TUNE.worldH - unit.r - 1);
}

function combat(text) {
  match.logs.unshift({ t: match.time, text });
  if (match.logs.length > 18) match.logs.length = 18;
}

const SPELL_LOOK = {
  charge: { kind: "trail", color: "#f0d48a", life: 0.45, style: "dust" },
  mortalStrike: { kind: "slash", color: "#e15b5b", life: 0.42, size: 1.25, style: "blade" },
  hamstring: { kind: "slash", color: "#d6a15a", life: 0.36, size: 1, style: "blade" },
  overpower: { kind: "slash", color: "#f2e2b0", life: 0.34, size: 1.05, style: "blade" },
  execute: { kind: "slash", color: "#ff4d3a", life: 0.5, size: 1.65, style: "blade" },
  pummel: { kind: "burst", color: "#d7d2bf", life: 0.36, size: 0.9, style: "steel" },
  heroicLeap: { kind: "ring", color: "#e7c98a", life: 0.8, size: 3.2, style: "dust" },
  brace: { kind: "burst", color: "#e7c98a", life: 0.45, size: 1.4, style: "shield" },
  quake: { kind: "ring", color: "#e7c98a", life: 0.55, size: 8, style: "steel" },
  emberWard: { kind: "burst", color: "#ff7a3c", life: 0.5, size: 1.45, style: "fire" },
  pin: { kind: "bolt", color: "#d9cbb0", life: 0.4, size: 1.05, style: "arrow" },
  finishShot: { kind: "bolt", color: "#ffb089", life: 0.42, size: 1.2, style: "arrow" },
  blessing: { kind: "burst", color: "#f7f4ff", life: 0.48, size: 1.35, style: "holy" },
  speedBlessing: { kind: "burst", color: "#f7f4ff", life: 0.48, size: 1.4, style: "holy" },
  wither: { kind: "burst", color: "#6b4cff", life: 0.48, size: 1.2, style: "shadow" },
  umbralShell: { kind: "burst", color: "#6b4cff", life: 0.5, size: 1.45, style: "shadow" },
  thicket: { kind: "burst", color: "#7dce6a", life: 0.5, size: 1.3, style: "nature" },
  clearbloom: { kind: "burst", color: "#c6ff8a", life: 0.45, size: 1.2, style: "nature" },
  step: { kind: "blink", color: "#e6d3b0", life: 0.4, size: 1.2, style: "smoke" },
  tendon: { kind: "slash", color: "#d6a15a", life: 0.36, size: 1, style: "blade" },
  tend: { kind: "burst", color: "#5ee0c5", life: 0.48, size: 1.35, style: "heal" },
  wickstep: { kind: "blink", color: "#5ee0c5", life: 0.45, size: 1.3, style: "nature" },
  barbs: { kind: "bolt", color: "#e23d4a", life: 0.4, size: 1.15, style: "barb" },
  bulwark: { kind: "burst", color: "#e23d4a", life: 0.5, size: 1.4, style: "shield" },
  comfort: { kind: "burst", color: "#f2a3c7", life: 0.48, size: 1.35, style: "holy" },
  exchange: { kind: "blink", color: "#f2a3c7", life: 0.45, size: 1.3, style: "holy" },
  flourish: { kind: "slash", color: "#7f9cff", life: 0.45, size: 1.4, style: "blade" },
  tempo: { kind: "burst", color: "#8eb0ff", life: 0.42, size: 1.25, style: "arcane" },
  spellReflection: { kind: "burst", color: "#9ee7ff", life: 0.5, size: 1.45, style: "shield" },
  trinket: { kind: "ring", color: "#b8fff0", life: 0.55, size: 3.4, style: "holy" },
  frostbolt: { kind: "bolt", color: "#8fd7ff", life: 0.55, size: 1.35, style: "frost" },
  fireBlast: { kind: "burst", color: "#ff7a3c", life: 0.42, size: 1.45, style: "fire" },
  polymorph: { kind: "burst", color: "#d7b3ff", life: 0.55, size: 1.4, style: "arcane" },
  counterspell: { kind: "burst", color: "#c9a0ff", life: 0.38, size: 1.05, style: "arcane" },
  blink: { kind: "blink", color: "#9fd0ff", life: 0.45, size: 1.35, style: "arcane" },
  frostNova: { kind: "nova", color: "#c6f4ff", life: 0.7, size: 8, style: "frost" },
  scorch: { kind: "bolt", color: "#ffb45a", life: 0.48, size: 1.15, style: "fire" },
  pyroblast: { kind: "bolt", color: "#ff5a1f", life: 0.72, size: 2.25, style: "pyro" },
  iceBlock: { kind: "burst", color: "#c6f4ff", life: 0.55, size: 1.7, style: "frost" },
  aimedShot: { kind: "bolt", color: "#f0e2b8", life: 0.42, size: 1.15, style: "arrow" },
  concussiveShot: { kind: "bolt", color: "#d9cbb0", life: 0.48, size: 1.05, style: "arrow" },
  freezingTrap: { kind: "ring", color: "#9eecff", life: 0.55, size: 3.4, style: "frost" },
  wingClip: { kind: "slash", color: "#c4b48a", life: 0.36, size: 0.95, style: "blade" },
  silencingShot: { kind: "bolt", color: "#b9a6e0", life: 0.4, size: 1.05, style: "arrow" },
  disengage: { kind: "trail", color: "#e6d3b0", life: 0.42, style: "dust" },
  feignDeath: { kind: "burst", color: "#8a847c", life: 0.5, size: 1.4, style: "smoke" },
  deterrence: { kind: "ring", color: "#ffe08a", life: 0.55, size: 3.6, style: "shield" },
  flashHeal: { kind: "burst", color: "#7dff9a", life: 0.48, size: 1.3, style: "heal" },
  powerWordShield: { kind: "burst", color: "#9fd0ff", life: 0.48, size: 1.45, style: "shield" },
  shadowWordPain: { kind: "burst", color: "#c084fc", life: 0.5, size: 1.15, style: "shadow" },
  psychicScream: { kind: "nova", color: "#b388ff", life: 0.65, size: 8, style: "shadow" },
  dispelMagic: { kind: "burst", color: "#f7f4ff", life: 0.4, size: 1.15, style: "holy" },
  mindBlast: { kind: "bolt", color: "#9b6bff", life: 0.48, size: 1.25, style: "mind" },
  penance: { kind: "bolt", color: "#ffe08a", life: 0.28, size: 1, style: "holy" },
  desperatePrayer: { kind: "burst", color: "#b6ff6a", life: 0.55, size: 1.7, style: "holy" },
  shadowBolt: { kind: "bolt", color: "#7d5cff", life: 0.52, size: 1.4, style: "shadow" },
  corruption: { kind: "burst", color: "#6b4cff", life: 0.5, size: 1.2, style: "shadow" },
  agony: { kind: "burst", color: "#c084fc", life: 0.5, size: 1.25, style: "shadow" },
  unstableAffliction: { kind: "burst", color: "#6dff9a", life: 0.55, size: 1.35, style: "nature" },
  fear: { kind: "bolt", color: "#b388ff", life: 0.5, size: 1.25, style: "fear" },
  spellLock: { kind: "burst", color: "#d7c4ff", life: 0.38, size: 1.05, style: "arcane" },
  drainLife: { kind: "bolt", color: "#9b6bff", life: 0.36, size: 1.05, style: "siphon", pull: true },
  healthstone: { kind: "burst", color: "#7dff9a", life: 0.55, size: 1.6, style: "heal" },
  rejuvenation: { kind: "burst", color: "#7dff9a", life: 0.48, size: 1.2, style: "nature" },
  lifebloom: { kind: "burst", color: "#b6ff6a", life: 0.5, size: 1.25, style: "nature" },
  regrowth: { kind: "burst", color: "#8fd18a", life: 0.5, size: 1.3, style: "nature" },
  wildGrowth: { kind: "ring", color: "#7dff9a", life: 0.7, size: 6, style: "nature" },
  swiftmend: { kind: "burst", color: "#c6ff8a", life: 0.48, size: 1.55, style: "heal" },
  cyclone: { kind: "burst", color: "#e7c98a", life: 0.55, size: 1.45, style: "nature" },
  wrath: { kind: "bolt", color: "#c6e58a", life: 0.48, size: 1.2, style: "nature" },
  ironbark: { kind: "burst", color: "#8f6a3a", life: 0.55, size: 1.5, style: "nature" },
  sinisterStrike: { kind: "slash", color: "#fff569", life: 0.36, size: 1.05, style: "blade" },
  eviscerate: { kind: "slash", color: "#e15b5b", life: 0.46, size: 1.4, style: "blade" },
  cheapShot: { kind: "burst", color: "#f4f0c8", life: 0.42, size: 1.15, style: "steel" },
  kick: { kind: "burst", color: "#d7d2bf", life: 0.36, size: 0.95, style: "steel" },
  gouge: { kind: "slash", color: "#e6d3b0", life: 0.38, size: 1.05, style: "blade" },
  sprint: { kind: "ring", color: "#fff569", life: 0.5, size: 3.2, style: "dust" },
  stealth: { kind: "burst", color: "#6a645c", life: 0.5, size: 1.35, style: "smoke" },
  vanish: { kind: "burst", color: "#3a342c", life: 0.55, size: 1.6, style: "smoke" },
  kindle: { kind: "ring", color: "#5ee0c5", life: 0.6, size: 8, style: "nature" },
  soothe: { kind: "burst", color: "#b8fff0", life: 0.45, size: 1.25, style: "heal" },
  shelter: { kind: "burst", color: "#9fd0ff", life: 0.48, size: 1.35, style: "shield" },
  hush: { kind: "burst", color: "#f7f4ff", life: 0.4, size: 1.15, style: "holy" },
  flare: { kind: "ring", color: "#fff1b0", life: 0.6, size: 8, style: "fire" },
  mend: { kind: "burst", color: "#7dff9a", life: 0.48, size: 1.3, style: "heal" },
  snuff: { kind: "ring", color: "#d7c39a", life: 0.5, size: 8, style: "smoke" },
  beacon: { kind: "ring", color: "#fff1b0", life: 0.7, size: 16, style: "holy" },
  lash: { kind: "bolt", color: "#e23d4a", life: 0.4, size: 1.15, style: "lash" },
  brand: { kind: "burst", color: "#e23d4a", life: 0.48, size: 1.2, style: "fire" },
  yank: { kind: "bolt", color: "#ff8a96", life: 0.42, size: 1.15, style: "chain" },
  sever: { kind: "slash", color: "#ff4d3a", life: 0.46, size: 1.45, style: "blade" },
  silenceLash: { kind: "burst", color: "#d7c4ff", life: 0.38, size: 1.05, style: "arcane" },
  hobble: { kind: "bolt", color: "#d6a15a", life: 0.42, size: 1.05, style: "chain" },
  reel: { kind: "blink", color: "#e23d4a", life: 0.4, size: 1.2, style: "fire" },
  bind: { kind: "ring", color: "#e23d4a", life: 0.6, size: 6, style: "shadow" },
  oath: { kind: "burst", color: "#f2a3c7", life: 0.5, size: 1.35, style: "holy" },
  pulse: { kind: "burst", color: "#ffd0e4", life: 0.45, size: 1.25, style: "holy" },
  link: { kind: "ring", color: "#f2a3c7", life: 0.55, size: 3.4, style: "holy" },
  unravel: { kind: "burst", color: "#f7f4ff", life: 0.4, size: 1.15, style: "holy" },
  chorus: { kind: "burst", color: "#ffb7d5", life: 0.5, size: 1.35, style: "holy" },
  rebuke: { kind: "bolt", color: "#f2a3c7", life: 0.4, size: 1.1, style: "holy" },
  thread: { kind: "burst", color: "#ffd0e4", life: 0.48, size: 1.2, style: "holy" },
  unity: { kind: "ring", color: "#f2a3c7", life: 0.6, size: 4, style: "holy" },
  mark: { kind: "burst", color: "#7f9cff", life: 0.45, size: 1.2, style: "arcane" },
  fleche: { kind: "slash", color: "#d7e4ff", life: 0.34, size: 1.05, style: "blade" },
  riposte: { kind: "slash", color: "#7f9cff", life: 0.4, size: 1.2, style: "blade" },
  lunge: { kind: "trail", color: "#7f9cff", life: 0.4, style: "dust" },
  crosscut: { kind: "slash", color: "#ffe14a", life: 0.46, size: 1.45, style: "blade" },
  parry: { kind: "burst", color: "#d7d2bf", life: 0.36, size: 0.95, style: "steel" },
  feint: { kind: "burst", color: "#c9d6ff", life: 0.4, size: 1.1, style: "arcane" },
  isolate: { kind: "ring", color: "#7f9cff", life: 0.55, size: 3.2, style: "arcane" },
};

let fxSerial = 1;

function spellFx(spec) {
  if (!match) return;
  const life = spec.life || 0.35;
  match.fx.push({ ...spec, id: fxSerial++, life, max: life });
  if (match.fx.length > 64) match.fx.shift();
}

function spellVisual(id, source, target, from) {
  const look = SPELL_LOOK[id];
  if (!look || !match) return;
  const origin = from || { x: source.x, y: source.y, h: 0 };
  const dest = target || source;
  if (id === "blink" || id === "reel" || id === "step" || id === "wickstep" || id === "exchange") {
    spellFx({ kind: "burst", style: look.style || "arcane", color: look.color, x: origin.x, y: origin.y, h: 1.15, life: look.life, size: look.size });
    spellFx({ kind: "burst", style: look.style || "arcane", color: look.color, x: source.x, y: source.y, h: 1.15, life: look.life, size: look.size });
    return;
  }
  if (id === "disengage") {
    const sp = Math.hypot(source.vx, source.vy) || 1;
    spellFx({
      kind: "trail", style: "dust", color: look.color,
      x: origin.x, y: origin.y, h: 0.55,
      x2: origin.x + (source.vx / sp) * 7, y2: origin.y + (source.vy / sp) * 7, h2: 0.7,
      life: look.life,
    });
    spellFx({ kind: "burst", style: "dust", color: look.color, x: origin.x, y: origin.y, h: 0.8, life: 0.36, size: 1.3 });
    return;
  }
  if (id === "heroicLeap" && source.dash) {
    spellFx({ kind: "ring", color: look.color, x: source.dash.x, y: source.dash.y, h: 0.12, life: (source.dash.dur || 0.5) + 0.2, size: look.size });
    spellFx({ kind: "burst", color: look.color, x: origin.x, y: origin.y, h: 0.7, life: 0.34, size: 1.2 });
    return;
  }
  if (id === "charge" && source.dash) {
    spellFx({ kind: "trail", style: "dust", color: look.color, x: origin.x, y: origin.y, h: 0.45, x2: source.dash.x, y2: source.dash.y, h2: 0.45, life: look.life });
    return;
  }
  if (id === "freezingTrap") {
    const trap = [...match.traps].reverse().find((t) => t.ownerId === source.id);
    const spot = trap || origin;
    spellFx({ kind: "ring", color: look.color, x: spot.x, y: spot.y, h: 0.14, life: look.life, size: look.size });
    return;
  }
  if (id === "kindle" || id === "beacon" || id === "flare" || id === "snuff") {
    const lantern = [...(match.lanterns || [])].reverse().find((l) => l.ownerId === source.id);
    const spot = lantern || origin;
    spellFx({ kind: "ring", color: look.color, x: spot.x, y: spot.y, h: 0.16, life: look.life, size: id === "beacon" ? lanternReach(spot) : look.size });
    return;
  }
  if (id === "lunge" && source.dash) {
    spellFx({ kind: "trail", style: "dust", color: look.color, x: origin.x, y: origin.y, h: 0.45, x2: source.dash.x, y2: source.dash.y, h2: 0.45, life: look.life });
    return;
  }
  if (id === "penance") {
    const heal = dest.team === source.team;
    spellFx({
      kind: "bolt", style: heal ? "holy" : "shadow", color: heal ? "#ffe08a" : "#7a5cff", size: 1.05, life: 0.28,
      x: origin.x, y: origin.y, h: 1.35 + (origin.h || 0),
      x2: dest.x, y2: dest.y, h2: 1.2 + (dest.height || 0),
    });
    return;
  }
  if (look.kind === "bolt") {
    const pull = !!look.pull;
    spellFx({
      kind: "bolt", style: look.style || "orb", color: look.color, size: look.size || 1, life: look.life,
      x: pull ? dest.x : origin.x,
      y: pull ? dest.y : origin.y,
      h: 1.35 + ((pull ? dest.height : origin.h) || 0),
      x2: pull ? origin.x : dest.x,
      y2: pull ? origin.y : dest.y,
      h2: 1.15 + ((pull ? origin.h : dest.height) || 0),
    });
    return;
  }
  if (look.kind === "slash") {
    spellFx({
      kind: "slash", style: look.style || "blade", color: look.color, size: look.size || 1, life: look.life,
      x: origin.x, y: origin.y, x2: dest.x, y2: dest.y, h: 1.25 + (dest.height || 0),
    });
    return;
  }
  const selfCentered = look.kind === "nova" || ["trinket", "iceBlock", "deterrence", "feignDeath", "desperatePrayer", "spellReflection", "frostNova", "psychicScream"].includes(id);
  const at = selfCentered ? source : dest;
  spellFx({
    kind: look.kind === "nova" ? "ring" : look.kind,
    color: look.color,
    x: at.x,
    y: at.y,
    h: look.kind === "ring" || look.kind === "nova" ? 0.12 : 1.15 + (at.height || 0),
    life: look.life,
    size: look.size || 1,
    style: look.style || "",
    conceal: id === "stealth" || id === "vanish" ? source.team : "",
  });
}

function releaseSpell(source, target, ability) {
  const from = { x: source.x, y: source.y, h: source.height || 0 };
  ability.effect(source, target);
  spellVisual(ability.id, source, target, from);
}

function floater(unit, text, color) {
  match.floaters.push({
    unitId: unit.id,
    x: unit.x + (Math.random() - 0.5) * 2,
    y: unit.y - 1.6,
    h: unit.height || 0,
    text,
    color,
    life: 1.15,
  });
  if (match.floaters.length > 48) match.floaters.shift();
}

function feedback(unit, text) {
  if (!unit || !unit.human) return;
  unit.lastNote = text;
  unit.noteUntil = match.time + 1.6;
  if (unit.isPlayer && match.feedbackCd > 0 && match.lastFeedback === text) return;
  if (unit.isPlayer) {
    match.feedbackCd = 0.45;
    match.lastFeedback = text;
  }
  floater(unit, text, "#ffd2d2");
}

function addAura(unit, aura) {
  unit.auras = unit.auras.filter((a) => a.id !== aura.id);
  unit.auras.push(aura);
}

function drFactor(unit, category) {
  const row = unit.dr[category];
  if (!row || match.time > row.expire) return 1;
  return [1, 0.5, 0.25, 0][Math.min(3, row.stacks)];
}

function bumpDr(unit, category) {
  if (!category) return;
  const row = unit.dr[category];
  const stacks = row && match.time <= row.expire ? row.stacks : 0;
  unit.dr[category] = { stacks: Math.min(3, stacks + 1), expire: match.time + TUNE.drTime };
}

function applyControl(source, target, spec) {
  if (target.hp <= 0) return false;
  if (immune(target)) {
    floater(target, "Immune", "#ddd");
    combat(`${nameOf(target)} is immune to ${spec.name}.`);
    return false;
  }
  const factor = spec.dr ? drFactor(target, spec.dr) : 1;
  if (spec.dr) bumpDr(target, spec.dr);
  if (factor <= 0) {
    floater(target, "Resisted", "#eee");
    combat(`${nameOf(target)} resists ${spec.name} (diminishing returns).`);
    return false;
  }
  addAura(target, {
    id: spec.id,
    name: spec.name,
    short: spec.short,
    type: "debuff",
    remaining: spec.duration * factor,
    control: spec.control,
    breakOnDamage: !!spec.breakOnDamage,
    dispellable: !!spec.dispellable,
    dr: spec.dr,
  });
  if (spec.control === "stun" || spec.control === "incap" || spec.control === "fear") {
    cancelCast(target, true);
  }
  const diminished = factor < 1 ? " (diminished)" : "";
  floater(target, spec.short, "#d7b3ff");
  combat(`${nameOf(source)} ${spec.name.toLowerCase()}s ${nameOf(target)} for ${(spec.duration * factor).toFixed(1)}s${diminished}.`);
  return true;
}

function breakIncaps(target) {
  const breaks = (aura) => aura.breakOnDamage && (aura.control === "incap" || aura.control === "fear");
  const broken = target.auras.filter(breaks);
  if (!broken.length) return;
  target.auras = target.auras.filter((a) => !breaks(a));
  floater(target, "Broke", "#ffe29a");
  combat(`${nameOf(target)} breaks ${broken.map((a) => a.name).join(" & ")}.`);
}

function dealDamage(source, target, raw, meta) {
  if (!target || target.hp <= 0) return 0;
  if (immune(target)) {
    if (meta.direct && source && !source.veilSafe) breakVeil(source);
    if (source) touchCombat(source);
    touchCombat(target);
    floater(target, "Immune", "#ddd");
    return 0;
  }
  let amount;
  let crit = false;
  let shared = 0;
  let sharedWith = null;
  if (meta.split) {
    amount = Math.max(1, Math.round(raw));
  } else {
    amount = raw * (0.96 + Math.random() * 0.08);
    crit = meta.direct && Math.random() < 0.12;
    if (crit) amount *= 1.5;
    if (!meta.direct && source) {
      const amp = target.auras.reduce((max, aura) => {
        if (!aura.dotAmp || (aura.dotAmpSource && aura.dotAmpSource !== source.id)) return max;
        return Math.max(max, aura.dotAmp);
      }, 0);
      if (amp) amount *= 1 + amp;
    }
    const reduction = target.auras.reduce((max, aura) => Math.max(max, aura.damageReduce || 0), 0);
    if (reduction) amount *= 1 - reduction;
    if (meta.direct && source && source.classId === "duelist") amount *= isDuelMark(source, target) ? 1.25 : 0.6;
    if (source) {
      const isolate = target.auras.find((a) => a.id === "isolate" && a.sourceTeam === source.team);
      if (isolate) amount *= 1 + (isolate.damageAmp || 0);
      const cut = source.auras.reduce((max, aura) => Math.max(max, aura.damageDoneCut || 0), 0);
      if (cut) amount *= 1 - cut;
    }
    amount = Math.max(1, Math.round(amount));
    const link = target.auras.find((a) => a.link);
    const other = link && unitById(link.partnerId);
    if (other && other.hp > 0 && other !== target) {
      const half = Math.floor(amount / 2);
      if (half > 0) {
        shared = half;
        sharedWith = other;
        amount -= half;
        dealDamage(source, other, half, { direct: false, school: meta.school, name: "Link", split: true, shared: true, log: false });
      }
    }
  }
  let remaining = amount;
  const burst = [];
  for (const aura of target.auras) {
    if (!aura.absorb) continue;
    const used = Math.min(aura.absorb, remaining);
    aura.absorb -= used;
    remaining -= used;
    if (used > 0) floater(target, `-${used}`, "#9fd0ff");
    if (aura.absorb <= 0 && aura.breakSpeed) burst.push(aura.breakSpeed);
  }
  target.auras = target.auras.filter((a) => a.absorb == null || a.absorb > 0);
  for (const speed of burst) grantSpeed(target, 3, speed);
  if (remaining > 0) {
    target.hp = Math.max(0, target.hp - remaining);
    if (target.dummy) target.hp = Math.max(1, target.hp);
    if (target.classId === "warrior") {
      target.resource = Math.min(100, target.resource + remaining * 0.08);
    }
    if (meta.direct && source && !meta.split) {
      target.lastHitId = source.id;
      target.lastHitTime = match.time;
    }
    breakIncaps(target);
    if (meta.direct) breakVeil(target);
  }
  if (amount > 0) {
    touchCombat(target);
    if (source) touchCombat(source);
  }
  if (meta.direct && source && !source.veilSafe) breakVeil(source);
  if (source) source.stats.damage += remaining;
  floater(target, `${crit ? "✦" : ""}${amount}`, crit ? "#ffe14a" : meta.direct || meta.shared ? "#f4f4f4" : "#ffb26b");
  if (meta.direct && meta.log !== false) {
    const via = [];
    if (remaining < amount) via.push(`${remaining} to health`);
    if (sharedWith) via.push(`${shared} shared with ${nameOf(sharedWith)}`);
    const shown = amount + shared;
    combat(`${nameOf(source)} ${meta.name} hits ${nameOf(target)} for ${shown}${crit ? " (crit)" : ""}${via.length ? ` (${via.join(", ")})` : ""}.`);
  }
  if (target.hp <= 0) onDeath(target, source);
  return remaining;
}

function heal(source, target, raw, spellName, quiet) {
  if (!target || target.hp <= 0) return 0;
  if (target.auras.some((a) => a.ice)) {
    floater(target, "Immune", "#ddd");
    return 0;
  }
  let mul = 1 - currentDamp();
  if (target.auras.some((a) => a.healReduce)) mul *= 1 - Math.max(...target.auras.filter((a) => a.healReduce).map((a) => a.healReduce));
  const crit = Math.random() < 0.12;
  let amount = Math.round(raw * mul * (crit ? 1.5 : 1));
  amount = Math.max(0, amount);
  const before = target.hp;
  target.hp = Math.min(target.hpMax, target.hp + amount);
  const gained = Math.round(target.hp - before);
  source.stats.healing += gained;
  floater(target, `+${gained}`, crit ? "#b6ff6a" : "#7dff9a");
  const notes = [];
  if (currentDamp() > 0) notes.push(`damp ${Math.round(currentDamp() * 100)}%`);
  if (target.auras.some((a) => a.healReduce)) notes.push("Sundered");
  if (!quiet) combat(`${nameOf(source)} ${spellName} heals ${nameOf(target)} for ${gained}${notes.length ? ` (${notes.join(", ")})` : ""}.`);
  return gained;
}

function livingPartner(unit) {
  return match.units.find((u) => u !== unit && u.team === unit.team && u.hp > 0) || null;
}

function oathTarget(source, target) {
  if (target && target !== source && target.team === source.team && target.hp > 0) return target;
  return livingPartner(source);
}

function oathPartner(source) {
  const oath = source?.auras.find((a) => a.id === "oath");
  if (!oath) return null;
  const partner = unitById(oath.partnerId);
  if (!partner || partner.hp <= 0 || partner.team !== source.team) return null;
  return partner;
}

function healLinked(source, target, raw, spellName) {
  const gained = heal(source, target, raw, spellName);
  const partner = oathPartner(source);
  if (!partner || partner === target) return gained;
  const ratio = source.fullOath || source.auras.some((a) => a.id === "unity") ? 1 : 0.5;
  heal(source, partner, raw * ratio, "Oath");
  return gained;
}

function lanternOf(owner) {
  return match?.lanterns?.find((l) => l.ownerId === owner.id) || null;
}

function lanternReach(lantern) {
  if (!lantern) return 0;
  return lantern.beacon > 0 ? lantern.radius * 2 : lantern.radius;
}

function standingInLantern(owner, unit) {
  const lantern = lanternOf(owner);
  if (!lantern || !unit) return false;
  return dist(unit, lantern) <= lanternReach(lantern);
}

function chainStacks(source, target) {
  return target?.auras.find((a) => a.id === "chain" && a.sourceId === source.id)?.stacks || 0;
}

function addChain(source, target) {
  const prev = target.auras.find((a) => a.id === "chain" && a.sourceId === source.id);
  const stacks = Math.min(3, (prev?.stacks || 0) + 1);
  target.auras = target.auras.filter((a) => !(a.id === "chain" && a.sourceId === source.id));
  target.auras.push({
    id: "chain",
    name: "Chain",
    short: "Ch",
    type: "debuff",
    remaining: 12,
    stacks,
    sourceId: source.id,
    chain: true,
    dispellable: true,
  });
  return stacks;
}

function isDuelMark(source, target) {
  return !!target?.auras.some((a) => a.id === "duelMark" && a.sourceId === source.id);
}

function gainMomentum(unit, amount) {
  if (!unit || unit.classId !== "duelist" || amount <= 0) return;
  const max = CLASSES.duelist.resource.max;
  unit.resource = Math.min(max, unit.resource + amount);
}

function dispelHelp(source, target) {
  const aura = pickDispel(target, "help");
  if (!aura) return false;
  target.auras = target.auras.filter((a) => a !== aura);
  floater(target, "Dispelled", "#d7c4ff");
  combat(`${nameOf(source)} removes ${aura.name} from ${nameOf(target)}.`);
  if (aura.backlash) {
    const owner = unitById(aura.dot?.sourceId) || target;
    dealDamage(owner, source, aura.backlash, { direct: true, school: "magic", name: aura.name });
  }
  return true;
}

function tryReflect(source, target, ability) {
  if (match.reflectLock) return false;
  if (!ability.reflectable) return false;
  if (!target.auras.some((a) => a.reflect)) return false;
  target.auras = target.auras.filter((a) => !a.reflect);
  match.reflectLock = true;
  floater(target, "Reflected", "#9ee7ff");
  combat(`${nameOf(target)} reflects ${ability.name} onto ${nameOf(source)}.`);
  ability.effect(target, source);
  match.reflectLock = false;
  return true;
}

function interruptUnit(source, target, lockFor) {
  if (!target.cast) return false;
  const spellName = target.cast.ability.name;
  cancelCast(target, true);
  target.lockout = lockFor;
  floater(target, "Interrupted", "#ffb0b0");
  combat(`${nameOf(source)} interrupts ${nameOf(target)}'s ${spellName}. Locked for ${lockFor}s.`);
  return true;
}

function silenceUnit(source, target, seconds) {
  const wasCasting = !!target.cast;
  const spellName = target.cast?.ability.name;
  if (wasCasting) cancelCast(target, true);
  target.silence = Math.max(target.silence, seconds);
  addAura(target, {
    id: "silence",
    name: "Silenced",
    short: "Si",
    type: "debuff",
    remaining: seconds,
    silence: true,
  });
  floater(target, "Silenced", "#ffb0b0");
  combat(`${nameOf(source)} silences ${nameOf(target)}${wasCasting ? `, interrupting ${spellName}` : ""} for ${seconds}s.`);
}

function cancelCast(unit, refund) {
  if (!unit?.cast) return;
  if (refund) {
    const max = CLASSES[unit.classId].resource.max;
    unit.resource = Math.min(max, unit.resource + unit.cast.cost);
  }
  unit.cast = null;
  unit.nextSpell = null;
}

function pickDispel(target, mode) {
  const list = target.auras.filter((a) => a.dispellable && (mode === "harm" ? a.type === "buff" : a.type === "debuff"));
  const weight = (a) => {
    if (a.reflect) return 0;
    if (a.control === "incap") return 1;
    if (a.control === "fear") return 2;
    if (a.absorb) return 3;
    if (a.link) return 3.2;
    if (a.damageReduce) return 3.5;
    if (a.chain) return 3.8;
    if (a.hot) return 4;
    if (a.control === "root") return 4.5;
    if (a.dot) return 5;
    return 6;
  };
  list.sort((a, b) => weight(a) - weight(b));
  return list[0] || null;
}

function living(team) {
  return match.units.filter((u) => u.team === team && u.hp > 0);
}

function foesOf(unit) {
  return match.units.filter((u) => u.team !== unit.team && u.hp > 0);
}

function friendsOf(unit) {
  return match.units.filter((u) => u.team === unit.team && u.hp > 0);
}

function unitsInRadius(origin, radius, pred) {
  return match.units.filter((u) => u !== origin && dist(origin, u) <= radius && pred(u));
}

function isLocked(unit, ability) {
  if (ability.ignoreLock) return false;
  if (ability.school === "magic" && (unit.silence > 0 || unit.lockout > 0)) return true;
  if (ability.castTime > 0 && unit.lockout > 0) return true;
  return false;
}

function abilityCost(unit, ability) {
  if (ability.costOf) return ability.costOf(unit);
  return ability.cost || 0;
}

function validate(unit, ability, target) {
  if (match.phase !== "fight") return "Gates are closed";
  if (unit.hp <= 0) return "Dead";
  if (unit.dash) return unit.dash.leap ? "Leaping" : unit.dash.yank ? "Yanked" : unit.dash.lunge ? "Lunging" : "Rushing";
  if (unit.auras.some((a) => a.ice)) return "Glacier";
  if (ability.id !== "trinket" && hardLocked(unit)) return statusText(unit) || "Can't act";
  if (ability.id !== "trinket" && isLocked(unit, ability)) return unit.silence > 0 ? "Silenced" : "School locked";
  if (ability.gcd !== false && unit.gcd > 0) return "Not ready";
  if (ability.charges) {
    const left = unit.charges[ability.id] == null ? ability.charges : unit.charges[ability.id];
    if (left <= 0) return "No charges";
  } else if ((unit.cd[ability.id] || 0) > 0) return "Not ready";
  if (unit.resource < abilityCost(unit, ability)) return `Not enough ${CLASSES[unit.classId].resource.name}`;
  if (ability.target === "enemy" || ability.target === "friend" || ability.target === "any") {
    if (!target || target.hp <= 0) return "No target";
  }
  if (ability.target === "enemy" && target.team === unit.team) return "Invalid target";
  if (target && isHidden(target) && target.team !== unit.team && (ability.target === "enemy" || ability.target === "any")) return "Can't see target";
  if (ability.target === "friend" && target.team !== unit.team) return "Invalid target";
  if (target && (ability.target === "enemy" || ability.target === "friend" || ability.target === "any")) {
    const d = dist(unit, target);
    if (ability.minRange && d < ability.minRange) return "Too close";
    if (ability.range && d > ability.range) return "Out of range";
    if (!hasLoS(unit, target)) return "Line of sight";
  }
  if (ability.extra) {
    const reason = ability.extra(unit, target);
    if (reason) return reason;
  }
  return null;
}

function resolveTarget(unit, ability, explicit) {
  if (ability.target === "self" || ability.target === "aoe" || ability.target === "ground") return unit;
  if (explicit) return explicit;
  const selected = unitById(unit.targetId);
  if (ability.target === "friend") {
    if (selected && selected.team === unit.team && selected.hp > 0) return selected;
    return unit;
  }
  if (ability.target === "any") {
    if (selected && selected.hp > 0) return selected;
    return unit;
  }
  if (selected && selected.team !== unit.team && selected.hp > 0) return selected;
  return null;
}

function tryCast(unit, abilityId, explicit, quiet) {
  const ability = unit.abilities.find((a) => a.id === abilityId);
  if (!ability || !match || match.phase === "end") return false;
  if (unit.isPlayer && match.groundAim && ability.target !== "ground") match.groundAim = null;
  if (ability.id === "iceBlock" && hasAura(unit, "iceBlock")) {
    unit.auras = unit.auras.filter((a) => a.id !== "iceBlock");
    floater(unit, "Canceled", "#fff");
    combat(`${nameOf(unit)} cancels Glacier.`);
    return true;
  }
  if (unit.isPlayer && ability.target === "ground" && !unit.aimPoint) {
    if (match.groundAim && match.groundAim.abilityId === ability.id) {
      confirmGroundAim();
      return true;
    }
    const previewTarget = resolveTarget(unit, ability, explicit);
    const holdGcd = unit.cast && !unit.cast.channel ? unit.gcd : null;
    if (holdGcd != null) unit.gcd = 0;
    const blocked = validate(unit, ability, previewTarget);
    if (holdGcd != null) unit.gcd = holdGcd;
    if (blocked) {
      if (unit.human && !quiet) feedback(unit, blocked);
      return false;
    }
    match.groundAim = {
      abilityId: ability.id,
      range: ability.range || 30,
      minRange: ability.minRange || 0,
      radius: ability.marker || ability.radius || 3,
      los: ability.id !== "heroicLeap",
      cursor: null,
    };
    refreshAimCursor();
    return true;
  }
  if (unit.cast && !unit.cast.channel && unit.human && ability.gcd !== false) {
    if (unit.cast.ability.id === ability.id && ability.cd) return false;
    return queueFollowUp(unit, ability, explicit, quiet);
  }
  if (unit.cast && unit.cast.ability.id === ability.id) return false;
  const target = resolveTarget(unit, ability, explicit);
  const reason = validate(unit, ability, target);
  if (reason) {
    if (unit.human && !quiet) feedback(unit, reason);
    return false;
  }
  if (unit.cast && ability.gcd !== false) cancelCast(unit, true);
  const price = abilityCost(unit, ability);
  unit.resource -= price;
  if (ability.gcd !== false) unit.gcd = ability.gcdTime || TUNE.gcd;
  const time = castTimeOf(unit, ability);
  if (time > 0) {
    unit.cast = {
      ability,
      targetId: target.id,
      time,
      total: time,
      cost: price,
      channel: !!ability.channel,
      pulsesLeft: ability.pulses || 0,
      pulse: ability.channel ? 0.05 : 0,
    };
    if (ability.channel && ability.cd) unit.cd[ability.id] = ability.cd;
    unit.goal = null;
  } else {
    if (ability.charges) spendCharge(unit, ability);
    else if (ability.cd) unit.cd[ability.id] = ability.cd;
    releaseSpell(unit, target, ability);
  }
  return true;
}

function queueFollowUp(unit, ability, explicit, quiet) {
  const saved = unit.gcd;
  unit.gcd = 0;
  const target = resolveTarget(unit, ability, explicit);
  const reason = validate(unit, ability, target);
  unit.gcd = saved;
  if (reason) {
    if (unit.human && !quiet) feedback(unit, reason);
    return false;
  }
  unit.nextSpell = {
    abilityId: ability.id,
    targetId: explicit ? explicit.id : null,
    aimPoint: unit.aimPoint ? { x: unit.aimPoint.x, y: unit.aimPoint.y, h: unit.aimPoint.h } : null,
  };
  return true;
}

function releaseQueue(unit) {
  const next = unit.nextSpell;
  if (!next || unit.cast || unit.hp <= 0) return;
  const ability = unit.abilities.find((a) => a.id === next.abilityId);
  if (!ability) {
    unit.nextSpell = null;
    return;
  }
  if (ability.gcd !== false && unit.gcd > 0.02) return;
  unit.nextSpell = null;
  if (next.aimPoint) unit.aimPoint = next.aimPoint;
  const target = next.targetId ? unitById(next.targetId) : null;
  tryCast(unit, next.abilityId, target || undefined);
  unit.aimPoint = null;
}

function finishCast(unit) {
  const cast = unit.cast;
  unit.cast = null;
  const ability = cast.ability;
  const target = unitById(cast.targetId);
  if (ability.target === "enemy" || ability.target === "friend" || ability.target === "any") {
    const lost = !target || target.hp <= 0
      || (ability.range && dist(unit, target) > ability.range + 3)
      || (ability.minRange && dist(unit, target) < ability.minRange - 0.5)
      || !hasLoS(unit, target);
    if (lost) {
      const max = CLASSES[unit.classId].resource.max;
      unit.resource = Math.min(max, unit.resource + cast.cost);
      if (unit.human) feedback(unit, "Lost the target");
      combat(`${nameOf(unit)} loses ${ability.name}.`);
      releaseQueue(unit);
      return;
    }
  }
  if (hardLocked(unit)) {
    unit.nextSpell = null;
    return;
  }
  if (ability.cd) unit.cd[ability.id] = ability.cd;
  releaseSpell(unit, target, ability);
  releaseQueue(unit);
}

function blinkMove(unit, dx, dy, distance) {
  const len = Math.hypot(dx, dy) || 1;
  const step = 0.4;
  let left = distance;
  while (left > 0) {
    const hop = Math.min(step, left);
    const nx = unit.x + (dx / len) * hop;
    const ny = unit.y + (dy / len) * hop;
    if (!canStand(unit, nx, ny)) break;
    unit.x = nx;
    unit.y = ny;
    left -= hop;
  }
  const surface = standSurface(unit.x, unit.y, unit.height);
  if (surface != null && unit.height < surface) unit.height = surface;
  unit.facing = Math.atan2(dy, dx);
  unit.vx = 0;
  unit.vy = 0;
}

function launchBackward(unit) {
  unit.auras = unit.auras.filter((a) => a.control !== "root");
  const floor = standSurface(unit.x, unit.y, unit.height);
  const ground = floor == null ? 0 : floor;
  const airborne = unit.height > ground + 0.2 || unit.vz > 1;
  const backX = -Math.cos(unit.facing);
  const backY = -Math.sin(unit.facing);
  const push = airborne ? 28 : 22;
  unit.vx += backX * push;
  unit.vy += backY * push;
  unit.vz = airborne ? unit.vz + 2.5 : 8.6;
  unit.knock = airborne ? 0.9 : 0.62;
  if (unit.height < ground + 0.05) unit.height = ground + 0.05;
}

function jumpUnit(unit) {
  if (!unit || unit.hp <= 0 || unit.dash) return;
  if (hardLocked(unit) || unit.auras.some((a) => a.control === "root" || a.ice)) return;
  const floor = standSurface(unit.x, unit.y, unit.height);
  const ground = floor == null ? 0 : floor;
  if (unit.height > ground + 0.08 || unit.vz > 0) return;
  unit.vz = TUNE.jumpVelocity;
  unit.height = ground + 0.06;
}

function projectAim(unit, x, y, range, minRange, checkLos, h) {
  let dx = x - unit.x;
  let dy = y - unit.y;
  const d = Math.hypot(dx, dy) || 0.001;
  const scale = d > range ? range / d : 1;
  const px = unit.x + dx * scale;
  const py = unit.y + dy * scale;
  const surface = standSurface(px, py, (h == null ? unit.height : h) + 0.4);
  const point = { x: px, y: py, h: surface == null ? 0 : surface };
  const landed = Math.hypot(px - unit.x, py - unit.y);
  if (minRange && landed < minRange - 0.05) return { ...point, ok: false, reason: "Too close" };
  if (checkLos === false) return { ...point, ok: true, reason: null };
  const los = hasLoS(unit, { x: px, y: py, height: point.h });
  return { ...point, ok: los, reason: los ? null : "Line of sight" };
}

function refreshAimCursor() {
  if (!match?.groundAim || !lastPointer || !window.ArenaView) return;
  const p = ArenaView.groundPoint(lastPointer.x, lastPointer.y);
  if (!p) return;
  match.groundAim.cursor = projectAim(match.player, p.x, p.z, match.groundAim.range, match.groundAim.minRange, match.groundAim.los, p.h);
}

function confirmGroundAim() {
  const aim = match.groundAim;
  if (!aim) return;
  refreshAimCursor();
  const cursor = match.groundAim && match.groundAim.cursor;
  if (!cursor) {
    feedback(match.player, "Aim the circle");
    return;
  }
  if (!cursor.ok) {
    feedback(match.player, cursor.reason || "Can't place there");
    return;
  }
  match.groundAim = null;
  if (match.netRole === "client") {
    sendInput({ cast: aim.abilityId, aimX: cursor.x, aimY: cursor.y, aimH: cursor.h });
    return;
  }
  match.player.aimPoint = { x: cursor.x, y: cursor.y, h: cursor.h };
  tryCast(match.player, aim.abilityId);
  match.player.aimPoint = null;
}

function onDeath(unit, killer) {
  if (unit.dead) return;
  unit.dead = true;
  unit.hp = 0;
  cancelCast(unit, false);
  unit.dash = null;
  unit.auras = [];
  combat(`${nameOf(unit)} dies${killer ? ` to ${nameOf(killer)}` : ""}.`);
  floater(unit, "Dead", "#ff8d8d");
}

function laneYs(size) {
  if (size <= 1) return [20];
  if (size === 2) return [22, 38];
  return [16, 30, 44];
}

function makeUnit(classId, team, x, y, opts) {
  opts = opts || {};
  const def = CLASSES[classId];
  const isPlayer = !!opts.local;
  if (opts.id) nextId = Math.max(nextId, opts.id + 1);
  const unit = {
    id: opts.id || nextId++,
    classId,
    team,
    isPlayer,
    human: opts.human != null ? !!opts.human : isPlayer,
    peerId: opts.peerId || null,
    givenName: opts.name || null,
    gearTier: opts.tier === 2 ? 2 : 1,
    name: def.name,
    x,
    y,
    r: 1.7,
    facing: team === "ally" ? 0 : Math.PI,
    hp: def.hp,
    hpMax: def.hp,
    resource: def.resource.start,
    abilities: def.abilities.map((a) => ({ ...a })),
    auras: [],
    cd: {},
    charges: {},
    recharge: {},
    gcd: 0,
    silence: 0,
    lockout: 0,
    cast: null,
    nextSpell: null,
    dash: null,
    vx: 0,
    vy: 0,
    vz: 0,
    height: 0,
    knock: 0,
    aimPoint: null,
    swing: 0.6,
    targetId: null,
    goal: null,
    aiTimer: 0.4 + Math.random() * 0.4,
    fearAng: 0,
    fearTurn: 0,
    dr: { stun: null, incap: null, fear: null, root: null },
    stats: { damage: 0, healing: 0 },
    dead: false,
    remote: null,
    appliedJump: 0,
    appliedCancel: 0,
    appliedCast: 0,
    lastNote: "",
    noteUntil: 0,
    toX: x,
    toY: y,
  };
  applyTalents(unit, opts.talents);
  return unit;
}

function assignNames(units) {
  const counts = {};
  for (const u of units) counts[u.classId] = (counts[u.classId] || 0) + 1;
  const seen = {};
  for (const u of units) {
    const base = CLASSES[u.classId].name;
    u.label = base;
    if (u.givenName) u.name = u.givenName;
    else if (u.isPlayer && !u.peerId) u.name = "You";
    else if (counts[u.classId] > 1) {
      seen[u.classId] = (seen[u.classId] || 0) + 1;
      u.name = `${base} ${seen[u.classId]}`;
    } else u.name = base;
  }
}

function rosterFromSpec(spec) {
  const me = window.ArenaNet && ArenaNet.id;
  if (spec.roster) {
    return spec.roster.map((r) => ({ ...r, local: !!(r.peerId && r.peerId === me) }));
  }
  const allies = spec.allies ? [spec.player, ...spec.allies].slice(0, spec.size || 2) : [spec.player, spec.ally].filter(Boolean);
  const enemies = spec.enemies ? spec.enemies.slice(0, spec.size || spec.enemies.length) : [spec.enemyA, spec.enemyB].filter(Boolean);
  const ay = laneYs(allies.length);
  const ey = laneYs(enemies.length);
  const roster = [];
  let id = 1;
  allies.forEach((classId, i) => roster.push({
    id: id++, classId, team: "ally", x: 18, y: ay[i], human: i === 0, local: i === 0, peerId: null, name: null,
    talents: i === 0 ? picksFor(classId) : rollTalents(classId),
    tier: i === 0 ? gearTier(classId) : 1,
  }));
  enemies.forEach((classId, i) => roster.push({
    id: id++, classId, team: "enemy", x: 82, y: ey[i], human: false, local: false, peerId: null, name: null,
    talents: rollTalents(classId),
  }));
  return roster;
}

function createMatch(spec) {
  if (window.ArenaView) ArenaView.reset();
  const mapId = spec.map && MAPS[spec.map] ? spec.map : (spec.training ? (MAPS[trainMap] ? trainMap : "court") : rollMap());
  spec.map = mapId;
  const roster = rosterFromSpec(spec);
  nextId = 1;
  const units = roster.map((r) => makeUnit(r.classId, r.team, r.x, r.y, r));
  assignNames(units);
  const player = units.find((u) => u.isPlayer) || units[0];
  if (spec.training) {
    let allyN = 0;
    let enemyN = 0;
    const friends = units.filter((u) => u !== player && u.team === player.team).length;
    const foes = units.filter((u) => u.team !== player.team).length;
    for (const unit of units) {
      if (unit === player) continue;
      unit.dummy = true;
      unit.human = false;
      const friendly = unit.team === player.team;
      const n = friendly ? ++allyN : ++enemyN;
      const label = friendly ? "Ally" : "Dummy";
      unit.name = (friendly ? friends : foes) > 1 ? `${label} ${n}` : (friendly ? "Ally dummy" : "Dummy");
    }
  }
  const firstFoe = units.find((u) => u.team !== player.team) || units[0];
  player.targetId = firstFoe.id;
  for (const u of units) {
    if (u === player) continue;
    const foe = units.find((o) => o.team !== u.team);
    if (foe) u.targetId = foe.id;
  }
  match = {
    units,
    player,
    time: 0,
    phase: "prep",
    traps: [],
    lanterns: [],
    logs: [],
    floaters: [],
    fx: [],
    groundAim: null,
    feedbackCd: 0,
    lastFeedback: "",
    reflectLock: false,
    setup: spec,
    netRole: spec.netRole || "local",
    serverAuth: !!spec.serverAuth,
    winSide: null,
    training: !!spec.training,
    map: mapId,
  };
  for (const unit of units) unit.height = standSurface(unit.x, unit.y, 999) || 0;
  if (window.ArenaView) ArenaView.setMap(mapId);
  if (spec.training) {
    match.phase = "fight";
    match.time = TUNE.prep;
  }
  netSend = 0;
  const mapName = MAPS[mapId].name;
  combat(spec.training
    ? `${mapName}. The dummies hold still. Drag the frames where you want them, then head back.`
    : `${mapName}. Take your positions. Gates open in a moment.`);
  hoverAbility = null;
  buildMatchUi();
  if (!window.HEADLESS) {
    $("lobby").classList.add("hidden");
    $("match").classList.remove("hidden");
    $("result").classList.add("hidden");
    if ($("leave-training")) $("leave-training").classList.toggle("hidden", !match.training);
    requestAnimationFrame(resizeCanvas);
  }
}

function tickAuras(unit, dt) {
  for (const aura of unit.auras) {
    if (!aura.hold) aura.remaining -= dt;
    if (aura.dot) {
      aura.dot.tick -= dt;
      if (aura.dot.tick <= 0 && aura.remaining > 0) {
        aura.dot.tick += aura.dot.every;
        const src = unitById(aura.dot.sourceId);
        dealDamage(src, unit, aura.dot.damage, { direct: false, school: aura.dot.school, name: aura.dot.name });
        const spark = aura.dot.fx || (aura.id === "swp" ? "#c084fc" : null);
        if (spark) spellFx({ kind: "burst", color: spark, x: unit.x, y: unit.y, h: 1.35 + (unit.height || 0), life: 0.28, size: 0.7 });
      }
    }
    if (aura.hot) {
      aura.hot.tick -= dt;
      if (aura.hot.tick <= 0 && aura.remaining > 0) {
        aura.hot.tick += aura.hot.every;
        const src = unitById(aura.hot.sourceId);
        if (src) heal(src, unit, aura.hot.heal, aura.hot.name, true);
        spellFx({ kind: "burst", color: "#7dff9a", x: unit.x, y: unit.y, h: 1.5 + (unit.height || 0), life: 0.28, size: 0.65 });
      }
    }
    if (aura.remaining <= 0 && aura.bloom) {
      const src = unitById(aura.bloom.sourceId);
      if (src && unit.hp > 0) heal(src, unit, aura.bloom.heal, aura.bloom.name);
      spellFx({ kind: "burst", color: "#c6ff8a", x: unit.x, y: unit.y, h: 1.6 + (unit.height || 0), life: 0.45, size: 1.3 });
    }
    if (aura.silence) unit.silence = Math.max(unit.silence, aura.remaining);
  }
  unit.auras = unit.auras.filter((a) => (a.hold || a.remaining > 0) && (a.absorb == null || a.absorb > 0));
}

function spendCharge(unit, ability) {
  const max = ability.charges;
  if (!unit.charges) unit.charges = {};
  if (!unit.recharge) unit.recharge = {};
  if (unit.charges[ability.id] == null) unit.charges[ability.id] = max;
  unit.charges[ability.id] = Math.max(0, unit.charges[ability.id] - 1);
  if (unit.charges[ability.id] < max && !(unit.recharge[ability.id] > 0)) {
    unit.recharge[ability.id] = ability.recharge || 20;
  }
}

function tickCharges(unit, dt) {
  if (!unit.charges) unit.charges = {};
  if (!unit.recharge) unit.recharge = {};
  for (const ability of unit.abilities) {
    if (!ability.charges) continue;
    const max = ability.charges;
    if (unit.charges[ability.id] == null) unit.charges[ability.id] = max;
    if (unit.charges[ability.id] >= max) {
      unit.recharge[ability.id] = 0;
      continue;
    }
    if (!(unit.recharge[ability.id] > 0)) unit.recharge[ability.id] = ability.recharge || 20;
    unit.recharge[ability.id] -= dt;
    if (unit.recharge[ability.id] <= 0) {
      unit.charges[ability.id] += 1;
      unit.recharge[ability.id] = unit.charges[ability.id] >= max ? 0 : (ability.recharge || 20);
    }
  }
}

function tickUnitTimers(unit, dt) {
  if (unit.gcd > 0) unit.gcd = Math.max(0, unit.gcd - dt);
  if (unit.silence > 0) unit.silence = Math.max(0, unit.silence - dt);
  if (unit.lockout > 0) unit.lockout = Math.max(0, unit.lockout - dt);
  for (const key of Object.keys(unit.cd)) {
    if (unit.cd[key] > 0) unit.cd[key] = Math.max(0, unit.cd[key] - dt);
  }
  tickCharges(unit, dt);
}

function tickSwing(unit, dt) {
  if (unit.dummy || unit.hp <= 0 || unit.cast || unit.dash || hardLocked(unit) || isFeigning(unit) || isVeiled(unit)) return;
  const auto = CLASSES[unit.classId].auto;
  const target = unitById(unit.targetId);
  if (!target || target.hp <= 0 || target.team === unit.team || isHidden(target)) return;
  const d = dist(unit, target);
  if (d > auto.range || d < auto.minRange || !hasLoS(unit, target)) return;
  unit.swing -= dt;
  if (unit.swing > 0) return;
  unit.swing += auto.interval;
  const dealt = dealDamage(unit, target, auto.damage, { direct: true, school: "physical", name: "Auto attack", log: false });
  if (unit.classId === "warrior" && dealt >= 0) unit.resource = Math.min(100, unit.resource + (unit.rageOnSwing || 12));
  if (unit.classId === "duelist" && isDuelMark(unit, target) && !immune(target)) gainMomentum(unit, 8);
}

function tickCast(unit, dt) {
  if (!unit.cast) return;
  if (hardLocked(unit)) {
    cancelCast(unit, true);
    return;
  }
  const cast = unit.cast;
  if (cast.channel) {
    const target = unitById(cast.targetId);
    const lost = !target || target.hp <= 0
      || (cast.ability.range && dist(unit, target) > cast.ability.range + 3)
      || (cast.ability.id !== "penance" && !hasLoS(unit, target));
    if (lost) {
      cancelCast(unit, false);
      if (unit.human) feedback(unit, "Lost the target");
      return;
    }
    cast.time -= dt;
    cast.pulse -= dt;
    if (cast.pulse <= 0 && cast.pulsesLeft > 0) {
      releaseSpell(unit, target, cast.ability);
      cast.pulsesLeft--;
      cast.pulse += cast.total / (cast.ability.pulses || 1);
    }
    if (cast.time <= 0 || cast.pulsesLeft <= 0) unit.cast = null;
    return;
  }
  cast.time -= dt;
  if (cast.time <= 0) finishCast(unit);
}

function tickDash(unit, dt) {
  if (!unit.dash) return;
  const dash = unit.dash;
  const dx = dash.x - unit.x;
  const dy = dash.y - unit.y;
  const d = Math.hypot(dx, dy);
  const step = Math.min(d, (d / Math.max(dash.t, 0.016)) * dt);
  if (d < 0.3 || dash.t <= 0) {
    unit.x = dash.x;
    unit.y = dash.y;
    const stunTarget = unitById(dash.stunId);
    unit.dash = null;
    if (dash.leap) unit.height = dash.floor1 || 0;
    else {
      const surface = standSurface(unit.x, unit.y, unit.height + 0.4);
      if (surface != null && unit.height <= surface + 1.2) unit.height = surface;
    }
    unit.vz = 0;
    unit.vx = 0;
    unit.vy = 0;
    clampUnit(unit);
    if (dash.yank) {
      spellFx({ kind: "burst", color: "#e23d4a", x: unit.x, y: unit.y, h: 0.8, life: 0.35, size: 1.3 });
      const from = unitById(dash.yankFrom);
      if (dash.stun && from && unit.hp > 0) {
        applyControl(from, unit, {
          id: "yank",
          name: "Yank",
          short: "Stun",
          control: "stun",
          dr: "stun",
          duration: 1.5,
          dispellable: false,
        });
      }
      return;
    }
    if (dash.lunge) {
      spellFx({ kind: "burst", color: "#7f9cff", x: unit.x, y: unit.y, h: 0.45, life: 0.3, size: 1.2 });
      const mark = unitById(dash.markId);
      if (mark && mark.hp > 0 && dist(unit, mark) < 7) {
        gainMomentum(unit, dash.momentum || 0);
        if (dash.stunMark) {
          applyControl(unit, mark, {
            id: "lungeStun",
            name: "Lunge",
            short: "Stun",
            control: "stun",
            dr: "stun",
            duration: 1.5,
            dispellable: false,
          });
        }
      }
      return;
    }
    if (dash.leap) spellFx({ kind: "burst", color: "#e7c98a", x: unit.x, y: unit.y, h: 0.4, life: 0.32, size: 1.55 });
    else spellFx({ kind: "ring", color: "#ffe08a", x: unit.x, y: unit.y, h: 0.12, life: 0.32, size: 2.1 });
    if (stunTarget && stunTarget.hp > 0 && dist(unit, stunTarget) < 7) {
      applyControl(unit, stunTarget, {
        id: "chargeStun",
        name: "Rush",
        short: "Stun",
        control: "stun",
        dr: "stun",
        duration: 1.5,
        dispellable: false,
      });
    }
    return;
  }
  unit.x += (dx / d) * step;
  unit.y += (dy / d) * step;
  dash.t -= dt;
  if (dash.leap) {
    const p = clamp(1 - Math.max(dash.t, 0) / (dash.dur || 0.4), 0, 1);
    const base = (dash.floor0 || 0) + ((dash.floor1 || 0) - (dash.floor0 || 0)) * p;
    unit.height = base + Math.sin(p * Math.PI) * (dash.arc || 3);
    clampUnit(unit, true);
  } else {
    unit.facing = Math.atan2(dy, dx);
    clampUnit(unit);
  }
}

function tickTraps(dt) {
  for (const trap of match.traps) {
    trap.life -= dt;
    if (trap.arm > 0) {
      trap.arm -= dt;
      continue;
    }
    const victim = match.units.find((u) => u.hp > 0 && u.team !== trap.team && Math.abs(u.height - (trap.h || 0)) < 2.4 && dist(u, trap) <= trap.radius);
    if (victim) {
      trap.life = 0;
      const owner = unitById(trap.ownerId);
      spellFx({ kind: "burst", color: "#c6f4ff", x: victim.x, y: victim.y, h: 1.05, life: 0.4, size: 1.35 });
      applyControl(owner || victim, victim, {
        id: "freezingTrap",
        name: "Snare Trap",
        short: "Trap",
        control: "incap",
        dr: "incap",
        duration: 5,
        breakOnDamage: true,
        dispellable: true,
      });
      if (trap.silence && owner) silenceUnit(owner, victim, 3);
    }
  }
  match.traps = match.traps.filter((t) => t.life > 0);
}

function tickLanterns(dt) {
  if (!match.lanterns) return;
  for (const lantern of match.lanterns) {
    lantern.life -= dt;
    if (lantern.beacon > 0) lantern.beacon = Math.max(0, lantern.beacon - dt);
    lantern.tick -= dt;
    if (lantern.tick > 0 || lantern.life <= 0) continue;
    lantern.tick += 1.5;
    const owner = unitById(lantern.ownerId);
    if (!owner || owner.hp <= 0) {
      lantern.life = 0;
      continue;
    }
    const reach = lantern.beacon > 0 ? lantern.radius * 2 : lantern.radius;
    const inside = match.units.filter((u) => u.team === lantern.team && u.hp > 0 && Math.abs(u.height - (lantern.h || 0)) < 2.4 && dist(u, lantern) <= reach);
    const targets = lantern.beacon > 0 && inside.length ? friendsOf(owner) : inside;
    if (lantern.healOwner && owner.hp > 0 && !targets.includes(owner)) targets.push(owner);
    for (const ally of targets) heal(owner, ally, lantern.heal || 34, "Kindle", true);
    if (lantern.slowFoes) {
      for (const foe of foesOf(owner)) {
        if (foe.hp <= 0 || Math.abs(foe.height - (lantern.h || 0)) >= 2.4 || dist(foe, lantern) > reach) continue;
        addAura(foe, { id: "lanternSlow", name: "Lantern", short: "Sn", type: "debuff", remaining: 2, slow: 0.3, dispellable: true });
      }
    }
  }
  match.lanterns = match.lanterns.filter((l) => l.life > 0);
}

function regen(unit, dt) {
  const res = CLASSES[unit.classId].resource;
  if (res.regen) unit.resource = Math.min(res.max, unit.resource + res.regen * dt);
}

function nearestFoe(unit) {
  let best = null;
  let bestD = Infinity;
  for (const foe of foesOf(unit)) {
    if (immune(foe) || isHidden(foe)) continue;
    const d = dist(unit, foe);
    if (d < bestD) {
      best = foe;
      bestD = d;
    }
  }
  return best;
}

function pickKillTarget(unit) {
  const foes = foesOf(unit).filter((f) => !immune(f) && !isHidden(f));
  if (!foes.length) return null;
  const caller = match.units.find((u) => u.human && u.team === unit.team);
  if (caller) {
    const selected = unitById(caller.targetId);
    if (selected && selected.team !== unit.team && selected.hp > 0 && !immune(selected) && !isHidden(selected)) return selected;
  }
  const human = foes.find((f) => f.human);
  if (human) return human;
  return [...foes].sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax)[0];
}

function interruptPlan(cast) {
  if (cast.plan) return cast.plan;
  const total = cast.total || 0;
  if (cast.channel) {
    cast.plan = { skip: Math.random() < 0.4, at: 0.85 + Math.random() * 0.7 };
    return cast.plan;
  }
  const earliest = Math.max(0.7, total * 0.42);
  const latest = total - 0.28;
  if (total < 1.15 || latest <= earliest) {
    cast.plan = { skip: true, at: total };
    return cast.plan;
  }
  cast.plan = {
    skip: Math.random() < 0.32,
    at: earliest + Math.random() * (latest - earliest),
  };
  return cast.plan;
}

function tryKick(unit, abilityId, range, minRange) {
  for (const foe of foesOf(unit)) {
    if (!foe.cast || isHidden(foe) || immune(foe)) continue;
    const gap = dist(unit, foe);
    if (gap > range || (minRange && gap < minRange) || !hasLoS(unit, foe)) continue;
    const plan = interruptPlan(foe.cast);
    if (plan.skip) continue;
    const elapsed = (foe.cast.total || 0) - foe.cast.time;
    if (elapsed + 0.02 < plan.at || foe.cast.time < 0.18) continue;
    return tryCast(unit, abilityId, foe);
  }
  return false;
}

function forgetHiddenTargets() {
  for (const unit of match.units) {
    const target = unitById(unit.targetId);
    if (!target || !isHidden(target) || target.team === unit.team) continue;
    unit.targetId = null;
    unit.goal = null;
    if (unit.cast && unit.cast.targetId === target.id) cancelCast(unit, true);
  }
}

function maybeTrinket(unit) {
  if ((unit.cd.trinket || 0) > 0) return false;
  const cc = unit.auras.find((a) => a.control === "stun" || a.control === "incap" || a.control === "fear");
  const rooted = unit.auras.some((a) => a.control === "root");
  const low = unit.hp / unit.hpMax < 0.42;
  if (cc && (cc.remaining > 2 || low)) return tryCast(unit, "trinket");
  if ((unit.silence > 1.5 && low) || (rooted && low && nearestFoe(unit) && dist(unit, nearestFoe(unit)) < 8)) {
    return tryCast(unit, "trinket");
  }
  return false;
}

function pathTo(from, to) {
  if (hasLoS(from, to)) return { x: to.x, y: to.y };
  const map = activeMap();
  const feet = from.height || 0;
  const corners = [];
  for (const block of map.blocks) {
    if (block.below != null && feet >= block.below - 0.2) continue;
    const box = blockAabb(block, 0);
    const pad = 3.8;
    corners.push(
      { x: box.minX - pad, y: box.minY - pad },
      { x: box.maxX + pad, y: box.minY - pad },
      { x: box.minX - pad, y: box.maxY + pad },
      { x: box.maxX + pad, y: box.maxY + pad }
    );
  }
  for (const ramp of map.ramps || []) {
    const x = ramp.high === "end" ? ramp.x0 + 1.5 : ramp.x1 - 1.5;
    corners.push({ x, y: (ramp.y0 + ramp.y1) / 2 });
  }
  let best = null;
  let bestScore = Infinity;
  for (const corner of corners) {
    if (!hasLoS(from, corner) || !hasLoS(corner, to)) continue;
    const score = Math.hypot(from.x - corner.x, from.y - corner.y) + Math.hypot(to.x - corner.x, to.y - corner.y);
    if (score < bestScore) {
      best = corner;
      bestScore = score;
    }
  }
  if (!best) {
    for (const corner of corners) {
      if (!hasLoS(from, corner)) continue;
      const score = Math.hypot(to.x - corner.x, to.y - corner.y);
      if (score < bestScore) {
        best = corner;
        bestScore = score;
      }
    }
  }
  return best || { x: to.x, y: to.y };
}

function wantRange(unit, target, minR, maxR) {
  if (!target) {
    unit.goal = null;
    return;
  }
  const d = dist(unit, target);
  if (d > maxR) unit.goal = pathTo(unit, target);
  else if (d < minR) {
    const ang = Math.atan2(unit.y - target.y, unit.x - target.x);
    unit.goal = pathTo(unit, { x: unit.x + Math.cos(ang) * 12, y: unit.y + Math.sin(ang) * 12 });
  } else unit.goal = null;
}

function aiVanguard(unit) {
  const kill = pickKillTarget(unit);
  if (kill) unit.targetId = kill.id;
  tryKick(unit, "pummel", 5);
  const magicCast = foesOf(unit).find((f) => !isHidden(f) && f.cast && f.cast.ability.reflectable && dist(unit, f) < 32 && hasLoS(unit, f));
  if (magicCast && (unit.cd.spellReflection || 0) <= 0) tryCast(unit, "spellReflection");
  if (kill && !unit.gcd) {
    const d = dist(unit, kill);
    const charged = d >= 8 && d <= 25 && hasLoS(unit, kill) && tryCast(unit, "charge", kill);
    if (!charged && d >= 8 && d <= 40 && hasLoS(unit, kill)) {
      unit.aimPoint = { x: kill.x, y: kill.y, h: kill.height };
      tryCast(unit, "heroicLeap");
      unit.aimPoint = null;
    }
    if (unit.hp / unit.hpMax < 0.5) tryCast(unit, "brace");
    const packed = foesOf(unit).filter((f) => !isHidden(f) && dist(unit, f) <= 8 && hasLoS(unit, f));
    if (packed.length) tryCast(unit, "quake");
    if (kill.hp / kill.hpMax <= 0.2) tryCast(unit, "execute", kill);
    tryCast(unit, "mortalStrike", kill);
    if (!kill.auras.some((a) => a.slow)) tryCast(unit, "hamstring", kill);
    tryCast(unit, "overpower", kill);
  }
  wantRange(unit, kill, 0, 4.4);
}

function aiChanneler(unit) {
  const kill = pickKillTarget(unit);
  if (kill) unit.targetId = kill.id;
  if (unit.hp / unit.hpMax < 0.25) tryCast(unit, "iceBlock");
  if (unit.hp / unit.hpMax < 0.55 && !unit.auras.some((a) => a.absorb)) tryCast(unit, "emberWard");
  tryKick(unit, "counterspell", 30);
  const near = nearestFoe(unit);
  if (near && dist(unit, near) < 8 && (unit.cd.blink || 0) <= 0) {
    unit.facing = Math.atan2(unit.y - near.y, unit.x - near.x);
    tryCast(unit, "blink");
  }
  if (near && dist(unit, near) < 7.5) tryCast(unit, "frostNova");
  const off = foesOf(unit).find((f) => f !== kill && !isHidden(f) && !immune(f) && drFactor(f, "incap") > 0 && !f.auras.some((a) => a.dot || a.control === "incap"));
  if (off && !unit.cast && drFactor(off, "incap") > 0) tryCast(unit, "polymorph", off);
  if (kill && !unit.cast) {
    const stacks = unit.auras.find((a) => a.id === "hotStreak")?.stacks || 0;
    if (hotStreakReady(unit)) tryCast(unit, "pyroblast", kill);
    else if (stacks > 0 || (near && dist(unit, near) < 16)) tryCast(unit, "scorch", kill);
    if (!unit.cast && (unit.cd.fireBlast || 0) <= 0 && dist(unit, kill) < 12) tryCast(unit, "fireBlast", kill);
    if (!unit.cast) tryCast(unit, "frostbolt", kill);
  }
  if (!unit.cast || unit.cast.ability.moveCast) wantRange(unit, near || kill, 12, 24);
}

function aiRanger(unit) {
  const kill = pickKillTarget(unit);
  if (kill) unit.targetId = kill.id;
  const pressured = foesOf(unit).some((f) => !isHidden(f) && (f.targetId === unit.id || dist(unit, f) < 12));
  if (pressured && unit.hp / unit.hpMax < 0.55) tryCast(unit, "feignDeath");
  if (unit.hp / unit.hpMax < 0.28) tryCast(unit, "deterrence");
  const near = nearestFoe(unit);
  if (near && dist(unit, near) < 8) {
    unit.facing = Math.atan2(near.y - unit.y, near.x - unit.x);
    tryCast(unit, "disengage");
  }
  tryKick(unit, "silencingShot", 35, 8);
  if (near && dist(unit, near) < 16 && (unit.cd.freezingTrap || 0) <= 0 && !match.traps.some((t) => t.ownerId === unit.id)) {
    const ang = Math.atan2(near.y - unit.y, near.x - unit.x);
    const place = Math.min(12, Math.max(4, dist(unit, near) * 0.65));
    const spot = { x: unit.x + Math.cos(ang) * place, y: unit.y + Math.sin(ang) * place };
    unit.aimPoint = hasLoS(unit, spot) ? spot : { x: unit.x, y: unit.y };
    tryCast(unit, "freezingTrap");
    unit.aimPoint = null;
  }
  if (kill && !unit.cast) {
    if (dist(unit, kill) <= 5) tryCast(unit, "wingClip", kill);
    if (dist(unit, kill) >= 8) tryCast(unit, "pin", kill);
    if (kill.hp / kill.hpMax <= 0.2 && dist(unit, kill) >= 8) tryCast(unit, "finishShot", kill);
    if (near && !near.auras.some((a) => a.slow) && dist(unit, near) >= 8) tryCast(unit, "concussiveShot", near);
    if (!near || dist(unit, near) > 10) tryCast(unit, "aimedShot", kill);
  }
  const aimed = unit.cast && unit.cast.ability.moveCast;
  if (!unit.cast || aimed) wantRange(unit, near || kill, 12, 26);
}

function aiCleric(unit) {
  const friends = friendsOf(unit);
  const lowest = [...friends].sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax)[0];
  const kill = pickKillTarget(unit);
  if (unit.hp / unit.hpMax < 0.34) tryCast(unit, "desperatePrayer");
  const near = nearestFoe(unit);
  if (near && dist(unit, near) < 8 && drFactor(near, "fear") > 0) tryCast(unit, "psychicScream");
  for (const friend of friends) {
    if (pickDispel(friend, "help")) {
      tryCast(unit, "dispelMagic", friend);
      break;
    }
  }
  if (kill && pickDispel(kill, "harm")) tryCast(unit, "dispelMagic", kill);
  if (lowest && lowest.hp / lowest.hpMax < 0.7 && !hasAura(lowest, "blessing")) tryCast(unit, "blessing", lowest);
  const chased = friends.find((friend) => !hasAura(friend, "speedBlessing") && foesOf(unit).some((foe) => !isHidden(foe) && dist(friend, foe) < 11));
  if (chased) tryCast(unit, "speedBlessing", chased);
  if (lowest && lowest.hp / lowest.hpMax < 0.82 && !hasAura(lowest, "powerWordShield") && !hasAura(lowest, "weakenedSoul")) {
    tryCast(unit, "powerWordShield", lowest);
  }
  const urgent = lowest && lowest.hp / lowest.hpMax < 0.78;
  if (urgent && !unit.cast) {
    if (lowest.hp / lowest.hpMax < 0.7) tryCast(unit, "penance", lowest);
    if (!unit.cast) tryCast(unit, "flashHeal", lowest);
  }
  if (!urgent && kill && !unit.cast && friends.every((f) => f.hp / f.hpMax > 0.72)) {
    unit.targetId = kill.id;
    if (!hasAura(kill, "swp")) tryCast(unit, "shadowWordPain", kill);
    else if ((unit.cd.penance || 0) <= 0) tryCast(unit, "penance", kill);
    else tryCast(unit, "mindBlast", kill);
  }
  if (!unit.cast || unit.cast.ability.moveCast) {
    if (near && dist(unit, near) < 11) wantRange(unit, near, 14, 28);
    else if (lowest && lowest !== unit && dist(unit, lowest) > 18 && lowest.hp / lowest.hpMax < 0.85) unit.goal = pathTo(unit, lowest);
    else if (kill) wantRange(unit, kill, 16, 28);
    else unit.goal = null;
  }
}

function aiHexer(unit) {
  const kill = pickKillTarget(unit);
  if (kill) unit.targetId = kill.id;
  if (unit.hp / unit.hpMax < 0.36) tryCast(unit, "healthstone");
  if (unit.hp / unit.hpMax < 0.6 && !unit.auras.some((a) => a.absorb)) tryCast(unit, "umbralShell");
  tryKick(unit, "spellLock", 30);
  const off = foesOf(unit).find((foe) => (
    foe !== kill
    && !isHidden(foe)
    && !immune(foe)
    && drFactor(foe, "fear") > 0
    && !foe.auras.some((a) => a.dot || a.control)
  ));
  if (off && !unit.cast) tryCast(unit, "fear", off);
  if (kill && !unit.cast) {
    if (!hasAura(kill, "wither")) tryCast(unit, "wither", kill);
    if (!hasAura(kill, "corruption")) tryCast(unit, "corruption", kill);
    if (!hasAura(kill, "agony")) tryCast(unit, "agony", kill);
    if (!hasAura(kill, "unstableAffliction")) tryCast(unit, "unstableAffliction", kill);
    if (!unit.cast && unit.hp / unit.hpMax < 0.62 && dist(unit, kill) <= 30) tryCast(unit, "drainLife", kill);
    if (!unit.cast && hasAura(kill, "corruption") && hasAura(kill, "agony")) tryCast(unit, "shadowBolt", kill);
  }
  const near = nearestFoe(unit);
  if (!unit.cast) wantRange(unit, near || kill, 16, 30);
}

function aiGrovekeeper(unit) {
  const friends = friendsOf(unit);
  const lowest = [...friends].sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax)[0];
  const kill = pickKillTarget(unit);
  const near = nearestFoe(unit);
  if (near && dist(unit, near) < 28 && drFactor(near, "root") > 0 && !near.auras.some((a) => a.control === "root")) tryCast(unit, "thicket", near);
  for (const friend of friends) {
    if (pickDispel(friend, "help")) {
      tryCast(unit, "clearbloom", friend);
      break;
    }
  }
  if (lowest && lowest.hp / lowest.hpMax < 0.42) tryCast(unit, "ironbark", lowest);
  for (const friend of friends) {
    if (friend.hp / friend.hpMax < 0.94 && !hasAura(friend, "rejuvenation")) {
      tryCast(unit, "rejuvenation", friend);
    }
  }
  if (lowest && !hasAura(lowest, "lifebloom")) tryCast(unit, "lifebloom", lowest);
  if (friends.filter((friend) => friend.hp / friend.hpMax < 0.82).length >= 2) tryCast(unit, "wildGrowth");
  const urgent = lowest && lowest.hp / lowest.hpMax < 0.62;
  if (urgent && lowest.auras.some((a) => a.hot) && !unit.cast) tryCast(unit, "swiftmend", lowest);
  if (urgent && !unit.cast) tryCast(unit, "regrowth", lowest);
  const clone = foesOf(unit).find((foe) => (
    foe !== kill
    && !isHidden(foe)
    && !immune(foe)
    && drFactor(foe, "incap") > 0
    && !foe.auras.some((a) => a.control || a.dot)
  ));
  if (!urgent && clone && !unit.cast && friends.every((friend) => friend.hp / friend.hpMax > 0.7)) {
    tryCast(unit, "cyclone", clone);
  }
  if (!urgent && !unit.cast && kill && friends.every((friend) => friend.hp / friend.hpMax > 0.84)) {
    unit.targetId = kill.id;
    tryCast(unit, "wrath", kill);
  }
  if (!unit.cast) {
    if (near && dist(unit, near) < 11) wantRange(unit, near, 14, 28);
    else if (lowest && lowest !== unit && dist(unit, lowest) > 18 && lowest.hp / lowest.hpMax < 0.85) unit.goal = pathTo(unit, lowest);
    else if (kill) wantRange(unit, kill, 16, 28);
    else unit.goal = null;
  }
}

function aiShade(unit) {
  const kill = pickKillTarget(unit);
  if (kill) unit.targetId = kill.id;
  if (unit.hp / unit.hpMax < 0.34) tryCast(unit, "vanish");
  tryKick(unit, "kick", 5);
  const hidden = isVeiled(unit);
  if (!hidden && !inCombat(unit) && kill && dist(unit, kill) > 10 && (unit.cd.stealth || 0) <= 0 && unit.hp / unit.hpMax > 0.5) {
    tryCast(unit, "stealth");
  }
  if (isVeiled(unit) && kill && dist(unit, kill) <= 5) tryCast(unit, "cheapShot", kill);
  const off = foesOf(unit).find((foe) => (
    foe !== kill
    && !immune(foe)
    && !isHidden(foe)
    && dist(unit, foe) <= 5
    && drFactor(foe, "incap") > 0
    && !foe.auras.some((a) => a.control || a.dot)
  ));
  if (off && !isVeiled(unit)) tryCast(unit, "gouge", off);
  if (kill && !isVeiled(unit) && dist(unit, kill) <= 5) {
    if (unit.resource >= 35) tryCast(unit, "eviscerate", kill);
    if (!kill.auras.some((a) => a.slow)) tryCast(unit, "tendon", kill);
    if (!unit.gcd) tryCast(unit, "sinisterStrike", kill);
  }
  if (kill && dist(unit, kill) > 6 && dist(unit, kill) <= 20) tryCast(unit, "step", kill);
  if (kill && dist(unit, kill) > 14) tryCast(unit, "sprint");
  if (isVeiled(unit) && kill) unit.goal = pathTo(unit, kill);
  else wantRange(unit, kill, 0, 4.4);
}

function aiWarden(unit) {
  const friends = friendsOf(unit);
  const lowest = [...friends].sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax)[0];
  const near = nearestFoe(unit);
  const lantern = lanternOf(unit);
  const hurt = friends.filter((f) => f.hp / f.hpMax < 0.62);
  if (lantern && (lowest?.hp / lowest.hpMax < 0.4 || hurt.length >= 2)) tryCast(unit, "beacon");
  if (lantern && near && dist(unit, near) < 10 && dist(unit, lantern) > 14) tryCast(unit, "wickstep");
  const allyOut = lowest && (!lantern || dist(lowest, lantern) > lanternReach(lantern) + 1);
  if (!lantern || (allyOut && lowest.hp / lowest.hpMax < 0.88)) {
    unit.aimPoint = lowest && hasLoS(unit, lowest) ? { x: lowest.x, y: lowest.y } : { x: unit.x, y: unit.y };
    tryCast(unit, "kindle");
    unit.aimPoint = null;
  }
  for (const friend of friends) {
    if (pickDispel(friend, "help")) {
      tryCast(unit, "hush", friend);
      break;
    }
  }
  if (lowest && lowest.hp / lowest.hpMax < 0.78 && !lowest.auras.some((a) => a.absorb)) tryCast(unit, "shelter", lowest);
  const lit = lanternOf(unit);
  const foeIn = lit && foesOf(unit).find((f) => !immune(f) && dist(f, lit) <= lanternReach(lit) && hasLoS(lit, f));
  if (foeIn && drFactor(foeIn, "fear") > 0 && (!lowest || lowest.hp / lowest.hpMax > 0.45)) tryCast(unit, "flare");
  if (foeIn && !foeIn.auras.some((a) => a.slow)) tryCast(unit, "snuff");
  if (lowest && lowest.hp / lowest.hpMax < 0.72 && standingInLantern(unit, lowest)) tryCast(unit, "tend", lowest);
  if (lowest && lowest.hp / lowest.hpMax < 0.84 && !unit.cast) tryCast(unit, "soothe", lowest);
  if (lowest && lowest.hp / lowest.hpMax < 0.58 && !unit.cast) tryCast(unit, "mend", lowest);
  if (!unit.cast) {
    const stand = lanternOf(unit);
    const foe = pickKillTarget(unit);
    if (near && dist(unit, near) < 11) wantRange(unit, near, 14, 28);
    else if (lowest && lowest !== unit && dist(unit, lowest) > 14 && lowest.hp / lowest.hpMax < 0.85) unit.goal = pathTo(unit, lowest);
    else if (stand && dist(unit, stand) > lanternReach(stand)) unit.goal = pathTo(unit, stand);
    else if (foe) wantRange(unit, foe, 16, 28);
    else unit.goal = null;
  }
}

function aiBinder(unit) {
  const kill = pickKillTarget(unit);
  if (kill) unit.targetId = kill.id;
  if (unit.hp / unit.hpMax < 0.55 && !unit.auras.some((a) => a.absorb)) tryCast(unit, "bulwark");
  const foes = foesOf(unit);
  if (foes.length >= 2 && dist(foes[0], foes[1]) <= 12 && (!kill || kill.hp / kill.hpMax > 0.35)) tryCast(unit, "bind");
  tryKick(unit, "silenceLash", 30);
  if (kill && !unit.cast) {
    const stacks = chainStacks(unit, kill);
    const d = dist(unit, kill);
    if (d > 28 && (unit.cd.reel || 0) <= 0) {
      const ang = Math.atan2(kill.y - unit.y, kill.x - unit.x);
      const spot = { x: unit.x + Math.cos(ang) * 16, y: unit.y + Math.sin(ang) * 16 };
      unit.aimPoint = hasLoS(unit, spot) ? spot : { x: unit.x, y: unit.y };
      tryCast(unit, "reel");
      unit.aimPoint = null;
    }
    if (stacks >= 3 && d <= 30 && !kill.auras.some((a) => a.control === "stun")) tryCast(unit, "yank", kill);
    if (stacks >= 3) tryCast(unit, "sever", kill);
    if (stacks < 3) tryCast(unit, "barbs", kill);
    if (stacks < 3) tryCast(unit, "lash", kill);
    if (stacks >= 1 && !kill.auras.some((a) => a.id === "brand" && a.dot?.sourceId === unit.id)) tryCast(unit, "brand", kill);
    if (!kill.auras.some((a) => a.slow)) tryCast(unit, "hobble", kill);
  }
  const near = nearestFoe(unit);
  if (!unit.cast) wantRange(unit, near || kill, 14, 28);
}

function aiVow(unit) {
  const friends = friendsOf(unit);
  const lowest = [...friends].sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax)[0];
  const partner = livingPartner(unit);
  const kill = pickKillTarget(unit);
  const near = nearestFoe(unit);
  if (lowest && lowest.hp / lowest.hpMax < 0.4) tryCast(unit, "unity");
  if (partner && !unit.auras.some((a) => a.id === "oath")) tryCast(unit, "oath", partner);
  if (partner && near && dist(unit, near) < 8 && dist(partner, near) > 18) tryCast(unit, "exchange", partner);
  if (partner && lowest && lowest.hp / lowest.hpMax < 0.55 && !hasAura(unit, "link")) tryCast(unit, "link");
  for (const friend of friends) {
    if (pickDispel(friend, "help")) {
      tryCast(unit, "unravel", friend);
      break;
    }
  }
  if (lowest && lowest.hp / lowest.hpMax < 0.92 && !hasAura(lowest, "thread")) tryCast(unit, "thread", lowest);
  if (lowest && lowest.hp / lowest.hpMax < 0.75) tryCast(unit, "comfort");
  if (lowest && lowest.hp / lowest.hpMax < 0.8 && !unit.cast) tryCast(unit, "pulse", lowest);
  if (lowest && lowest.hp / lowest.hpMax < 0.58 && !unit.cast) tryCast(unit, "chorus", lowest);
  if (!unit.cast && kill && friends.every((f) => f.hp / f.hpMax > 0.86)) tryCast(unit, "rebuke", kill);
  if (!unit.cast) {
    if (near && dist(unit, near) < 11) wantRange(unit, near, 14, 28);
    else if (lowest && lowest !== unit && dist(unit, lowest) > 16 && lowest.hp / lowest.hpMax < 0.85) unit.goal = pathTo(unit, lowest);
    else if (kill) wantRange(unit, kill, 16, 28);
    else unit.goal = null;
  }
}

function aiDuelist(unit) {
  const kill = pickKillTarget(unit);
  if (kill) unit.targetId = kill.id;
  tryKick(unit, "parry", 5);
  if (kill && !isDuelMark(unit, kill)) tryCast(unit, "mark", kill);
  if (kill && isDuelMark(unit, kill) && kill.hp / kill.hpMax < 0.65) tryCast(unit, "isolate", kill);
  if (kill) {
    const d = dist(unit, kill);
    if (d >= 8 && d <= 20 && hasLoS(unit, kill)) tryCast(unit, "lunge", kill);
    if (d > 8 && d <= 22) tryCast(unit, "tempo");
    const off = foesOf(unit).find((f) => f !== kill && !isHidden(f) && !immune(f) && dist(unit, f) <= 5 && drFactor(f, "incap") > 0 && !f.auras.some((a) => a.control));
    if (off) tryCast(unit, "feint", off);
    if (d <= 5) {
      tryCast(unit, "riposte", kill);
      if (unit.resource >= 40 && isDuelMark(unit, kill)) tryCast(unit, "flourish", kill);
      if (unit.resource >= 40) tryCast(unit, "crosscut", kill);
      tryCast(unit, "fleche", kill);
    }
  }
  wantRange(unit, kill, 0, 4.4);
}

const AI = {
  warrior: aiVanguard,
  mage: aiChanneler,
  hunter: aiRanger,
  priest: aiCleric,
  warlock: aiHexer,
  druid: aiGrovekeeper,
  rogue: aiShade,
  warden: aiWarden,
  binder: aiBinder,
  vow: aiVow,
  duelist: aiDuelist,
};

function aiAct(unit) {
  if (unit.hp <= 0 || unit.dash) return;
  if (maybeTrinket(unit)) return;
  if (hardLocked(unit)) return;
  if (Math.random() < 0.06) return;
  AI[unit.classId](unit);
}

function canStand(unit, x, y) {
  if (x < unit.r + 1 || y < unit.r + 1 || x > TUNE.worldW - unit.r - 1 || y > TUNE.worldH - unit.r - 1) return false;
  if (match.phase === "prep") {
    if (unit.team === "ally" && x > 38) return false;
    if (unit.team === "enemy" && x < 62) return false;
  }
  if (standSurface(x, y, unit.height) == null) return false;
  return !solidAt(x, y, unit.r, unit.height);
}

function slide(unit, dx, dy) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.35));
  for (let i = 0; i < steps; i++) {
    const sx = dx / steps;
    const sy = dy / steps;
    if (canStand(unit, unit.x + sx, unit.y + sy)) {
      unit.x += sx;
      unit.y += sy;
    } else if (canStand(unit, unit.x + sx, unit.y)) {
      unit.x += sx;
      unit.vy = 0;
    } else if (canStand(unit, unit.x, unit.y + sy)) {
      unit.y += sy;
      unit.vx = 0;
    } else {
      unit.vx = 0;
      unit.vy = 0;
    }
  }
}

function steer(unit, wishX, wishY, dt, rate) {
  const k = 1 - Math.exp(-rate * dt);
  unit.vx += (wishX - unit.vx) * k;
  unit.vy += (wishY - unit.vy) * k;
}

function updateMovement(dt) {
  for (const unit of match.units) {
    if (unit.hp <= 0) continue;
    if (unit.dash) {
      if (!unit.dash.leap) {
        const surface = standSurface(unit.x, unit.y, unit.height + 0.4);
        if (surface != null && unit.height <= surface + 1.2) unit.height = surface;
        unit.vz = 0;
      }
      unit.vx = 0;
      unit.vy = 0;
      unit.knock = 0;
      continue;
    }
    if (unit.knock > 0) unit.knock = Math.max(0, unit.knock - dt);

    const feared = unit.auras.some((a) => a.control === "fear");
    const rooted = unit.auras.some((a) => a.control === "root");
    const locked = hardLocked(unit);
    const remote = unit.human && !unit.isPlayer ? unit.remote : null;
    if (unit.isPlayer && !feared) {
      unit.facing = localWish().facing;
    } else if (remote && !feared && typeof remote.facing === "number") {
      unit.facing = remote.facing;
    }

    let wishX = 0;
    let wishY = 0;
    let moving = false;
    if (feared) {
      if (match.time >= unit.fearTurn) {
        unit.fearAng = Math.random() * Math.PI * 2;
        unit.fearTurn = match.time + 0.45;
      }
      wishX = Math.cos(unit.fearAng);
      wishY = Math.sin(unit.fearAng);
      moving = true;
    } else if (!locked && !rooted) {
      if (unit.isPlayer || remote) {
        const wish = unit.isPlayer ? localWish() : remote;
        wishX = wish.wishX || 0;
        wishY = wish.wishY || 0;
        moving = !!wish.moving;
        if (moving && unit.cast && !unit.cast.ability.moveCast) cancelCast(unit, true);
      } else if (!(unit.cast && unit.cast.ability.castTime > 0 && !unit.cast.ability.moveCast) && unit.goal) {
        const dx = unit.goal.x - unit.x;
        const dy = unit.goal.y - unit.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.8) unit.goal = null;
        else {
          wishX = dx / d;
          wishY = dy / d;
          moving = true;
          unit.facing = Math.atan2(wishY, wishX);
        }
      }
    }

    const speed = CLASSES[unit.classId].speed * (feared ? 0.85 : speedMul(unit));
    const floorNow = standSurface(unit.x, unit.y, unit.height);
    const groundNow = floorNow == null ? 0 : floorNow;
    const grounded = unit.height <= groundNow + 0.08;
    if (unit.knock > 0) {
      // The launch keeps the speed it was given.
    } else if (rooted || (locked && !feared)) {
      steer(unit, 0, 0, dt, 18);
    } else if (grounded) {
      steer(unit, wishX * speed, wishY * speed, dt, moving ? 36 : 22);
    } else if (moving) {
      steer(unit, wishX * speed, wishY * speed, dt, 3.5);
    }

    slide(unit, unit.vx * dt, unit.vy * dt);
    const landed = standSurface(unit.x, unit.y, unit.height);
    const rest = landed == null ? 0 : landed;
    unit.vz -= TUNE.gravity * dt;
    unit.height += unit.vz * dt;
    if (unit.height <= rest) {
      unit.height = rest;
      if (unit.vz < 0) unit.vz = 0;
    }
  }
}

function separate() {
  const units = match.units.filter((u) => u.hp > 0);
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      let dx = units[j].x - units[i].x;
      let dy = units[j].y - units[i].y;
      let d = Math.hypot(dx, dy) || 0.001;
      if (Math.abs(units[i].height - units[j].height) > 2.4) continue;
      const min = units[i].r + units[j].r;
      if (d < min) {
        const push = (min - d) / 2;
        dx /= d;
        dy /= d;
        units[i].x -= dx * push;
        units[i].y -= dy * push;
        units[j].x += dx * push;
        units[j].y += dy * push;
      }
    }
  }
  for (const unit of units) clampUnit(unit, unit.dash && unit.dash.leap && unit.height > 0.6);
}

function checkEnd() {
  if (match.training) return;
  const ally = match.units.some((u) => u.team === "ally" && u.hp > 0);
  const enemy = match.units.some((u) => u.team === "enemy" && u.hp > 0);
  if (ally && enemy) return;
  match.phase = "end";
  match.winSide = ally ? "ally" : "enemy";
  match.win = match.player.team === match.winSide;
  showResult();
  publishSnap();
}

function update(dt) {
  if (!match) return;
  if (match.fx) {
    for (const effect of match.fx) effect.life -= dt;
    match.fx = match.fx.filter((effect) => effect.life > 0);
  }
  if (match.netRole === "client") {
    if (match.phase !== "end") match.time += dt;
    for (const floater of match.floaters) floater.life -= dt;
    match.floaters = match.floaters.filter((f) => f.life > 0);
    const k = 1 - Math.exp(-16 * dt);
    for (const unit of match.units) {
      if (unit.toX == null) continue;
      unit.x += (unit.toX - unit.x) * k;
      unit.y += (unit.toY - unit.y) * k;
    }
    if (match.groundAim) {
      const p = match.player;
      if (p.hp <= 0 || hardLocked(p) || match.phase !== "fight") match.groundAim = null;
      else refreshAimCursor();
    }
    const selected = unitById(match.player.targetId);
    if (!selected || selected.hp <= 0 || (isHidden(selected) && selected.team !== match.player.team)) {
      const next = match.units.find((u) => u.team !== match.player.team && u.hp > 0 && !isHidden(u));
      if (next) match.player.targetId = next.id;
    }
    pumpInput(dt);
    return;
  }
  if (match.phase === "end") return;
  match.time += dt;
  for (const unit of match.units) {
    if (unit.human && !unit.isPlayer) applyRemote(unit);
  }
  if (match.feedbackCd > 0) match.feedbackCd -= dt;
  for (const floater of match.floaters) {
    floater.life -= dt;
  }
  match.floaters = match.floaters.filter((f) => f.life > 0);

  if (match.phase === "prep") {
    updateMovement(dt);
    separate();
    if (match.time >= TUNE.prep) {
      match.phase = "fight";
      combat("The gates are open. Fight!");
    }
    publishSnapDue(dt);
    return;
  }

  for (const unit of match.units) {
    if (unit.hp <= 0) continue;
    if (unit.dummy && unit.hp < unit.hpMax) unit.hp = Math.min(unit.hpMax, unit.hp + unit.hpMax * 0.03 * dt);
    tickUnitTimers(unit, dt);
    tickAuras(unit, dt);
    regen(unit, dt);
    tickDash(unit, dt);
    tickCast(unit, dt);
    releaseQueue(unit);
    tickSwing(unit, dt);
  }
  tickTraps(dt);
  tickLanterns(dt);
  forgetHiddenTargets();
  for (const unit of match.units) {
    if (unit.human || unit.dummy || unit.hp <= 0) continue;
    unit.aiTimer -= dt;
    if (unit.aiTimer <= 0) {
      unit.aiTimer = 0.28 + Math.random() * 0.12;
      aiAct(unit);
    }
  }
  updateMovement(dt);
  separate();
  if (match.groundAim) {
    const p = match.player;
    if (p.hp <= 0 || hardLocked(p) || match.phase !== "fight") match.groundAim = null;
    else refreshAimCursor();
  }
  if (match.player.isPlayer) {
    const selected = unitById(match.player.targetId);
    if (!selected || selected.hp <= 0 || (isHidden(selected) && selected.team !== match.player.team)) {
      const next = match.units.find((u) => u.team !== match.player.team && u.hp > 0 && !isHidden(u))
        || match.units.find((u) => u.hp > 0 && u !== match.player && !isHidden(u));
      if (next) match.player.targetId = next.id;
      else if (selected && isHidden(selected)) match.player.targetId = null;
    }
  }
  checkEnd();
  if (match.phase !== "end") publishSnapDue(dt);
}

function statusText(unit) {
  if (unit.hp <= 0) return "Dead";
  if (unit.auras.some((a) => a.ice)) return "Glacier";
  if (unit.auras.some((a) => a.control === "stun")) return "Stunned";
  const incap = unit.auras.find((a) => a.control === "incap");
  if (incap) return incap.name;
  if (unit.auras.some((a) => a.control === "fear")) return "Feared";
  if (unit.silence > 0) return "Silenced";
  if (unit.lockout > 0) return "School locked";
  if (unit.auras.some((a) => a.control === "root")) return "Rooted";
  if (unit.auras.some((a) => a.deflect)) return "Deflect";
  if (unit.auras.some((a) => a.feign)) return "Playing dead";
  if (unit.auras.some((a) => a.stealth)) return "Veiled";
  if (unit.dash) return unit.dash.leap ? "Leaping" : unit.dash.yank ? "Yanked" : unit.dash.lunge ? "Lunging" : "Rushing";
  return "";
}

function fmtTime(t) {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const SPELL_GLYPH = {
  charge: "rush", mortalStrike: "slash", hamstring: "slow", overpower: "press", execute: "finisher",
  pummel: "interrupt", heroicLeap: "leap", brace: "guard", quake: "stun", spellReflection: "reflect",
  frostbolt: "ice", fireBlast: "fire", polymorph: "sheep", counterspell: "interrupt", blink: "blink",
  frostNova: "nova", scorch: "fire", pyroblast: "inferno", emberWard: "ward", iceBlock: "ice",
  aimedShot: "shot", concussiveShot: "slow", freezingTrap: "trap", wingClip: "slow", silencingShot: "interrupt",
  disengage: "back", feignDeath: "feign", pin: "root", finishShot: "shot", deterrence: "deflect",
  flashHeal: "heal", powerWordShield: "shield", shadowWordPain: "pain", psychicScream: "fear",
  dispelMagic: "cleanse", mindBlast: "mind", penance: "channel", blessing: "bless", speedBlessing: "haste", desperatePrayer: "heal",
  shadowBolt: "shadow", corruption: "dot", agony: "dot", unstableAffliction: "curse", fear: "fear",
  spellLock: "interrupt", drainLife: "drain", wither: "wither", umbralShell: "ward", healthstone: "stone",
  rejuvenation: "leaf", lifebloom: "bloom", regrowth: "leaf", wildGrowth: "bloom", swiftmend: "heal",
  cyclone: "cyclone", wrath: "leaf", thicket: "root", clearbloom: "cleanse", ironbark: "bark",
  sinisterStrike: "dagger", eviscerate: "finisher", cheapShot: "stun", kick: "interrupt", gouge: "stun",
  sprint: "rush", stealth: "veil", step: "blink", tendon: "slow", vanish: "veil",
  kindle: "lantern", soothe: "heal", shelter: "shield", hush: "interrupt", flare: "lantern",
  mend: "heal", snuff: "fire", tend: "lantern", wickstep: "blink", beacon: "lantern",
  lash: "chain", brand: "brand", yank: "yank", sever: "slash", silenceLash: "interrupt",
  hobble: "slow", reel: "yank", barbs: "chain", bulwark: "shield", bind: "chain",
  oath: "heart", pulse: "heal", link: "link", unravel: "cleanse", chorus: "heal", rebuke: "interrupt",
  thread: "link", comfort: "heal", exchange: "blink", unity: "heart",
  mark: "mark", fleche: "slash", riposte: "deflect", lunge: "rush", crosscut: "cross",
  parry: "deflect", feint: "veil", flourish: "finisher", tempo: "rush", isolate: "mark", trinket: "charm",
};

const iconCache = {};

function spellIcon(id) {
  if (iconCache[id]) return iconCache[id];
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const kind = SPELL_GLYPH[id] || "spark";
  const ink = {
    ice: "#9fdfff", fire: "#ff8a3c", inferno: "#ffd27a", shadow: "#c9a0ff", sheep: "#d7e7f2",
    heal: "#8dffb0", leaf: "#7dff9a", bloom: "#d6ff7a", pain: "#d07cff", fear: "#e7c4ff",
    lantern: "#d8fff6", heart: "#ffb3cf", chain: "#f0d48a", charm: "#8fd0c3", haste: "#f7f4ff",
  }[kind] || "#f3e2b8";
  ctx.fillStyle = "#16120f";
  ctx.fillRect(0, 0, 128, 128);
  const glow = ctx.createRadialGradient(64, 52, 6, 64, 64, 68);
  glow.addColorStop(0, ink);
  glow.addColorStop(1, "rgba(22,18,15,0)");
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(224,193,122,0.85)";
  ctx.lineWidth = 5;
  ctx.strokeRect(7, 7, 114, 114);
  ctx.save();
  ctx.translate(64, 66);
  ctx.fillStyle = ink;
  ctx.strokeStyle = "#f7f1e4";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const blade = (rot, len) => {
    ctx.save();
    ctx.rotate(rot);
    ctx.fillRect(-5, -len / 2, 10, len);
    ctx.beginPath();
    ctx.moveTo(-12, -len / 2 + 4);
    ctx.lineTo(12, -len / 2 + 4);
    ctx.lineTo(0, -len / 2 - 14);
    ctx.fill();
    ctx.restore();
  };
  if (kind === "slash" || kind === "press" || kind === "finisher" || kind === "dagger" || kind === "cross") {
    blade(-0.65, kind === "dagger" ? 52 : 74);
    if (kind === "cross" || kind === "finisher") blade(0.65, 74);
  } else if (kind === "rush" || kind === "back" || kind === "blink") {
    ctx.beginPath();
    ctx.moveTo(-28, 10);
    ctx.lineTo(8, 10);
    ctx.lineTo(8, 24);
    ctx.lineTo(36, 0);
    ctx.lineTo(8, -24);
    ctx.lineTo(8, -10);
    ctx.lineTo(-28, -10);
    ctx.closePath();
    ctx.fill();
    if (kind === "blink") { ctx.globalAlpha = 0.45; ctx.translate(-18, 0); ctx.fill(); }
  } else if (kind === "haste") {
    const chevron = (x) => {
      ctx.beginPath();
      ctx.moveTo(x - 16, 16);
      ctx.lineTo(x + 10, 0);
      ctx.lineTo(x - 16, -16);
      ctx.stroke();
    };
    chevron(-8);
    chevron(14);
  } else if (kind === "slow" || kind === "root") {
    ctx.beginPath();
    ctx.arc(0, 8, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-18, 28); ctx.lineTo(0, -8); ctx.lineTo(18, 28);
    ctx.stroke();
  } else if (kind === "interrupt" || kind === "stun") {
    ctx.beginPath();
    ctx.moveTo(-24, -24); ctx.lineTo(24, 24); ctx.moveTo(24, -24); ctx.lineTo(-24, 24);
    ctx.stroke();
  } else if (kind === "leap") {
    ctx.beginPath();
    ctx.arc(0, 18, 36, Math.PI, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 22, 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "guard" || kind === "shield" || kind === "deflect" || kind === "reflect" || kind === "ward" || kind === "bark") {
    ctx.beginPath();
    ctx.moveTo(0, -36);
    ctx.lineTo(28, -16);
    ctx.lineTo(22, 22);
    ctx.lineTo(0, 38);
    ctx.lineTo(-22, 22);
    ctx.lineTo(-28, -16);
    ctx.closePath();
    ctx.fill();
  } else if (kind === "ice" || kind === "nova") {
    for (let i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3);
      ctx.fillRect(-3, -34, 6, 68);
    }
  } else if (kind === "fire" || kind === "inferno") {
    ctx.beginPath();
    ctx.moveTo(0, -40);
    ctx.bezierCurveTo(28, -8, 22, 20, 0, 38);
    ctx.bezierCurveTo(-22, 20, -28, -8, 0, -40);
    ctx.fill();
  } else if (kind === "sheep") {
    ctx.beginPath();
    ctx.ellipse(0, 6, 28, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-16, -16, 8, 0, Math.PI * 2);
    ctx.arc(16, -16, 8, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "shot") {
    ctx.beginPath();
    ctx.moveTo(-30, 16); ctx.lineTo(20, -28); ctx.lineTo(8, -10); ctx.lineTo(30, -16); ctx.lineTo(-8, 22); ctx.closePath();
    ctx.fill();
  } else if (kind === "trap") {
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-3, -22, 6, 12);
    }
  } else if (kind === "feign") {
    ctx.beginPath();
    ctx.ellipse(0, 8, 34, 14, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === "heal" || kind === "bless") {
    ctx.fillRect(-8, -28, 16, 56);
    ctx.fillRect(-28, -8, 56, 16);
  } else if (kind === "pain" || kind === "dot" || kind === "curse" || kind === "wither" || kind === "drain") {
    ctx.beginPath();
    ctx.moveTo(0, -32);
    ctx.bezierCurveTo(26, -6, 18, 24, 0, 36);
    ctx.bezierCurveTo(-18, 24, -26, -6, 0, -32);
    ctx.fill();
  } else if (kind === "fear") {
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillRect(-16, -6, 8, 14);
    ctx.fillRect(8, -6, 8, 14);
  } else if (kind === "cleanse") {
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0.4, Math.PI * 1.7);
    ctx.stroke();
  } else if (kind === "mind" || kind === "channel") {
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 1.6);
    ctx.stroke();
  } else if (kind === "shadow") {
    ctx.beginPath();
    ctx.arc(0, 4, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1224";
    ctx.beginPath();
    ctx.arc(8, 0, 16, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "stone") {
    ctx.beginPath();
    ctx.moveTo(0, -30); ctx.lineTo(26, -8); ctx.lineTo(16, 30); ctx.lineTo(-16, 30); ctx.lineTo(-26, -8);
    ctx.closePath();
    ctx.fill();
  } else if (kind === "leaf" || kind === "bloom") {
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 32, -0.6, 0, Math.PI * 2);
    ctx.fill();
    if (kind === "bloom") {
      ctx.rotate(2);
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 32, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === "cyclone") {
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0.2, Math.PI * 1.6);
    ctx.arc(0, 0, 16, Math.PI * 1.2, Math.PI * 2.5);
    ctx.stroke();
  } else if (kind === "veil") {
    ctx.beginPath();
    ctx.moveTo(-30, 20);
    ctx.quadraticCurveTo(0, -40, 30, 20);
    ctx.quadraticCurveTo(0, 4, -30, 20);
    ctx.fill();
  } else if (kind === "lantern") {
    ctx.fillRect(-12, -28, 24, 36);
    ctx.beginPath();
    ctx.arc(0, -2, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#fff8e8";
    ctx.fill();
  } else if (kind === "chain" || kind === "yank" || kind === "link" || kind === "brand") {
    ctx.beginPath();
    ctx.arc(-12, 0, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(12, 0, 14, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === "heart") {
    ctx.beginPath();
    ctx.arc(-12, -8, 14, 0, Math.PI * 2);
    ctx.arc(12, -8, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-26, -2); ctx.lineTo(0, 32); ctx.lineTo(26, -2);
    ctx.fill();
  } else if (kind === "mark") {
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-36, 0); ctx.lineTo(36, 0); ctx.moveTo(0, -36); ctx.lineTo(0, 36);
    ctx.stroke();
  } else if (kind === "charm") {
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#17332e";
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(0, -34);
    ctx.lineTo(10, -8);
    ctx.lineTo(34, 0);
    ctx.lineTo(10, 8);
    ctx.lineTo(0, 34);
    ctx.lineTo(-10, 8);
    ctx.lineTo(-34, 0);
    ctx.lineTo(-10, -8);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  iconCache[id] = canvas.toDataURL("image/png");
  return iconCache[id];
}

const CLASS_CREST = {
  warrior: "charge", mage: "fireBlast", hunter: "aimedShot", priest: "flashHeal", warlock: "shadowBolt",
  druid: "rejuvenation", rogue: "stealth", warden: "kindle", binder: "lash", vow: "oath", duelist: "mark",
};

let frameLayout = {};
let frameDrag = null;
try {
  frameLayout = JSON.parse(localStorage.getItem("arenaFrames") || "{}") || {};
} catch (err) { frameLayout = {}; }

function defaultFramePos(side, index, count, stage) {
  const w = 196;
  const h = 72;
  const gap = 8;
  if (side === "enemy") {
    const total = count * w + (count - 1) * gap;
    return { x: Math.max(8, (stage.clientWidth - total) / 2) + index * (w + gap), y: 14 };
  }
  return { x: 14, y: stage.clientHeight - 132 - (index + 1) * h - index * gap };
}

function layoutFrames() {
  if (frameDrag || !match || window.HEADLESS) return;
  const stage = $("stage");
  if (!stage || stage.clientWidth < 20) return;
  const groups = { ally: [], enemy: [] };
  for (const unit of match.units) {
    if (!unit.el) return;
    groups[unit.team === match.player.team ? "ally" : "enemy"].push(unit);
  }
  for (const side of ["ally", "enemy"]) {
    groups[side].forEach((unit, index) => {
      const saved = frameLayout[`${side}-${index}`];
      const pos = saved || defaultFramePos(side, index, groups[side].length, stage);
      const maxX = Math.max(0, stage.clientWidth - unit.el.offsetWidth);
      const maxY = Math.max(0, stage.clientHeight - unit.el.offsetHeight);
      unit.el.style.left = `${clamp(pos.x, 0, maxX)}px`;
      unit.el.style.top = `${clamp(pos.y, 0, maxY)}px`;
    });
  }
}

function bindFrameDrag(el, slot, unitId) {
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const parent = $("unit-frames").getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    frameDrag = {
      el,
      slot,
      x: e.clientX,
      y: e.clientY,
      left: rect.left - parent.left,
      top: rect.top - parent.top,
      moved: false,
    };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (!frameDrag || frameDrag.el !== el) return;
    const dx = e.clientX - frameDrag.x;
    const dy = e.clientY - frameDrag.y;
    if (Math.hypot(dx, dy) < 5) return;
    frameDrag.moved = true;
    el.classList.add("dragging");
    const parent = $("unit-frames");
    const x = clamp(frameDrag.left + dx, 0, Math.max(0, parent.clientWidth - el.offsetWidth));
    const y = clamp(frameDrag.top + dy, 0, Math.max(0, parent.clientHeight - el.offsetHeight));
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  });
  el.addEventListener("pointerup", () => {
    if (!frameDrag || frameDrag.el !== el) return;
    const drag = frameDrag;
    frameDrag = null;
    el.classList.remove("dragging");
    if (drag.moved) {
      frameLayout[slot] = { x: parseFloat(el.style.left), y: parseFloat(el.style.top) };
      try { localStorage.setItem("arenaFrames", JSON.stringify(frameLayout)); } catch (err) { /* ignore */ }
      return;
    }
    selectTarget(unitId);
  });
  el.addEventListener("pointercancel", () => {
    if (!frameDrag || frameDrag.el !== el) return;
    frameDrag = null;
    el.classList.remove("dragging");
  });
}

function buildMatchUi() {
  if (window.HEADLESS) return;
  const wrap = $("unit-frames");
  wrap.innerHTML = "";
  const counts = { ally: 0, enemy: 0 };
  for (const unit of match.units) {
    const side = unit.team === match.player.team ? "ally" : "enemy";
    const slot = `${side}-${counts[side]++}`;
    const el = document.createElement("button");
    el.type = "button";
    el.className = `frame ${unit.team}${unit === match.player ? " player" : ""}`;
    el.dataset.uid = String(unit.id);
    el.innerHTML = `
      <div class="frame-head"><b class="fname"></b><span class="sub"></span></div>
      <div class="meter hp"><div class="fill"></div><span></span></div>
      <div class="meter resource"><div class="fill"></div><span></span></div>
      <div class="meter cast hidden"><div class="fill"></div><span></span></div>
      <div class="auras"></div>`;
    bindFrameDrag(el, slot, unit.id);
    wrap.appendChild(el);
    unit.el = el;
  }
  const bar = $("abilities");
  bar.innerHTML = "";
  for (const ability of match.player.abilities) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `ability ${ability.tag === "Signature" ? "signature" : ""} ${ability.tag === "Trinket" ? "trinket" : ""}`;
    btn.innerHTML = `<span class="key">${bindLabel(ability, true)}</span><span class="short">${ability.short}</span><span class="cost"></span><span class="sweep"></span><span class="cd"></span>`;
    btn.style.setProperty("--icon", `url("${spellIcon(ability.id)}")`);
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => pressAbility(ability));
    btn.addEventListener("mouseenter", (e) => {
      hoverAbility = ability;
      showTip(e, abilityTip(ability));
    });
    btn.addEventListener("mouseleave", hideTip);
    ability.el = btn;
    bar.appendChild(btn);
  }
}

function selectTarget(id) {
  if (!match) return;
  const unit = unitById(id);
  if (!unit || unit.hp <= 0) return;
  match.player.targetId = id;
  if (match.netRole === "client") sendInput();
}

function abilityTip(ability) {
  const bits = [];
  if (ability.channel) bits.push(`${ability.castTime}s channel`);
  else if (ability.id === "pyroblast") bits.push(`${ability.castTime || 2.5}s cast, instant at ${match.player.hotNeed || 3} Wildfire`);
  else bits.push(ability.castTime ? `${ability.castTime}s cast` : "Instant");
  if (ability.moveCast) bits.push("while moving");
  if (ability.range) bits.push(ability.minRange ? `${ability.minRange}–${ability.range} yd` : `${ability.range} yd`);
  if (ability.radius) bits.push(`${ability.radius} yd radius`);
  const res = CLASSES[match.player.classId].resource.name;
  const price = abilityCost(match.player, ability);
  if (price) bits.push(`${price} ${res}`);
  if (ability.charges) bits.push(`${ability.charges} charges, ${ability.recharge}s each`);
  else if (ability.cd) bits.push(`${ability.cd}s cooldown`);
  if (ability.gcd === false) bits.push("Off global cooldown");
  return `<strong>${ability.name}</strong><div class="meta">${ability.tag} · ${bits.join(" · ")}</div><p>${ability.blurb}</p>`;
}

function showTip(e, html) {
  const tip = $("tooltip");
  tip.innerHTML = html;
  tip.classList.remove("hidden");
  moveTip(e);
}

function moveTip(e) {
  const tip = $("tooltip");
  if (tip.classList.contains("hidden")) return;
  const pad = 12;
  const width = tip.offsetWidth || 260;
  const height = tip.offsetHeight || 80;
  let x = e.clientX + 16;
  let y = e.clientY + 16;
  if (x + width > window.innerWidth - pad) x = e.clientX - width - 12;
  if (y + height > window.innerHeight - pad) y = e.clientY - height - 12;
  tip.style.left = `${Math.max(pad, x)}px`;
  tip.style.top = `${Math.max(pad, y)}px`;
}

function hideTip() {
  hoverAbility = null;
  $("tooltip").classList.add("hidden");
}

function updateHud() {
  if (!match) return;
  const announce = $("announce");
  if (match.phase === "prep") {
    const left = Math.max(0, Math.ceil(TUNE.prep - match.time - 1e-6));
    $("clock").textContent = fmtTime(left);
    announce.textContent = left >= 1 && left <= 3 ? String(left) : "";
  } else {
    $("clock").textContent = fmtTime(fightSeconds());
  }
  $("damp").textContent = `Dampening ${Math.round(currentDamp() * 100)}%`;
  const mapName = MAPS[match.map] ? MAPS[match.map].name : "Arena";
  $("phase-label").textContent = match.training
    ? `${mapName} · Training`
    : match.phase === "end" ? (match.win ? "Victory" : "Defeat") : mapName;
  if (!match.training && match.phase === "fight" && match.time < TUNE.prep + 0.8) {
    announce.textContent = "FIGHT";
  } else if (match.phase !== "prep") {
    announce.textContent = "";
  }

  for (const unit of match.units) {
    const el = unit.el;
    const concealed = veiledFromViewer(unit);
    el.classList.toggle("hidden", concealed);
    el.classList.toggle("selected", !concealed && match.player.targetId === unit.id);
    el.classList.toggle("dead", unit.hp <= 0);
    el.querySelector(".fname").textContent = unit === match.player && unit.name !== "You" ? `${unit.name} (you)` : unit.name;
    el.querySelector(".sub").textContent = CLASSES[unit.classId].role;
    const hpPct = Math.max(0, unit.hp / unit.hpMax);
    const hpFill = el.querySelector(".hp .fill");
    hpFill.style.width = `${hpPct * 100}%`;
    hpFill.style.background = hpPct < 0.3 ? "#c44747" : "#3f9d4e";
    el.querySelector(".hp span").textContent = `${Math.ceil(unit.hp)} / ${unit.hpMax}`;
    const res = CLASSES[unit.classId].resource;
    const resFill = el.querySelector(".resource .fill");
    resFill.style.width = `${(unit.resource / res.max) * 100}%`;
    resFill.style.background = res.color;
    el.querySelector(".resource span").textContent = `${Math.round(unit.resource)} ${res.name}`;
    const castEl = el.querySelector(".cast");
    if (unit.cast) {
      castEl.classList.remove("hidden");
      castEl.querySelector(".fill").style.width = `${(1 - unit.cast.time / unit.cast.total) * 100}%`;
      castEl.querySelector("span").textContent = unit.cast.ability.name;
    } else castEl.classList.add("hidden");
    el.querySelector(".auras").innerHTML = unit.auras.slice(0, 8).map((a) => {
      const secs = a.hold ? "" : Math.ceil(a.remaining);
      const stacks = a.stacks > 1 ? a.stacks : "";
      return `<i class="aura ${a.type}" title="${a.name}">${a.short}${stacks}<b>${secs}</b></i>`;
    }).join("");
  }

  const player = match.player;
  const castbar = $("castbar");
  if (player.cast) {
    castbar.classList.remove("hidden");
    $("cast-fill").style.width = `${(1 - player.cast.time / player.cast.total) * 100}%`;
    const follow = player.nextSpell && player.abilities.find((a) => a.id === player.nextSpell.abilityId);
    $("cast-label").textContent = follow ? `${player.cast.ability.name}  →  ${follow.name}` : player.cast.ability.name;
  } else castbar.classList.add("hidden");
  const st = statusText(player);
  const aimAbility = match.groundAim && player.abilities.find((a) => a.id === match.groundAim.abilityId);
  const teamUp = match.units.some((u) => u !== player && u.team === player.team && u.hp > 0);
  const note = player.noteUntil > match.time ? player.lastNote : "";
  $("status-line").textContent = aimAbility
    ? `Aim ${aimAbility.name} — click to place`
    : player.hp <= 0 && match.phase === "fight"
    ? (teamUp ? "You died. Your team is still fighting." : "You died.")
    : st || note;

  for (const ability of player.abilities) {
    const btn = ability.el;
    let cd = Math.max(ability.gcd === false ? 0 : player.gcd, player.cd[ability.id] || 0);
    let base = ability.cd || (ability.gcd === false ? 0 : TUNE.gcd);
    let chargeLeft = null;
    if (ability.charges) {
      chargeLeft = player.charges[ability.id] == null ? ability.charges : player.charges[ability.id];
      const recharging = chargeLeft < ability.charges ? (player.recharge[ability.id] || 0) : 0;
      if (chargeLeft <= 0) {
        cd = recharging;
        base = ability.recharge || 20;
      }
    }
    const pct = base > 0 ? clamp(cd / base, 0, 1) : 0;
    btn.classList.toggle("queued", !!(player.nextSpell && player.nextSpell.abilityId === ability.id));
    btn.querySelector(".sweep").style.height = `${pct * 100}%`;
    btn.querySelector(".cd").textContent = chargeLeft != null
      ? (chargeLeft <= 0 && cd > 0.15 ? String(Math.ceil(cd)) : String(chargeLeft))
      : (cd > 0.15 ? String(Math.ceil(cd)) : "");
    let costText = "Free";
    const price = abilityCost(player, ability);
    if (ability.tag === "Trinket") costText = "Trinket";
    else if (price) costText = String(price);
    else if (ability.tag === "Signature") costText = "Signature";
    if (ability.id === "pyroblast" && hotStreakReady(player)) costText = "Instant";
    btn.querySelector(".cost").textContent = costText;
    btn.classList.toggle("primed", ability.id === "pyroblast" && hotStreakReady(player));
    const selected = unitById(player.targetId);
    const frozen = player.auras.some((a) => a.ice);
    const controlled = hardLocked(player);
    let usable = match.phase === "fight" && player.hp > 0 && !frozen && (ability.id === "trinket" || !controlled);
    if (price > player.resource) usable = false;
    if (ability.charges) {
      if (chargeLeft <= 0) usable = false;
    } else if ((player.cd[ability.id] || 0) > 0) usable = false;
    if (ability.extra) {
      const extraTarget = ability.target === "self" || ability.target === "aoe" || ability.target === "ground" ? player : selected;
      if (extraTarget && ability.extra(player, extraTarget)) usable = false;
    }
    btn.classList.toggle("unusable", !usable && match.phase === "fight");
  }

  $("log").innerHTML = match.logs.slice(-6).map((line) => `<div><span class="time">${fmtTime(line.t)}</span>${line.text}</div>`).join("");
}

function resizeCanvas() {
  if (window.ArenaView) ArenaView.resize();
  layoutFrames();
}

function xpLine() {
  const me = match.player;
  if (!me || match.training) return "";
  if (!match.xp) match.xp = addClassXp(me.classId, match.win ? XP_WIN : XP_LOSS);
  const got = match.xp;
  const name = esc(CLASSES[me.classId].name);
  const bar = got.need ? `<span class="xp-bar"><i style="width:${Math.round((got.xp / got.need) * 100)}%"></i></span><span class="xp-count">${got.xp} / ${got.need} XP</span>` : "";
  let note = "";
  if (got.level > got.before) {
    note = got.level >= LEVEL_CAP
      ? `<b class="xp-up">${name} reached level ${LEVEL_CAP}. Champion set unlocked.</b>`
      : `<b class="xp-up">${name} reached level ${got.level}.</b>`;
  }
  return `<div class="xp-line"><span>+${got.amount} XP · ${name} level ${got.level}</span>${bar}${note}</div>`;
}

function showResult() {
  if (window.HEADLESS) return;
  const xp = xpLine();
  const rows = match.units.map((u) => `<tr><td>${u.name}</td><td>${CLASSES[u.classId].name}</td><td>${Math.round(u.stats.damage)}</td><td>${Math.round(u.stats.healing)}</td><td>${u.hp > 0 ? "Up" : "Dead"}</td></tr>`).join("");
  $("result").innerHTML = `
    <div class="result-card ${match.win ? "win" : "loss"}">
      <div class="result-head">
        <img src="assets/arena-emblem.jpg" alt="">
        <div>
          <h2>${match.win ? "Victory" : "Defeat"}</h2>
          <p>${match.win ? "Your team is still standing." : "Your team is down."} ${MAPS[match.map] ? MAPS[match.map].name : "Arena"} · ${fmtTime(fightSeconds())} · dampening ${Math.round(currentDamp() * 100)}%.</p>
        </div>
      </div>
      ${xp}
      <table>
        <thead><tr><th>Fighter</th><th>Class</th><th>Damage</th><th>Healing</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="lobby-actions">
        <button class="start-btn" id="rematch" type="button">Rematch</button>
        <button class="text-btn" id="back-lobby" type="button">Change classes</button>
      </div>
    </div>`;
  $("result").classList.remove("hidden");
  $("rematch").addEventListener("click", requestRematch);
  $("back-lobby").addEventListener("click", requestBack);
}

const setup = {
  size: 2,
  player: "warrior",
  allies: ["priest"],
  enemies: ["mage", "hunter"],
};
let playMode = "local";
let room = null;
let party = null;
let queueing = false;
let netStatus = "";
let playerName = "Player";
let serverUrl = "";
try {
  playerName = localStorage.getItem("arenaName") || "Player";
  serverUrl = localStorage.getItem("arenaServer") || "";
} catch (err) { /* private mode */ }

function fitTeams() {
  const ids = Object.keys(CLASSES);
  while (setup.allies.length < setup.size - 1) setup.allies.push(ids[setup.allies.length % ids.length]);
  setup.allies.length = Math.max(0, setup.size - 1);
  while (setup.enemies.length < setup.size) setup.enemies.push(ids[(setup.enemies.length + 2) % ids.length]);
  setup.enemies.length = setup.size;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function defaultServer() {
  if (serverUrl) return serverUrl;
  if (location.protocol === "file:") return "ws://127.0.0.1:8780";
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}`;
}

function readIdentity() {
  const nameEl = $("player-name");
  const urlEl = $("server-url");
  if (nameEl) playerName = nameEl.value.trim().slice(0, 16) || "Player";
  if (urlEl) serverUrl = urlEl.value.trim();
  try {
    localStorage.setItem("arenaName", playerName);
    if (serverUrl) localStorage.setItem("arenaServer", serverUrl);
  } catch (err) { /* ignore */ }
}

function iAmHost() {
  return !!(window.ArenaNet && ArenaNet.id && ArenaNet.id === ArenaNet.hostId);
}

function iLeadParty() {
  return !!(party && window.ArenaNet && ArenaNet.id === party.leaderId);
}

function localWish() {
  const yaw = window.ArenaView ? ArenaView.getYaw() : Math.PI;
  const viewX = -Math.cos(yaw);
  const viewZ = -Math.sin(yaw);
  const forward = (keysDown.has("KeyW") || keysDown.has("ArrowUp") ? 1 : 0) - (keysDown.has("KeyS") || keysDown.has("ArrowDown") ? 1 : 0);
  const strafe = (keysDown.has("KeyD") || keysDown.has("ArrowRight") ? 1 : 0) - (keysDown.has("KeyA") || keysDown.has("ArrowLeft") ? 1 : 0);
  let wishX = 0;
  let wishY = 0;
  let moving = false;
  if (forward || strafe) {
    const x = viewX * forward - viewZ * strafe;
    const y = viewZ * forward + viewX * strafe;
    const len = Math.hypot(x, y) || 1;
    wishX = x / len;
    wishY = y / len;
    moving = true;
  }
  return { wishX, wishY, moving, facing: Math.atan2(-Math.sin(yaw), -Math.cos(yaw)) };
}

function sendInput(extra) {
  if (!match || match.netRole !== "client" || !window.ArenaNet || !ArenaNet.connected) return;
  const wish = localWish();
  if (extra && extra.jump) netCmds.jump += 1;
  if (extra && extra.cancel) netCmds.cancel += 1;
  if (extra && extra.cast) {
    netCmds.cast += 1;
    netCmds.castMsg = {
      seq: netCmds.cast,
      abilityId: extra.cast,
      aimX: extra.aimX == null ? null : extra.aimX,
      aimY: extra.aimY == null ? null : extra.aimY,
      aimH: extra.aimH == null ? null : extra.aimH,
    };
  }
  const payload = {
    kind: "input",
    wishX: wish.wishX,
    wishY: wish.wishY,
    moving: wish.moving,
    facing: wish.facing,
    targetId: match.player.targetId,
    jumpSeq: netCmds.jump,
    cancelSeq: netCmds.cancel,
    cast: netCmds.castMsg,
  };
  if (match.serverAuth) ArenaNet.play(payload);
  else ArenaNet.send(payload);
}

function applyNetInput(peerId, data) {
  if (!match || !data) return;
  const unit = match.units.find((u) => u.peerId === peerId);
  if (unit) unit.remote = data;
}

function dropHuman(peerId) {
  if (!match) return;
  const unit = match.units.find((u) => u.peerId === peerId);
  if (!unit) return;
  unit.human = false;
  unit.peerId = null;
  unit.remote = null;
  unit.aiTimer = 0.15;
}

function pumpInput(dt) {
  if (!match || match.netRole !== "client") return;
  inputSend -= dt;
  if (inputSend > 0) return;
  inputSend = 0.05;
  sendInput();
}

function beginClientAim(ability) {
  if (match.groundAim && match.groundAim.abilityId === ability.id) {
    confirmGroundAim();
    return;
  }
  match.groundAim = {
    abilityId: ability.id,
    range: ability.range || 30,
    minRange: ability.minRange || 0,
    radius: ability.marker || ability.radius || 3,
    los: ability.id !== "heroicLeap",
    cursor: null,
  };
  refreshAimCursor();
}

function pressAbility(ability) {
  if (!match || !ability) return;
  if (match.netRole === "client") {
    if (ability.target === "ground") beginClientAim(ability);
    else sendInput({ cast: ability.id });
    return;
  }
  tryCast(match.player, ability.id);
}

function applyRemote(unit) {
  const ctl = unit.remote;
  if (!ctl) return;
  if (ctl.targetId && unitById(ctl.targetId)) unit.targetId = ctl.targetId;
  if ((ctl.jumpSeq || 0) > unit.appliedJump) {
    unit.appliedJump = ctl.jumpSeq;
    jumpUnit(unit);
  }
  if ((ctl.cancelSeq || 0) > unit.appliedCancel) {
    unit.appliedCancel = ctl.cancelSeq;
    if (unit.cast) cancelCast(unit, true);
  }
  if (ctl.cast && ctl.cast.seq > unit.appliedCast) {
    unit.appliedCast = ctl.cast.seq;
    if (ctl.cast.aimX != null && ctl.cast.aimY != null) {
      unit.aimPoint = { x: ctl.cast.aimX, y: ctl.cast.aimY, h: ctl.cast.aimH == null ? unit.height : ctl.cast.aimH };
    }
    tryCast(unit, ctl.cast.abilityId);
    unit.aimPoint = null;
  }
}

function packAura(a) {
  return {
    id: a.id,
    name: a.name,
    short: a.short,
    type: a.type,
    remaining: a.remaining,
    stacks: a.stacks || 0,
    control: a.control || null,
    absorb: a.absorb == null ? null : a.absorb,
    ice: !!a.ice,
    feign: !!a.feign,
    stealth: !!a.stealth,
    deflect: !!a.deflect,
    reflect: !!a.reflect,
    damageReduce: a.damageReduce || 0,
    hold: !!a.hold,
  };
}

function dashKind(unit) {
  if (!unit.dash) return null;
  if (unit.dash.leap) return "leap";
  if (unit.dash.yank) return "yank";
  if (unit.dash.lunge) return "lunge";
  return "rush";
}

function packMatch() {
  return {
    time: match.time,
    phase: match.phase,
    map: match.map,
    winSide: match.winSide || null,
    logs: match.logs.map((line) => ({ t: line.t, text: line.text })),
    traps: match.traps.map((t) => ({ ownerId: t.ownerId, team: t.team, x: t.x, y: t.y, h: t.h || 0, life: t.life, arm: t.arm, radius: t.radius })),
    lanterns: (match.lanterns || []).map((l) => ({ ownerId: l.ownerId, team: l.team, x: l.x, y: l.y, h: l.h || 0, life: l.life, radius: l.radius, tick: l.tick, beacon: l.beacon })),
    fx: (match.fx || []).map((effect) => ({
      id: effect.id, kind: effect.kind, color: effect.color, x: effect.x, y: effect.y, h: effect.h,
      x2: effect.x2, y2: effect.y2, h2: effect.h2,       life: effect.life, max: effect.max, size: effect.size, round: !!effect.round,
      style: effect.style || "", conceal: effect.conceal || "",
    })),
    floaters: match.floaters.map((f) => ({ unitId: f.unitId, x: f.x, y: f.y, h: f.h, text: f.text, color: f.color, life: f.life })),
    units: match.units.map((unit) => ({
      id: unit.id,
      x: unit.x,
      y: unit.y,
      height: unit.height,
      facing: unit.facing,
      hp: unit.hp,
      resource: unit.resource,
      gcd: unit.gcd,
      silence: unit.silence,
      lockout: unit.lockout,
      targetId: unit.targetId,
      cd: unit.cd,
      charges: unit.charges || {},
      recharge: unit.recharge || {},
      dead: unit.hp <= 0,
      dash: dashKind(unit),
      cast: unit.cast ? { id: unit.cast.ability.id, time: unit.cast.time, total: unit.cast.total } : null,
      nextSpell: unit.nextSpell ? unit.nextSpell.abilityId : null,
      auras: unit.auras.map(packAura),
      damage: unit.stats.damage,
      healing: unit.stats.healing,
      note: unit.noteUntil > match.time ? unit.lastNote : "",
    })),
  };
}

function publishSnap() {
  if (!match || match.netRole !== "host" || !window.ArenaNet || !ArenaNet.connected) return;
  ArenaNet.send({ kind: "snap", state: packMatch() });
}

function publishSnapDue(dt) {
  if (!match || match.netRole !== "host") return;
  netSend -= dt;
  if (netSend > 0) return;
  netSend = 0.05;
  publishSnap();
}

function applySnap(state) {
  if (!match || match.netRole !== "client" || !state) return;
  const ended = match.phase !== "end" && state.phase === "end";
  match.time = state.time;
  match.phase = state.phase;
  if (state.map && MAPS[state.map] && state.map !== match.map) {
    match.map = state.map;
    if (window.ArenaView) ArenaView.setMap(state.map);
  }
  match.winSide = state.winSide;
  if (state.winSide) match.win = match.player.team === state.winSide;
  match.logs = state.logs || [];
  match.traps = state.traps || [];
  match.lanterns = state.lanterns || [];
  match.fx = state.fx || [];
  match.floaters = state.floaters || [];
  for (const snap of state.units || []) {
    const unit = unitById(snap.id);
    if (!unit) continue;
    unit.toX = snap.x;
    unit.toY = snap.y;
    unit.height = snap.height;
    unit.facing = snap.facing;
    unit.hp = snap.hp;
    unit.resource = snap.resource;
    unit.gcd = snap.gcd;
    unit.silence = snap.silence;
    unit.lockout = snap.lockout;
    if (unit !== match.player) unit.targetId = snap.targetId;
    unit.cd = snap.cd || {};
    unit.charges = snap.charges || {};
    unit.recharge = snap.recharge || {};
    unit.dead = snap.hp <= 0;
    unit.auras = snap.auras || [];
    unit.stats.damage = snap.damage || 0;
    unit.stats.healing = snap.healing || 0;
    unit.lastNote = snap.note || "";
    unit.noteUntil = snap.note ? match.time + 1.2 : 0;
    unit.dash = snap.dash ? { leap: snap.dash === "leap", yank: snap.dash === "yank", lunge: snap.dash === "lunge" } : null;
    if (snap.cast) {
      const ability = unit.abilities.find((a) => a.id === snap.cast.id);
      unit.cast = ability ? { ability, time: snap.cast.time, total: snap.cast.total, channel: !!ability.channel } : null;
    } else unit.cast = null;
    unit.nextSpell = snap.nextSpell ? { abilityId: snap.nextSpell, targetId: null, aimPoint: null } : null;
  }
  if (ended) showResult();
}

function returnToLobby() {
  match = null;
  $("match").classList.add("hidden");
  $("lobby").classList.remove("hidden");
  $("result").classList.add("hidden");
  if ($("leave-training")) $("leave-training").classList.add("hidden");
  renderLobby();
}

function requestRematch() {
  if (!match) return;
  if (match.serverAuth) {
    if (window.ArenaNet) ArenaNet.queue(setup.size, setup.player, playerName);
    returnToLobby();
    return;
  }
  if (match.netRole === "client") {
    if (window.ArenaNet) ArenaNet.send({ kind: "rematch" });
    return;
  }
  if (!match.setup.training) delete match.setup.map;
  if (match.netRole === "host") {
    createMatch(match.setup);
    if (window.ArenaNet) ArenaNet.send({ kind: "start", roster: match.setup.roster, map: match.map });
    return;
  }
  createMatch(match.setup);
}

function requestBack() {
  if (match && match.serverAuth) {
    if (window.ArenaNet) ArenaNet.play({ kind: "leave" });
    returnToLobby();
    return;
  }
  if (match && match.netRole === "client") {
    if (window.ArenaNet) ArenaNet.send({ kind: "back" });
    return;
  }
  if (match && match.netRole === "host" && window.ArenaNet) ArenaNet.send({ kind: "back" });
  returnToLobby();
}

function makeSlots(size) {
  const ys = laneYs(size);
  const ids = Object.keys(CLASSES);
  const slots = [];
  for (let i = 0; i < size; i++) {
    slots.push({
      team: "ally",
      classId: i === 0 ? setup.player : (setup.allies[i - 1] || ids[i % ids.length]),
      kind: "open",
      peerId: null,
      name: "",
      y: ys[i],
    });
  }
  for (let i = 0; i < size; i++) {
    slots.push({
      team: "enemy",
      classId: setup.enemies[i] || ids[(i + 2) % ids.length],
      kind: "open",
      peerId: null,
      name: "",
      y: ys[i],
    });
  }
  return slots;
}

function broadcastLobby() {
  if (!window.ArenaNet || !room) return;
  ArenaNet.send({ kind: "lobby", code: room.code, size: setup.size, slots: room.slots });
}

function claimSlot(index, peerId, name, classId, talents, tier) {
  if (!room || !room.slots[index]) return false;
  const slot = room.slots[index];
  if (slot.kind === "human" && slot.peerId && slot.peerId !== peerId) return false;
  for (const other of room.slots) {
    if (other.peerId === peerId) {
      other.kind = "open";
      other.peerId = null;
      other.name = "";
    }
  }
  slot.kind = "human";
  slot.peerId = peerId;
  slot.name = String(name || "Player").slice(0, 16);
  if (CLASSES[classId]) slot.classId = classId;
  if (Array.isArray(talents)) slot.talents = normalizeTalents(slot.classId, talents);
  slot.tier = tier === 2 ? 2 : 1;
  return true;
}

function clearPeer(peerId) {
  if (!room) return;
  for (const slot of room.slots) {
    if (slot.peerId === peerId) {
      slot.kind = "open";
      slot.peerId = null;
      slot.name = "";
    }
  }
}

function onNetMessage(msg) {
  if (!msg) return;
  if (msg.t === "queue") {
    queueing = true;
    const label = msg.size === 1 ? "1v1" : msg.size === 3 ? "3v3" : "2v2";
    netStatus = `Looking for a ${label}. ${msg.waiting} of ${msg.need} players.`;
    if (!match) renderLobby();
    return;
  }
  if (msg.t === "error") {
    netStatus = msg.text || "Could not join.";
    renderLobby();
    return;
  }
  if (msg.t === "closed") {
    room = null;
    party = null;
    queueing = false;
    netStatus = msg.reason || "Disconnected.";
    if (match && match.netRole !== "local") returnToLobby();
    else renderLobby();
    return;
  }
  if (msg.t === "created") {
    party = null;
    queueing = false;
    fitTeams();
    room = { code: msg.code, slots: makeSlots(setup.size) };
    claimSlot(0, ArenaNet.id, playerName, setup.player, undefined, gearTier(setup.player));
    netStatus = "Room open. Share the code.";
    broadcastLobby();
    renderLobby();
    return;
  }
  if (msg.t === "party") {
    if (msg.gone) {
      party = null;
      queueing = false;
      netStatus = "You left the party.";
    } else {
      party = {
        code: msg.code,
        leaderId: msg.leaderId,
        queued: msg.queued || 0,
        members: msg.members || [],
      };
      queueing = !!msg.queued;
      if (!msg.queued) netStatus = "Party open. Share the code.";
      if (party.members.length > setup.size) setup.size = Math.min(3, party.members.length);
    }
    if (!match) renderLobby();
    return;
  }
  if (msg.t === "joined") {
    party = null;
    queueing = false;
    room = { code: msg.code, slots: [] };
    netStatus = "Joined. Waiting for the host.";
    renderLobby();
    return;
  }
  if (msg.t === "peer" && iAmHost() && room) {
    broadcastLobby();
    return;
  }
  if (msg.t === "left") {
    if (room && iAmHost()) {
      clearPeer(msg.id);
      broadcastLobby();
      if (!match) renderLobby();
    }
    if (match && match.netRole === "host") {
      const unit = match.units.find((u) => u.peerId === msg.id);
      if (unit) {
        unit.human = false;
        unit.peerId = null;
        unit.remote = null;
      }
    }
    return;
  }
  if (msg.t !== "msg" || !msg.data) return;
  const data = msg.data;
  if (data.kind === "lobby") {
    room = { code: data.code, slots: data.slots };
    setup.size = data.size || Math.max(1, Math.round((data.slots || []).length / 2));
    if (!match) renderLobby();
    return;
  }
  if (data.kind === "claim" && iAmHost()) {
    claimSlot(data.slot, msg.from, data.name, data.classId, data.talents, data.tier);
    broadcastLobby();
    if (!match) renderLobby();
    return;
  }
  if (data.kind === "leave-slot" && iAmHost()) {
    clearPeer(msg.from);
    broadcastLobby();
    if (!match) renderLobby();
    return;
  }
  if (data.kind === "start" && data.roster) {
    if (data.server) {
      queueing = false;
      createMatch({ roster: data.roster, netRole: "client", serverAuth: true, map: data.map || "court" });
      return;
    }
    const seated = data.roster.some((r) => r.peerId && window.ArenaNet && r.peerId === ArenaNet.id);
    if (!seated && !iAmHost()) {
      netStatus = "That match started without you. Claim a slot for the next one.";
      renderLobby();
      return;
    }
    createMatch({ roster: data.roster, netRole: iAmHost() ? "host" : "client", map: data.map || "court" });
    return;
  }
  if (data.kind === "snap") {
    applySnap(data.state);
    return;
  }
  if (data.kind === "input" && match && match.netRole === "host") {
    const unit = match.units.find((u) => u.peerId === msg.from);
    if (unit) unit.remote = data;
    return;
  }
  if (data.kind === "rematch" && iAmHost()) {
    requestRematch();
    return;
  }
  if (data.kind === "back") {
    if (iAmHost() && window.ArenaNet) ArenaNet.send({ kind: "back" });
    returnToLobby();
  }
}

async function ensureOnline() {
  readIdentity();
  if (window.ArenaNet && ArenaNet.connected) return;
  netStatus = "Connecting…";
  renderLobby();
  await ArenaNet.connect(defaultServer());
}

async function findMatch() {
  if (queueing) return;
  readIdentity();
  fitTeams();
  if (party && !iLeadParty()) {
    netStatus = "Only the party leader can queue.";
    renderLobby();
    return;
  }
  if (party && party.members.length > setup.size) {
    netStatus = "Your party is too big for that bracket.";
    renderLobby();
    return;
  }
  try {
    await ensureOnline();
    ArenaNet.queue(setup.size, setup.player, playerName, picksFor(setup.player));
  } catch (err) {
    queueing = false;
    netStatus = err.message || "Could not reach the server.";
    renderLobby();
  }
}

function cancelQueue() {
  queueing = false;
  netStatus = "";
  if (window.ArenaNet && ArenaNet.connected) ArenaNet.leaveQueue();
  renderLobby();
}

async function hostRoom() {
  readIdentity();
  fitTeams();
  try {
    await ensureOnline();
    ArenaNet.create(playerName);
  } catch (err) {
    netStatus = "Could not reach the room server. Run node server.js, then open this page from that address.";
    renderLobby();
  }
}

async function joinRoom() {
  readIdentity();
  const code = ($("room-code-input") && $("room-code-input").value.trim()) || "";
  if (!code) {
    netStatus = "Enter a room code.";
    renderLobby();
    return;
  }
  try {
    await ensureOnline();
    ArenaNet.join(code, playerName);
  } catch (err) {
    netStatus = "Could not reach the room server. Run node server.js, then open this page from that address.";
    renderLobby();
  }
}

function leaveNetRoom() {
  if (window.ArenaNet) ArenaNet.close();
  room = null;
  party = null;
  queueing = false;
  netStatus = "";
  renderLobby();
}

async function createParty() {
  readIdentity();
  try {
    await ensureOnline();
    ArenaNet.partyCreate(playerName, setup.player, picksFor(setup.player));
  } catch (err) {
    netStatus = err.message || "Could not reach the server.";
    renderLobby();
  }
}

async function joinParty() {
  readIdentity();
  const code = ($("party-code-input") && $("party-code-input").value.trim()) || "";
  if (!code) {
    netStatus = "Enter a party code.";
    renderLobby();
    return;
  }
  try {
    await ensureOnline();
    ArenaNet.partyJoin(code, playerName, setup.player, picksFor(setup.player));
  } catch (err) {
    netStatus = err.message || "Could not reach the server.";
    renderLobby();
  }
}

async function queueBots() {
  if (!party || !iLeadParty()) return;
  readIdentity();
  try {
    await ensureOnline();
    netStatus = "Starting a bot match…";
    renderLobby();
    ArenaNet.queueBots(setup.player, playerName, picksFor(setup.player));
  } catch (err) {
    netStatus = err.message || "Could not reach the server.";
    renderLobby();
  }
}

function leaveParty() {
  if (window.ArenaNet && ArenaNet.connected) ArenaNet.partyLeave();
  else {
    party = null;
    queueing = false;
    renderLobby();
  }
}

function startOnline() {
  if (!iAmHost() || !room) return;
  if (room.slots.some((slot) => slot.kind === "open")) {
    netStatus = "Every slot needs a player or an AI.";
    renderLobby();
    return;
  }
  if (!room.slots.some((slot) => slot.peerId === ArenaNet.id)) {
    netStatus = "Claim a slot before starting.";
    renderLobby();
    return;
  }
  let id = 1;
  const roster = room.slots.map((slot) => ({
    id: id++,
    classId: slot.classId,
    team: slot.team,
    x: slot.team === "ally" ? 18 : 82,
    y: slot.y,
    human: slot.kind === "human",
    peerId: slot.kind === "human" ? slot.peerId : null,
    name: slot.kind === "human" ? slot.name : null,
    talents: slot.kind === "human" ? normalizeTalents(slot.classId, slot.talents) : rollTalents(slot.classId),
    tier: slot.kind === "human" && slot.tier === 2 ? 2 : 1,
  }));
  const map = rollMap();
  ArenaNet.send({ kind: "start", roster, map });
  createMatch({ roster, netRole: "host", map });
}

function renderLobby() {
  const root = $("lobby");
  const card = (id, selected) => {
    const cls = CLASSES[id];
    return `<button type="button" class="class-card ${selected ? "selected" : ""}" data-class="${id}" style="--accent:${cls.color}">
      <img class="crest" alt="" src="${spellIcon(CLASS_CREST[id] || "charge")}">
      <span class="class-meta"><b>${esc(cls.name)}</b><span class="role">${esc(cls.role)}</span></span>
      <span class="class-level ${gearTier(id) === 2 ? "max" : ""}">Lv ${levelInfo(id).level}</span>
    </button>`;
  };
  const chips = (group, current) => Object.keys(CLASSES).map((id) => {
    const cls = CLASSES[id];
    return `<button type="button" class="chip ${current === id ? "selected" : ""}" data-group="${group}" data-class="${id}" style="border-top:3px solid ${cls.color}">${esc(cls.name)}</button>`;
  }).join("");
  const sizeBtn = (n, label) => `<button type="button" class="text-btn ${setup.size === n ? "selected" : ""}" data-size="${n}">${label}</button>`;
  const picked = CLASSES[setup.player];
  let teams = "";
  if (playMode === "local") {
    const partners = setup.allies.map((id, i) => `<div class="section-label">Blue partner ${setup.size > 2 ? i + 1 : ""}</div><div class="team-row">${chips(`ally-${i}`, id)}</div>`).join("");
    const foes = setup.enemies.map((id, i) => `<div class="section-label">Red fighter ${setup.size > 1 ? i + 1 : ""}</div><div class="team-row">${chips(`enemy-${i}`, id)}</div>`).join("");
    teams = `${partners}${foes}`;
  } else if (!room) {
    const canQueue = !party || iLeadParty();
    const queueLabel = party ? (queueing ? "Party in queue" : "Queue party") : (queueing ? "In queue" : "Find match");
    const roster = party ? `<ul class="party-list">${party.members.map((member) => {
      const cls = CLASSES[member.classId];
      const you = window.ArenaNet && member.id === ArenaNet.id ? " (you)" : "";
      const lead = member.id === party.leaderId ? "Leader" : "Member";
      return `<li><b>${esc(member.name)}${you}</b><span>${esc(cls ? cls.name : "Fighter")} · ${lead}</span></li>`;
    }).join("")}</ul>` : "";
    teams = `
      <div class="lobby-field">
        <input id="player-name" maxlength="16" value="${esc(playerName)}" placeholder="Your name" />
        <input id="server-url" value="${esc(defaultServer())}" placeholder="ws://127.0.0.1:8780" />
      </div>
      ${party ? `<p class="room-code">${esc(party.code)}</p>${roster}<p class="map-note">Share the code. Your party stays on the same team. Vs bots fills the other side with random classes.</p>` : `<p class="map-note">Queue alone, or make a party so friends stay together.</p>`}
      <div class="lobby-field">
        ${canQueue ? `<button class="start-btn" id="find-match" type="button">${queueLabel}</button>` : ""}
        ${iLeadParty() ? `<button class="text-btn" id="queue-bots" type="button">${party.members.length}v${party.members.length} vs bots</button>` : ""}
        ${queueing && canQueue ? `<button class="text-btn" id="cancel-queue" type="button">Cancel</button>` : ""}
        ${party ? `<button class="text-btn" id="leave-party" type="button">Leave party</button>` : ""}
      </div>
      ${party ? "" : `<div class="lobby-field">
        <button class="text-btn" id="create-party" type="button">Create party</button>
        <input id="party-code-input" maxlength="5" placeholder="Party code" />
        <button class="text-btn" id="join-party" type="button">Join party</button>
      </div>
      <div class="lobby-field">
        <button class="text-btn" id="host-room" type="button">Host room</button>
        <input id="room-code-input" maxlength="5" placeholder="Room code" />
        <button class="text-btn" id="join-room" type="button">Join room</button>
      </div>`}
      <p class="net-status">${esc(netStatus)}</p>`;
  } else {
    const slots = (room.slots || []).map((slot, i) => {
      const cls = CLASSES[slot.classId] || picked;
      const mine = window.ArenaNet && slot.peerId === ArenaNet.id;
      let who = "Open";
      if (slot.kind === "human") who = mine ? `${slot.name} (you)` : slot.name;
      if (slot.kind === "ai") who = `${cls.name} AI`;
      const claim = slot.kind !== "human" || mine
        ? `<button type="button" class="text-btn" data-claim="${i}">Claim as ${esc(picked.name)}</button>` : "";
      const ai = iAmHost() && slot.kind !== "human"
        ? `<button type="button" class="text-btn" data-ai="${i}">AI ${esc(picked.name)}</button>` : "";
      const leave = mine ? `<button type="button" class="text-btn" data-leave="${i}">Leave slot</button>` : "";
      return `<div class="slot">
        <b>${slot.team === "ally" ? "Blue" : "Red"}</b>
        <div class="who">${esc(who)}</div>
        <div class="sub">${esc(cls.name)}</div>
        <div class="slot-actions">${claim}${ai}${leave}</div>
      </div>`;
    }).join("");
    teams = `
      <p class="room-code">${esc(room.code || "")}</p>
      <p class="net-status">${esc(netStatus || "Share the code with the other players.")}</p>
      <div class="slot-grid">${slots || "<p>Waiting for the room.</p>"}</div>
      <div class="lobby-actions">
        ${iAmHost() ? `<button class="start-btn" id="start-online" type="button">Start match</button>` : ""}
        <button class="text-btn" id="leave-room" type="button">Leave room</button>
      </div>`;
  }

  root.innerHTML = `
    <div class="menu">
      <header class="menu-banner">
        <img class="banner" src="assets/arena-banner.jpg" alt="">
        <div class="menu-title">
          <img class="menu-emblem" src="assets/arena-emblem.jpg" alt="">
          <div>
            <h1>Arena</h1>
            <p>Pick a class, choose your talents, set your keys, then enter. Training lets you place the frames first.</p>
          </div>
        </div>
      </header>
      <div class="play-bar">
        <div class="choice-row">
          <button type="button" class="text-btn ${playMode === "local" ? "selected" : ""}" data-mode="local">Local</button>
          <button type="button" class="text-btn ${playMode === "online" ? "selected" : ""}" data-mode="online">Online</button>
          ${room ? "" : `${sizeBtn(1, "1v1")}${sizeBtn(2, "2v2")}${sizeBtn(3, "3v3")}<button type="button" class="text-btn" id="train">Training arena</button>`}
        </div>
        ${playMode === "local" && !room ? `<div class="map-pick">
          <span class="section-label">Training map</span>
          ${MAP_ORDER.map((id) => `<button type="button" class="text-btn ${trainMap === id ? "selected" : ""}" data-map="${id}">${MAPS[id].name}</button>`).join("")}
          <span class="map-note">Real matches roll a map. Training uses this one.</span>
        </div>` : ""}
        ${playMode === "local" && !room ? `<div class="lobby-actions">
          <button class="start-btn" id="start" type="button">Enter arena</button>
          <button class="text-btn" id="random" type="button">Random teams</button>
        </div>` : ""}
      </div>
      <div class="menu-layout">
        <section class="menu-panel">
          <div class="section-label">Your class</div>
          <div class="class-grid" id="pick-player">
            ${Object.keys(CLASSES).map((id) => card(id, setup.player === id)).join("")}
          </div>
          ${talentBoard()}
          <div class="dossier" id="dossier"></div>
        </section>
        <aside class="menu-panel">
          <div class="section-label">${playMode === "local" && !room ? "Teams" : room ? "Room" : party ? "Party" : "Online"}</div>
          ${teams || `<p class="net-status">Pick a team size, then enter.</p>`}
          <div class="section-label">Keybinds</div>
          <p class="net-status">${esc(bindPrompt(picked))}</p>
          <div class="section-label">Targeting</div>
          <div class="bind-grid">
            ${TARGET_ACTIONS.map((a) => `<button type="button" class="bind-row ${rebinding === a.id ? "selected" : ""}" data-bind="${a.id}"><span>${esc(a.name)}</span><b>${esc(codeLabel(targetCode(a.id)))}</b></button>`).join("")}
          </div>
          <div class="section-label">Spells</div>
          <div class="bind-grid">
            ${picked.abilities.map((a) => `<button type="button" class="bind-row ${rebinding === a.id ? "selected" : ""}" data-bind="${a.id}"><span>${esc(a.name)}</span><b>${esc(bindLabel(a, false))}</b></button>`).join("")}
          </div>
          <div class="lobby-actions"><button type="button" class="text-btn" id="reset-binds">Reset keys</button></div>
        </aside>
      </div>
    </div>`;

  renderDossier();
  root.querySelectorAll("[data-talent]").forEach((btn) => {
    btn.addEventListener("click", () => setTalent(Number(btn.dataset.talentNode), btn.dataset.talent));
  });
  root.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      playMode = btn.dataset.mode;
      renderLobby();
    });
  });
  root.querySelectorAll("[data-size]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setup.size = Number(btn.dataset.size);
      fitTeams();
      renderLobby();
    });
  });
  root.querySelectorAll("[data-map]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!MAPS[btn.dataset.map]) return;
      trainMap = btn.dataset.map;
      renderLobby();
    });
  });
  root.querySelectorAll("#pick-player .class-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      setup.player = btn.dataset.class;
      if (room && window.ArenaNet) {
        const mine = room.slots.findIndex((slot) => slot.peerId === ArenaNet.id);
        if (mine >= 0) {
          if (iAmHost()) {
            room.slots[mine].classId = setup.player;
            room.slots[mine].tier = gearTier(setup.player);
            broadcastLobby();
          } else {
            ArenaNet.send({ kind: "claim", slot: mine, classId: setup.player, name: playerName, tier: gearTier(setup.player) });
          }
        }
      }
      if (party && window.ArenaNet && ArenaNet.connected) ArenaNet.partyClass(setup.player, playerName, picksFor(setup.player));
      renderLobby();
    });
  });
  root.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [side, index] = btn.dataset.group.split("-");
      const list = side === "ally" ? setup.allies : setup.enemies;
      list[Number(index)] = btn.dataset.class;
      renderLobby();
    });
  });
  if ($("start")) {
    $("start").addEventListener("click", () => {
      fitTeams();
      createMatch({
        size: setup.size,
        player: setup.player,
        allies: setup.allies.slice(),
        enemies: setup.enemies.slice(),
        netRole: "local",
      });
    });
  }
  if ($("train")) {
    $("train").addEventListener("click", () => {
      fitTeams();
      createMatch({
        size: setup.size,
        player: setup.player,
        allies: setup.allies.slice(),
        enemies: setup.enemies.slice(),
        netRole: "local",
        training: true,
        map: trainMap,
      });
    });
  }
  if ($("random")) {
    $("random").addEventListener("click", () => {
      const ids = Object.keys(CLASSES);
      const roll = () => ids[Math.floor(Math.random() * ids.length)];
      setup.player = roll();
      setup.allies = setup.allies.map(roll);
      setup.enemies = setup.enemies.map(roll);
      renderLobby();
    });
  }
  root.querySelectorAll("[data-bind]").forEach((btn) => {
    btn.addEventListener("click", () => {
      rebinding = btn.dataset.bind;
      bindNote = "";
      renderLobby();
    });
  });
  if ($("reset-binds")) {
    $("reset-binds").addEventListener("click", () => {
      resetBinds();
      renderLobby();
    });
  }
  if ($("find-match")) $("find-match").addEventListener("click", findMatch);
  if ($("cancel-queue")) $("cancel-queue").addEventListener("click", cancelQueue);
  if ($("create-party")) $("create-party").addEventListener("click", createParty);
  if ($("join-party")) $("join-party").addEventListener("click", joinParty);
  if ($("leave-party")) $("leave-party").addEventListener("click", leaveParty);
  if ($("queue-bots")) $("queue-bots").addEventListener("click", queueBots);
  if ($("host-room")) $("host-room").addEventListener("click", hostRoom);
  if ($("join-room")) $("join-room").addEventListener("click", joinRoom);
  if ($("leave-room")) $("leave-room").addEventListener("click", leaveNetRoom);
  if ($("start-online")) $("start-online").addEventListener("click", startOnline);
  root.querySelectorAll("[data-claim]").forEach((btn) => {
    btn.addEventListener("click", () => {
      readIdentity();
      const index = Number(btn.dataset.claim);
      if (iAmHost()) {
        claimSlot(index, ArenaNet.id, playerName, setup.player, picksFor(setup.player), gearTier(setup.player));
        broadcastLobby();
        renderLobby();
      } else if (window.ArenaNet) {
        ArenaNet.send({ kind: "claim", slot: index, classId: setup.player, name: playerName, talents: picksFor(setup.player), tier: gearTier(setup.player) });
      }
    });
  });
  root.querySelectorAll("[data-ai]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const slot = room.slots[Number(btn.dataset.ai)];
      if (!slot || slot.kind === "human") return;
      slot.kind = "ai";
      slot.classId = setup.player;
      slot.peerId = null;
      slot.name = "";
      broadcastLobby();
      renderLobby();
    });
  });
  root.querySelectorAll("[data-leave]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (iAmHost()) {
        clearPeer(ArenaNet.id);
        broadcastLobby();
        renderLobby();
      } else if (window.ArenaNet) ArenaNet.send({ kind: "leave-slot" });
    });
  });
}

function talentBoard() {
  const nodes = TALENTS[setup.player] || [];
  const picked = picksFor(setup.player);
  return `<div class="section-label">Talents</div>
    <p class="map-note">One choice from each row. Saved in this browser.</p>
    <div class="talent-board">${nodes.map((node, i) => `<div class="talent-node">
      <span class="section-label">${esc(node.name)}</span>
      <div class="talent-choices">${node.choices.map((choice) => `<button type="button" class="talent-choice ${picked[i] === choice.id ? "selected" : ""}" data-talent-node="${i}" data-talent="${choice.id}"><b>${esc(choice.name)}</b><span>${esc(choice.text)}</span></button>`).join("")}</div>
    </div>`).join("")}</div>`;
}

function renderDossier() {
  const cls = CLASSES[setup.player];
  const dossier = $("dossier");
  if (!cls || !dossier) return;
  const lv = levelInfo(setup.player);
  const progress = lv.need
    ? `<div class="xp-line"><span>Level ${lv.level} of ${LEVEL_CAP}. The champion set unlocks at level ${LEVEL_CAP}.</span><span class="xp-bar"><i style="width:${Math.round((lv.xp / lv.need) * 100)}%"></i></span><span class="xp-count">${lv.xp} / ${lv.need} XP · win ${XP_WIN}, loss ${XP_LOSS}</span></div>`
    : `<div class="xp-line"><b class="xp-up">Level ${LEVEL_CAP}. Champion set equipped.</b></div>`;
  dossier.innerHTML = `<h3>${esc(cls.name)} kit</h3>${progress}` + cls.abilities.map((a) => {
    const bits = [a.channel ? `${a.castTime}s channel` : a.castTime ? `${a.castTime}s cast` : "Instant"];
    if (a.cost) bits.push(`${a.cost} ${cls.resource.name.toLowerCase()}`);
    if (a.cd) bits.push(`${a.cd}s cd`);
    return `<article><strong>${bindLabel(a, false)} · ${esc(a.name)}</strong><p>${esc(bits.join(" · "))}. ${esc(a.blurb)}</p></article>`;
  }).join("");
}


function cycleTarget(dir) {
  const foes = match.units.filter((u) => u.team !== match.player.team && u.hp > 0 && !isHidden(u));
  if (!foes.length) return;
  let idx = foes.findIndex((u) => u.id === match.player.targetId);
  idx = (idx + dir + foes.length) % foes.length;
  match.player.targetId = foes[idx].id;
  if (match.netRole === "client") sendInput();
}

function cycleFriend() {
  const friends = match.units.filter((u) => u.team === match.player.team && u !== match.player && u.hp > 0);
  if (!friends.length) {
    match.player.targetId = match.player.id;
  } else {
    let idx = friends.findIndex((u) => u.id === match.player.targetId);
    idx = (idx + 1) % friends.length;
    match.player.targetId = friends[idx].id;
  }
  if (match.netRole === "client") sendInput();
}

function lobbyRebinding() {
  return rebinding && (!match || $("match").classList.contains("hidden"));
}

function matchOpen() {
  return !!(match && $("match") && !$("match").classList.contains("hidden"));
}

function finishRebind(code) {
  const moving = ["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
  const targetKey = code === "Tab" || /^F([1-9]|1[0-2])$/.test(code);
  const mouse = isMouseBind(code);
  if (code === "Escape") {
    rebinding = null;
    bindNote = "";
  } else if (moving.includes(code)) {
    bindNote = "That key is for moving or jumping.";
  } else if (rebinding.startsWith("target:") && (BIND_CODES[code] || targetKey || mouse)) {
    setTargetBind(rebinding, code);
    bindNote = "";
    rebinding = null;
  } else if (!rebinding.startsWith("target:") && (BIND_CODES[code] || mouse)) {
    setBind(rebinding, mouse ? code : BIND_CODES[code]);
    bindNote = "";
    rebinding = null;
  } else if (targetKey) {
    bindNote = "Tab and the F keys are for targeting.";
  } else {
    bindNote = "Use a key, a mouse button, or the scroll wheel.";
  }
  renderLobby();
}

function tokenBound(token) {
  if (!match || !match.player) return false;
  if (targetActionFor(token, false)) return true;
  return match.player.abilities.some((a) => bindFor(a) === token);
}

function fireToken(token, shift) {
  if (!matchOpen() || !match.player || match.player.hp <= 0) return false;
  const targetAction = targetActionFor(token, shift);
  if (targetAction) {
    doTargetAction(targetAction);
    return true;
  }
  const ability = match.player.abilities.find((a) => bindFor(a) === token);
  if (!ability) return false;
  pressAbility(ability);
  return true;
}

function onKeyDown(e) {
  if (e.repeat) return;
  if (lobbyRebinding()) {
    e.preventDefault();
    finishRebind(e.code);
    return;
  }
  keysDown.add(e.code);
  if (!$("match") || $("match").classList.contains("hidden") || !match) return;
  const player = match.player;
  if (["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code) || /^F([1-9]|1[0-2])$/.test(e.code)) e.preventDefault();
  const targetAction = targetActionFor(e.code, e.shiftKey);
  if (targetAction) {
    doTargetAction(targetAction);
    return;
  }
  if (e.code === "Space") {
    if (match.netRole === "client") sendInput({ jump: true });
    else jumpUnit(player);
    return;
  }
  if (e.code === "Escape") {
    if (match.groundAim) match.groundAim = null;
    else if (match.netRole === "client") sendInput({ cancel: true });
    else if (player.cast) cancelCast(player, true);
    else player.targetId = player.id;
    return;
  }
  const key = BIND_CODES[e.code];
  if (!key || player.hp <= 0) return;
  const ability = player.abilities.find((a) => bindFor(a) === key);
  if (!ability) return;
  if (ability) pressAbility(ability);
}

function onKeyUp(e) {
  keysDown.delete(e.code);
}

function canvasClick(e) {
  if (!match || !window.ArenaView || e.button !== 0) return;
  if (match.groundAim) {
    lastPointer = { x: e.clientX, y: e.clientY };
    const point = ArenaView.groundPoint(e.clientX, e.clientY);
    if (point) match.groundAim.cursor = projectAim(match.player, point.x, point.z, match.groundAim.range, match.groundAim.minRange, match.groundAim.los, point.h);
    confirmGroundAim();
    return;
  }
  if (fireToken("Mouse0", e.shiftKey)) return;
  const hitId = ArenaView.pickUnitId(e.clientX, e.clientY);
  if (hitId) {
    const unit = unitById(hitId);
    if (unit && unit.hp > 0) selectTarget(unit.id);
    return;
  }
  const point = ArenaView.groundPoint(e.clientX, e.clientY);
  if (!point) return;
  let best = null;
  let bestD = 2.4;
  for (const unit of match.units) {
    if (unit.hp <= 0) continue;
    const d = Math.hypot(unit.x - point.x, unit.y - point.z);
    if (d < bestD) {
      best = unit;
      bestD = d;
    }
  }
  if (best) selectTarget(best.id);
}

if (!window.HEADLESS) {
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (match && !$("match").classList.contains("hidden")) {
      update(dt);
      updateHud();
      if (window.ArenaView) ArenaView.render(match, dt);
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  let rightPress = null;
  let wheelLock = 0;
  window.addEventListener("pointerdown", (e) => {
    if (lobbyRebinding()) {
      if (e.target.closest && e.target.closest("button, input, a, select, textarea")) return;
      e.preventDefault();
      finishRebind("Mouse" + e.button);
      return;
    }
    if (!matchOpen()) return;
    if (e.target.closest && e.target.closest("#actionbar, #unit-frames, #leave-training, #result, button, input, a")) return;
    if (e.button === 3 || e.button === 4) e.preventDefault();
    if (e.button === 2) {
      rightPress = { x: e.clientX, y: e.clientY, moved: false };
      return;
    }
    if (e.button === 0) return;
    fireToken("Mouse" + e.button, e.shiftKey);
  });
  window.addEventListener("pointerup", (e) => {
    if (!rightPress || e.button !== 2) return;
    const press = rightPress;
    rightPress = null;
    if (!press.moved) fireToken("Mouse2", e.shiftKey);
  });
  window.addEventListener("pointermove", (e) => {
    lastPointer = { x: e.clientX, y: e.clientY };
    if (rightPress && Math.hypot(e.clientX - rightPress.x, e.clientY - rightPress.y) > 6) rightPress.moved = true;
  });
  window.addEventListener("wheel", (e) => {
    const token = e.deltaY < 0 ? "WheelUp" : e.deltaY > 0 ? "WheelDown" : "";
    if (!token) return;
    if (lobbyRebinding()) {
      e.preventDefault();
      finishRebind(token);
      return;
    }
    if (!matchOpen() || !tokenBound(token)) return;
    e.preventDefault();
    e.stopPropagation();
    const now = performance.now();
    if (now - wheelLock < 180) return;
    wheelLock = now;
    fireToken(token, e.shiftKey);
  }, { capture: true, passive: false });
  window.addEventListener("auxclick", (e) => {
    if (e.button === 3 || e.button === 4) e.preventDefault();
  });
  window.addEventListener("contextmenu", (e) => {
    if (lobbyRebinding()) e.preventDefault();
  });
  window.addEventListener("resize", resizeCanvas);
  if ($("leave-training")) $("leave-training").addEventListener("click", requestBack);
  document.addEventListener("mousemove", moveTip);
  window.addEventListener("load", () => {
    if (window.ArenaNet) ArenaNet.on(onNetMessage);
    renderLobby();
    resizeCanvas();
    const stage = $("stage");
    if (window.ResizeObserver && stage) new ResizeObserver(() => resizeCanvas()).observe(stage);
    requestAnimationFrame(frame);
    if (window.ArenaView) ArenaView.bind(canvasClick);
  });
}

window.Arena = {
  TUNE,
  CLASSES,
  MAPS,
  PILLAR,
  get match() { return match; },
  getHover() { return hoverAbility; },
  spellLook(id) { return SPELL_LOOK[id] || null; },
  floorAt(x, y, feet) {
    const surface = standSurface(x, y, feet == null ? 0 : feet);
    return surface == null ? 0 : surface;
  },
  underDeck,
  hasLoS,
  tallBoxes,
  veiledFromViewer,
  createMatch,
  normalizeTalents,
  rollTalents,
  tryCast,
  step: update,
  pack: packMatch,
  applyNetInput,
  dropHuman,
};
