/* ==========================================================================
   GRIMHOLLOW  —  01_core.js
   Math, RNG, input (keyboard/gamepad/touch), audio, persistence, tunables.
   ========================================================================== */
'use strict';

var G = (typeof G !== 'undefined') ? G : {};

/* ---------------------------------------------------------------- math ---- */
G.M = {
  clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
  lerp: function (a, b, t) { return a + (b - a) * t; },
  // frame-rate independent exponential smoothing
  damp: function (a, b, lambda, dt) { return G.M.lerp(a, b, 1 - Math.exp(-lambda * dt)); },
  approach: function (v, target, step) {
    if (v < target) return Math.min(v + step, target);
    if (v > target) return Math.max(v - step, target);
    return target;
  },
  sign: function (v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); },
  len: function (x, y) { return Math.sqrt(x * x + y * y); },
  dist: function (ax, ay, bx, by) { return G.M.len(bx - ax, by - ay); },
  smoothstep: function (t) { t = G.M.clamp(t, 0, 1); return t * t * (3 - 2 * t); },
  easeOutCubic: function (t) { t = G.M.clamp(t, 0, 1); var u = 1 - t; return 1 - u * u * u; },
  easeInQuad: function (t) { t = G.M.clamp(t, 0, 1); return t * t; },
  easeOutBack: function (t) {
    t = G.M.clamp(t, 0, 1); var c = 1.70158, u = t - 1;
    return 1 + (c + 1) * u * u * u + c * u * u;
  },
  wrapAngle: function (a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  },
  lerpAngle: function (a, b, t) { return a + G.M.wrapAngle(b - a) * t; },
  aabb: function (ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  },
  // 0..1 pseudo-noise, deterministic on integer lattice
  hash2: function (x, y) {
    var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  },
  noise2: function (x, y) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var u = G.M.smoothstep(xf), v = G.M.smoothstep(yf);
    var a = G.M.hash2(xi, yi), b = G.M.hash2(xi + 1, yi);
    var c = G.M.hash2(xi, yi + 1), d = G.M.hash2(xi + 1, yi + 1);
    return G.M.lerp(G.M.lerp(a, b, u), G.M.lerp(c, d, u), v);
  },
  fbm: function (x, y, oct) {
    var s = 0, amp = 0.5, f = 1;
    for (var i = 0; i < (oct || 4); i++) { s += G.M.noise2(x * f, y * f) * amp; amp *= 0.5; f *= 2; }
    return s;
  }
};

/* mulberry32 — small deterministic PRNG so level decoration is stable */
G.RNG = function (seed) {
  var s = (seed | 0) || 1;
  var self = {
    next: function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range: function (a, b) { return a + self.next() * (b - a); },
    int: function (a, b) { return Math.floor(self.range(a, b + 1)); },
    pick: function (arr) { return arr[Math.floor(self.next() * arr.length)]; },
    chance: function (p) { return self.next() < p; },
    sign: function () { return self.next() < 0.5 ? -1 : 1; }
  };
  return self;
};

/* ------------------------------------------------------------ tunables ---- */
G.K = {
  TILE: 24,
  // Movement — tuned for Grimvalor-ish weight: fast run, snappy but heavy fall.
  RUN_SPEED: 250,
  RUN_ACCEL: 2400,
  RUN_FRICTION: 2000,
  AIR_ACCEL: 1500,
  AIR_DRAG: 380,
  GRAVITY: 1750,
  GRAVITY_APEX: 1250,        // softened gravity near jump apex = floatier control
  MAX_FALL: 1000,
  JUMP_VEL: -560,
  JUMP_CUT: 0.42,            // velocity multiplier when jump released early
  COYOTE: 0.10,              // grace period after leaving ledge
  JUMP_BUFFER: 0.12,         // pre-press buffer before landing
  DOUBLE_JUMP_VEL: -500,
  WALL_SLIDE_SPEED: 170,
  WALL_JUMP_X: 300,
  WALL_JUMP_Y: -520,
  WALL_STICK: 0.14,          // time input is ignored after wall jump
  DASH_SPEED: 700,
  DASH_TIME: 0.16,
  DASH_COOLDOWN: 0.34,
  DASH_IFRAME: 0.14,
  // Combat
  COMBO_WINDOW: 0.42,        // time after a swing to chain the next
  PARRY_WINDOW: 0.16,        // perfect-parry window at start of block
  PARRY_STUN: 0.85,          // enemy stagger duration on parry
  HITSTOP: 0.075,            // freeze frames on landing a hit
  HITSTOP_HEAVY: 0.13,
  INVULN_ON_HIT: 0.75,
  // Resources
  BASE_HP: 100,
  BASE_STAMINA: 100,
  STAM_REGEN: 34,
  STAM_REGEN_DELAY: 0.5,
  STAM_DASH: 18,
  STAM_BLOCK: 12,
  POTION_HEAL: 45
};

/* -------------------------------------------------------------- input ---- */
G.Input = (function () {
  var down = {}, pressed = {}, released = {}, anyKey = false;
  var MAP = {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    up: ['ArrowUp', 'KeyW'],
    down: ['ArrowDown', 'KeyS'],
    jump: ['Space', 'KeyZ', 'KeyK'],
    attack: ['KeyJ', 'KeyX', 'Enter'],
    dash: ['ShiftLeft', 'ShiftRight', 'KeyL', 'KeyC'],
    block: ['KeyO', 'KeyV', 'ControlLeft'],
    potion: ['KeyQ', 'KeyF'],
    pause: ['Escape', 'KeyP'],
    map: ['Tab'],
    respec: ['KeyR'],
    debug: ['F3', 'Backquote']
  };
  var touch = {};        // virtual button state set by on-screen controls
  var pad = null, padPrev = {};
  var hasTouch = false;

  function codeToActions(code) {
    var out = [];
    for (var a in MAP) if (MAP[a].indexOf(code) >= 0) out.push(a);
    return out;
  }

  function keydown(e) {
    // Let browser keep F-keys / devtools, swallow the rest we use
    var acts = codeToActions(e.code);
    if (acts.length) e.preventDefault();
    if (e.repeat) return;
    anyKey = true;
    for (var i = 0; i < acts.length; i++) {
      if (!down[acts[i]]) pressed[acts[i]] = true;
      down[acts[i]] = true;
    }
  }
  function keyup(e) {
    var acts = codeToActions(e.code);
    if (acts.length) e.preventDefault();
    for (var i = 0; i < acts.length; i++) { down[acts[i]] = false; released[acts[i]] = true; }
  }

  function pollPad() {
    if (!navigator.getGamepads) return;
    var pads = navigator.getGamepads();
    pad = null;
    for (var i = 0; i < pads.length; i++) if (pads[i]) { pad = pads[i]; break; }
    if (!pad) return;
    var b = pad.buttons, ax = pad.axes;
    var st = {
      left: (ax[0] < -0.35) || (b[14] && b[14].pressed),
      right: (ax[0] > 0.35) || (b[15] && b[15].pressed),
      up: (ax[1] < -0.5) || (b[12] && b[12].pressed),
      down: (ax[1] > 0.5) || (b[13] && b[13].pressed),
      jump: b[0] && b[0].pressed,
      attack: b[2] && b[2].pressed,
      dash: (b[5] && b[5].pressed) || (b[7] && b[7].value > 0.4),
      block: (b[4] && b[4].pressed) || (b[6] && b[6].value > 0.4),
      potion: b[3] && b[3].pressed,
      pause: b[9] && b[9].pressed
    };
    for (var k in st) {
      if (st[k] && !padPrev[k]) pressed[k] = true;
      if (!st[k] && padPrev[k]) released[k] = true;
      if (st[k]) down[k] = true;
      padPrev[k] = st[k];
    }
  }

  return {
    init: function () {
      window.addEventListener('keydown', keydown, { passive: false });
      window.addEventListener('keyup', keyup, { passive: false });
      window.addEventListener('blur', function () { down = {}; touch = {}; padPrev = {}; });
      hasTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    },
    hasTouch: function () { return hasTouch; },
    // called by the touch overlay
    setTouch: function (action, isDown) {
      if (isDown && !touch[action] && !down[action]) pressed[action] = true;
      if (!isDown && touch[action]) released[action] = true;
      touch[action] = isDown;
      hasTouch = true;
    },
    poll: function () { pollPad(); },
    down: function (a) { return !!(down[a] || touch[a]); },
    pressed: function (a) { return !!pressed[a]; },
    released: function (a) { return !!released[a]; },
    consume: function (a) { var v = !!pressed[a]; pressed[a] = false; return v; },
    axis: function () { return (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0); },
    axisY: function () { return (this.down('down') ? 1 : 0) - (this.down('up') ? 1 : 0); },
    anyKeyPressed: function () {
      for (var k in pressed) if (pressed[k]) return true;
      return false;
    },
    endFrame: function () { pressed = {}; released = {}; }
  };
})();

/* -------------------------------------------------------------- audio ---- */
/* All SFX are synthesised at runtime — the game ships with zero audio files. */
G.Audio = (function () {
  var ctx = null, master = null, musicGain = null, sfxGain = null;
  var ready = false, noiseBuf = null;
  var muted = false;
  var musicTimer = 0, musicStep = 0, musicOn = false, musicMood = 'calm';

  function ensure() {
    if (ctx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.85; master.connect(ctx.destination);
      sfxGain = ctx.createGain(); sfxGain.gain.value = 0.75; sfxGain.connect(master);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.30; musicGain.connect(master);
      // pre-render a second of white noise for percussive/impact sounds
      var n = ctx.sampleRate | 0;
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      ready = true;
      return true;
    } catch (e) { return false; }
  }

  function now() { return ctx.currentTime; }

  function tone(opt) {
    if (!ready || muted) return;
    var t0 = now() + (opt.delay || 0);
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = opt.type || 'sine';
    o.frequency.setValueAtTime(opt.f0, t0);
    if (opt.f1 && opt.f1 !== opt.f0) {
      if (opt.exp !== false) o.frequency.exponentialRampToValueAtTime(Math.max(1, opt.f1), t0 + opt.dur);
      else o.frequency.linearRampToValueAtTime(opt.f1, t0 + opt.dur);
    }
    var peak = (opt.vol == null ? 0.3 : opt.vol);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + (opt.atk || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opt.dur);
    var node = o;
    if (opt.filter) {
      var bf = ctx.createBiquadFilter();
      bf.type = opt.filter; bf.frequency.value = opt.fc || 900; bf.Q.value = opt.q || 1;
      node.connect(bf); node = bf;
    }
    node.connect(g); g.connect(opt.bus === 'music' ? musicGain : sfxGain);
    o.start(t0); o.stop(t0 + opt.dur + 0.02);
  }

  function noise(opt) {
    if (!ready || muted) return;
    var t0 = now() + (opt.delay || 0);
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    var bf = ctx.createBiquadFilter();
    bf.type = opt.filter || 'bandpass';
    bf.frequency.setValueAtTime(opt.fc || 1200, t0);
    if (opt.fc1) bf.frequency.exponentialRampToValueAtTime(Math.max(20, opt.fc1), t0 + opt.dur);
    bf.Q.value = opt.q == null ? 1.2 : opt.q;
    var g = ctx.createGain();
    var peak = (opt.vol == null ? 0.3 : opt.vol);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + (opt.atk || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opt.dur);
    s.connect(bf); bf.connect(g); g.connect(opt.bus === 'music' ? musicGain : sfxGain);
    s.start(t0); s.stop(t0 + opt.dur + 0.02);
  }

  // Named SFX. Each is a couple of layered primitives — cheap but characterful.
  var SFX = {
    swing: function (n) {
      var base = 620 + (n || 0) * 130;
      noise({ filter: 'bandpass', fc: base, fc1: base * 0.35, q: 1.1, dur: 0.16, vol: 0.20 });
      tone({ type: 'triangle', f0: base * 0.55, f1: base * 0.2, dur: 0.12, vol: 0.07 });
    },
    hit: function (heavy) {
      noise({ filter: 'lowpass', fc: heavy ? 1500 : 2600, fc1: 260, q: 0.7, dur: heavy ? 0.20 : 0.13, vol: heavy ? 0.42 : 0.30 });
      tone({ type: 'square', f0: heavy ? 150 : 240, f1: 55, dur: heavy ? 0.16 : 0.10, vol: 0.20 });
    },
    crit: function () {
      noise({ filter: 'highpass', fc: 3200, fc1: 900, dur: 0.16, vol: 0.30 });
      tone({ type: 'sawtooth', f0: 900, f1: 240, dur: 0.18, vol: 0.16 });
      tone({ type: 'sine', f0: 1500, f1: 700, dur: 0.12, vol: 0.10, delay: 0.02 });
    },
    parry: function () {
      tone({ type: 'sine', f0: 1750, f1: 2400, dur: 0.14, vol: 0.22 });
      tone({ type: 'sine', f0: 2600, f1: 3300, dur: 0.20, vol: 0.13, delay: 0.015 });
      noise({ filter: 'highpass', fc: 4200, dur: 0.10, vol: 0.18 });
    },
    block: function () {
      noise({ filter: 'bandpass', fc: 700, fc1: 300, q: 2.0, dur: 0.14, vol: 0.26 });
      tone({ type: 'triangle', f0: 190, f1: 110, dur: 0.12, vol: 0.14 });
    },
    dash: function () {
      noise({ filter: 'bandpass', fc: 380, fc1: 1500, q: 0.8, dur: 0.20, vol: 0.20 });
    },
    jump: function () {
      tone({ type: 'triangle', f0: 330, f1: 560, dur: 0.11, vol: 0.13 });
    },
    land: function (hard) {
      noise({ filter: 'lowpass', fc: 700, fc1: 150, dur: hard ? 0.16 : 0.09, vol: hard ? 0.26 : 0.13 });
    },
    hurt: function () {
      tone({ type: 'sawtooth', f0: 300, f1: 90, dur: 0.26, vol: 0.24 });
      noise({ filter: 'lowpass', fc: 1100, fc1: 200, dur: 0.20, vol: 0.20 });
    },
    die: function () {
      tone({ type: 'sawtooth', f0: 260, f1: 45, dur: 1.0, vol: 0.24 });
      noise({ filter: 'lowpass', fc: 900, fc1: 90, dur: 0.9, vol: 0.18 });
    },
    enemyDie: function () {
      noise({ filter: 'lowpass', fc: 1600, fc1: 180, dur: 0.34, vol: 0.26 });
      tone({ type: 'square', f0: 200, f1: 60, dur: 0.28, vol: 0.13 });
    },
    coin: function () {
      tone({ type: 'square', f0: 1250, f1: 1250, dur: 0.05, vol: 0.10 });
      tone({ type: 'square', f0: 1850, f1: 1850, dur: 0.09, vol: 0.09, delay: 0.045 });
    },
    xp: function () {
      tone({ type: 'sine', f0: 900, f1: 1500, dur: 0.12, vol: 0.09 });
    },
    heal: function () {
      tone({ type: 'sine', f0: 500, f1: 950, dur: 0.30, vol: 0.15 });
      tone({ type: 'sine', f0: 760, f1: 1420, dur: 0.34, vol: 0.10, delay: 0.05 });
    },
    levelup: function () {
      [0, 4, 7, 12].forEach(function (semi, i) {
        tone({ type: 'triangle', f0: 440 * Math.pow(2, semi / 12), f1: 440 * Math.pow(2, semi / 12), dur: 0.34, vol: 0.13, delay: i * 0.085 });
      });
    },
    ui: function () { tone({ type: 'square', f0: 700, f1: 700, dur: 0.035, vol: 0.07 }); },
    uiBig: function () { tone({ type: 'square', f0: 480, f1: 720, dur: 0.10, vol: 0.10 }); },
    door: function () {
      noise({ filter: 'lowpass', fc: 400, fc1: 120, dur: 0.7, vol: 0.22 });
      tone({ type: 'sine', f0: 90, f1: 55, dur: 0.8, vol: 0.14 });
    },
    bossRoar: function () {
      tone({ type: 'sawtooth', f0: 110, f1: 62, dur: 1.4, vol: 0.30, filter: 'lowpass', fc: 700 });
      noise({ filter: 'lowpass', fc: 500, fc1: 130, dur: 1.5, vol: 0.26 });
      tone({ type: 'square', f0: 74, f1: 44, dur: 1.5, vol: 0.16, delay: 0.06 });
    },
    charge: function () {
      tone({ type: 'sawtooth', f0: 120, f1: 620, dur: 0.55, vol: 0.14, filter: 'lowpass', fc: 1400 });
    },
    slam: function () {
      noise({ filter: 'lowpass', fc: 900, fc1: 70, dur: 0.5, vol: 0.44 });
      tone({ type: 'square', f0: 110, f1: 34, dur: 0.4, vol: 0.26 });
    },
    arrow: function () {
      noise({ filter: 'bandpass', fc: 2000, fc1: 800, q: 2, dur: 0.10, vol: 0.13 });
    },
    checkpoint: function () {
      [0, 7, 12].forEach(function (s, i) {
        tone({ type: 'sine', f0: 523 * Math.pow(2, s / 12), f1: 523 * Math.pow(2, s / 12), dur: 0.5, vol: 0.11, delay: i * 0.11 });
      });
    },
    victory: function () {
      [0, 4, 7, 12, 16, 19].forEach(function (s, i) {
        tone({ type: 'triangle', f0: 392 * Math.pow(2, s / 12), f1: 392 * Math.pow(2, s / 12), dur: 0.6, vol: 0.13, delay: i * 0.13 });
      });
    }
  };

  /* Minimal generative score: a slow minor arpeggio with a drone bed.
     Three moods change root, rate and voicing. */
  var SCALE = { calm: [0, 3, 7, 10, 12], tense: [0, 1, 5, 8, 12], boss: [0, 3, 6, 7, 10] };
  var ROOT = { calm: 110, tense: 98, boss: 87.3 };
  var RATE = { calm: 0.62, tense: 0.44, boss: 0.30 };

  function musicTick(dt) {
    if (!ready || muted || !musicOn) return;
    musicTimer -= dt;
    if (musicTimer > 0) return;
    var rate = RATE[musicMood] || 0.6;
    musicTimer = rate;
    var sc = SCALE[musicMood] || SCALE.calm;
    var root = ROOT[musicMood] || 110;
    musicStep++;
    var deg = sc[musicStep % sc.length];
    var oct = (musicStep % (sc.length * 2) < sc.length) ? 2 : 3;
    var f = root * Math.pow(2, deg / 12) * oct;
    tone({ type: 'triangle', f0: f, f1: f, dur: rate * 1.7, vol: 0.055, atk: 0.05, bus: 'music', filter: 'lowpass', fc: 2200 });
    // drone every 4 steps
    if (musicStep % 4 === 1) {
      tone({ type: 'sine', f0: root, f1: root, dur: rate * 4.2, vol: 0.075, atk: 0.35, bus: 'music' });
      tone({ type: 'sine', f0: root * 1.5, f1: root * 1.5, dur: rate * 4.0, vol: 0.035, atk: 0.4, bus: 'music' });
    }
    if (musicMood === 'boss' && musicStep % 2 === 0) {
      noise({ filter: 'lowpass', fc: 220, fc1: 90, dur: 0.22, vol: 0.16, bus: 'music' });
    }
  }

  return {
    unlock: function () {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
    },
    play: function (name, a) {
      if (!ensure() || muted) return;
      if (ctx.state === 'suspended') { ctx.resume(); }
      var f = SFX[name];
      if (f) { try { f(a); } catch (e) { /* audio must never break gameplay */ } }
    },
    music: function (on, mood) {
      musicOn = !!on;
      if (mood && mood !== musicMood) { musicMood = mood; musicStep = 0; musicTimer = 0; }
      if (ready) musicGain.gain.value = on ? 0.30 : 0.0;
    },
    tick: function (dt) { try { musicTick(dt); } catch (e) {} },
    setMuted: function (m) {
      muted = m;
      if (ready) master.gain.value = m ? 0 : 0.85;
    },
    isMuted: function () { return muted; },
    setVolume: function (v) { if (ready) master.gain.value = muted ? 0 : v; }
  };
})();

/* ---------------------------------------------------------------- save ---- */
/* localStorage, with an in-memory fallback so the game still runs when
   opened from file:// in a browser with storage disabled. */
G.Save = (function () {
  var KEY = 'grimhollow.save.v1';
  var mem = null, usable = true;
  try {
    var t = '__gh_probe__';
    window.localStorage.setItem(t, '1');
    window.localStorage.removeItem(t);
  } catch (e) { usable = false; }

  function blank() {
    return {
      unlockedLevel: 0,       // 0-based index of the furthest level you may enter
      completed: [],          // completed[levelIndex] = true
      xp: 0, level: 1, gold: 0,
      stats: { vitality: 0, power: 0, speed: 0, stamina: 0, fortune: 0, focus: 0 },
      // Double jump is baseline traversal, not a mid-campaign gate.  This
      // keeps every level recoverable on keyboard, gamepad, and touch.
      abilities: { doubleJump: true, airControl: false, dashAttack: false, plunge: false },
      potions: 3, maxPotions: 3,
      secrets: [],            // array of "levelId:index" strings
      totalDeaths: 0, totalTime: 0,
      settings: { muted: false, shake: 1, viewZoom: 1, showTouch: 'auto', layout: null }
    };
  }

  /* Coerce an arbitrary parsed blob onto the blank schema. A save that has
     been hand-edited, truncated, or written by an older build must never be
     able to crash the game — worst case we fall back to a fresh profile. */
  function coerce(d) {
    var b = blank();
    if (!d || typeof d !== 'object') return b;

    function num(v, def, lo, hi) {
      var n = typeof v === 'number' ? v : parseFloat(v);
      if (!isFinite(n)) return def;
      if (lo != null) n = Math.max(lo, n);
      if (hi != null) n = Math.min(hi, n);
      return n;
    }

    b.unlockedLevel = Math.floor(num(d.unlockedLevel, 0, 0, 999));
    b.xp            = Math.floor(num(d.xp, 0, 0));
    b.level         = Math.floor(num(d.level, 1, 1, 999));
    b.gold          = Math.floor(num(d.gold, 0, 0));
    b.potions       = Math.floor(num(d.potions, 3, 0, 99));
    b.maxPotions    = Math.floor(num(d.maxPotions, 3, 1, 99));
    b.totalDeaths   = Math.floor(num(d.totalDeaths, 0, 0));
    b.totalTime     = num(d.totalTime, 0, 0);

    // completed: accept an array or a legacy object keyed by index
    if (Array.isArray(d.completed)) {
      for (var i = 0; i < d.completed.length; i++) b.completed[i] = !!d.completed[i];
    } else if (d.completed && typeof d.completed === 'object') {
      for (var ck in d.completed) {
        var ci = parseInt(ck, 10);
        if (ci >= 0 && ci < 999) b.completed[ci] = !!d.completed[ck];
      }
    }

    // secrets: accept an array or a legacy object used as a set
    if (Array.isArray(d.secrets)) {
      for (var s = 0; s < d.secrets.length; s++) {
        var sv = '' + d.secrets[s];
        if (b.secrets.indexOf(sv) < 0) b.secrets.push(sv);
      }
    } else if (d.secrets && typeof d.secrets === 'object') {
      for (var sk in d.secrets) if (d.secrets[sk] && b.secrets.indexOf(sk) < 0) b.secrets.push(sk);
    }

    if (d.stats && typeof d.stats === 'object') {
      for (var st in b.stats) b.stats[st] = Math.floor(num(d.stats[st], 0, 0, 99));
    }
    if (d.abilities && typeof d.abilities === 'object') {
      for (var ab in b.abilities) b.abilities[ab] = !!d.abilities[ab];
      // a build before the rename stored the third relic as "parry"
      if (d.abilities.parry && !b.abilities.plunge) b.abilities.plunge = true;
    }
    // Migration for profiles created before double-jump became a permanent
    // movement ability.  Never lock an existing player out of a route.
    b.abilities.doubleJump = true;
    if (d.settings && typeof d.settings === 'object') {
      b.settings.muted = !!d.settings.muted;
      b.settings.shake = num(d.settings.shake, 1, 0, 2);
      var vz = num(d.settings.viewZoom, 1, 0.85, 1.15);
      b.settings.viewZoom = [0.85, 1, 1.15].indexOf(vz) >= 0 ? vz : 1;
      b.settings.showTouch = (['auto', 'on', 'off'].indexOf(d.settings.showTouch) >= 0)
        ? d.settings.showTouch : 'auto';
      if (d.settings.layout && typeof d.settings.layout === 'object') {
        b.settings.layout = d.settings.layout;
      }
    }

    // A save can't claim more spent stat points than its level has earned.
    var spent = 0;
    for (var k2 in b.stats) spent += b.stats[k2];
    if (spent > b.level - 1) { for (var k3 in b.stats) b.stats[k3] = 0; }

    return b;
  }

  return {
    blank: blank,
    coerce: coerce,
    load: function () {
      try {
        var raw = usable ? window.localStorage.getItem(KEY) : mem;
        if (!raw) return blank();
        return coerce(JSON.parse(raw));
      } catch (e) { return blank(); }
    },
    _legacyLoad: function () {
      try {
        var raw = usable ? window.localStorage.getItem(KEY) : mem;
        if (!raw) return blank();
        return coerce(JSON.parse(raw));
      } catch (e) { return blank(); }
    },
    save: function (data) {
      try {
        var raw = JSON.stringify(data);
        if (usable) window.localStorage.setItem(KEY, raw); else mem = raw;
        return true;
      } catch (e) { mem = null; return false; }
    },
    wipe: function () {
      try { if (usable) window.localStorage.removeItem(KEY); else mem = null; } catch (e) {}
      return this.blank();
    },
    persistent: function () { return usable; }
  };
})();
