#!/usr/bin/env node
/* ==========================================================================
   GRIMHOLLOW — test.js
   Headless smoke test. Stubs enough of the DOM/Canvas to actually EXECUTE the
   game: every level is loaded, simulated for thousands of frames with random
   and scripted input, and every draw path is exercised. Syntax checks can't
   catch a typo'd method name; this can.
   Run:  node test.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

let FAIL = 0, PASS = 0;
const notes = [];
function ok(name)        { PASS++; console.log('  ✓ ' + name); }
function bad(name, err)  { FAIL++; console.log('  ✗ ' + name + (err ? '\n      ' + String(err).split('\n').slice(0, 6).join('\n      ') : '')); }
function note(s)         { notes.push(s); }
function check(name, fn) { try { const r = fn(); if (r === false) bad(name, 'returned false'); else ok(name); } catch (e) { bad(name, e && e.stack || e); } }

/* ======================================================= canvas/DOM stub == */
function makeGradient() {
  return { addColorStop() {} };
}
function makeCtx(canvas) {
  const c = {
    canvas,
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    lineCap: 'butt', lineJoin: 'miter', miterLimit: 10,
    font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic',
    shadowBlur: 0, shadowColor: 'transparent', shadowOffsetX: 0, shadowOffsetY: 0,
    imageSmoothingEnabled: true, filter: 'none', lineDashOffset: 0,
    save() {}, restore() {},
    translate() {}, scale() {}, rotate() {}, transform() {}, setTransform() {}, resetTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, arcTo() {}, arc() {}, ellipse() {},
    rect() {}, roundRect() {},
    fill() {}, stroke() {}, clip() {},
    fillRect() {}, strokeRect() {}, clearRect() {},
    fillText() {}, strokeText() {},
    measureText(s) { return { width: (s || '').length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }; },
    createLinearGradient: makeGradient, createRadialGradient: makeGradient,
    createConicGradient: makeGradient,
    createPattern() { return { setTransform() {} }; },
    drawImage() {}, setLineDash() {}, getLineDash() { return []; },
    getImageData(x, y, w, h) { return { width: w | 0 || 1, height: h | 0 || 1, data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)) }; },
    putImageData() {}, createImageData(w, h) { return this.getImageData(0, 0, w, h); },
    isPointInPath() { return false; }
  };
  return c;
}
let canvasesMade = 0;
function makeCanvas(w, h) {
  const cv = { width: w || 300, height: h || 150, style: {} };
  let ctx = null;
  cv.getContext = () => (ctx || (ctx = makeCtx(cv)));
  cv.addEventListener = () => {};
  cv.removeEventListener = () => {};
  cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: cv.width, height: cv.height, right: cv.width, bottom: cv.height });
  cv.toDataURL = () => 'data:,';
  canvasesMade++;
  return cv;
}

const listeners = {};
const gameCanvas = makeCanvas(1200, 675);

const store = {};
const localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
  clear: () => { for (const k in store) delete store[k]; }
};

const documentStub = {
  readyState: 'complete',
  hidden: false,
  createElement: tag => (tag === 'canvas' ? makeCanvas() : { style: {}, appendChild() {}, addEventListener() {} }),
  getElementById: id => (id === 'game' ? gameCanvas : (id === 'boot' || id === 'err' ? { style: {}, textContent: '' } : null)),
  addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
  removeEventListener: () => {},
  body: { appendChild() {}, style: {} },
  documentElement: { style: {} }
};

let rafQueue = [];
const windowStub = {
  innerWidth: 1200, innerHeight: 675, devicePixelRatio: 1,
  localStorage,
  addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
  removeEventListener: () => {},
  requestAnimationFrame: fn => { rafQueue.push(fn); return rafQueue.length; },
  cancelAnimationFrame: () => {},
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: id => clearTimeout(id),
  AudioContext: undefined,          // force the silent-audio fallback path
  webkitAudioContext: undefined,
  navigator: { getGamepads: () => [], maxTouchPoints: 0, userAgent: 'node' },
  performance: { now: () => Date.now() },
  location: { protocol: 'file:', href: 'file:///x/index.html' },
  document: documentStub,
  matchMedia: () => ({ matches: false, addEventListener() {} })
};
windowStub.window = windowStub;

/* Publish stubs as globals the bundle will close over. Node 22 defines some of
   these (navigator, performance) as getter-only, so force them. */
function setGlobal(name, value) {
  try { global[name] = value; }
  catch (e) { Object.defineProperty(global, name, { value, writable: true, configurable: true }); }
}
setGlobal('window', windowStub);
setGlobal('document', documentStub);
setGlobal('navigator', windowStub.navigator);
setGlobal('localStorage', localStorage);
setGlobal('performance', windowStub.performance);
setGlobal('requestAnimationFrame', windowStub.requestAnimationFrame);
setGlobal('cancelAnimationFrame', windowStub.cancelAnimationFrame);
setGlobal('Image', function () { this.width = this.height = 1; });
setGlobal('OffscreenCanvas', function (w, h) { return makeCanvas(w, h); });

/* ============================================================ load source = */
console.log('\nGRIMHOLLOW — headless verification\n');
console.log('[1] loading modules');

const SRC = path.join(__dirname, 'src');
const files = fs.readdirSync(SRC).filter(f => /^\d\d_.*\.js$/.test(f)).sort();

// Concatenate exactly like build.js, but keep boot from auto-firing so we
// control the loop manually.
let code = '';
for (const f of files) {
  code += '\n' + fs.readFileSync(path.join(SRC, f), 'utf8').replace(/^\s*'use strict';\s*$/m, '') + '\n';
}
// Neutralise the auto-boot tail: we call G.boot() ourselves.
code = code.replace(
  /if \(typeof window !== 'undefined'\) \{\s*if \(document\.readyState === 'loading'\)[\s\S]*?else G\.boot\(\);\s*\}/,
  '/* auto-boot disabled for tests */'
);

let G;
try {
  const fn = new Function('window', 'document', 'navigator', 'localStorage', 'performance',
    'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout',
    `'use strict'; var G = {}; window.G = G;\n${code}\nreturn G;`);
  G = fn(windowStub, documentStub, windowStub.navigator, localStorage, windowStub.performance,
    windowStub.requestAnimationFrame, windowStub.cancelAnimationFrame, setTimeout, clearTimeout);
  ok(`bundle evaluated (${files.length} modules, ${(code.length / 1024).toFixed(0)} KB)`);
} catch (e) {
  bad('bundle evaluation', e && e.stack || e);
  console.log('\nFATAL — cannot continue.\n');
  process.exit(1);
}

/* ============================================================ [2] exports = */
console.log('\n[2] module exports');
const required = ['M', 'K', 'T', 'RNG', 'Input', 'Audio', 'Save', 'World', 'Body',
  'Particles', 'Camera', 'FloatText', 'Slashes', 'Ghosts', 'Hitstop', 'Flash',
  'Art', 'Player', 'Enemy', 'Projectile', 'Boss', 'Wave', 'Biomes', 'Terrain',
  'Parallax', 'LightPass', 'Draw', 'Post', 'LEVELS', 'Levels', 'UI', 'Game', 'boot'];
for (const k of required) check('G.' + k, () => G[k] != null);

/* ==================================================== [3] colour hygiene = */
console.log('\n[3] palette integrity');
check('all biome hex colours are valid', () => {
  const bad = [];
  const hexRe = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  for (const bk in G.Biomes) {
    const b = G.Biomes[bk];
    for (const key in b.rock) {
      const v = b.rock[key];
      if (typeof v === 'string' && v[0] === '#' && !hexRe.test(v)) bad.push(`${bk}.rock.${key}=${v}`);
    }
    if (!Array.isArray(b.ambient) || b.ambient.length !== 3) bad.push(`${bk}.ambient malformed`);
  }
  if (bad.length) throw new Error(bad.join(', '));
  return true;
});
check('no stray non-ASCII in code (hex literals, identifiers)', () => {
  // Only code positions matter: em-dashes in comments and glyphs like ◀ ‖ ▲
  // inside display strings are intentional. Strip comments and string
  // literals, then anything non-ASCII left over is a real typo.
  const offenders = [];
  for (const f of files) {
    const t = fs.readFileSync(path.join(SRC, f), 'utf8');
    const stripped = t
      .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))   // block comments
      .replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length))              // line comments
      .replace(/'(?:[^'\\\n]|\\.)*'/g, m => ' '.repeat(m.length))     // '...'
      .replace(/"(?:[^"\\\n]|\\.)*"/g, m => ' '.repeat(m.length));    // "..."
    const lines = stripped.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/[^\x00-\x7F]/.test(lines[i])) {
        offenders.push(`${f}:${i + 1}  ${t.split('\n')[i].trim().slice(0, 60)}`);
      }
    }
  }
  if (offenders.length) throw new Error('non-ASCII in code:\n      ' + offenders.slice(0, 8).join('\n      '));
  return true;
});

/* ======================================================= [4] level design = */
console.log('\n[4] level geometry (' + G.LEVELS.length + ' levels)');
check('exactly 10 levels', () => G.LEVELS.length === 10);
check('G.Levels.validate() reports no problems', () => {
  const probs = G.Levels.validate();
  if (probs && probs.length) throw new Error('\n      ' + probs.join('\n      '));
  return true;
});
check('every level has a unique id and name', () => {
  const ids = new Set(), names = new Set();
  for (const L of G.LEVELS) {
    if (ids.has(L.id)) throw new Error('duplicate id ' + L.id);
    if (names.has(L.name)) throw new Error('duplicate name ' + L.name);
    ids.add(L.id); names.add(L.name);
  }
  return true;
});
check('3 bosses across the campaign, last level is the finale', () => {
  const bosses = G.LEVELS.filter(L => L.boss);
  if (bosses.length !== 3) throw new Error('found ' + bosses.length + ' boss levels');
  if (!G.LEVELS[G.LEVELS.length - 1].boss) throw new Error('final level has no boss');
  return true;
});
check('3 ability relics are obtainable', () => {
  const relics = G.LEVELS.filter(L => L.relic).map(L => L.relic.id);
  for (const need of ['airControl', 'dashAttack', 'plunge']) {
    if (relics.indexOf(need) < 0) throw new Error('no level grants ' + need);
  }
  return true;
});
check('every level is reachable by sequential unlock', () => {
  // unlockedLevel advances by 1 per completion, so all we need is that each
  // level can be finished without an ability granted only by a LATER level.
  const have = {};
  for (let i = 0; i < G.LEVELS.length; i++) {
    const L = G.LEVELS[i];
    if (L.requires) for (const r of L.requires) if (!have[r]) throw new Error(`${L.name} requires ${r} not yet granted`);
    if (L.relic) have[L.relic.id] = true;
  }
  return true;
});

/* ===================================================== [5] world & bodies = */
console.log('\n[5] world simulation');
check('all 10 worlds compile', () => {
  for (let i = 0; i < G.LEVELS.length; i++) {
    const w = G.Levels.world(i);
    if (!w.grid || w.grid.length !== w.w * w.h) throw new Error('level ' + i + ' grid malformed');
  }
  return true;
});
check('worlds contain solid ground and no all-empty grid', () => {
  for (let i = 0; i < G.LEVELS.length; i++) {
    const w = G.Levels.world(i);
    let solid = 0;
    for (let k = 0; k < w.grid.length; k++) if (w.grid[k] === G.T.SOLID) solid++;
    if (solid < 200) throw new Error(G.LEVELS[i].name + ' has only ' + solid + ' solid tiles');
  }
  return true;
});
check('body sweeps resolve against terrain without tunnelling', () => {
  const w = G.Levels.world(0);
  const b = new G.Body(200, 100, 22, 42);
  for (let i = 0; i < 600; i++) {
    b.vx = (Math.random() - 0.5) * 1800;
    b.vy = (Math.random() - 0.5) * 2400;
    b.move(w, 1 / 120);
    const tx = Math.floor(b.cx() / G.K.TILE), ty = Math.floor(b.cy() / G.K.TILE);
    if (w.inBounds(tx, ty) && w.at(tx, ty) === G.T.SOLID) {
      throw new Error(`body centre inside solid tile at ${tx},${ty} after ${i} steps`);
    }
  }
  return true;
});

/* ======================================================= [6] full gameplay = */
console.log('\n[6] gameplay simulation — every level, every draw path');

let game;
check('G.boot() constructs a Game', () => {
  game = G.boot();
  if (!game) throw new Error('boot returned nothing');
  if (!game.player) { /* player is made on level start */ }
  return true;
});

/* A deterministic pseudo-player: presses plausible combinations so we walk
   every state machine branch (attack chains, dash, parry, block, potion). */
function simulate(g, frames, seed, opts) {
  opts = opts || {};
  const rng = G.RNG(seed);
  const acts = ['left', 'right', 'up', 'down', 'jump', 'attack', 'dash', 'block', 'potion'];
  const held = {};
  for (let f = 0; f < frames; f++) {
    // change intent every ~12 frames
    if (f % 12 === 0) {
      for (const a of acts) {
        if (held[a]) { G.Input.setTouch(a, false); held[a] = false; }
      }
      const n = rng.int(0, 3);
      for (let i = 0; i <= n; i++) {
        const a = rng.pick(acts);
        G.Input.setTouch(a, true); held[a] = true;
      }
    }
    g.update(1 / 120);
    G.Input.endFrame();
    if (opts.draw && f % 7 === 0) g.draw();
    if (opts.godmode && g.player) { g.player.hp = g.player.maxHp; g.player.dead = false; g.player.deadT = 0; }
  }
  for (const a of acts) if (held[a]) G.Input.setTouch(a, false);
}

for (let i = 0; i < G.LEVELS.length; i++) {
  const L = G.LEVELS[i];
  check(`L${i + 1} ${L.name}`, () => {
    game.save.unlockedLevel = i;
    game.save.abilities = { doubleJump: true, dashAttack: true, plunge: true };
    game.save.level = 12;
    game.startLevel(i, false);
    if (game.state !== G.Game.STATE.PLAY) throw new Error('did not enter PLAY, got ' + game.state);
    if (!game.player) throw new Error('no player');
    game.draw();                       // exercise the whole render stack once
    simulate(game, 900, 1000 + i, { draw: true, godmode: true });
    return true;
  });
}

check('boss fights run to completion', () => {
  const bossLevels = [];
  for (let i = 0; i < G.LEVELS.length; i++) if (G.LEVELS[i].boss) bossLevels.push(i);
  for (const i of bossLevels) {
    const L = G.LEVELS[i];
    game.save.abilities = { doubleJump: true, dashAttack: true, plunge: true };
    game.startLevel(i, false);
    // teleport into the arena so the trigger fires
    const b = game.player.body;
    b.x = (L.arena.trigger + 1) * G.K.TILE;
    b.y = (L.gy - 3) * G.K.TILE;
    simulate(game, 240, 7000 + i, { godmode: true });
    if (!game.boss) throw new Error(L.name + ': boss never spawned (trigger ' + L.arena.trigger + ')');
    if (!game.boss.def) throw new Error(L.name + ': boss has no def');
    // run every one of its actions
    const boss = game.boss;
    const actions = (boss.def && boss.def.actions) || {};
    const names = Object.keys(actions);
    if (names.length === 0) throw new Error(L.name + ': boss has no actions');
    for (const n of names) {
      boss.startAction(n);
      for (let f = 0; f < 200; f++) {
        game.update(1 / 120);
        game.player.hp = game.player.maxHp;
        game.player.dead = false;
      }
      game.draw();
    }
    // force through every phase
    for (let ph = 2; ph <= boss.maxPhase; ph++) {
      boss.hp = boss.maxHp * (boss.def.phaseAt[ph - 1] - 0.01);
      boss.takeDamage(1, 1, {});
      simulate(game, 200, 8000 + ph, { godmode: true });
      game.draw();
    }
    // kill it
    boss.hp = 1;
    boss.takeDamage(9999, 1, {});
    simulate(game, 300, 9000 + i, { godmode: true });
    if (!boss.dead) throw new Error(L.name + ': boss survived 9999 damage');
    note(`${L.name}: boss "${boss.def.name || L.boss.kind}" ran ${names.length} actions across ${boss.maxPhase} phases`);
  }
  return true;
});

check('every enemy archetype spawns, fights and dies', () => {
  game.startLevel(0, false);
  const types = Object.keys(G.Enemy.TYPES);
  if (types.length < 6) throw new Error('only ' + types.length + ' enemy types');
  for (const t of types) {
    const e = game.spawnEnemy(t, game.player.body.cx() + 70, (G.LEVELS[0].gy) * G.K.TILE, { tier: 3, elite: true, spawn: true });
    for (let f = 0; f < 400; f++) {
      game.update(1 / 120);
      game.player.hp = game.player.maxHp;
      game.player.dead = false;
    }
    game.draw();
    e.takeDamage(99999, 1, {});
    for (let f = 0; f < 120; f++) game.update(1 / 120);
    if (!e.dead) throw new Error(t + ' survived 99999 damage');
  }
  note(`enemy archetypes exercised: ${types.join(', ')}`);
  return true;
});

check('player death and checkpoint respawn', () => {
  game.startLevel(0, false);
  game.player.hp = 1;
  game.player.takeDamage(999, 1, { unblockable: true });
  if (!game.player.dead) throw new Error('player survived a 999 unblockable hit at 1 hp');
  for (let f = 0; f < 400; f++) game.update(1 / 120);
  game.toDeath();
  if (game.state !== G.Game.STATE.DEAD) throw new Error('did not reach DEAD state');
  game.draw();
  game.respawnAtCheckpoint();
  if (game.state !== G.Game.STATE.PLAY) throw new Error('respawn did not return to PLAY');
  if (game.player.dead) throw new Error('player still dead after respawn');
  if (game.player.hp <= 0) throw new Error('respawned with ' + game.player.hp + ' hp');
  return true;
});

check('falling out of the world kills rather than hangs', () => {
  game.startLevel(0, false);
  game.player.body.y = game.world.pixelH() + 500;
  game.update(1 / 120);
  if (!game.player.dead) throw new Error('void fall did not kill');
  return true;
});

check('baseline touch double-jump is usable in every level', () => {
  game.save.abilities = { doubleJump: true, airControl: false, dashAttack: false, plunge: false };
  game.startLevel(1, false);
  const p = game.player;
  for (let f = 0; f < 10; f++) game.update(1 / 120);
  if (p.maxJumps() !== 2) throw new Error('Level 2 does not retain the baseline double-jump');

  // Two separate taps on the on-screen JUMP control must produce a ground
  // jump followed by an airborne jump.
  G.Input.setTouch('jump', true);
  game.update(1 / 120);
  G.Input.setTouch('jump', false);
  G.Input.endFrame();
  for (let f = 0; f < 8; f++) game.update(1 / 120);
  G.Input.setTouch('jump', true);
  game.update(1 / 120);
  G.Input.setTouch('jump', false);
  G.Input.endFrame();
  if (p.body.vy > G.K.DOUBLE_JUMP_VEL + 20 || p.jumpsLeft !== 0) {
    throw new Error('second touch jump did not trigger an airborne double-jump');
  }

  for (let i = 0; i < G.LEVELS.length; i++) {
    game.startLevel(i, false);
    if (game.player.maxJumps() !== 2) throw new Error(`Level ${i + 1} lost the permanent double-jump`);
  }

  const levelOne = G.Levels.world(0);
  for (const [x, y] of [[40, 25], [42, 23], [76, 25], [79, 23], [118, 25], [120, 23]]) {
    if (levelOne.at(x, y) !== G.T.PLAT) throw new Error(`missing Level 1 recovery ledge at ${x},${y}`);
  }
  return true;
});

check('every deep campaign drop has a permanent climb-out route', () => {
  const routes = [
    [0, [[56, 20], [56, 17], [56, 14], [72, 15], [72, 18], [128, 18], [130, 15], [140, 16], [140, 19]]],
    [1, [[31, 24], [31, 21], [31, 18], [31, 15], [31, 12], [31, 9], [39, 19], [39, 12], [41, 9], [113, 22], [113, 17], [113, 12]]],
    [2, [[72, 34], [76, 31], [80, 28]]],
    [5, [[116, 34], [119, 31], [122, 28]]]
  ];
  for (const [levelIndex, bars] of routes) {
    const world = G.Levels.world(levelIndex);
    for (const [x, y] of bars) {
      if (world.at(x, y) !== G.T.PLAT) throw new Error(`L${levelIndex + 1} is missing climb bar at ${x},${y}`);
    }
  }
  return true;
});

/* ========================================================== [7] progress = */
console.log('\n[7] progression, economy, persistence');

check('xp curve is monotonic and sane', () => {
  let prev = 0;
  for (let lv = 1; lv <= 40; lv++) {
    const need = game.xpForLevel(lv);
    if (need <= prev) throw new Error('level ' + lv + ' needs ' + need + ' <= previous ' + prev);
    prev = need;
  }
  if (game.xpForLevel(1) !== 100) throw new Error('level 1 should need 100, got ' + game.xpForLevel(1));
  return true;
});

check('grantXp levels the player up without infinite loop', () => {
  game.save.level = 1; game.save.xp = 0;
  game.grantXp(1000000, 100, 100);
  if (game.save.level <= 1) throw new Error('no level gained from 1,000,000 xp');
  if (game.save.level > 60) throw new Error('runaway levelling to ' + game.save.level);
  note(`1,000,000 xp -> level ${game.save.level}`);
  return true;
});

check('stat points: earn, spend, respec', () => {
  game.save.level = 10;
  for (const k in game.save.stats) game.save.stats[k] = 0;
  const avail = game.availablePoints();
  if (avail !== 9) throw new Error('level 10 should give 9 points, got ' + avail);
  if (!game.spendPoint('vitality')) throw new Error('could not spend a point');
  if (game.availablePoints() !== 8) throw new Error('point not deducted');
  const hpBefore = game.player.maxHp;
  game.spendPoint('vitality'); game.spendPoint('vitality');
  game.player.applyStats(game.save);
  if (game.player.maxHp <= hpBefore) throw new Error('vitality did not raise maxHp');
  game.save.gold = 99999;
  if (!game.respec()) throw new Error('respec failed with 99999 gold');
  if (game.spentPoints() !== 0) throw new Error('respec left ' + game.spentPoints() + ' points spent');
  return true;
});

check('overspending is refused', () => {
  game.save.level = 1;
  for (const k in game.save.stats) game.save.stats[k] = 0;
  if (game.availablePoints() !== 0) throw new Error('level 1 should have 0 points');
  if (game.spendPoint('power') !== false) throw new Error('spent a point we did not have');
  return true;
});

check('damage scales with power and never goes negative', () => {
  game.save.stats.power = 0; game.player.applyStats(game.save);
  const base = game.player.powerMul;
  game.save.stats.power = 10; game.player.applyStats(game.save);
  const high = game.player.powerMul;
  if (!(high > base)) throw new Error('power did not raise damage multiplier');
  // a huge hit must not wrap the player's hp negative-then-positive
  game.startLevel(0, false);
  game.player.takeDamage(1e9, 1, { unblockable: true });
  if (game.player.hp > 0) throw new Error('hp survived 1e9 damage: ' + game.player.hp);
  if (!isFinite(game.player.hp)) throw new Error('hp became ' + game.player.hp);
  note(`power 0 -> x${base.toFixed(2)} dmg, power 10 -> x${high.toFixed(2)}`);
  return true;
});

check('save round-trips through storage', () => {
  const s = G.Save.load();
  s.unlockedLevel = 7; s.level = 23; s.gold = 4242;
  s.stats.power = 5; s.abilities.plunge = true;
  s.secrets = ['3:0', '5:1'];
  G.Save.save(s);
  const r = G.Save.load();
  if (r.unlockedLevel !== 7) throw new Error('unlockedLevel lost: ' + r.unlockedLevel);
  if (r.level !== 23) throw new Error('level lost: ' + r.level);
  if (r.gold !== 4242) throw new Error('gold lost: ' + r.gold);
  if (r.stats.power !== 5) throw new Error('stats lost');
  if (!r.abilities.plunge) throw new Error('abilities lost');
  if (r.secrets.length !== 2) throw new Error('secrets lost');
  return true;
});

check('wipe returns a fresh blank save', () => {
  const w = G.Save.wipe();
  if (!w) throw new Error('wipe() returned ' + w + ' — callers assign this');
  if (w.level !== 1 || w.unlockedLevel !== 0) throw new Error('wipe did not reset progression');
  if (w.gold !== 0) throw new Error('wipe left gold');
  return true;
});

check('corrupt save data does not crash the loader', () => {
  localStorage.setItem('grimhollow.save.v1', '{not json at all');
  const r1 = G.Save.load();
  if (!r1 || typeof r1.level !== 'number') throw new Error('garbage JSON broke load()');
  localStorage.setItem('grimhollow.save.v1', '{"level":"banana","stats":null,"completed":"nope"}');
  const r2 = G.Save.load();
  if (!r2 || !r2.stats || typeof r2.stats.power !== 'number') throw new Error('malformed shape broke load()');
  localStorage.clear();
  return true;
});

check('older saves migrate to permanent double-jump', () => {
  const migrated = G.Save.coerce({ abilities: { doubleJump: false, dashAttack: false, plunge: false } });
  if (!migrated.abilities.doubleJump) throw new Error('legacy save left double-jump locked');
  return true;
});

check('level completion unlocks the next level', () => {
  const s = G.Save.load();
  s.unlockedLevel = 0; s.completed = [];
  G.Save.save(s);
  game.save = G.Save.load();
  game.startLevel(0, false);
  game.completeLevel();
  if (!game.save.completed[0]) throw new Error('level 0 not marked complete');
  if (game.save.unlockedLevel !== 1) throw new Error('next level not unlocked, got ' + game.save.unlockedLevel);
  if (game.state !== G.Game.STATE.CLEAR) throw new Error('did not reach CLEAR, got ' + game.state);
  game.draw();
  return true;
});

check('finishing the last level reaches VICTORY', () => {
  game.save.unlockedLevel = 9;
  game.startLevel(9, false);
  game.completeLevel();
  if (game.state !== G.Game.STATE.VICTORY) throw new Error('got ' + game.state + ' instead of victory');
  game.draw();
  return true;
});

/* ============================================================ [8] menus = */
console.log('\n[8] menus & every screen renders');

check('all screens draw without throwing', () => {
  const screens = ['title', 'levelSelect', 'upgrades', 'pause', 'death', 'levelClear', 'victory', 'relicPopup'];
  game.startLevel(0, false);
  game.relicPopup = { name: 'Test Relic', desc: 'Does a thing.', t: 0.5, max: 4 };
  const ctx = gameCanvas.getContext('2d');
  for (const s of screens) {
    if (typeof G.UI[s] !== 'function') throw new Error('G.UI.' + s + ' missing');
    G.UI[s](ctx, game);
  }
  G.UI.loading(ctx, 1200, 675, 'Testing', 0.5);
  G.UI.drawHUD(ctx, game);
  G.UI.drawTouch(ctx, game);
  return true;
});

check('menu navigation wraps and never lands on a disabled item via confirm', () => {
  game.toTitle();
  for (let i = 0; i < 40; i++) game.menu.move(1);
  if (game.menu.index < 0 || game.menu.index >= game.menu.items.length) throw new Error('index escaped: ' + game.menu.index);
  game.toSelect();
  // only level 0..unlockedLevel should be selectable
  game.save.unlockedLevel = 2;
  game.toSelect();
  let enabled = 0;
  for (const it of game.menu.items) if (!it.disabled) enabled++;
  if (enabled !== 3) throw new Error('expected 3 unlocked levels selectable, got ' + enabled);
  return true;
});

check('pause round-trip preserves the level', () => {
  game.startLevel(3, false);
  const nm = game.level.name;
  game.togglePause();
  if (game.state !== G.Game.STATE.PAUSE) throw new Error('did not pause');
  game.draw();
  game.togglePause();
  if (game.state !== G.Game.STATE.PLAY) throw new Error('did not resume');
  if (game.level.name !== nm) throw new Error('level changed across pause');
  return true;
});

check('every menu action is handled (no silent no-ops)', () => {
  const acts = new Set();
  const screens = [() => game.toTitle(), () => game.toSelect(), () => game.toUpgrade(),
                   () => game.toSettings(), () => game.toLayout(), () => { game.startLevel(0, false); game.togglePause(); }, () => game.toDeath()];
  for (const mk of screens) { mk(); for (const it of game.menu.items) acts.add(it.act); }
  const handled = new Set(['continue', 'select', 'title', 'upgrade', 'sound', 'quality', 'wipe',
                           'level', 'stat', 'resume', 'restart', 'respawn', 'quit', 'next',
                           'settings', 'layout', 'settingsBack', 'resetLayout', 'viewZoom']);
  const unknown = [...acts].filter(a => !handled.has(a));
  if (unknown.length) throw new Error('unhandled menu actions: ' + unknown.join(', '));
  note(`menu actions in use: ${[...acts].sort().join(', ')}`);
  return true;
});

check('quality settings all resize cleanly', () => {
  for (const q of ['low', 'med', 'high']) {
    game.save.settings.quality = q;
    game.resize();
    game.startLevel(0, false);
    game.draw();
    if (!(game.vw > 0 && game.vh > 0)) throw new Error(q + ' produced viewport ' + game.vw + 'x' + game.vh);
  }
  game.save.settings.quality = 'med'; game.resize();
  return true;
});

check('touch controls map to real input actions', () => {
  const layout = G.UI.touchLayout(900, 500);
  const buttons = Object.keys(layout).filter(k => layout[k] && typeof layout[k] === 'object' && layout[k].act);
  if (!buttons.length) throw new Error('no touch buttons');
  const valid = ['left', 'right', 'jump', 'attack', 'dash', 'block', 'potion', 'pause'];
  for (const k of buttons) {
    const b = layout[k];
    if (valid.indexOf(b.act) < 0) throw new Error('touch button "' + b.act + '" is not a known action');
    const hit = G.UI.touchHit(900, 500, b.x + b.w / 2, b.y + b.h / 2);
    if (hit !== b.act) throw new Error('hit test for ' + b.act + ' returned ' + hit);
  }
  // every gameplay action must be reachable on a phone
  for (const a of valid) {
    if (!buttons.some(k => layout[k].act === a)) throw new Error('no touch button for "' + a + '"');
  }
  note(`${buttons.length} touch buttons, all hit-testable, all gameplay touch actions covered`);
  return true;
});

check('custom control/HUD layout persists and is editable', () => {
  game.save.settings.layout = G.UI.cloneLayout(null);
  const l = G.UI.getLayout(game);
  l.touch.left.x = 0.20; l.touch.left.y = 0.70; l.touch.left.w = 0.14; l.touch.left.h = 0.14;
  l.hud.health.x = 0.03; l.hud.health.w = 0.22;
  l.hud.boss.x = 0.28; l.hud.boss.y = 0.04; l.hud.boss.w = 0.44;
  G.UI.clampLayoutItem(l.touch.left); G.UI.clampLayoutItem(l.hud.health); G.UI.clampLayoutItem(l.hud.boss);
  game.saveLayout();
  const raw = G.Save.load();
  if (!raw.settings.layout || Math.abs(raw.settings.layout.touch.left.x - 0.20) > 0.001) throw new Error('layout did not persist');
  if (Object.keys(G.UI.touchLayout(900,500,raw.settings)).length !== 8) throw new Error('custom layout lost a touch control');
  return true;
});

/* ========================================================= [9] endurance = */
console.log('\n[9] endurance & leak check');

check('10,000 frames of chaos across levels leaves no unbounded growth', () => {
  game.save.abilities = { doubleJump: true, dashAttack: true, plunge: true };
  let maxParts = 0, maxEnts = 0, maxProj = 0, maxFt = 0;
  for (let i = 0; i < G.LEVELS.length; i++) {
    game.startLevel(i, false);
    simulate(game, 1000, 42 + i, { draw: true, godmode: true });
    maxParts = Math.max(maxParts, game.particles.count);
    maxEnts = Math.max(maxEnts, game.enemies.length);
    maxProj = Math.max(maxProj, game.projectiles.length);
    maxFt = Math.max(maxFt, game.floatText.items.length);
  }
  if (maxParts > 1400) throw new Error('particle pool overflowed: ' + maxParts);
  if (maxProj > 400) throw new Error('projectiles unbounded: ' + maxProj);
  if (maxFt > 60) throw new Error('float text unbounded: ' + maxFt);
  note(`peaks — particles ${maxParts}/1400, enemies ${maxEnts}, projectiles ${maxProj}, floatText ${maxFt}`);
  return true;
});

check('terrain chunk cache respects its LRU bound', () => {
  game.startLevel(7, false);   // the widest level
  const t = game.terrain;
  for (let x = 0; x < game.world.pixelW(); x += 256) {
    game.camera.x = x; game.camera.y = 0;
    t.draw(gameCanvas.getContext('2d'), game.camera);
  }
  const n = Object.keys(t.chunks || {}).length;
  if (n > 40) throw new Error('chunk cache grew to ' + n + ' (bound is 40)');
  note(`chunk cache held ${n} baked tiles after a full sweep of the widest level`);
  return true;
});

check('no NaN leaks into player or camera state', () => {
  game.startLevel(5, false);
  simulate(game, 1200, 777, { draw: true, godmode: true });
  const p = game.player, b = p.body, c = game.camera;
  const vals = { 'body.x': b.x, 'body.y': b.y, 'body.vx': b.vx, 'body.vy': b.vy,
                 hp: p.hp, stam: p.stam, 'cam.x': c.x, 'cam.y': c.y };
  for (const k in vals) {
    if (!isFinite(vals[k])) throw new Error(k + ' is ' + vals[k]);
  }
  return true;
});

check('hitstop always releases (never freezes the game)', () => {
  game.startLevel(0, false);
  game.hitstop.add(0.2, 0);
  let released = false;
  for (let f = 0; f < 200; f++) {
    game.hitstop.update(1 / 60);
    if (game.hitstop.factor() >= 1) { released = true; break; }
  }
  if (!released) throw new Error('hitstop never returned to factor 1');
  return true;
});

/* ============================================================== summary = */
console.log('\n' + '-'.repeat(66));
if (notes.length) {
  console.log('\nobservations');
  for (const n of notes) console.log('  . ' + n);
}
console.log(`\n${PASS} passed, ${FAIL} failed   (${canvasesMade} canvases allocated)\n`);
process.exit(FAIL ? 1 : 0);
