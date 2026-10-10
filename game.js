"use strict";

/**
 * Arena prototype.
 * Tune feel in TUNE and the CLASSES ability numbers.
 * Each class: spells on 1–4, E, Q, R, plus a break charm (T) and a signature (F).
 */

const TUNE = {
  gcd: 1.5,
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
        range: 5,
        school: "physical",
        target: "enemy",
        blurb: "Light damage and a 50% slow for 6 sec. The slow is physical and cannot be dispelled.",
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
        blurb: "Aim a spot 8–40 yards away and leap there, clearing roots. You arc over the pillar.",
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
          source.dash = {
            x: spot.x,
            y: spot.y,
            t: travel,
            dur: travel,
            leap: true,
            arc: 1.8 + Math.min(3.2, d * 0.05),
          };
          source.vx = 0;
          source.vy = 0;
          source.vz = 0;
          source.knock = 0;
          source.height = 0.15;
          source.facing = Math.atan2(dy, dx);
          source.auras = source.auras.filter((a) => a.control !== "root");
          combat(`${nameOf(source)} leaps.`);
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
        blurb: "Roots nearby enemies for up to 4 sec. Root diminishing returns. Magic, so it can be dispelled. Does not hit through the pillar.",
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
          const stacks = Math.min(3, (prev?.stacks || 0) + 1);
          addAura(source, {
            id: "hotStreak",
            name: "Wildfire",
            short: stacks >= 3 ? "Hot!" : `Hot ${stacks}`,
            type: "buff",
            remaining: 15,
            stacks,
          });
          floater(source, stacks >= 3 ? "Wildfire" : `Hot ${stacks}`, "#ffb45a");
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
          match.traps.push({
            ownerId: source.id,
            team: source.team,
            x: spot.x,
            y: spot.y,
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
        blurb: "1.5 sec heal. If an enemy is targeted, it heals you. Click your partner's frame (or press F2) to heal them. Reduced by dampening and Sundering Blow.",
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
        blurb: "Fears nearby enemies for up to 4 sec. Fear diminishing returns. Magic, so it can be dispelled. Does not hit through the pillar.",
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
    blurb: "Opens from the veil with a stun, then sticks to a target. Fade drops combat and puts you back in the veil.",
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
        blurb: "Fade out and drop enemy targeting. Lasts 20 sec. Dealing or taking damage reveals you. Blindside requires the veil.",
        extra(source) {
          if (isVeiled(source)) return "Already veiled";
          return null;
        },
        effect(source) {
          enterVeil(source, 20);
          combat(`${nameOf(source)} enters the veil.`);
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
        blurb: "Drop enemy targeting, clear slows and roots, and enter the veil for 8 sec. 90 sec cooldown. Off the global cooldown.",
        effect(source) {
          source.auras = source.auras.filter((a) => a.control !== "root" && !a.slow);
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
          match.lanterns.push({
            ownerId: source.id,
            team: source.team,
            x: spot.x,
            y: spot.y,
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
            stun: chainStacks(source, target) >= 3,
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

function hotStreakReady(unit) {
  const aura = unit?.auras.find((a) => a.id === "hotStreak");
  return !!(aura && aura.stacks >= 3);
}

function castTimeOf(unit, ability) {
  if (ability.id === "pyroblast" && hotStreakReady(unit)) return 0;
  return ability.castTime || 0;
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

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
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

function pillarBox(pad = 0) {
  return {
    minX: PILLAR.x - PILLAR.hw - pad,
    maxX: PILLAR.x + PILLAR.hw + pad,
    minY: PILLAR.y - PILLAR.hh - pad,
    maxY: PILLAR.y + PILLAR.hh + pad,
  };
}

function segmentHits(x1, y1, x2, y2, box) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tmin = 0;
  let tmax = 1;
  const checks = [
    { p: -dx, q: x1 - box.minX },
    { p: dx, q: box.maxX - x1 },
    { p: -dy, q: y1 - box.minY },
    { p: dy, q: box.maxY - y1 },
  ];
  for (const { p, q } of checks) {
    if (Math.abs(p) < 1e-8) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > tmax) return false;
        if (r > tmin) tmin = r;
      } else {
        if (r < tmin) return false;
        if (r < tmax) tmax = r;
      }
    }
  }
  return tmax >= tmin && tmin <= 1 && tmax >= 0;
}

function hasLoS(a, b) {
  if (!a || !b) return false;
  if (Math.hypot(a.x - b.x, a.y - b.y) < 0.25) return true;
  const pad = 0.4;
  return !segmentHits(a.x, a.y, b.x, b.y, pillarBox(pad));
}

function circleHitsPillar(x, y, r) {
  const box = pillarBox(0);
  const cx = clamp(x, box.minX, box.maxX);
  const cy = clamp(y, box.minY, box.maxY);
  return Math.hypot(x - cx, y - cy) < r;
}

function clampUnit(unit, ignorePillar) {
  unit.x = clamp(unit.x, unit.r + 1, TUNE.worldW - unit.r - 1);
  unit.y = clamp(unit.y, unit.r + 1, TUNE.worldH - unit.r - 1);
  if (match.phase === "prep") {
    if (unit.team === "ally") unit.x = Math.min(unit.x, 38);
    else unit.x = Math.max(unit.x, 62);
  }
  if (!ignorePillar && circleHitsPillar(unit.x, unit.y, unit.r)) {
    const box = pillarBox(0);
    const left = Math.abs(unit.x - box.minX);
    const right = Math.abs(box.maxX - unit.x);
    const top = Math.abs(unit.y - box.minY);
    const bottom = Math.abs(box.maxY - unit.y);
    const m = Math.min(left, right, top, bottom);
    if (m === left) unit.x = box.minX - unit.r;
    else if (m === right) unit.x = box.maxX + unit.r;
    else if (m === top) unit.y = box.minY - unit.r;
    else unit.y = box.maxY + unit.r;
    unit.x = clamp(unit.x, unit.r + 1, TUNE.worldW - unit.r - 1);
    unit.y = clamp(unit.y, unit.r + 1, TUNE.worldH - unit.r - 1);
  }
}

function combat(text) {
  match.logs.unshift({ t: match.time, text });
  if (match.logs.length > 18) match.logs.length = 18;
}

const SPELL_LOOK = {
  charge: { kind: "beam", color: "#f0d48a", life: 0.45 },
  mortalStrike: { kind: "slash", color: "#e15b5b", life: 0.42, size: 1.25 },
  hamstring: { kind: "slash", color: "#d6a15a", life: 0.36, size: 1 },
  overpower: { kind: "slash", color: "#f2e2b0", life: 0.34, size: 1.05 },
  execute: { kind: "slash", color: "#ff4d3a", life: 0.5, size: 1.65 },
  pummel: { kind: "burst", color: "#d7d2bf", life: 0.36, size: 0.9 },
  heroicLeap: { kind: "ring", color: "#e7c98a", life: 0.8, size: 3.2 },
  spellReflection: { kind: "burst", color: "#9ee7ff", life: 0.5, size: 1.45 },
  trinket: { kind: "ring", color: "#b8fff0", life: 0.55, size: 3.4 },
  frostbolt: { kind: "bolt", color: "#8fd7ff", life: 0.48, size: 1.15 },
  fireBlast: { kind: "burst", color: "#ff7a3c", life: 0.42, size: 1.35 },
  polymorph: { kind: "burst", color: "#d7b3ff", life: 0.55, size: 1.4 },
  counterspell: { kind: "burst", color: "#c9a0ff", life: 0.38, size: 1.05 },
  blink: { kind: "blink", color: "#9fd0ff", life: 0.45, size: 1.35 },
  frostNova: { kind: "nova", color: "#c6f4ff", life: 0.7, size: 8 },
  scorch: { kind: "bolt", color: "#ffb45a", life: 0.42, size: 1.2, round: true },
  pyroblast: { kind: "bolt", color: "#ff6a2a", life: 0.62, size: 1.85, round: true },
  iceBlock: { kind: "burst", color: "#c6f4ff", life: 0.5, size: 1.6 },
  aimedShot: { kind: "bolt", color: "#f0e2b8", life: 0.4, size: 1.05 },
  concussiveShot: { kind: "bolt", color: "#d9cbb0", life: 0.48, size: 1 },
  freezingTrap: { kind: "ring", color: "#9eecff", life: 0.55, size: 3.4 },
  wingClip: { kind: "slash", color: "#c4b48a", life: 0.36, size: 0.95 },
  silencingShot: { kind: "bolt", color: "#b9a6e0", life: 0.4, size: 1 },
  disengage: { kind: "dash", color: "#e6d3b0", life: 0.42 },
  feignDeath: { kind: "burst", color: "#8a847c", life: 0.5, size: 1.4 },
  deterrence: { kind: "ring", color: "#ffe08a", life: 0.55, size: 3.6 },
  flashHeal: { kind: "burst", color: "#7dff9a", life: 0.48, size: 1.3 },
  powerWordShield: { kind: "burst", color: "#9fd0ff", life: 0.48, size: 1.35 },
  shadowWordPain: { kind: "burst", color: "#c084fc", life: 0.5, size: 1.15 },
  psychicScream: { kind: "nova", color: "#b388ff", life: 0.65, size: 8 },
  dispelMagic: { kind: "burst", color: "#f7f4ff", life: 0.4, size: 1.15 },
  mindBlast: { kind: "bolt", color: "#9b6bff", life: 0.45, size: 1.25, round: true },
  penance: { kind: "bolt", color: "#ffe08a", life: 0.28, size: 1, round: true },
  desperatePrayer: { kind: "burst", color: "#b6ff6a", life: 0.55, size: 1.7 },
  shadowBolt: { kind: "bolt", color: "#7d5cff", life: 0.5, size: 1.25, round: true },
  corruption: { kind: "burst", color: "#6b4cff", life: 0.5, size: 1.2 },
  agony: { kind: "burst", color: "#c084fc", life: 0.5, size: 1.25 },
  unstableAffliction: { kind: "burst", color: "#6dff9a", life: 0.55, size: 1.35 },
  fear: { kind: "bolt", color: "#b388ff", life: 0.48, size: 1.15, round: true },
  spellLock: { kind: "burst", color: "#d7c4ff", life: 0.38, size: 1.05 },
  drainLife: { kind: "bolt", color: "#9b6bff", life: 0.32, size: 1.05, round: true },
  healthstone: { kind: "burst", color: "#7dff9a", life: 0.55, size: 1.6 },
  rejuvenation: { kind: "burst", color: "#7dff9a", life: 0.48, size: 1.2 },
  lifebloom: { kind: "burst", color: "#b6ff6a", life: 0.5, size: 1.25 },
  regrowth: { kind: "burst", color: "#8fd18a", life: 0.5, size: 1.3 },
  wildGrowth: { kind: "ring", color: "#7dff9a", life: 0.7, size: 6 },
  swiftmend: { kind: "burst", color: "#c6ff8a", life: 0.48, size: 1.55 },
  cyclone: { kind: "burst", color: "#e7c98a", life: 0.55, size: 1.45 },
  wrath: { kind: "bolt", color: "#c6e58a", life: 0.45, size: 1.15, round: true },
  ironbark: { kind: "burst", color: "#8f6a3a", life: 0.55, size: 1.5 },
  sinisterStrike: { kind: "slash", color: "#fff569", life: 0.36, size: 1.05 },
  eviscerate: { kind: "slash", color: "#e15b5b", life: 0.46, size: 1.4 },
  cheapShot: { kind: "burst", color: "#f4f0c8", life: 0.42, size: 1.15 },
  kick: { kind: "burst", color: "#d7d2bf", life: 0.36, size: 0.95 },
  gouge: { kind: "slash", color: "#e6d3b0", life: 0.38, size: 1.05 },
  sprint: { kind: "ring", color: "#fff569", life: 0.5, size: 3.2 },
  stealth: { kind: "burst", color: "#6a645c", life: 0.5, size: 1.35 },
  vanish: { kind: "burst", color: "#3a342c", life: 0.55, size: 1.6 },
  kindle: { kind: "ring", color: "#5ee0c5", life: 0.6, size: 8 },
  soothe: { kind: "burst", color: "#b8fff0", life: 0.45, size: 1.25 },
  shelter: { kind: "burst", color: "#9fd0ff", life: 0.48, size: 1.35 },
  hush: { kind: "burst", color: "#f7f4ff", life: 0.4, size: 1.15 },
  flare: { kind: "ring", color: "#fff1b0", life: 0.6, size: 8 },
  mend: { kind: "burst", color: "#7dff9a", life: 0.48, size: 1.3 },
  snuff: { kind: "ring", color: "#d7c39a", life: 0.5, size: 8 },
  beacon: { kind: "ring", color: "#fff1b0", life: 0.7, size: 16 },
  lash: { kind: "bolt", color: "#e23d4a", life: 0.4, size: 1.1 },
  brand: { kind: "burst", color: "#e23d4a", life: 0.48, size: 1.2 },
  yank: { kind: "bolt", color: "#ff8a96", life: 0.4, size: 1.15 },
  sever: { kind: "slash", color: "#ff4d3a", life: 0.46, size: 1.45 },
  silenceLash: { kind: "burst", color: "#d7c4ff", life: 0.38, size: 1.05 },
  hobble: { kind: "bolt", color: "#d6a15a", life: 0.4, size: 1 },
  reel: { kind: "blink", color: "#e23d4a", life: 0.4, size: 1.2 },
  bind: { kind: "ring", color: "#e23d4a", life: 0.6, size: 6 },
  oath: { kind: "burst", color: "#f2a3c7", life: 0.5, size: 1.35 },
  pulse: { kind: "burst", color: "#ffd0e4", life: 0.45, size: 1.25 },
  link: { kind: "ring", color: "#f2a3c7", life: 0.55, size: 3.4 },
  unravel: { kind: "burst", color: "#f7f4ff", life: 0.4, size: 1.15 },
  chorus: { kind: "burst", color: "#ffb7d5", life: 0.5, size: 1.35 },
  rebuke: { kind: "bolt", color: "#f2a3c7", life: 0.4, size: 1.05 },
  thread: { kind: "burst", color: "#ffd0e4", life: 0.48, size: 1.2 },
  unity: { kind: "ring", color: "#f2a3c7", life: 0.6, size: 4 },
  mark: { kind: "burst", color: "#7f9cff", life: 0.45, size: 1.2 },
  fleche: { kind: "slash", color: "#d7e4ff", life: 0.34, size: 1.05 },
  riposte: { kind: "slash", color: "#7f9cff", life: 0.4, size: 1.2 },
  lunge: { kind: "dash", color: "#7f9cff", life: 0.4 },
  crosscut: { kind: "slash", color: "#ffe14a", life: 0.46, size: 1.45 },
  parry: { kind: "burst", color: "#d7d2bf", life: 0.36, size: 0.95 },
  feint: { kind: "burst", color: "#c9d6ff", life: 0.4, size: 1.1 },
  isolate: { kind: "ring", color: "#7f9cff", life: 0.55, size: 3.2 },
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
  if (id === "blink" || id === "reel") {
    spellFx({ kind: "burst", color: look.color, x: origin.x, y: origin.y, h: 1.15, life: look.life, size: look.size });
    spellFx({ kind: "burst", color: look.color, x: source.x, y: source.y, h: 1.15, life: look.life, size: look.size });
    return;
  }
  if (id === "disengage") {
    const sp = Math.hypot(source.vx, source.vy) || 1;
    spellFx({
      kind: "beam", color: look.color,
      x: origin.x, y: origin.y, h: 0.55,
      x2: origin.x + (source.vx / sp) * 7, y2: origin.y + (source.vy / sp) * 7, h2: 0.7,
      life: look.life,
    });
    spellFx({ kind: "burst", color: look.color, x: origin.x, y: origin.y, h: 0.8, life: 0.36, size: 1.3 });
    return;
  }
  if (id === "heroicLeap" && source.dash) {
    spellFx({ kind: "ring", color: look.color, x: source.dash.x, y: source.dash.y, h: 0.12, life: (source.dash.dur || 0.5) + 0.2, size: look.size });
    spellFx({ kind: "burst", color: look.color, x: origin.x, y: origin.y, h: 0.7, life: 0.34, size: 1.2 });
    return;
  }
  if (id === "charge" && source.dash) {
    spellFx({ kind: "beam", color: look.color, x: origin.x, y: origin.y, h: 0.4, x2: source.dash.x, y2: source.dash.y, h2: 0.4, life: look.life });
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
    spellFx({ kind: "beam", color: look.color, x: origin.x, y: origin.y, h: 0.45, x2: source.dash.x, y2: source.dash.y, h2: 0.45, life: look.life });
    return;
  }
  if (id === "penance") {
    const heal = dest.team === source.team;
    spellFx({
      kind: "bolt", color: heal ? "#ffe08a" : "#7a5cff", round: true, size: 1.05, life: 0.28,
      x: origin.x, y: origin.y, h: 1.35 + (origin.h || 0),
      x2: dest.x, y2: dest.y, h2: 1.2 + (dest.height || 0),
    });
    return;
  }
  if (look.kind === "bolt") {
    spellFx({
      kind: "bolt", color: look.color, round: !!look.round, size: look.size || 0.24, life: look.life,
      x: origin.x, y: origin.y, h: 1.35 + (origin.h || 0),
      x2: dest.x, y2: dest.y, h2: 1.15 + (dest.height || 0),
    });
    return;
  }
  if (look.kind === "slash") {
    spellFx({
      kind: "slash", color: look.color, size: look.size || 1, life: look.life,
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
  });
}

function releaseSpell(source, target, ability) {
  const from = { x: source.x, y: source.y, h: source.height || 0 };
  ability.effect(source, target);
  spellVisual(ability.id, source, target, from);
}

function floater(unit, text, color) {
  match.floaters.push({
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
    if (meta.direct && source) breakVeil(source);
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
  for (const aura of target.auras) {
    if (!aura.absorb) continue;
    const used = Math.min(aura.absorb, remaining);
    aura.absorb -= used;
    remaining -= used;
    if (used > 0) floater(target, `-${used}`, "#9fd0ff");
  }
  target.auras = target.auras.filter((a) => a.absorb == null || a.absorb > 0);
  if (remaining > 0) {
    target.hp = Math.max(0, target.hp - remaining);
    if (target.classId === "warrior") {
      target.resource = Math.min(100, target.resource + remaining * 0.08);
    }
    if (meta.direct && source && !meta.split) {
      target.lastHitId = source.id;
      target.lastHitTime = match.time;
    }
    breakIncaps(target);
    breakVeil(target);
  }
  if (meta.direct && source) breakVeil(source);
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
  const ratio = source.auras.some((a) => a.id === "unity") ? 1 : 0.5;
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
  if (ability.school === "magic" && (unit.silence > 0 || unit.lockout > 0)) return true;
  if (ability.castTime > 0 && unit.lockout > 0) return true;
  return false;
}

function validate(unit, ability, target) {
  if (match.phase !== "fight") return "Gates are closed";
  if (unit.hp <= 0) return "Dead";
  if (unit.dash) return unit.dash.leap ? "Leaping" : unit.dash.yank ? "Yanked" : unit.dash.lunge ? "Lunging" : "Rushing";
  if (unit.auras.some((a) => a.ice)) return "Glacier";
  if (ability.id !== "trinket" && hardLocked(unit)) return statusText(unit) || "Can't act";
  if (ability.id !== "trinket" && isLocked(unit, ability)) return unit.silence > 0 ? "Silenced" : "School locked";
  if (ability.gcd !== false && unit.gcd > 0) return "Not ready";
  if ((unit.cd[ability.id] || 0) > 0) return "Not ready";
  if (unit.resource < ability.cost) return `Not enough ${CLASSES[unit.classId].resource.name}`;
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
  if (unit.cast && unit.cast.ability.id === ability.id) return false;
  if (unit.isPlayer && ability.target === "ground" && !unit.aimPoint) {
    if (match.groundAim && match.groundAim.abilityId === ability.id) {
      confirmGroundAim();
      return true;
    }
    const previewTarget = resolveTarget(unit, ability, explicit);
    const blocked = validate(unit, ability, previewTarget);
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
  const target = resolveTarget(unit, ability, explicit);
  const reason = validate(unit, ability, target);
  if (reason) {
    if (unit.human && !quiet) feedback(unit, reason);
    return false;
  }
  if (unit.cast) cancelCast(unit, true);
  unit.resource -= ability.cost;
  if (ability.gcd !== false) unit.gcd = ability.gcdTime || TUNE.gcd;
  const time = castTimeOf(unit, ability);
  if (time > 0) {
    unit.cast = {
      ability,
      targetId: target.id,
      time,
      total: time,
      cost: ability.cost,
      channel: !!ability.channel,
      pulsesLeft: ability.pulses || 0,
      pulse: ability.channel ? 0.05 : 0,
    };
    if (ability.channel && ability.cd) unit.cd[ability.id] = ability.cd;
    unit.goal = null;
  } else {
    if (ability.cd) unit.cd[ability.id] = ability.cd;
    releaseSpell(unit, target, ability);
  }
  return true;
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
      return;
    }
  }
  if (hardLocked(unit)) return;
  if (ability.cd) unit.cd[ability.id] = ability.cd;
  releaseSpell(unit, target, ability);
}

function blinkMove(unit, dx, dy, distance) {
  const len = Math.hypot(dx, dy) || 1;
  const step = 0.4;
  let left = distance;
  while (left > 0) {
    const hop = Math.min(step, left);
    const nx = unit.x + (dx / len) * hop;
    const ny = unit.y + (dy / len) * hop;
    if (nx < 2 || ny < 2 || nx > TUNE.worldW - 2 || ny > TUNE.worldH - 2) break;
    if (circleHitsPillar(nx, ny, unit.r)) break;
    if (match.phase === "prep") break;
    unit.x = nx;
    unit.y = ny;
    left -= hop;
  }
  unit.facing = Math.atan2(dy, dx);
  unit.vx = 0;
  unit.vy = 0;
}

function launchBackward(unit) {
  unit.auras = unit.auras.filter((a) => a.control !== "root");
  const airborne = unit.height > 0.2 || unit.vz > 1;
  const backX = -Math.cos(unit.facing);
  const backY = -Math.sin(unit.facing);
  const push = airborne ? 28 : 22;
  unit.vx += backX * push;
  unit.vy += backY * push;
  unit.vz = airborne ? unit.vz + 2.5 : 8.6;
  unit.knock = airborne ? 0.9 : 0.62;
  if (unit.height < 0.05) unit.height = 0.05;
}

function jumpUnit(unit) {
  if (!unit || unit.hp <= 0 || unit.dash) return;
  if (hardLocked(unit) || unit.auras.some((a) => a.control === "root" || a.ice)) return;
  if (unit.height > 0.05 || unit.vz > 0) return;
  unit.vz = TUNE.jumpVelocity;
  unit.height = 0.06;
}

function projectAim(unit, x, y, range, minRange, checkLos) {
  let dx = x - unit.x;
  let dy = y - unit.y;
  const d = Math.hypot(dx, dy) || 0.001;
  const scale = d > range ? range / d : 1;
  const px = unit.x + dx * scale;
  const py = unit.y + dy * scale;
  const landed = Math.hypot(px - unit.x, py - unit.y);
  if (minRange && landed < minRange - 0.05) return { x: px, y: py, ok: false, reason: "Too close" };
  if (checkLos === false) return { x: px, y: py, ok: true, reason: null };
  const los = hasLoS(unit, { x: px, y: py });
  return { x: px, y: py, ok: los, reason: los ? null : "Line of sight" };
}

function refreshAimCursor() {
  if (!match?.groundAim || !lastPointer || !window.ArenaView) return;
  const p = ArenaView.groundPoint(lastPointer.x, lastPointer.y);
  if (!p) return;
  match.groundAim.cursor = projectAim(match.player, p.x, p.z, match.groundAim.range, match.groundAim.minRange, match.groundAim.los);
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
    sendInput({ cast: aim.abilityId, aimX: cursor.x, aimY: cursor.y });
    return;
  }
  match.player.aimPoint = { x: cursor.x, y: cursor.y };
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
  return {
    id: opts.id || nextId++,
    classId,
    team,
    isPlayer,
    human: opts.human != null ? !!opts.human : isPlayer,
    peerId: opts.peerId || null,
    givenName: opts.name || null,
    name: def.name,
    x,
    y,
    r: 1.7,
    facing: team === "ally" ? 0 : Math.PI,
    hp: def.hp,
    hpMax: def.hp,
    resource: def.resource.start,
    abilities: def.abilities,
    auras: [],
    cd: {},
    gcd: 0,
    silence: 0,
    lockout: 0,
    cast: null,
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
  }));
  enemies.forEach((classId, i) => roster.push({
    id: id++, classId, team: "enemy", x: 82, y: ey[i], human: false, local: false, peerId: null, name: null,
  }));
  return roster;
}

function createMatch(spec) {
  if (window.ArenaView) ArenaView.reset();
  const roster = rosterFromSpec(spec);
  nextId = 1;
  const units = roster.map((r) => makeUnit(r.classId, r.team, r.x, r.y, r));
  assignNames(units);
  const player = units.find((u) => u.isPlayer) || units[0];
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
    winSide: null,
  };
  netSend = 0;
  combat("Take your positions. Gates open in a moment.");
  hoverAbility = null;
  buildMatchUi();
  $("lobby").classList.add("hidden");
  $("match").classList.remove("hidden");
  $("result").classList.add("hidden");
  requestAnimationFrame(resizeCanvas);
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

function tickUnitTimers(unit, dt) {
  if (unit.gcd > 0) unit.gcd = Math.max(0, unit.gcd - dt);
  if (unit.silence > 0) unit.silence = Math.max(0, unit.silence - dt);
  if (unit.lockout > 0) unit.lockout = Math.max(0, unit.lockout - dt);
  for (const key of Object.keys(unit.cd)) {
    if (unit.cd[key] > 0) unit.cd[key] = Math.max(0, unit.cd[key] - dt);
  }
}

function tickSwing(unit, dt) {
  if (unit.hp <= 0 || unit.cast || unit.dash || hardLocked(unit) || isFeigning(unit) || isVeiled(unit)) return;
  const auto = CLASSES[unit.classId].auto;
  const target = unitById(unit.targetId);
  if (!target || target.hp <= 0 || target.team === unit.team || isHidden(target)) return;
  const d = dist(unit, target);
  if (d > auto.range || d < auto.minRange || !hasLoS(unit, target)) return;
  unit.swing -= dt;
  if (unit.swing > 0) return;
  unit.swing += auto.interval;
  const dealt = dealDamage(unit, target, auto.damage, { direct: true, school: "physical", name: "Auto attack", log: false });
  if (unit.classId === "warrior" && dealt >= 0) unit.resource = Math.min(100, unit.resource + 12);
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
    unit.height = 0;
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
      if (mark && mark.hp > 0 && dist(unit, mark) < 7) gainMomentum(unit, dash.momentum || 0);
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
    const p = 1 - Math.max(dash.t, 0) / (dash.dur || 0.4);
    unit.height = Math.sin(clamp(p, 0, 1) * Math.PI) * (dash.arc || 3);
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
    const victim = match.units.find((u) => u.hp > 0 && u.team !== trap.team && dist(u, trap) <= trap.radius);
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
    const inside = match.units.filter((u) => u.team === lantern.team && u.hp > 0 && dist(u, lantern) <= reach);
    const targets = lantern.beacon > 0 && inside.length ? friendsOf(owner) : inside;
    for (const ally of targets) heal(owner, ally, 34, "Kindle", true);
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

function foeCasting(unit, range) {
  return foesOf(unit).find((f) => f.cast && !isHidden(f) && dist(unit, f) <= range && hasLoS(unit, f) && !immune(f));
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
  const pad = 4.2;
  const box = pillarBox(0);
  const corners = [
    { x: box.minX - pad, y: box.minY - pad },
    { x: box.maxX + pad, y: box.minY - pad },
    { x: box.minX - pad, y: box.maxY + pad },
    { x: box.maxX + pad, y: box.maxY + pad },
  ];
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
  const casting = foeCasting(unit, 5);
  if (casting) tryCast(unit, "pummel", casting);
  const magicCast = foesOf(unit).find((f) => !isHidden(f) && f.cast && f.cast.ability.reflectable && dist(unit, f) < 32 && hasLoS(unit, f));
  if (magicCast && (unit.cd.spellReflection || 0) <= 0) tryCast(unit, "spellReflection");
  if (kill && !unit.gcd) {
    const d = dist(unit, kill);
    const charged = d >= 8 && d <= 25 && hasLoS(unit, kill) && tryCast(unit, "charge", kill);
    if (!charged && d >= 8 && d <= 40 && hasLoS(unit, kill)) {
      unit.aimPoint = { x: kill.x, y: kill.y };
      tryCast(unit, "heroicLeap");
      unit.aimPoint = null;
    }
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
  const casting = foeCasting(unit, 30);
  if (casting) tryCast(unit, "counterspell", casting);
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
  const casting = foeCasting(unit, 35);
  if (casting && dist(unit, casting) >= 8) tryCast(unit, "silencingShot", casting);
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
    else if (lowest && dist(unit, lowest) > 16) unit.goal = pathTo(unit, lowest);
    else unit.goal = null;
  }
}

function aiHexer(unit) {
  const kill = pickKillTarget(unit);
  if (kill) unit.targetId = kill.id;
  if (unit.hp / unit.hpMax < 0.36) tryCast(unit, "healthstone");
  const casting = foeCasting(unit, 30);
  if (casting) tryCast(unit, "spellLock", casting);
  const off = foesOf(unit).find((foe) => (
    foe !== kill
    && !isHidden(foe)
    && !immune(foe)
    && drFactor(foe, "fear") > 0
    && !foe.auras.some((a) => a.dot || a.control)
  ));
  if (off && !unit.cast) tryCast(unit, "fear", off);
  if (kill && !unit.cast) {
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
    else if (lowest && dist(unit, lowest) > 18) unit.goal = pathTo(unit, lowest);
    else unit.goal = null;
  }
}

function aiShade(unit) {
  const kill = pickKillTarget(unit);
  if (kill) unit.targetId = kill.id;
  if (unit.hp / unit.hpMax < 0.34) tryCast(unit, "vanish");
  const casting = foeCasting(unit, 5);
  if (casting) tryCast(unit, "kick", casting);
  const hidden = isVeiled(unit);
  if (!hidden && kill && dist(unit, kill) > 10 && (unit.cd.stealth || 0) <= 0 && unit.hp / unit.hpMax > 0.5) {
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
    if (!unit.gcd) tryCast(unit, "sinisterStrike", kill);
  }
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
  if (lowest && lowest.hp / lowest.hpMax < 0.84 && !unit.cast) tryCast(unit, "soothe", lowest);
  if (lowest && lowest.hp / lowest.hpMax < 0.58 && !unit.cast) tryCast(unit, "mend", lowest);
  if (!unit.cast) {
    const stand = lanternOf(unit);
    if (near && dist(unit, near) < 11) wantRange(unit, near, 14, 28);
    else if (lowest && dist(unit, lowest) > 14) unit.goal = pathTo(unit, lowest);
    else if (stand && dist(unit, stand) > lanternReach(stand)) unit.goal = pathTo(unit, stand);
    else unit.goal = null;
  }
}

function aiBinder(unit) {
  const kill = pickKillTarget(unit);
  if (kill) unit.targetId = kill.id;
  const foes = foesOf(unit);
  if (foes.length >= 2 && dist(foes[0], foes[1]) <= 12 && (!kill || kill.hp / kill.hpMax > 0.35)) tryCast(unit, "bind");
  const casting = foeCasting(unit, 30);
  if (casting) tryCast(unit, "silenceLash", casting);
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
  if (partner && lowest && lowest.hp / lowest.hpMax < 0.55 && !hasAura(unit, "link")) tryCast(unit, "link");
  for (const friend of friends) {
    if (pickDispel(friend, "help")) {
      tryCast(unit, "unravel", friend);
      break;
    }
  }
  if (lowest && lowest.hp / lowest.hpMax < 0.92 && !hasAura(lowest, "thread")) tryCast(unit, "thread", lowest);
  if (lowest && lowest.hp / lowest.hpMax < 0.8 && !unit.cast) tryCast(unit, "pulse", lowest);
  if (lowest && lowest.hp / lowest.hpMax < 0.58 && !unit.cast) tryCast(unit, "chorus", lowest);
  if (!unit.cast && kill && friends.every((f) => f.hp / f.hpMax > 0.86)) tryCast(unit, "rebuke", kill);
  if (!unit.cast) {
    if (near && dist(unit, near) < 11) wantRange(unit, near, 14, 28);
    else if (lowest && dist(unit, lowest) > 16) unit.goal = pathTo(unit, lowest);
    else unit.goal = null;
  }
}

function aiDuelist(unit) {
  const kill = pickKillTarget(unit);
  if (kill) unit.targetId = kill.id;
  const casting = foeCasting(unit, 5);
  if (casting) tryCast(unit, "parry", casting);
  if (kill && !isDuelMark(unit, kill)) tryCast(unit, "mark", kill);
  if (kill && isDuelMark(unit, kill) && kill.hp / kill.hpMax < 0.65) tryCast(unit, "isolate", kill);
  if (kill) {
    const d = dist(unit, kill);
    if (d >= 8 && d <= 20 && hasLoS(unit, kill)) tryCast(unit, "lunge", kill);
    const off = foesOf(unit).find((f) => f !== kill && !isHidden(f) && !immune(f) && dist(unit, f) <= 5 && drFactor(f, "incap") > 0 && !f.auras.some((a) => a.control));
    if (off) tryCast(unit, "feint", off);
    if (d <= 5) {
      tryCast(unit, "riposte", kill);
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
  return !circleHitsPillar(x, y, unit.r);
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
        unit.height = 0;
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
    const grounded = unit.height <= 0.001;
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
    unit.vz -= TUNE.gravity * dt;
    unit.height += unit.vz * dt;
    if (unit.height <= 0) {
      unit.height = 0;
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
    tickUnitTimers(unit, dt);
    tickAuras(unit, dt);
    regen(unit, dt);
    tickDash(unit, dt);
    tickCast(unit, dt);
    tickSwing(unit, dt);
  }
  tickTraps(dt);
  tickLanterns(dt);
  forgetHiddenTargets();
  for (const unit of match.units) {
    if (unit.human || unit.hp <= 0) continue;
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
  const selected = unitById(match.player.targetId);
  if (!selected || selected.hp <= 0 || (isHidden(selected) && selected.team !== match.player.team)) {
    const next = match.units.find((u) => u.team !== match.player.team && u.hp > 0 && !isHidden(u))
      || match.units.find((u) => u.hp > 0 && u !== match.player && !isHidden(u));
    if (next) match.player.targetId = next.id;
    else if (selected && isHidden(selected)) match.player.targetId = null;
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

function buildMatchUi() {
  const enemyWrap = $("enemy-frames");
  const partyWrap = $("party-frames");
  enemyWrap.innerHTML = "";
  partyWrap.innerHTML = "";
  for (const unit of match.units) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `frame ${unit.team}`;
    el.dataset.uid = String(unit.id);
    el.innerHTML = `
      <div class="frame-head"><b class="fname"></b><span class="sub"></span></div>
      <div class="meter hp"><div class="fill"></div><span></span></div>
      <div class="meter resource"><div class="fill"></div><span></span></div>
      <div class="meter cast hidden"><div class="fill"></div><span></span></div>
      <div class="auras"></div>`;
    el.addEventListener("click", () => selectTarget(unit.id));
    (unit.team === match.player.team ? partyWrap : enemyWrap).appendChild(el);
    unit.el = el;
  }
  const bar = $("abilities");
  bar.innerHTML = "";
  for (const ability of match.player.abilities) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `ability ${ability.tag === "Signature" ? "signature" : ""} ${ability.tag === "Trinket" ? "trinket" : ""}`;
    btn.innerHTML = `<span class="key">${ability.key.toUpperCase()}</span><span class="short">${ability.short}</span><span class="cost"></span><span class="sweep"></span><span class="cd"></span>`;
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
  else if (ability.id === "pyroblast") bits.push("2.5s cast, instant at 3 Wildfire");
  else bits.push(ability.castTime ? `${ability.castTime}s cast` : "Instant");
  if (ability.moveCast) bits.push("while moving");
  if (ability.range) bits.push(ability.minRange ? `${ability.minRange}–${ability.range} yd` : `${ability.range} yd`);
  if (ability.radius) bits.push(`${ability.radius} yd radius`);
  const res = CLASSES[match.player.classId].resource.name;
  if (ability.cost) bits.push(`${ability.cost} ${res}`);
  if (ability.cd) bits.push(`${ability.cd}s cooldown`);
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
  const x = Math.min(window.innerWidth - 280, e.clientX + 16);
  const y = Math.min(window.innerHeight - 20, e.clientY + 16);
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
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
  $("phase-label").textContent = match.phase === "prep" ? "Gates closed" : match.phase === "fight" ? "In combat" : match.win ? "Victory" : "Defeat";
  if (match.phase === "fight" && match.time < TUNE.prep + 0.8) {
    announce.textContent = "FIGHT";
  } else if (match.phase !== "prep") {
    announce.textContent = "";
  }

  for (const unit of match.units) {
    const el = unit.el;
    el.classList.toggle("selected", match.player.targetId === unit.id);
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
    $("cast-label").textContent = player.cast.ability.name;
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
    const cd = Math.max(ability.gcd === false ? 0 : player.gcd, player.cd[ability.id] || 0);
    const base = ability.cd || (ability.gcd === false ? 0 : TUNE.gcd);
    const pct = base > 0 ? clamp(cd / (ability.cd || TUNE.gcd), 0, 1) : 0;
    btn.querySelector(".sweep").style.height = `${pct * 100}%`;
    btn.querySelector(".cd").textContent = cd > 0.15 ? String(Math.ceil(cd)) : "";
    let costText = "Free";
    if (ability.tag === "Trinket") costText = "Trinket";
    else if (ability.cost) costText = String(ability.cost);
    else if (ability.tag === "Signature") costText = "Signature";
    if (ability.id === "pyroblast" && hotStreakReady(player)) costText = "Instant";
    btn.querySelector(".cost").textContent = costText;
    btn.classList.toggle("primed", ability.id === "pyroblast" && hotStreakReady(player));
    const selected = unitById(player.targetId);
    const frozen = player.auras.some((a) => a.ice);
    const controlled = hardLocked(player);
    let usable = match.phase === "fight" && player.hp > 0 && !frozen && (ability.id === "trinket" || !controlled);
    if (ability.cost > player.resource) usable = false;
    if ((player.cd[ability.id] || 0) > 0) usable = false;
    if (ability.extra && selected && ability.extra(player, ability.target === "self" ? player : selected)) usable = false;
    btn.classList.toggle("unusable", !usable && match.phase === "fight");
  }

  $("log").innerHTML = match.logs.map((line) => `<div><span class="time">${fmtTime(line.t)}</span>${line.text}</div>`).join("");
}

function resizeCanvas() {
  if (window.ArenaView) ArenaView.resize();
}

function showResult() {
  const rows = match.units.map((u) => `<tr><td>${u.name}</td><td>${CLASSES[u.classId].name}</td><td>${Math.round(u.stats.damage)}</td><td>${Math.round(u.stats.healing)}</td><td>${u.hp > 0 ? "Up" : "Dead"}</td></tr>`).join("");
  $("result").innerHTML = `
    <div class="result-card">
      <h2>${match.win ? "Victory" : "Defeat"}</h2>
      <p>${match.win ? "Your team is still standing." : "Your team is down."} ${fmtTime(fightSeconds())} · dampening ${Math.round(currentDamp() * 100)}%.</p>
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
    };
  }
  ArenaNet.send({
    kind: "input",
    wishX: wish.wishX,
    wishY: wish.wishY,
    moving: wish.moving,
    facing: wish.facing,
    targetId: match.player.targetId,
    jumpSeq: netCmds.jump,
    cancelSeq: netCmds.cancel,
    cast: netCmds.castMsg,
  });
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
    if (ctl.cast.aimX != null && ctl.cast.aimY != null) unit.aimPoint = { x: ctl.cast.aimX, y: ctl.cast.aimY };
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
    winSide: match.winSide || null,
    logs: match.logs.map((line) => ({ t: line.t, text: line.text })),
    traps: match.traps.map((t) => ({ ownerId: t.ownerId, team: t.team, x: t.x, y: t.y, life: t.life, arm: t.arm, radius: t.radius })),
    lanterns: (match.lanterns || []).map((l) => ({ ownerId: l.ownerId, team: l.team, x: l.x, y: l.y, life: l.life, radius: l.radius, tick: l.tick, beacon: l.beacon })),
    fx: (match.fx || []).map((effect) => ({
      kind: effect.kind, color: effect.color, x: effect.x, y: effect.y, h: effect.h,
      x2: effect.x2, y2: effect.y2, h2: effect.h2, life: effect.life, size: effect.size, round: !!effect.round,
    })),
    floaters: match.floaters.map((f) => ({ x: f.x, y: f.y, h: f.h, text: f.text, color: f.color, life: f.life })),
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
      dead: unit.hp <= 0,
      dash: dashKind(unit),
      cast: unit.cast ? { id: unit.cast.ability.id, time: unit.cast.time, total: unit.cast.total } : null,
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
    unit.targetId = snap.targetId;
    unit.cd = snap.cd || {};
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
  }
  if (ended) showResult();
}

function returnToLobby() {
  match = null;
  $("match").classList.add("hidden");
  $("lobby").classList.remove("hidden");
  $("result").classList.add("hidden");
  renderLobby();
}

function requestRematch() {
  if (!match) return;
  if (match.netRole === "client") {
    if (window.ArenaNet) ArenaNet.send({ kind: "rematch" });
    return;
  }
  if (match.netRole === "host") {
    if (window.ArenaNet) ArenaNet.send({ kind: "start", roster: match.setup.roster });
    createMatch(match.setup);
    return;
  }
  createMatch(match.setup);
}

function requestBack() {
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

function claimSlot(index, peerId, name, classId) {
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
  if (msg.t === "error") {
    netStatus = msg.text || "Could not join.";
    renderLobby();
    return;
  }
  if (msg.t === "closed") {
    room = null;
    netStatus = msg.reason || "Disconnected.";
    if (match && match.netRole !== "local") returnToLobby();
    else renderLobby();
    return;
  }
  if (msg.t === "created") {
    fitTeams();
    room = { code: msg.code, slots: makeSlots(setup.size) };
    claimSlot(0, ArenaNet.id, playerName, setup.player);
    netStatus = "Room open. Share the code.";
    broadcastLobby();
    renderLobby();
    return;
  }
  if (msg.t === "joined") {
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
    claimSlot(data.slot, msg.from, data.name, data.classId);
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
    const seated = data.roster.some((r) => r.peerId && window.ArenaNet && r.peerId === ArenaNet.id);
    if (!seated && !iAmHost()) {
      netStatus = "That match started without you. Claim a slot for the next one.";
      renderLobby();
      return;
    }
    createMatch({ roster: data.roster, netRole: iAmHost() ? "host" : "client" });
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

async function hostRoom() {
  readIdentity();
  fitTeams();
  netStatus = "Connecting...";
  renderLobby();
  try {
    await ArenaNet.connect(defaultServer());
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
  netStatus = "Connecting...";
  renderLobby();
  try {
    await ArenaNet.connect(defaultServer());
    ArenaNet.join(code, playerName);
  } catch (err) {
    netStatus = "Could not reach the room server. Run node server.js, then open this page from that address.";
    renderLobby();
  }
}

function leaveNetRoom() {
  if (window.ArenaNet) ArenaNet.close();
  room = null;
  netStatus = "";
  renderLobby();
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
  }));
  ArenaNet.send({ kind: "start", roster });
  createMatch({ roster, netRole: "host" });
}

function renderLobby() {
  const root = $("lobby");
  const card = (id, selected) => {
    const cls = CLASSES[id];
    const spells = cls.abilities.map((a) => `<li>${esc(a.name)}<span>${a.key.toUpperCase()}</span></li>`).join("");
    return `<button type="button" class="class-card ${selected ? "selected" : ""}" data-class="${id}" style="--accent:${cls.color}">
      <header><h2>${esc(cls.name)}</h2><span class="role">${esc(cls.role)} · ${esc(cls.resource.name)}</span></header>
      <ul>${spells}</ul>
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
    teams = `${partners}${foes}
      <div class="lobby-actions">
        <button class="start-btn" id="start" type="button">Enter arena</button>
        <button class="text-btn" id="random" type="button">Random teams</button>
      </div>`;
  } else if (!room) {
    teams = `
      <div class="lobby-field">
        <input id="player-name" maxlength="16" value="${esc(playerName)}" placeholder="Your name" />
        <input id="server-url" value="${esc(defaultServer())}" placeholder="ws://127.0.0.1:8780" />
      </div>
      <div class="lobby-field">
        <button class="start-btn" id="host-room" type="button">Host room</button>
        <input id="room-code-input" maxlength="5" placeholder="Code" />
        <button class="text-btn" id="join-room" type="button">Join</button>
      </div>
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
    <div class="hero">
      <h1>Arena</h1>
      <p>A 3D arena for 1v1, 2v2, and 3v3. Play locally against AI, or host a room and fight other people. The pillar blocks line of sight and movement. Right-drag orbits the camera. Space jumps. Spells are 1–4, E, Q, and R. Channelers also have Inferno on C. Hexers stack curses. Grovekeepers keep heals over time rolling. Shades open from the veil. Wardens heal from a lantern. Binders yank with a chain. Vows share healing. Duelists fight one marked target. Ground spells are aimed with a circle. Healing falls off as dampening rises.</p>
    </div>
    <div class="section-label">Match</div>
    <div class="choice-row">
      <button type="button" class="text-btn ${playMode === "local" ? "selected" : ""}" data-mode="local">Local</button>
      <button type="button" class="text-btn ${playMode === "online" ? "selected" : ""}" data-mode="online">Online</button>
      ${room ? "" : `${sizeBtn(1, "1v1")}${sizeBtn(2, "2v2")}${sizeBtn(3, "3v3")}`}
    </div>
    <div class="section-label">Your class</div>
    <div class="class-grid" id="pick-player">
      ${Object.keys(CLASSES).map((id) => card(id, setup.player === id)).join("")}
    </div>
    ${teams}
    <div class="dossier" id="dossier"></div>`;

  renderDossier();
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
  root.querySelectorAll("#pick-player .class-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      setup.player = btn.dataset.class;
      if (room && window.ArenaNet) {
        const mine = room.slots.findIndex((slot) => slot.peerId === ArenaNet.id);
        if (mine >= 0) {
          if (iAmHost()) {
            room.slots[mine].classId = setup.player;
            broadcastLobby();
          } else {
            ArenaNet.send({ kind: "claim", slot: mine, classId: setup.player, name: playerName });
          }
        }
      }
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
  if ($("host-room")) $("host-room").addEventListener("click", hostRoom);
  if ($("join-room")) $("join-room").addEventListener("click", joinRoom);
  if ($("leave-room")) $("leave-room").addEventListener("click", leaveNetRoom);
  if ($("start-online")) $("start-online").addEventListener("click", startOnline);
  root.querySelectorAll("[data-claim]").forEach((btn) => {
    btn.addEventListener("click", () => {
      readIdentity();
      const index = Number(btn.dataset.claim);
      if (iAmHost()) {
        claimSlot(index, ArenaNet.id, playerName, setup.player);
        broadcastLobby();
        renderLobby();
      } else if (window.ArenaNet) {
        ArenaNet.send({ kind: "claim", slot: index, classId: setup.player, name: playerName });
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

function renderDossier() {
  const cls = CLASSES[setup.player];
  const dossier = $("dossier");
  if (!cls || !dossier) return;
  dossier.innerHTML = `<h3>${esc(cls.name)} kit</h3>` + cls.abilities.map((a) => {
    const bits = [a.channel ? `${a.castTime}s channel` : a.castTime ? `${a.castTime}s cast` : "Instant"];
    if (a.cost) bits.push(`${a.cost} ${cls.resource.name.toLowerCase()}`);
    if (a.cd) bits.push(`${a.cd}s cd`);
    return `<article><strong>${a.key.toUpperCase()} · ${esc(a.name)}</strong><p>${esc(bits.join(" · "))}. ${esc(a.blurb)}</p></article>`;
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

function onKeyDown(e) {
  if (e.repeat) return;
  keysDown.add(e.code);
  if (!$("match") || $("match").classList.contains("hidden") || !match) return;
  const player = match.player;
  if (["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if (e.code === "Tab") {
    cycleTarget(e.shiftKey ? -1 : 1);
    return;
  }
  if (e.code === "F1") {
    e.preventDefault();
    if (player.hp > 0) player.targetId = player.id;
    if (match.netRole === "client") sendInput();
    return;
  }
  if (e.code === "F2") {
    e.preventDefault();
    cycleFriend();
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
  const keyMap = {
    Digit1: "1", Digit2: "2", Digit3: "3", Digit4: "4",
    Numpad1: "1", Numpad2: "2", Numpad3: "3", Numpad4: "4",
    KeyE: "e", KeyQ: "q", KeyR: "r", KeyC: "c", KeyT: "t", KeyF: "f",
  };
  const key = keyMap[e.code];
  if (!key || player.hp <= 0) return;
  const ability = player.abilities.find((a) => a.key === key);
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
    if (point) match.groundAim.cursor = projectAim(match.player, point.x, point.z, match.groundAim.range, match.groundAim.minRange, match.groundAim.los);
    confirmGroundAim();
    return;
  }
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
window.addEventListener("pointermove", (e) => {
  lastPointer = { x: e.clientX, y: e.clientY };
});
window.addEventListener("resize", resizeCanvas);
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

window.Arena = {
  TUNE,
  CLASSES,
  PILLAR,
  get match() { return match; },
  getHover() { return hoverAbility; },
  spellLook(id) { return SPELL_LOOK[id] || null; },
  createMatch,
  tryCast,
  step: update,
};
