/* ==========================================================================
   GRIMHOLLOW  —  06_enemies.js
   Six enemy archetypes with readable telegraphs, plus projectiles that can
   be parried back at their owner.
   ========================================================================== */
'use strict';

var G = (typeof G !== 'undefined') ? G : {};

/* ---------------------------------------------------------- projectile ---- */
G.Projectile = (function () {
  var M = G.M;

  function Projectile(game, o) {
    this.game = game;
    this.x = o.x; this.y = o.y;
    this.vx = o.vx; this.vy = o.vy;
    this.grav = o.grav || 0;
    this.dmg = o.dmg || 12;
    this.r = o.r || 4;
    this.life = o.life || 4;
    this.kind = o.kind || 'arrow';
    this.owner = o.owner || null;
    this.hostile = o.hostile !== false;   // false = reflected, hurts enemies
    this.dead = false;
    this.rot = Math.atan2(this.vy, this.vx);
    this.spin = o.spin || 0;
    this.trail = o.trail !== false;
    this.homing = o.homing || 0;
    this.col = o.col || null;
  }

  Projectile.prototype.update = function (dt, world) {
    var g = this.game, p = g.player;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }

    if (this.homing > 0 && this.hostile && p && !p.dead) {
      var ang = Math.atan2(p.body.cy() - this.y, p.body.cx() - this.x);
      var cur = Math.atan2(this.vy, this.vx);
      var na = M.lerpAngle(cur, ang, Math.min(1, this.homing * dt));
      var sp = M.len(this.vx, this.vy);
      this.vx = Math.cos(na) * sp; this.vy = Math.sin(na) * sp;
    }

    this.vy += this.grav * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.kind !== 'orb') this.rot = Math.atan2(this.vy, this.vx);
    else this.rot += dt * 6;
    this.spin += dt * 12;

    if (this.trail && Math.random() < 0.6) {
      g.particles.spawn({
        x: this.x, y: this.y, vx: -this.vx * 0.05, vy: -this.vy * 0.05,
        life: 0.2, size: this.r * 0.8, kind: 2, drag: 3,
        col: this.hostile ? 'rgba(255,150,90,0.35)' : 'rgba(160,220,255,0.4)'
      });
    }

    if (world.isSolid(Math.floor(this.x / G.K.TILE), Math.floor(this.y / G.K.TILE))) {
      this.impact(); return;
    }
    if (this.x < -40 || this.x > world.pixelW() + 40 || this.y > world.pixelH() + 60) { this.dead = true; return; }

    if (this.hostile) {
      if (p && !p.dead && M.aabb(this.x - this.r, this.y - this.r, this.r * 2, this.r * 2,
                                 p.body.x, p.body.y, p.body.w, p.body.h)) {
        var dirX = M.sign(this.vx) || 1;
        // parry window deflects the shot back at whoever fired it
        var facingIt = (M.sign(this.vx) !== p.facing);
        var pw = G.K.PARRY_WINDOW * (p.focusMul || 1);
        if (p.blocking && facingIt && p.blockT <= pw) {
          this.hostile = false;
          this.vx *= -1.25; this.vy = -Math.abs(this.vy) * 0.5 - 40;
          this.dmg *= 2.2;
          this.col = '#bfe8ff';
          p.stam = Math.min(p.maxStam, p.stam + 22);
          g.particles.parryBurst(this.x, this.y);
          g.hitstop.add(0.12, 0.02);
          g.flash.pop(0.35, '#dff2ff');
          g.camera.addShake(7);
          g.floatText.add(p.body.cx(), p.body.y - 8, 'DEFLECT', '#bfe8ff', 14);
          G.Audio.play('parry');
          g.onParry();
          return;
        }
        p.takeDamage(this.dmg, dirX, { kb: 200, source: this.owner });
        this.impact();
        return;
      }
    } else {
      for (var i = 0; i < g.enemies.length; i++) {
        var e = g.enemies[i];
        if (e.dead || e.spawning > 0) continue;
        var hb = e.hurtbox();
        if (M.aabb(this.x - this.r, this.y - this.r, this.r * 2, this.r * 2, hb.x, hb.y, hb.w, hb.h)) {
          e.takeDamage(this.dmg, M.sign(this.vx) || 1, { kb: 200, ignoreBlock: true, source: g.player });
          g.particles.hitSparks(this.x, this.y, M.sign(this.vx), false);
          G.Audio.play('hit');
          this.impact();
          return;
        }
      }
    }
  };

  Projectile.prototype.impact = function () {
    this.dead = true;
    var col = this.hostile ? '#ffb066' : '#bfe8ff';
    for (var i = 0; i < 9; i++) {
      var a = Math.random() * Math.PI * 2;
      this.game.particles.spawn({
        x: this.x, y: this.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130,
        life: 0.2, size: 1.5 + Math.random() * 2, col: col, kind: 1, drag: 4, glow: 1
      });
    }
  };

  Projectile.prototype.draw = function (ctx) {
    var c = this.col || (this.hostile ? '#ffcf8a' : '#cfefff');
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    if (this.kind === 'arrow') {
      ctx.fillStyle = '#3a2a1c';
      ctx.fillRect(-13, -1.1, 18, 2.2);
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(3, -3.2); ctx.lineTo(3, 3.2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(230,230,230,0.7)';
      ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(-8, -3); ctx.lineTo(-7, 0); ctx.lineTo(-8, 3); ctx.closePath(); ctx.fill();
    } else if (this.kind === 'orb') {
      ctx.globalCompositeOperation = 'lighter';
      var g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, this.r * 3);
      g2.addColorStop(0, c); g2.addColorStop(0.4, this.hostile ? 'rgba(190,90,255,0.55)' : 'rgba(120,200,255,0.55)');
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(0, 0, this.r * 3, 0, 6.2832); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, this.r * 0.6, 0, 6.2832); ctx.fill();
    } else if (this.kind === 'bone') {
      ctx.fillStyle = '#ddd6c4';
      ctx.save(); ctx.rotate(this.spin);
      ctx.fillRect(-8, -1.6, 16, 3.2);
      ctx.beginPath(); ctx.arc(-8, 0, 2.6, 0, 6.2832); ctx.fill();
      ctx.beginPath(); ctx.arc(8, 0, 2.6, 0, 6.2832); ctx.fill();
      ctx.restore();
    } else { // shard
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-4, -4); ctx.lineTo(-6, 0); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  };

  Projectile.prototype.lights = function (out) {
    if (this.kind === 'orb') out.push({ x: this.x, y: this.y, r: 90, col: this.hostile ? [200, 110, 255] : [140, 210, 255], a: 0.6 });
  };

  return Projectile;
})();

/* --------------------------------------------------------------- enemy ---- */
G.Enemy = (function () {
  var M = G.M, A = G.Art, K = G.K;

  /* Archetype table. `tell` is the windup length — long tells on heavy hits so
     dodging is a skill check rather than a reflex lottery. */
  var TYPES = {
    grunt: {
      hp: 46, w: 22, h: 40, speed: 92, xp: 14, gold: 6, dmg: 14, poise: 18,
      reach: 34, tell: 0.34, act: 0.11, rec: 0.36, range: 240, aggro: 300,
      kb: 260, name: 'Husk Soldier',
      rig: { dark: '#1b1a24', mid: '#2b2a38', light: '#3b3a4c', accent: '#8a6b3a', weapon: 'sword', helm: 'plate', scale: 0.95, eyeCol: '#ff7a4a' }
    },
    shielder: {
      hp: 72, w: 24, h: 41, speed: 66, xp: 24, gold: 11, dmg: 17, poise: 60,
      reach: 32, tell: 0.44, act: 0.12, rec: 0.44, range: 210, aggro: 280,
      kb: 300, blocks: true, name: 'Bulwark',
      rig: { dark: '#1d2028', mid: '#2c3240', light: '#3d4556', accent: '#7e8a55', weapon: 'spear', helm: 'plate', shield: true, scale: 1.0, eyeCol: '#9fe08a' }
    },
    archer: {
      hp: 34, w: 21, h: 39, speed: 78, xp: 20, gold: 9, dmg: 13, poise: 12,
      reach: 0, tell: 0.52, act: 0.06, rec: 0.55, range: 420, aggro: 480,
      ranged: true, keepDist: 190, name: 'Bone Fletcher',
      rig: { dark: '#221c26', mid: '#332a38', light: '#443a4c', accent: '#9c7a4a', weapon: 'bow', helm: 'skull', scale: 0.92, eyeCol: '#ffd36b' }
    },
    flyer: {
      hp: 26, w: 20, h: 20, speed: 132, xp: 12, gold: 4, dmg: 11, poise: 8,
      reach: 24, tell: 0.30, act: 0.30, rec: 0.55, range: 300, aggro: 340,
      flying: true, name: 'Gloomwing',
      rig: { scale: 1.0, eyeCol: '#ff5a4a' }
    },
    brute: {
      hp: 140, w: 32, h: 52, speed: 62, xp: 52, gold: 26, dmg: 27, poise: 110,
      reach: 46, tell: 0.62, act: 0.14, rec: 0.62, range: 300, aggro: 380,
      kb: 420, unblockable: true, name: 'Rotbound Ogre',
      rig: { dark: '#231d1c', mid: '#39302c', light: '#4c403a', accent: '#8c4a2a', weapon: 'axe', helm: 'horned', scale: 1.28, eyeCol: '#ff4a2a' }
    },
    assassin: {
      hp: 40, w: 20, h: 38, speed: 168, xp: 34, gold: 15, dmg: 19, poise: 10,
      reach: 32, tell: 0.20, act: 0.09, rec: 0.30, range: 300, aggro: 420,
      kb: 200, dashes: true, name: 'Veilstalker',
      rig: { dark: '#171a22', mid: '#232b36', light: '#33404f', accent: '#5aa8c8', weapon: 'claw', helm: 'hood', cape: true, cloth: '#16222c', scale: 0.94, eyeCol: '#6ff0ff' }
    },
    wraith: {
      hp: 56, w: 22, h: 40, speed: 84, xp: 30, gold: 13, dmg: 16, poise: 14,
      reach: 0, tell: 0.62, act: 0.06, rec: 0.7, range: 400, aggro: 460,
      ranged: true, flying: true, keepDist: 170, projKind: 'orb', name: 'Hollow Wraith',
      rig: { scale: 1.0, eyeCol: '#c08aff' }
    }
  };

  function Enemy(game, type, x, y, opts) {
    opts = opts || {};
    var t = TYPES[type] || TYPES.grunt;
    this.game = game;
    this.type = type;
    this.def = t;
    this.tier = opts.tier || 1;

    var hpScale = 1 + (this.tier - 1) * 0.22;
    var dmgScale = 1 + (this.tier - 1) * 0.16;

    this.body = new G.Body(x, y - t.h, t.w, t.h);
    this.body.gravityScale = t.flying ? 0 : 1;
    this.maxHp = Math.round(t.hp * hpScale);
    this.hp = this.maxHp;
    this.dmg = t.dmg * dmgScale;
    this.facing = opts.facing || -1;
    this.speed = t.speed;
    this.state = 'idle';
    this.stateT = 0;
    this.animT = Math.random() * 6;
    this.runCycle = Math.random() * 6;

    this.poise = t.poise;
    this.poiseMax = t.poise;
    this.staggerT = 0;
    this.hurtFlash = 0;
    this.dead = false;
    this.deadT = 0;
    this.spawning = opts.spawn ? 0.55 : 0;

    this.atkCd = 0;
    this.tellT = 0;
    this.actT = 0;
    this.recT = 0;
    this.hitDone = false;
    this.aggro = false;
    this.aggroT = 0;
    this.dashT = 0;
    this.dashCd = 1.2;
    this.blockRaised = t.blocks || false;

    this.patrolAnchor = x;
    this.patrolRange = opts.patrol == null ? 90 : opts.patrol;
    this.patrolDir = this.facing;
    this.hoverPhase = Math.random() * 6.28;
    this.homeY = y - t.h;

    this.eyeGlow = 0.25;
    this.rig = A.makeRig(t.rig || {});
    this.pose = A.P.idle;
    this.isBoss = false;
    this.elite = !!opts.elite;
    if (this.elite) {
      this.maxHp = Math.round(this.maxHp * 1.7); this.hp = this.maxHp;
      this.dmg *= 1.25; this.poiseMax = this.poise = t.poise * 1.6;
      this.rig.accent = '#e0b64a';
      this.rig.rim = 'rgba(255,210,130,0.8)';
    }
  }

  Enemy.TYPES = TYPES;

  Enemy.prototype.hurtbox = function () {
    var b = this.body;
    return { x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 };
  };

  Enemy.prototype.attackHitbox = function () {
    if (this.state !== 'attack') return null;
    var t = this.def, b = this.body;
    if (t.reach <= 0) return null;
    var h = b.h * 0.8;
    var x = this.facing > 0 ? b.x + b.w * 0.4 : b.x + b.w * 0.6 - t.reach;
    return { x: x, y: b.y + b.h * 0.1, w: t.reach, h: h };
  };

  /* -------------------------------------------------------------- damage - */
  Enemy.prototype.takeDamage = function (amount, dirX, opts) {
    opts = opts || {};
    if (this.dead) return 'dead';

    // Shield: frontal, non-plunge hits bounce unless we're staggered.  Guard
    // poise is finite: a hit that breaks it carries its excess damage through
    // instead of making a shielded enemy invulnerable to a single huge blow.
    if (this.blockRaised && !opts.ignoreBlock && !opts.plunge && this.staggerT <= 0) {
      var fromFront = M.sign(dirX) === -this.facing || (M.sign(dirX) !== this.facing && dirX !== 0);
      fromFront = (M.sign(dirX) === -this.facing);
      if (fromFront || (this.state === 'windup' && M.sign(dirX) === -this.facing)) {
        var guardDamage = amount * 0.35;
        if (guardDamage < this.poise) {
          this.poise -= guardDamage;
          return 'blocked';
        }
        amount = Math.max(0, amount - this.poise / 0.35);
        this.stagger(0.9);
        this.poise = this.poiseMax;
      }
    }

    this.hp -= amount;
    this.hurtFlash = 1;
    this.aggro = true; this.aggroT = 6;
    this.poise -= amount + (opts.heavy ? 30 : 0);

    var kb = (opts.kb || 200) * (this.def.h > 48 ? 0.42 : 1) * (this.isBoss ? 0.16 : 1);
    this.body.vx += M.sign(dirX || 1) * kb;
    if (!this.def.flying && (opts.heavy || opts.plunge)) this.body.vy = Math.min(this.body.vy, -170);

    this.game.floatText.add(this.body.cx() + (Math.random() - 0.5) * 10, this.body.y - 4,
      Math.round(amount), opts.heavy ? '#ffd76b' : '#ffffff', opts.heavy ? 16 : 13);

    if (this.poise <= 0 && !this.isBoss) { this.stagger(0.42 + (opts.heavy ? 0.3 : 0)); this.poise = this.poiseMax; }
    else if (this.poise <= 0 && this.isBoss) { this.poise = this.poiseMax; this.onPoiseBreak && this.onPoiseBreak(); }

    if (this.hp <= 0) this.die(dirX);
    return 'hit';
  };

  Enemy.prototype.stagger = function (dur) {
    if (this.dead) return;
    this.staggerT = Math.max(this.staggerT, dur);
    this.state = 'stagger'; this.stateT = 0;
    this.tellT = this.actT = this.recT = 0;
    this.hitDone = false;
  };

  Enemy.prototype.die = function (dirX) {
    if (this.dead) return;
    this.dead = true; this.deadT = 0;
    var g = this.game;
    g.particles.death(this.body.cx(), this.body.cy(), this.rig.mid || '#2b2a3a');
    g.camera.addShake(this.def.h > 48 ? 10 : 5);
    g.hitstop.add(0.08);
    G.Audio.play('enemyDie');
    var xp = Math.round(this.def.xp * (1 + (this.tier - 1) * 0.25) * (this.elite ? 2 : 1));
    var gold = Math.round(this.def.gold * (this.elite ? 2.4 : 1) * (g.player.fortuneMul || 1));
    g.grantXp(xp, this.body.cx(), this.body.cy());
    g.spawnGold(this.body.cx(), this.body.cy() - 6, gold);
    if (Math.random() < 0.14 * (g.player.fortuneMul || 1)) g.spawnPickup('potion', this.body.cx(), this.body.cy());
    g.onEnemyKilled(this);
  };

  /* -------------------------------------------------------------- update - */
  Enemy.prototype.update = function (dt, world) {
    var g = this.game, p = g.player, b = this.body;
    this.animT += dt;
    this.stateT += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3.4);

    if (this.spawning > 0) {
      this.spawning -= dt;
      if (Math.random() < 0.6) {
        g.particles.spawn({
          x: b.cx() + (Math.random() - 0.5) * 22, y: b.y + b.h * Math.random(),
          vx: (Math.random() - 0.5) * 40, vy: -50 - Math.random() * 90,
          life: 0.4, size: 2 + Math.random() * 4, col: 'rgba(180,110,255,0.6)', kind: 1, drag: 2, glow: 1
        });
      }
      return;
    }

    if (this.dead) {
      this.deadT += dt;
      if (!this.def.flying) { b.applyGravity(dt); b.vx = M.approach(b.vx, 0, 800 * dt); b.move(world, dt); }
      else { b.vy += 700 * dt; b.move(world, dt); }
      this.pose = A.mix(this.pose, A.P.dead, Math.min(1, dt * 8));
      return;
    }

    /* poise regen */
    if (this.poise < this.poiseMax) this.poise = Math.min(this.poiseMax, this.poise + this.poiseMax * 0.35 * dt);
    this.atkCd = Math.max(0, this.atkCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);

    var alive = p && !p.dead;
    var dx = alive ? p.body.cx() - b.cx() : 0;
    var dy = alive ? p.body.cy() - b.cy() : 0;
    var dist = M.len(dx, dy);
    var t = this.def;

    /* aggro acquisition — needs line of sight, so enemies don't see through walls */
    if (alive) {
      if (!this.aggro && dist < t.aggro && world.losClear(b.cx(), b.cy(), p.body.cx(), p.body.cy())) {
        this.aggro = true; this.aggroT = 8;
        this.state = 'notice'; this.stateT = 0;
      }
      if (this.aggro) {
        this.aggroT -= dt;
        if (dist > t.aggro * 2.1 && this.aggroT <= 0) this.aggro = false;
        else if (dist < t.aggro * 1.6) this.aggroT = Math.max(this.aggroT, 2.5);
      }
    } else this.aggro = false;

    /* ------------------------------------------------------ state machine */
    if (this.staggerT > 0) {
      this.staggerT -= dt;
      this.state = 'stagger';
      b.vx = M.approach(b.vx, 0, 420 * dt);
      if (this.staggerT <= 0) { this.state = 'idle'; this.stateT = 0; }
    } else {
      switch (this.state) {
        case 'notice':
          b.vx = M.approach(b.vx, 0, 700 * dt);
          if (alive) this.facing = M.sign(dx) || this.facing;
          if (this.stateT > 0.28) { this.state = 'chase'; this.stateT = 0; }
          break;

        case 'idle':
        case 'patrol':
          this.patrolBehaviour(dt, world);
          if (this.aggro) { this.state = 'chase'; this.stateT = 0; }
          break;

        case 'chase':
          this.chaseBehaviour(dt, world, dx, dy, dist);
          break;

        case 'windup':
          this.tellT += dt;
          b.vx = M.approach(b.vx, 0, 900 * dt);
          if (alive && this.tellT < t.tell * 0.5) this.facing = M.sign(dx) || this.facing;
          if (this.tellT >= t.tell * (this.elite ? 0.82 : 1)) {
            this.state = 'attack'; this.stateT = 0; this.actT = 0; this.hitDone = false;
            this.onStrike(world);
          }
          break;

        case 'attack':
          this.actT += dt;
          if (t.reach > 0 && !this.hitDone) this.resolveMeleeHit();
          if (t.reach > 0 && !t.flying) b.vx = this.facing * (this.type === 'assassin' ? 260 : 120);
          if (this.actT >= t.act) { this.state = 'recover'; this.stateT = 0; this.recT = 0; }
          break;

        case 'recover':
          this.recT += dt;
          b.vx = M.approach(b.vx, 0, 700 * dt);
          if (this.recT >= t.rec) {
            this.state = this.aggro ? 'chase' : 'patrol';
            this.stateT = 0;
            this.atkCd = 0.35 + Math.random() * 0.5;
          }
          break;

        case 'reposition':
          this.repositionBehaviour(dt, world, dx, dist);
          break;

        default:
          this.state = 'idle';
      }
    }

    /* ------------------------------------------------------------ physics */
    if (t.flying) {
      // gentle hover bob toward a target altitude
      var targetY = this.homeY;
      if (this.aggro && alive) targetY = p.body.cy() - 46;
      var bob = Math.sin(this.animT * 2.4 + this.hoverPhase) * 12;
      var wantY = targetY + bob;
      if (this.state !== 'attack' && this.state !== 'stagger') {
        b.vy = M.damp(b.vy, (wantY - b.cy()) * 3.2, 8, dt);
      } else {
        b.vy = M.approach(b.vy, this.state === 'attack' ? 220 : 0, 900 * dt);
      }
      b.vx = M.clamp(b.vx, -420, 420);
      b.move(world, dt);
      if (b.onWall !== 0 && this.state === 'attack') { this.state = 'recover'; this.recT = 0; }
    } else {
      b.applyGravity(dt);
      b.move(world, dt);
    }

    /* hazards kill enemies too — spikes are a legitimate tactic */
    var hz = world.rectHazard(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
    if (hz > 0) {
      if (hz >= 9999) { this.hp = 0; this.die(0); }
      else if (this.hazT == null || this.hazT <= 0) { this.hazT = 0.6; this.takeDamage(hz, 0, { kb: 60, ignoreBlock: true }); }
    }
    if (this.hazT != null) this.hazT -= dt;
    if (b.y > world.pixelH() + 120) { this.hp = 0; this.die(0); }

    this.eyeGlow = 0.22 + (this.state === 'windup' ? M.clamp(this.tellT / Math.max(0.01, t.tell), 0, 1) * 0.9 : 0) +
                   (this.aggro ? 0.2 : 0) + this.hurtFlash * 0.3;

    this.updatePose(dt);
  };

  /* ------------------------------------------------------------ behaviour */
  Enemy.prototype.patrolBehaviour = function (dt, world) {
    var b = this.body, t = this.def;
    if (this.patrolRange <= 0) { b.vx = M.approach(b.vx, 0, 600 * dt); this.state = 'idle'; return; }
    this.state = 'patrol';
    var off = b.cx() - this.patrolAnchor;
    if (off > this.patrolRange) this.patrolDir = -1;
    if (off < -this.patrolRange) this.patrolDir = 1;

    // don't walk off ledges
    if (!t.flying) {
      var ahead = b.cx() + this.patrolDir * (b.w * 0.6 + 6);
      var footTx = Math.floor(ahead / K.TILE), footTy = Math.floor((b.y + b.h + 6) / K.TILE);
      var groundAhead = world.isSolid(footTx, footTy) || world.isPlatform(footTx, footTy);
      var wallAhead = world.isSolid(footTx, Math.floor(b.cy() / K.TILE));
      if ((!groundAhead && b.onGround) || wallAhead) this.patrolDir *= -1;
    }
    this.facing = this.patrolDir;
    b.vx = M.approach(b.vx, this.patrolDir * t.speed * 0.42, 700 * dt);
  };

  Enemy.prototype.chaseBehaviour = function (dt, world, dx, dy, dist) {
    var b = this.body, t = this.def, g = this.game, p = g.player;
    this.facing = M.sign(dx) || this.facing;

    if (t.ranged) {
      var kd = t.keepDist;
      var want = 0;
      if (dist < kd * 0.72) want = -M.sign(dx);        // back off
      else if (dist > kd * 1.25) want = M.sign(dx);    // close in
      // strafe a little so archers aren't static targets
      if (want === 0) want = Math.sin(this.animT * 1.3) > 0 ? 1 : -1;
      if (!t.flying) {
        var aheadX = b.cx() + want * (b.w * 0.6 + 6);
        var fty = Math.floor((b.y + b.h + 6) / K.TILE);
        if (!world.isSolid(Math.floor(aheadX / K.TILE), fty) && !world.isPlatform(Math.floor(aheadX / K.TILE), fty)) want = 0;
      }
      b.vx = M.approach(b.vx, want * t.speed * 0.6, 620 * dt);
      if (this.atkCd <= 0 && dist < t.range && world.losClear(b.cx(), b.cy(), p.body.cx(), p.body.cy())) {
        this.state = 'windup'; this.stateT = 0; this.tellT = 0;
      }
      return;
    }

    if (t.dashes && this.dashCd <= 0 && dist > 90 && dist < 280 &&
        world.losClear(b.cx(), b.cy(), p.body.cx(), p.body.cy())) {
      this.dashCd = 2.6 + Math.random() * 1.4;
      this.dashT = 0.22;
      b.vx = this.facing * 520;
      g.ghosts.add(this, 'rgba(90,200,230,0.28)', 0.22);
      G.Audio.play('dash');
    }
    if (this.dashT > 0) {
      this.dashT -= dt;
      b.vx = this.facing * 520;
      if (Math.random() < 0.7) g.ghosts.add(this, 'rgba(90,200,230,0.22)', 0.2);
      if (this.dashT <= 0 && dist < t.reach * 1.6) {
        this.state = 'windup'; this.tellT = 0;
      }
      return;
    }

    var inRange = Math.abs(dx) < t.reach * 0.85 && Math.abs(dy) < b.h * 1.1;
    if (inRange && this.atkCd <= 0) {
      this.state = 'windup'; this.stateT = 0; this.tellT = 0;
      if (t.tell > 0.4) G.Audio.play('charge');
      return;
    }

    var dir = M.sign(dx);
    if (!t.flying) {
      // stop at ledges rather than lemming off them
      var ax2 = b.cx() + dir * (b.w * 0.6 + 8);
      var ty2 = Math.floor((b.y + b.h + 8) / K.TILE);
      var solidAhead = world.isSolid(Math.floor(ax2 / K.TILE), ty2) || world.isPlatform(Math.floor(ax2 / K.TILE), ty2);
      if (!solidAhead && b.onGround && Math.abs(dy) < 60) dir = 0;
      // hop small walls
      var wallTy = Math.floor((b.y + b.h - 6) / K.TILE);
      if (dir !== 0 && world.isSolid(Math.floor(ax2 / K.TILE), wallTy) &&
          !world.isSolid(Math.floor(ax2 / K.TILE), wallTy - 2) && b.onGround) {
        b.vy = -430;
      }
      // hop up toward a player above us
      if (b.onGround && dy < -50 && Math.abs(dx) < 70 && Math.random() < 0.02) b.vy = -480;
    }
    b.vx = M.approach(b.vx, dir * t.speed, 900 * dt);
    if (this.blockRaised) this.blockRaised = true;
  };

  Enemy.prototype.repositionBehaviour = function (dt, world, dx, dist) {
    var b = this.body, t = this.def;
    b.vx = M.approach(b.vx, -M.sign(dx) * t.speed * 0.7, 600 * dt);
    if (this.stateT > 0.7) { this.state = 'chase'; this.stateT = 0; }
  };

  Enemy.prototype.onStrike = function (world) {
    var t = this.def, b = this.body, g = this.game, p = g.player;
    if (t.ranged) {
      var sx = b.cx() + this.facing * 12, sy = b.cy() - 6;
      var tx = p.body.cx(), ty = p.body.cy();
      if (t.projKind === 'orb') {
        var ang = Math.atan2(ty - sy, tx - sx);
        g.projectiles.push(new G.Projectile(g, {
          x: sx, y: sy, vx: Math.cos(ang) * 250, vy: Math.sin(ang) * 250,
          dmg: this.dmg, r: 5, kind: 'orb', owner: this, homing: 1.1, life: 3.4
        }));
      } else {
        // ballistic arrow with gravity compensation
        var gAcc = 380, dxx = tx - sx, dyy = ty - sy, sp = 420;
        var tflight = Math.max(0.05, Math.abs(dxx) / sp);
        var vy = (dyy - 0.5 * gAcc * tflight * tflight) / tflight;
        g.projectiles.push(new G.Projectile(g, {
          x: sx, y: sy, vx: M.sign(dxx) * sp, vy: vy,
          dmg: this.dmg, r: 4, kind: 'arrow', grav: gAcc, owner: this, life: 4
        }));
      }
      G.Audio.play('arrow');
      return;
    }
    G.Audio.play('swing', this.type === 'brute' ? 2 : 0);
    // sweep arc so the swing is visible even off-centre
    var col = t.unblockable ? 'rgba(255,140,90,0.85)' : 'rgba(255,220,190,0.75)';
    g.slashes.add({
      x: b.cx() + this.facing * 12, y: b.cy(), r: t.reach * 0.95,
      a0: -1.2, a1: 1.0, life: 0.14, width: this.type === 'brute' ? 20 : 12, col: col, dir: this.facing
    });
    if (this.type === 'brute') {
      g.particles.shockwave(b.cx() + this.facing * 30, b.y + b.h - 4, 90, '#ffa060');
      g.camera.addShake(6);
      G.Audio.play('slam');
    }
  };

  Enemy.prototype.resolveMeleeHit = function () {
    var hb = this.attackHitbox();
    if (!hb) return;
    var p = this.game.player;
    if (!p || p.dead) return;
    if (M.aabb(hb.x, hb.y, hb.w, hb.h, p.body.x, p.body.y, p.body.w, p.body.h)) {
      this.hitDone = true;
      var dir = M.sign(p.body.cx() - this.body.cx()) || this.facing;
      p.takeDamage(this.dmg, dir, {
        kb: this.def.kb || 240, source: this, unblockable: this.def.unblockable
      });
    }
  };

  /* ---------------------------------------------------------- animation - */
  Enemy.prototype.updatePose = function (dt) {
    var P = A.P, b = this.body, target, blend = 12, t = this.def;
    if (t.flying && (this.type === 'flyer' || this.type === 'wraith')) { this.pose = P.idle; return; }

    switch (this.state) {
      case 'patrol':
      case 'chase': {
        if (Math.abs(b.vx) > 20) {
          this.runCycle += dt * (4.4 + Math.abs(b.vx) / 68);
          var ph = Math.sin(this.runCycle) * 0.5 + 0.5;
          target = A.mix(P.run, P.runB, ph);
          target.bob = Math.abs(Math.cos(this.runCycle)) * -1.8;
          if (this.blockRaised) { target.shB = -0.9; target.elB = 1.5; }
          blend = 18;
        } else {
          target = P.idle;
          target = A.mix(P.idle, P.idle, 0);
          target.bob = Math.sin(this.animT * 1.8) * 0.9;
          if (this.blockRaised) { target.shB = -0.85; target.elB = 1.5; }
          blend = 8;
        }
        break;
      }
      case 'notice':
        target = A.mix(P.idle, P.parry, 0.35); blend = 20; break;
      case 'windup': {
        var k = M.clamp(this.tellT / Math.max(0.01, t.tell), 0, 1);
        var w = t.ranged ? P.aim : (this.type === 'brute' ? P.atk3a : P.atk1a);
        target = A.mix(P.idle, w, M.easeOutCubic(k));
        // brutes rear back further the longer the tell runs
        if (this.type === 'brute') target.lean = -0.5 * k;
        blend = 26;
        break;
      }
      case 'attack': {
        var ka = M.clamp(this.actT / Math.max(0.01, t.act), 0, 1);
        var from = t.ranged ? P.aim : (this.type === 'brute' ? P.atk3a : P.atk1a);
        var to = t.ranged ? P.shoot : (this.type === 'brute' ? P.atk3b : P.atk1b);
        target = A.mix(from, to, M.easeOutCubic(ka));
        blend = 44;
        break;
      }
      case 'recover':
        target = A.mix(P.atk1c, P.idle, M.smoothstep(this.recT / Math.max(0.01, t.rec))); blend = 12; break;
      case 'stagger':
        target = P.hurt; blend = 22; break;
      default:
        target = P.idle; blend = 8;
    }
    if (!b.onGround && !t.flying) { target = A.mix(target, b.vy < 0 ? P.jump : P.fall, 0.65); blend = 14; }
    this.pose = A.mix(this.pose, target, Math.min(1, blend * dt));
  };

  Enemy.prototype.snapshotPose = function () {
    var o = {}; for (var k in this.pose) o[k] = this.pose[k];
    return o;
  };

  /* --------------------------------------------------------------- draw -- */
  Enemy.prototype.draw = function (ctx) {
    var b = this.body, t = this.def;
    var alpha = 1;
    if (this.spawning > 0) alpha = 1 - this.spawning / 0.55;
    if (this.dead) alpha = Math.max(0, 1 - this.deadT / 0.9);

    var flat = null;
    if (this.hurtFlash > 0.45) flat = 'rgba(255,240,240,0.95)';   // hit flash

    var opts = {
      alpha: alpha, eyeGlow: this.eyeGlow, eyeCol: t.rig && t.rig.eyeCol,
      flat: flat, rimStrength: 0.4 + (this.state === 'windup' ? 0.5 : 0)
    };

    if (this.type === 'flyer') {
      A.drawBat(ctx, b.cx(), b.cy(), this.facing, this.animT, {
        scale: 1.05, alpha: alpha, eyeGlow: this.eyeGlow, eyeCol: '#ff5a4a', flat: flat
      });
    } else if (this.type === 'wraith') {
      A.drawWraith(ctx, b.cx(), b.cy() + 4, this.facing, this.animT, {
        scale: 1.0, alpha: alpha, eyeGlow: this.eyeGlow, eyeCol: '#c08aff', flat: flat
      });
    } else {
      A.drawHumanoid(ctx, this.rig, this.pose, b.cx(), b.cy() - 2, this.facing, opts);
    }

    if (this.dead) return;

    /* ---- telegraph ring: the single clearest "dodge now" signal ---- */
    if (this.state === 'windup') {
      var k = M.clamp(this.tellT / Math.max(0.01, t.tell), 0, 1);
      var warn = t.unblockable ? [255, 90, 60] : [255, 200, 120];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.22 + k * 0.5;
      ctx.strokeStyle = 'rgba(' + warn[0] + ',' + warn[1] + ',' + warn[2] + ',0.95)';
      ctx.lineWidth = 1.6 + k * 1.8;
      ctx.beginPath();
      ctx.arc(b.cx(), b.cy(), 16 + (1 - k) * 26, 0, 6.2832);
      ctx.stroke();
      ctx.restore();
      if (t.unblockable) {
        // unblockable attacks get a glyph so you know not to guard
        ctx.save();
        ctx.globalAlpha = 0.4 + k * 0.6;
        ctx.fillStyle = '#ff8a5a';
        ctx.font = 'bold 15px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('!', b.cx(), b.y - 12);
        ctx.restore();
      }
    }

    /* ---- health pip above elites/damaged enemies ---- */
    if (this.hp < this.maxHp || this.elite) {
      var w = Math.max(20, Math.min(44, this.maxHp * 0.32));
      var hx = b.cx() - w / 2, hy = b.y - 9;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(hx - 1, hy - 1, w + 2, 4.5);
      ctx.fillStyle = this.elite ? '#e0b64a' : '#c0392b';
      ctx.fillRect(hx, hy, w * Math.max(0, this.hp / this.maxHp), 2.5);
      if (this.poise < this.poiseMax) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(hx, hy + 3, w * (this.poise / this.poiseMax), 1);
      }
      ctx.restore();
    }
  };

  Enemy.prototype.drawGhost = function (ctx, gh) {
    if (this.type === 'flyer' || this.type === 'wraith') return;
    A.drawHumanoid(ctx, this.rig, gh.pose || this.pose, gh.x + gh.w * 0.5, gh.y + gh.h * 0.5 - 2, gh.facing,
                   { flat: gh.col, alpha: (gh.life / gh.max) * 0.6, rim: false, eyeGlow: 0 });
  };

  Enemy.prototype.lights = function (out) {
    var b = this.body;
    var t = this.def;
    if (this.dead) return;
    var eg = this.eyeGlow;
    if (eg > 0.3) {
      var c = this.type === 'assassin' ? [110, 240, 255] :
              this.type === 'wraith' ? [190, 138, 255] :
              this.type === 'shielder' ? [159, 224, 138] : [255, 122, 74];
      out.push({ x: b.cx() + this.facing * 4, y: b.cy() - b.h * 0.32, r: 46 + eg * 44, col: c, a: 0.30 + eg * 0.35 });
    }
    if (this.state === 'windup' && t.unblockable) {
      out.push({ x: b.cx(), y: b.cy(), r: 120, col: [255, 110, 60], a: 0.4 * M.clamp(this.tellT / t.tell, 0, 1) });
    }
  };

  return Enemy;
})();
