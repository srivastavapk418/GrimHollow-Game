/* ==========================================================================
   GRIMHOLLOW  —  02_world.js
   Tile grid, level compilation from the authoring DSL, swept AABB collision,
   moving/crumbling platforms, doors and arena gates.
   ========================================================================== */
'use strict';

var G = (typeof G !== 'undefined') ? G : {};

G.T = { EMPTY: 0, SOLID: 1, PLAT: 2, SPIKE: 3, VOID: 4, CRUMBLE: 5 };

G.World = (function () {
  var T = G.T, K = G.K;

  function World(def) {
    this.def = def;
    this.name = def.name;
    this.biome = def.biome || 'ruins';
    this.w = def.w;
    this.h = def.h;
    this.seed = def.seed || 1337;
    this.grid = new Uint8Array(this.w * this.h);
    this.crumbleState = {};        // "tx,ty" -> {t, gone}
    this.movers = [];              // moving platforms (solid AABBs)
    this.hazards = [];             // non-tile hazards (saw blades, etc.)
    this.decals = [];              // baked decoration hints
    this.torches = [];             // static light sources
    this.gates = [];               // arena doors that close behind you
    this.compile();
  }

  World.prototype.idx = function (tx, ty) { return ty * this.w + tx; };

  World.prototype.inBounds = function (tx, ty) {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  };

  World.prototype.at = function (tx, ty) {
    if (tx < 0 || tx >= this.w) return T.SOLID;         // sealed side walls
    if (ty < 0) return T.EMPTY;                          // open sky
    if (ty >= this.h) return T.VOID;                     // bottomless pit
    return this.grid[ty * this.w + tx];
  };

  World.prototype.set = function (tx, ty, v) {
    if (!this.inBounds(tx, ty)) return;
    this.grid[ty * this.w + tx] = v;
  };

  /* ------------------------------------------------------ DSL compiler --- */
  World.prototype.compile = function () {
    var b = this.def.build || [], i, j, x, y;
    for (i = 0; i < b.length; i++) {
      var op = b[i], kind = op[0];
      switch (kind) {
        case 'rect':   // solid block: x, y, w, h
          for (y = op[2]; y < op[2] + op[4]; y++)
            for (x = op[1]; x < op[1] + op[3]; x++) this.set(x, y, T.SOLID);
          break;
        case 'clear':  // carve empty: x, y, w, h
          for (y = op[2]; y < op[2] + op[4]; y++)
            for (x = op[1]; x < op[1] + op[3]; x++) this.set(x, y, T.EMPTY);
          break;
        case 'plat':   // one-way platform: x, y, w
          for (x = op[1]; x < op[1] + op[3]; x++) this.set(x, op[2], T.PLAT);
          break;
        case 'spike':  // floor spikes: x, y, w
          for (x = op[1]; x < op[1] + op[3]; x++) this.set(x, op[2], T.SPIKE);
          break;
        case 'crumble':
          for (x = op[1]; x < op[1] + op[3]; x++) this.set(x, op[2], T.CRUMBLE);
          break;
        case 'stair': { // staircase: x, y, steps, dir(+1 right/up), stepW
          var sw = op[5] || 2;
          for (j = 0; j < op[3]; j++) {
            var sx = op[1] + j * sw * (op[4] >= 0 ? 1 : -1);
            var sy = op[2] - j;
            for (var k2 = 0; k2 < sw; k2++)
              for (y = sy; y < this.h && y < sy + 40; y++) this.set(sx + k2 * (op[4] >= 0 ? 1 : -1), y, T.SOLID);
          }
          break;
        }
        case 'pillar': // decorative-but-solid column: x, y, h, w
          for (y = op[2]; y < op[2] + op[3]; y++)
            for (x = op[1]; x < op[1] + (op[4] || 1); x++) this.set(x, y, T.SOLID);
          break;
        case 'mover': { // moving platform: x, y, w, dx, dy, period
          this.movers.push({
            x0: op[1] * K.TILE, y0: op[2] * K.TILE,
            x: op[1] * K.TILE, y: op[2] * K.TILE,
            px: op[1] * K.TILE, py: op[2] * K.TILE,
            w: op[3] * K.TILE, h: Math.max(8, K.TILE * 0.5),
            dx: (op[4] || 0) * K.TILE, dy: (op[5] || 0) * K.TILE,
            period: op[6] || 4, t: op[7] || 0, vx: 0, vy: 0
          });
          break;
        }
        case 'saw': { // sweeping blade hazard: x, y, dx, dy, period, r
          this.hazards.push({
            type: 'saw', x0: op[1] * K.TILE, y0: op[2] * K.TILE,
            x: op[1] * K.TILE, y: op[2] * K.TILE,
            dx: (op[3] || 0) * K.TILE, dy: (op[4] || 0) * K.TILE,
            period: op[5] || 3, t: 0, r: (op[6] || 0.9) * K.TILE, dmg: 24, spin: 0
          });
          break;
        }
        case 'torch':
          this.torches.push({ x: (op[1] + 0.5) * K.TILE, y: (op[2] + 0.5) * K.TILE, hue: op[3] || 28, flick: Math.random() * 6.28 });
          break;
        case 'gate': // arena gate: x, y, h  (closes when arena triggers)
          this.gates.push({ tx: op[1], ty: op[2], th: op[3], closed: false, anim: 0 });
          break;
      }
    }
    // Seal the bottom edge of the map unless the level wants a death pit
    if (this.def.floor !== false) {
      for (x = 0; x < this.w; x++) { this.set(x, this.h - 1, T.SOLID); }
    }
    this.buildDecals();
  };

  /* Decoration hints (cracks, moss, bricks) — deterministic from the seed so
     the baked terrain looks identical every run. */
  World.prototype.buildDecals = function () {
    var rng = G.RNG(this.seed);
    var n = Math.floor(this.w * this.h * 0.012);
    for (var i = 0; i < n; i++) {
      var tx = rng.int(0, this.w - 1), ty = rng.int(0, this.h - 1);
      if (this.at(tx, ty) !== T.SOLID) continue;
      if (this.at(tx, ty - 1) !== T.EMPTY) continue;   // only on exposed tops
      this.decals.push({ x: tx, y: ty, k: rng.int(0, 3), r: rng.next() });
    }
  };

  /* ------------------------------------------------------- tile queries --- */
  World.prototype.isSolid = function (tx, ty) {
    var v = this.at(tx, ty);
    return v === T.SOLID || (v === T.CRUMBLE && !this.crumbleGone(tx, ty));
  };
  World.prototype.isPlatform = function (tx, ty) { return this.at(tx, ty) === T.PLAT; };
  World.prototype.isHazardTile = function (tx, ty) {
    var v = this.at(tx, ty);
    return v === T.SPIKE || v === T.VOID;
  };
  World.prototype.crumbleGone = function (tx, ty) {
    var s = this.crumbleState[tx + ',' + ty];
    return !!(s && s.gone);
  };
  World.prototype.touchCrumble = function (tx, ty) {
    var key = tx + ',' + ty;
    if (!this.crumbleState[key]) this.crumbleState[key] = { t: 0.45, gone: false, respawn: 0 };
  };

  /* Does an AABB (world px) overlap any solid tile? */
  World.prototype.rectSolid = function (x, y, w, h) {
    var t = K.TILE;
    var x0 = Math.floor(x / t), x1 = Math.floor((x + w - 0.001) / t);
    var y0 = Math.floor(y / t), y1 = Math.floor((y + h - 0.001) / t);
    for (var ty = y0; ty <= y1; ty++)
      for (var tx = x0; tx <= x1; tx++)
        if (this.isSolid(tx, ty)) return true;
    return false;
  };

  /* Hazard overlap → returns damage amount or 0 */
  World.prototype.rectHazard = function (x, y, w, h) {
    var t = K.TILE, dmg = 0;
    var x0 = Math.floor(x / t), x1 = Math.floor((x + w - 0.001) / t);
    var y0 = Math.floor(y / t), y1 = Math.floor((y + h - 0.001) / t);
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        var v = this.at(tx, ty);
        if (v === T.SPIKE) dmg = Math.max(dmg, 22);
        else if (v === T.VOID) dmg = Math.max(dmg, 9999);
      }
    }
    for (var i = 0; i < this.hazards.length; i++) {
      var hz = this.hazards[i];
      if (G.M.aabb(x, y, w, h, hz.x - hz.r, hz.y - hz.r, hz.r * 2, hz.r * 2)) dmg = Math.max(dmg, hz.dmg);
    }
    return dmg;
  };

  /* Cheap line-of-sight for enemy AI: sample along the segment. */
  World.prototype.losClear = function (ax, ay, bx, by) {
    var d = G.M.dist(ax, ay, bx, by);
    var steps = Math.ceil(d / (K.TILE * 0.5));
    if (steps <= 0) return true;
    for (var i = 1; i < steps; i++) {
      var t = i / steps;
      var x = G.M.lerp(ax, bx, t), y = G.M.lerp(ay, by, t);
      if (this.isSolid(Math.floor(x / K.TILE), Math.floor(y / K.TILE))) return false;
    }
    return true;
  };

  /* ------------------------------------------------------------ update --- */
  World.prototype.update = function (dt) {
    var i, m, k;
    for (i = 0; i < this.movers.length; i++) {
      m = this.movers[i];
      m.px = m.x; m.py = m.y;
      m.t += dt;
      var ph = Math.sin((m.t / m.period) * Math.PI * 2) * 0.5 + 0.5;
      m.x = m.x0 + m.dx * ph;
      m.y = m.y0 + m.dy * ph;
      m.vx = (m.x - m.px) / Math.max(dt, 1e-5);
      m.vy = (m.y - m.py) / Math.max(dt, 1e-5);
    }
    for (i = 0; i < this.hazards.length; i++) {
      var hz = this.hazards[i];
      hz.t += dt; hz.spin += dt * 9;
      var p = Math.sin((hz.t / hz.period) * Math.PI * 2) * 0.5 + 0.5;
      hz.x = hz.x0 + hz.dx * p;
      hz.y = hz.y0 + hz.dy * p;
    }
    for (k in this.crumbleState) {
      var s = this.crumbleState[k];
      if (!s.gone) {
        s.t -= dt;
        if (s.t <= 0) { s.gone = true; s.respawn = 3.2; }
      } else {
        s.respawn -= dt;
        if (s.respawn <= 0) delete this.crumbleState[k];
      }
    }
    for (i = 0; i < this.gates.length; i++) {
      var g = this.gates[i];
      g.anim = G.M.approach(g.anim, g.closed ? 1 : 0, dt * 2.2);
      // A closed gate becomes solid once mostly down
      var solid = g.anim > 0.55;
      for (var y = g.ty; y < g.ty + g.th; y++) this.set(g.tx, y, solid ? T.SOLID : T.EMPTY);
    }
  };

  World.prototype.closeGates = function () {
    for (var i = 0; i < this.gates.length; i++) this.gates[i].closed = true;
  };
  World.prototype.openGates = function () {
    for (var i = 0; i < this.gates.length; i++) this.gates[i].closed = false;
  };

  World.prototype.pixelW = function () { return this.w * K.TILE; };
  World.prototype.pixelH = function () { return this.h * K.TILE; };

  return World;
})();

/* ==========================================================================
   Physics body — shared by player and every enemy.
   Per-axis swept movement against the tile grid plus moving platforms.
   ========================================================================== */
G.Body = (function () {
  var K = G.K, T = G.T;

  function Body(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0;
    this.onGround = false; this.wasOnGround = false;
    this.onWall = 0;              // -1 wall on left, +1 wall on right, 0 none
    this.onCeiling = false;
    this.ridingMover = null;
    this.gravityScale = 1;
    this.ignorePlatforms = 0;     // >0 = drop through one-way platforms
    this.landedHard = false;
  }

  Body.prototype.cx = function () { return this.x + this.w * 0.5; };
  Body.prototype.cy = function () { return this.y + this.h * 0.5; };
  Body.prototype.setCenter = function (cx, cy) { this.x = cx - this.w * 0.5; this.y = cy - this.h * 0.5; };

  /* Move with collision. Returns nothing; flags live on the body. */
  Body.prototype.move = function (world, dt) {
    var t = K.TILE, i, m;
    this.wasOnGround = this.onGround;
    this.landedHard = false;
    if (this.ignorePlatforms > 0) this.ignorePlatforms -= dt;

    /* --- carry by moving platform first (so the rider moves with it) --- */
    if (this.ridingMover) {
      m = this.ridingMover;
      this.x += (m.x - m.px);
      this.y += (m.y - m.py);
      if (world.rectSolid(this.x, this.y, this.w, this.h)) {
        // squeezed into geometry — push out upward
        var guard = 0;
        while (world.rectSolid(this.x, this.y, this.w, this.h) && guard++ < 40) this.y -= 1;
      }
    }
    this.ridingMover = null;

    /* ------------------------------------------------ horizontal sweep --- */
    var dx = this.vx * dt;
    if (dx !== 0) {
      var stepsX = Math.max(1, Math.ceil(Math.abs(dx) / (t * 0.4)));
      var sx = dx / stepsX;
      for (i = 0; i < stepsX; i++) {
        var nx = this.x + sx;
        if (world.rectSolid(nx, this.y, this.w, this.h)) {
          // snap flush against the wall
          var dir = G.M.sign(sx);
          if (dir > 0) this.x = Math.floor((this.x + this.w + sx) / t) * t - this.w - 0.01;
          else this.x = Math.floor((this.x + sx) / t) * t + t + 0.01;
          this.vx = 0;
          break;
        }
        this.x = nx;
      }
    }
    // mover horizontal push-out
    for (i = 0; i < world.movers.length; i++) {
      m = world.movers[i];
      if (G.M.aabb(this.x, this.y, this.w, this.h, m.x, m.y, m.w, m.h)) {
        var overlapTop = (this.y + this.h) - m.y;
        if (overlapTop > 6) {           // not standing on it → side collision
          if (this.cx() < m.x + m.w * 0.5) this.x = m.x - this.w - 0.01;
          else this.x = m.x + m.w + 0.01;
          this.vx = 0;
        }
      }
    }

    /* -------------------------------------------------- vertical sweep --- */
    this.onGround = false; this.onCeiling = false;
    var dy = this.vy * dt;
    if (dy !== 0) {
      var stepsY = Math.max(1, Math.ceil(Math.abs(dy) / (t * 0.4)));
      var sy = dy / stepsY;
      for (i = 0; i < stepsY; i++) {
        var ny = this.y + sy;
        var blocked = false;

        if (world.rectSolid(this.x, ny, this.w, this.h)) blocked = true;

        // one-way platforms: only block when falling and feet start above
        if (!blocked && sy > 0 && this.ignorePlatforms <= 0) {
          var feetNow = this.y + this.h;
          var feetNext = ny + this.h;
          var tx0 = Math.floor(this.x / t), tx1 = Math.floor((this.x + this.w - 0.001) / t);
          var pty = Math.floor(feetNext / t);
          for (var tx = tx0; tx <= tx1; tx++) {
            if (world.isPlatform(tx, pty) && feetNow <= pty * t + 1.5) { blocked = true; break; }
          }
        }

        if (blocked) {
          if (sy > 0) {
            this.y = Math.floor((this.y + this.h + sy) / t) * t - this.h - 0.01;
            if (this.vy > 620) this.landedHard = true;
            this.onGround = true;
            // stepping on a crumble tile starts its timer
            var cty = Math.floor((this.y + this.h + 2) / t);
            var cx0 = Math.floor(this.x / t), cx1 = Math.floor((this.x + this.w - 0.001) / t);
            for (var cx = cx0; cx <= cx1; cx++)
              if (world.at(cx, cty) === T.CRUMBLE) world.touchCrumble(cx, cty);
          } else {
            this.y = Math.floor((this.y + sy) / t) * t + t + 0.01;
            this.onCeiling = true;
          }
          this.vy = 0;
          break;
        }
        this.y = ny;
      }
    }

    // landing on movers
    for (i = 0; i < world.movers.length; i++) {
      m = world.movers[i];
      if (G.M.aabb(this.x, this.y + 2, this.w, this.h, m.x, m.y, m.w, m.h)) {
        var feet = this.y + this.h;
        if (this.vy >= -1 && feet <= m.y + m.h * 0.9) {
          this.y = m.y - this.h - 0.01;
          this.vy = Math.min(this.vy, 0);
          this.onGround = true;
          this.ridingMover = m;
        }
      }
    }

    /* --------------------------------------------------------- contacts --- */
    this.onWall = 0;
    if (world.rectSolid(this.x - 2, this.y + 2, this.w, this.h - 6)) this.onWall = -1;
    else if (world.rectSolid(this.x + 2, this.y + 2, this.w, this.h - 6)) this.onWall = 1;

    // ground probe (keeps onGround true while walking over seams)
    if (!this.onGround && this.vy >= 0 && world.rectSolid(this.x + 1, this.y + this.h + 1, this.w - 2, 2)) {
      this.onGround = true;
    }
    if (!this.onGround && this.vy >= 0 && this.ignorePlatforms <= 0) {
      var ty2 = Math.floor((this.y + this.h + 1) / t);
      var ax0 = Math.floor((this.x + 1) / t), ax1 = Math.floor((this.x + this.w - 1) / t);
      for (var ax = ax0; ax <= ax1; ax++) {
        if (world.isPlatform(ax, ty2) && Math.abs((this.y + this.h) - ty2 * t) < 3) { this.onGround = true; break; }
      }
    }
  };

  Body.prototype.applyGravity = function (dt, apexSoften) {
    var g = G.K.GRAVITY * this.gravityScale;
    if (apexSoften && Math.abs(this.vy) < 110) g = G.K.GRAVITY_APEX * this.gravityScale;
    this.vy = Math.min(this.vy + g * dt, G.K.MAX_FALL);
  };

  return Body;
})();
