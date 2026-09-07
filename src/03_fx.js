/* ==========================================================================
   GRIMHOLLOW  —  03_fx.js
   Particles, camera (lookahead + shake), hitstop, floating combat text,
   dynamic light registry, slash arcs and afterimage trails.
   ========================================================================== */
'use strict';

var G = (typeof G !== 'undefined') ? G : {};

/* ----------------------------------------------------------- particles ---- */
/* Pooled, struct-of-arrays-ish. Capped so a heavy fight can't tank the frame. */
G.Particles = (function () {
  var MAX = 1400;

  function Particles() {
    this.pool = new Array(MAX);
    for (var i = 0; i < MAX; i++) {
      this.pool[i] = { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, drag: 0, grav: 0, col: '#fff', kind: 0, rot: 0, vr: 0, glow: 0, bounce: 0 };
    }
    this.cursor = 0;
    this.count = 0;
  }

  Particles.prototype.spawn = function (o) {
    // Round-robin over the pool; overwrite the oldest if saturated.
    var p = null, tries = 0;
    while (tries++ < MAX) {
      var c = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % MAX;
      if (!c.alive) { p = c; break; }
    }
    if (!p) { p = this.pool[this.cursor]; this.cursor = (this.cursor + 1) % MAX; }
    p.alive = true;
    p.x = o.x; p.y = o.y;
    p.vx = o.vx || 0; p.vy = o.vy || 0;
    p.max = p.life = o.life || 0.5;
    p.size = o.size || 2;
    p.drag = o.drag == null ? 1.5 : o.drag;
    p.grav = o.grav == null ? 0 : o.grav;
    p.col = o.col || '#ffd9a0';
    p.kind = o.kind || 0;      // 0 dot 1 spark-streak 2 smoke 3 shard 4 ring
    p.rot = o.rot || 0;
    p.vr = o.vr || 0;
    p.glow = o.glow || 0;
    p.bounce = o.bounce || 0;
    return p;
  };

  Particles.prototype.update = function (dt, world) {
    var n = 0;
    for (var i = 0; i < MAX; i++) {
      var p = this.pool[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      p.vy += p.grav * dt;
      var d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d;
      var nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      if (p.bounce && world) {
        if (world.isSolid(Math.floor(nx / G.K.TILE), Math.floor(p.y / G.K.TILE))) { p.vx *= -p.bounce; nx = p.x; }
        if (world.isSolid(Math.floor(p.x / G.K.TILE), Math.floor(ny / G.K.TILE))) { p.vy *= -p.bounce; ny = p.y; p.vx *= 0.7; }
      }
      p.x = nx; p.y = ny;
      p.rot += p.vr * dt;
      n++;
    }
    this.count = n;
  };

  Particles.prototype.clear = function () {
    for (var i = 0; i < MAX; i++) this.pool[i].alive = false;
    this.count = 0;
  };

  /* ---- authored bursts -------------------------------------------------- */

  Particles.prototype.hitSparks = function (x, y, dir, heavy) {
    var n = heavy ? 22 : 13;
    for (var i = 0; i < n; i++) {
      var a = (dir > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 2.3;
      var sp = 120 + Math.random() * (heavy ? 480 : 320);
      this.spawn({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: 0.16 + Math.random() * 0.3, size: 1 + Math.random() * 2.4,
        col: Math.random() < 0.55 ? '#fff3c4' : (Math.random() < 0.5 ? '#ffb347' : '#ff7a2f'),
        kind: 1, drag: 3.2, grav: 700, glow: 1
      });
    }
    this.spawn({ x: x, y: y, life: 0.16, size: heavy ? 34 : 22, col: '#fff6d0', kind: 4, drag: 0, glow: 1 });
  };

  Particles.prototype.blood = function (x, y, dir, amount) {
    var n = amount || 12;
    for (var i = 0; i < n; i++) {
      var a = (dir > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 2.0;
      var sp = 80 + Math.random() * 300;
      this.spawn({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 110,
        life: 0.4 + Math.random() * 0.6, size: 1.5 + Math.random() * 3,
        col: Math.random() < 0.6 ? '#8d1b2d' : '#5c0f1e',
        kind: 0, drag: 1.2, grav: 1100, bounce: 0.25
      });
    }
  };

  Particles.prototype.dust = function (x, y, n, spread, col) {
    for (var i = 0; i < (n || 8); i++) {
      this.spawn({
        x: x + (Math.random() - 0.5) * (spread || 18),
        y: y + (Math.random() - 0.5) * 5,
        vx: (Math.random() - 0.5) * 130, vy: -Math.random() * 70,
        life: 0.35 + Math.random() * 0.55, size: 3 + Math.random() * 7,
        col: col || 'rgba(190,175,150,0.5)', kind: 2, drag: 2.4, grav: -20
      });
    }
  };

  Particles.prototype.landPuff = function (x, y, hard) {
    var n = hard ? 18 : 8;
    for (var i = 0; i < n; i++) {
      var s = (Math.random() < 0.5 ? -1 : 1);
      this.spawn({
        x: x + (Math.random() - 0.5) * 20, y: y,
        vx: s * (60 + Math.random() * (hard ? 320 : 150)), vy: -Math.random() * 60,
        life: 0.3 + Math.random() * 0.5, size: 4 + Math.random() * (hard ? 10 : 6),
        col: 'rgba(200,188,166,0.45)', kind: 2, drag: 3.0, grav: -30
      });
    }
  };

  Particles.prototype.dashTrail = function (x, y, dir) {
    for (var i = 0; i < 5; i++) {
      this.spawn({
        x: x - dir * i * 5, y: y + (Math.random() - 0.5) * 22,
        vx: -dir * (100 + Math.random() * 160), vy: (Math.random() - 0.5) * 60,
        life: 0.16 + Math.random() * 0.2, size: 3 + Math.random() * 6,
        col: 'rgba(150,205,255,0.35)', kind: 2, drag: 3.6
      });
    }
  };

  Particles.prototype.parryBurst = function (x, y) {
    for (var i = 0; i < 30; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 180 + Math.random() * 420;
      this.spawn({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.2 + Math.random() * 0.35, size: 1.5 + Math.random() * 2.5,
        col: Math.random() < 0.5 ? '#ffffff' : '#bfe8ff', kind: 1, drag: 4.5, glow: 1
      });
    }
    this.spawn({ x: x, y: y, life: 0.3, size: 60, col: '#dff2ff', kind: 4, drag: 0, glow: 1 });
  };

  Particles.prototype.death = function (x, y, col) {
    for (var i = 0; i < 34; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 60 + Math.random() * 320;
      this.spawn({
        x: x + (Math.random() - 0.5) * 14, y: y + (Math.random() - 0.5) * 24,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120,
        life: 0.4 + Math.random() * 0.8, size: 2 + Math.random() * 5,
        col: col || '#2b2a3a', kind: 3, drag: 1.6, grav: 900,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 14, bounce: 0.3
      });
    }
    for (var j = 0; j < 14; j++) {
      this.spawn({
        x: x, y: y, vx: (Math.random() - 0.5) * 90, vy: -40 - Math.random() * 120,
        life: 0.6 + Math.random() * 0.7, size: 8 + Math.random() * 16,
        col: 'rgba(40,36,54,0.4)', kind: 2, drag: 1.5, grav: -40
      });
    }
    this.spawn({ x: x, y: y, life: 0.35, size: 70, col: '#ffb26b', kind: 4, drag: 0, glow: 1 });
  };

  Particles.prototype.ember = function (x, y) {
    this.spawn({
      x: x + (Math.random() - 0.5) * 10, y: y,
      vx: (Math.random() - 0.5) * 26, vy: -18 - Math.random() * 34,
      life: 1.0 + Math.random() * 1.6, size: 1 + Math.random() * 2,
      col: Math.random() < 0.5 ? '#ffb347' : '#ff6a2a', kind: 0, drag: 0.5, grav: -12, glow: 1
    });
  };

  Particles.prototype.heal = function (x, y) {
    for (var i = 0; i < 24; i++) {
      var a = Math.random() * Math.PI * 2, r = Math.random() * 20;
      this.spawn({
        x: x + Math.cos(a) * r, y: y + Math.sin(a) * r + 14,
        vx: Math.cos(a) * 20, vy: -70 - Math.random() * 90,
        life: 0.5 + Math.random() * 0.6, size: 1.5 + Math.random() * 3,
        col: Math.random() < 0.5 ? '#7dffb2' : '#d9fff0', kind: 0, drag: 1.0, glow: 1
      });
    }
  };

  Particles.prototype.shockwave = function (x, y, size, col) {
    this.spawn({ x: x, y: y, life: 0.42, size: size || 120, col: col || '#ffd9a0', kind: 4, drag: 0, glow: 1 });
  };

  Particles.prototype.rubble = function (x, y, n) {
    for (var i = 0; i < (n || 10); i++) {
      this.spawn({
        x: x + (Math.random() - 0.5) * 24, y: y,
        vx: (Math.random() - 0.5) * 260, vy: -100 - Math.random() * 260,
        life: 0.6 + Math.random() * 0.7, size: 2 + Math.random() * 4,
        col: Math.random() < 0.5 ? '#5b5347' : '#3b352d', kind: 3, drag: 0.9, grav: 1200,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 16, bounce: 0.35
      });
    }
  };

  return Particles;
})();

/* -------------------------------------------------------------- camera ---- */
G.Camera = (function () {
  function Camera(vw, vh) {
    this.x = 0; this.y = 0;             // top-left in world px
    this.vw = vw; this.vh = vh;
    this.targetX = 0; this.targetY = 0;
    this.shake = 0; this.shakeDecay = 5.5;
    this.shakeX = 0; this.shakeY = 0;
    this.zoom = 1; this.zoomTarget = 1;
    this.lookahead = 0;
    this.freeze = 0;
    this.bounds = null;
  }

  Camera.prototype.setViewport = function (vw, vh) { this.vw = vw; this.vh = vh; };

  Camera.prototype.addShake = function (amount) {
    this.shake = Math.min(this.shake + amount, 34);
  };

  Camera.prototype.snapTo = function (cx, cy) {
    this.x = cx - this.vw / (2 * this.zoom);
    this.y = cy - this.vh / (2 * this.zoom);
    this.clamp();
  };

  Camera.prototype.follow = function (target, dt, world, opts) {
    opts = opts || {};
    // Lead the camera in the direction of travel so the player can see ahead.
    var desiredLook = G.M.clamp(target.body.vx * 0.30, -170, 170);
    this.lookahead = G.M.damp(this.lookahead, desiredLook, 3.0, dt);
    var lookDown = target.body.vy > 380 ? G.M.clamp((target.body.vy - 380) * 0.14, 0, 90) : 0;

    var cx = target.body.cx() + this.lookahead + (opts.offsetX || 0);
    var cy = target.body.cy() - 18 + lookDown + (opts.offsetY || 0);

    this.zoom = G.M.damp(this.zoom, this.zoomTarget, 4.0, dt);

    var tx = cx - this.vw / (2 * this.zoom);
    var ty = cy - this.vh / (2 * this.zoom);

    // Vertical is stiffer when grounded to avoid seasick bobbing on jumps.
    var lx = opts.lambdaX || 6.5;
    var ly = target.body.onGround ? 7.5 : 3.6;
    this.x = G.M.damp(this.x, tx, lx, dt);
    this.y = G.M.damp(this.y, ty, ly, dt);

    this.world = world;
    this.clamp();

    if (this.shake > 0.01) {
      this.shake = Math.max(0, this.shake - this.shakeDecay * this.shake * dt - 6 * dt);
      var mag = this.shake;
      this.shakeX = (Math.random() * 2 - 1) * mag;
      this.shakeY = (Math.random() * 2 - 1) * mag;
    } else { this.shake = 0; this.shakeX = 0; this.shakeY = 0; }
  };

  Camera.prototype.clamp = function () {
    var w = this.world;
    if (!w) return;
    var pw = w.pixelW(), ph = w.pixelH();
    var vwz = this.vw / this.zoom, vhz = this.vh / this.zoom;
    if (pw <= vwz) this.x = (pw - vwz) * 0.5;
    else this.x = G.M.clamp(this.x, 0, pw - vwz);
    if (ph <= vhz) this.y = (ph - vhz) * 0.5;
    else this.y = G.M.clamp(this.y, 0, ph - vhz);
  };

  Camera.prototype.ox = function () { return this.x - this.shakeX; };
  Camera.prototype.oy = function () { return this.y - this.shakeY; };

  Camera.prototype.visible = function (x, y, w, h, pad) {
    pad = pad || 64;
    var vwz = this.vw / this.zoom, vhz = this.vh / this.zoom;
    return x + w > this.x - pad && x < this.x + vwz + pad &&
           y + h > this.y - pad && y < this.y + vhz + pad;
  };

  return Camera;
})();

/* -------------------------------------------------- floating text / fx ---- */
G.FloatText = (function () {
  function FloatText() { this.items = []; }
  FloatText.prototype.add = function (x, y, text, col, size, vy) {
    this.items.push({
      x: x, y: y, text: '' + text, col: col || '#fff',
      size: size || 13, life: 0.85, max: 0.85,
      vy: vy == null ? -58 : vy, vx: (Math.random() - 0.5) * 26
    });
    if (this.items.length > 60) this.items.shift();
  };
  FloatText.prototype.update = function (dt) {
    for (var i = this.items.length - 1; i >= 0; i--) {
      var it = this.items[i];
      it.life -= dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.vy += 90 * dt;
      it.vx *= 0.94;
      if (it.life <= 0) this.items.splice(i, 1);
    }
  };
  FloatText.prototype.clear = function () { this.items.length = 0; };
  return FloatText;
})();

/* Slash arcs — short-lived swept crescents drawn over the world. */
G.Slashes = (function () {
  function Slashes() { this.items = []; }
  Slashes.prototype.add = function (o) {
    this.items.push({
      x: o.x, y: o.y, r: o.r || 42, a0: o.a0, a1: o.a1,
      life: o.life || 0.15, max: o.life || 0.15,
      width: o.width || 13, col: o.col || 'rgba(255,255,255,0.9)',
      follow: o.follow || null, dx: o.dx || 0, dy: o.dy || 0
    });
    if (this.items.length > 24) this.items.shift();
  };
  Slashes.prototype.update = function (dt) {
    for (var i = this.items.length - 1; i >= 0; i--) {
      var s = this.items[i];
      s.life -= dt;
      if (s.follow && s.follow.body) { s.x = s.follow.body.cx() + s.dx * (s.follow.facing || 1); s.y = s.follow.body.cy() + s.dy; }
      if (s.life <= 0) this.items.splice(i, 1);
    }
  };
  Slashes.prototype.clear = function () { this.items.length = 0; };
  return Slashes;
})();

/* Afterimages — ghost silhouettes trailing a dashing or fast-moving actor. */
G.Ghosts = (function () {
  function Ghosts() { this.items = []; }
  Ghosts.prototype.add = function (actor, col, life) {
    this.items.push({
      x: actor.body.x, y: actor.body.y, w: actor.body.w, h: actor.body.h,
      facing: actor.facing, pose: actor.snapshotPose ? actor.snapshotPose() : null,
      col: col || 'rgba(120,190,255,0.30)', life: life || 0.24, max: life || 0.24,
      draw: actor.drawGhost ? actor.drawGhost.bind(actor) : null
    });
    if (this.items.length > 40) this.items.shift();
  };
  Ghosts.prototype.update = function (dt) {
    for (var i = this.items.length - 1; i >= 0; i--) {
      this.items[i].life -= dt;
      if (this.items[i].life <= 0) this.items.splice(i, 1);
    }
  };
  Ghosts.prototype.clear = function () { this.items.length = 0; };
  return Ghosts;
})();

/* ------------------------------------------------------------- hitstop ---- */
/* Freezing the world for ~4 frames on impact is most of what makes a hit
   feel like it connected. Everything scales dt by 0 while active. */
G.Hitstop = (function () {
  function Hitstop() { this.t = 0; this.scale = 0; }
  Hitstop.prototype.add = function (dur, scale) {
    this.t = Math.max(this.t, dur);
    this.scale = scale == null ? 0.04 : scale;
  };
  Hitstop.prototype.update = function (realDt) {
    if (this.t > 0) { this.t -= realDt; return true; }
    return false;
  };
  Hitstop.prototype.factor = function () { return this.t > 0 ? this.scale : 1; };
  Hitstop.prototype.clear = function () { this.t = 0; };
  return Hitstop;
})();

/* --------------------------------------------------- screen-space flash ---- */
G.Flash = (function () {
  function Flash() { this.a = 0; this.col = '#fff'; this.vignette = 0; this.hurtPulse = 0; }
  Flash.prototype.pop = function (a, col) {
    if (a > this.a) { this.a = a; this.col = col || '#fff'; }
  };
  Flash.prototype.hurt = function () { this.hurtPulse = 1; };
  Flash.prototype.update = function (dt) {
    this.a = Math.max(0, this.a - dt * 4.2);
    this.hurtPulse = Math.max(0, this.hurtPulse - dt * 1.9);
  };
  return Flash;
})();
