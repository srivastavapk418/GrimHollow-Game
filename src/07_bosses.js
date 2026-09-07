/* ==========================================================================
   GRIMHOLLOW  —  07_bosses.js
   Three multi-phase bosses driven by a shared action runner.
   An "action" is a data record: tell → active → recover, with optional
   movement, projectile spawns and chain-into-next. Adding a new boss attack
   means adding a table entry, not new control flow.
   ========================================================================== */
'use strict';

var G = (typeof G !== 'undefined') ? G : {};

/* ------------------------------------------------- travelling ground wave -- */
/* Duck-typed to live in game.projectiles alongside G.Projectile. */
G.Wave = (function () {
  var M = G.M;
  function Wave(game, o) {
    this.game = game;
    this.x = o.x; this.y = o.y;
    this.vx = o.vx;
    this.dmg = o.dmg || 20;
    this.life = o.life || 2.4;
    this.h = o.h || 34;
    this.w = 22;
    this.dead = false;
    this.hostile = true;
    this.hit = false;
    this.col = o.col || '#ff9a5a';
    this.unblockable = !!o.unblockable;
    this.t = 0;
  }
  Wave.prototype.update = function (dt, world) {
    this.t += dt;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.x += this.vx * dt;
    // stick to the floor: walk down/up to follow terrain
    var K = G.K, tx = Math.floor(this.x / K.TILE);
    var ty = Math.floor((this.y + 4) / K.TILE);
    if (world.isSolid(tx, ty)) this.y -= K.TILE;
    else if (!world.isSolid(tx, ty + 1) && !world.isPlatform(tx, ty + 1)) this.y += Math.min(200 * dt, K.TILE);
    if (world.isSolid(tx, Math.floor((this.y - this.h * 0.5) / K.TILE))) { this.dead = true; return; }
    if (this.x < -40 || this.x > world.pixelW() + 40) { this.dead = true; return; }

    if (Math.random() < 0.8) {
      this.game.particles.spawn({
        x: this.x + (Math.random() - 0.5) * 20, y: this.y - Math.random() * this.h,
        vx: this.vx * 0.1 + (Math.random() - 0.5) * 60, vy: -60 - Math.random() * 150,
        life: 0.3, size: 2 + Math.random() * 4, col: this.col, kind: 1, drag: 2.4, glow: 1
      });
    }
    var p = this.game.player;
    if (!this.hit && p && !p.dead &&
        M.aabb(this.x - this.w * 0.5, this.y - this.h, this.w, this.h, p.body.x, p.body.y, p.body.w, p.body.h)) {
      this.hit = true;
      p.takeDamage(this.dmg, M.sign(this.vx), { kb: 300, unblockable: this.unblockable });
      this.dead = true;
    }
  };
  Wave.prototype.draw = function (ctx) {
    var k = G.M.clamp(this.life / 0.5, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.75 * k;
    var g = ctx.createLinearGradient(this.x, this.y, this.x, this.y - this.h);
    g.addColorStop(0, this.col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(this.x - 14, this.y);
    ctx.quadraticCurveTo(this.x, this.y - this.h * 1.25, this.x + 14, this.y);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  };
  Wave.prototype.lights = function (out) {
    out.push({ x: this.x, y: this.y - this.h * 0.4, r: 90, col: [255, 150, 80], a: 0.5 });
  };
  return Wave;
})();

/* ------------------------------------------------------------------ boss --- */
G.Boss = (function () {
  var M = G.M, A = G.Art, K = G.K, P = G.Art.P;

  /* ---------- shared action helpers ---------- */
  function melee(self, reach, hy, dmg, kb, unblockable) {
    var b = self.body, p = self.game.player;
    if (!p || p.dead) return;
    var x = self.facing > 0 ? b.x + b.w * 0.35 : b.x + b.w * 0.65 - reach;
    var y = b.y + b.h * 0.5 - hy * 0.5;
    if (M.aabb(x, y, reach, hy, p.body.x, p.body.y, p.body.w, p.body.h)) {
      self.actHitDone = true;
      p.takeDamage(dmg, M.sign(p.body.cx() - b.cx()) || self.facing,
        { kb: kb, source: self, unblockable: unblockable });
    }
  }

  function arc(self, reach, width, col, life) {
    self.game.slashes.add({
      x: self.body.cx() + self.facing * 16, y: self.body.cy(),
      r: reach * 0.95, a0: -1.35, a1: 1.1, life: life || 0.18,
      width: width || 22, col: col || 'rgba(255,230,200,0.85)', dir: self.facing
    });
  }

  function wave(self, dmg, speed, unblockable) {
    var b = self.body;
    self.game.projectiles.push(new G.Wave(self.game, {
      x: b.cx() + self.facing * 30, y: b.y + b.h,
      vx: self.facing * (speed || 340), dmg: dmg, unblockable: unblockable,
      col: unblockable ? '#ff7a4a' : '#ffb066'
    }));
  }

  function orb(self, ang, sp, dmg, homing) {
    var b = self.body;
    self.game.projectiles.push(new G.Projectile(self.game, {
      x: b.cx(), y: b.cy() - 6,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      dmg: dmg, r: 6, kind: 'orb', owner: self, homing: homing || 0, life: 4
    }));
  }

  function shake(self, n) { self.game.camera.addShake(n); }

  /* ---------- action table entries ----------
     tell/act/rec in seconds. onStrike fires once when active begins. */

  var WARDEN_ACTIONS = {
    slash1: {
      tell: 0.42, act: 0.13, rec: 0.30, poseW: 'atk1a', poseS: 'atk1b',
      move: 150, chain: 'slash2',
      onStrike: function (s) { arc(s, 58, 20); G.Audio.play('swing', 1); },
      onActive: function (s) { melee(s, 58, 46, s.dmg, 300); }
    },
    slash2: {
      tell: 0.26, act: 0.13, rec: 0.52, poseW: 'atk2a', poseS: 'atk2b',
      move: 170,
      onStrike: function (s) { arc(s, 60, 22); G.Audio.play('swing', 2); },
      onActive: function (s) { melee(s, 60, 48, s.dmg * 1.1, 340); }
    },
    overhead: {
      tell: 0.70, act: 0.14, rec: 0.62, poseW: 'atk3a', poseS: 'atk3b',
      unblockable: true, move: 90,
      onStart: function (s) { G.Audio.play('charge'); },
      onStrike: function (s) {
        arc(s, 66, 30, 'rgba(255,140,90,0.9)', 0.24);
        s.game.particles.shockwave(s.body.cx() + s.facing * 34, s.body.y + s.body.h, 140, '#ff9a5a');
        s.game.particles.rubble(s.body.cx() + s.facing * 34, s.body.y + s.body.h, 16);
        shake(s, 12); G.Audio.play('slam');
        wave(s, s.dmg * 0.8, 320, false);
      },
      onActive: function (s) { melee(s, 66, 56, s.dmg * 1.5, 420, true); }
    },
    charge: {
      tell: 0.58, act: 0.62, rec: 0.60, poseW: 'crouch', poseS: 'dash',
      onStart: function (s) { G.Audio.play('charge'); s.chargeHits = []; },
      onStrike: function (s) { G.Audio.play('dash'); shake(s, 5); },
      onActive: function (s, dt, k) {
        s.body.vx = s.facing * 520;
        if (Math.random() < 0.8) s.game.ghosts.add(s, 'rgba(255,160,110,0.22)', 0.22);
        s.game.particles.dust(s.body.cx(), s.body.y + s.body.h - 4, 3, 22, 'rgba(220,180,140,0.4)');
        melee(s, 46, 52, s.dmg * 0.9, 420);
        // wall impact ends the charge in a stagger the player can punish
        if (s.body.onWall === s.facing) {
          s.body.vx = 0;
          s.game.particles.rubble(s.body.cx() + s.facing * 20, s.body.cy(), 20);
          s.game.particles.shockwave(s.body.cx() + s.facing * 20, s.body.cy(), 120, '#ffc08a');
          shake(s, 14); G.Audio.play('slam');
          s.forceStagger(1.25);
        }
      }
    },
    leap: {
      tell: 0.46, act: 0.95, rec: 0.66, poseW: 'crouch', poseS: 'slam',
      phase: 2,
      onStart: function (s) {
        var p = s.game.player;
        s.leapTargetX = p ? p.body.cx() : s.body.cx();
        G.Audio.play('charge');
      },
      onStrike: function (s) {
        var dx = s.leapTargetX - s.body.cx();
        s.body.vx = M.clamp(dx * 1.5, -520, 520);
        s.body.vy = -640;
        s.leapAirborne = true;
        G.Audio.play('jump');
      },
      onActive: function (s, dt, k) {
        if (s.leapAirborne && s.body.onGround && k > 0.25) {
          s.leapAirborne = false;
          s.body.vx = 0;
          s.game.particles.shockwave(s.body.cx(), s.body.y + s.body.h, 190, '#ff9a5a');
          s.game.particles.rubble(s.body.cx(), s.body.y + s.body.h, 26);
          s.game.particles.landPuff(s.body.cx(), s.body.y + s.body.h, true);
          shake(s, 16); G.Audio.play('slam');
          wave(s, s.dmg, 330, true);
          var save = s.facing; s.facing = -save; wave(s, s.dmg, 330, true); s.facing = save;
          var p = s.game.player;
          if (p && !p.dead && Math.abs(p.body.cx() - s.body.cx()) < 78 && p.body.onGround) {
            p.takeDamage(s.dmg * 1.2, M.sign(p.body.cx() - s.body.cx()) || 1, { kb: 420, unblockable: true });
          }
        }
      }
    }
  };

  var CHOIR_ACTIONS = {
    volley: {
      tell: 0.60, act: 0.42, rec: 0.55, poseW: 'aim', poseS: 'shoot',
      onStart: function (s) { s.volleyN = 0; G.Audio.play('charge'); },
      onStrike: function (s) { s.volleyN = 0; },
      onActive: function (s, dt, k) {
        var want = Math.floor(k * 3) + 1;
        while (s.volleyN < want && s.volleyN < 3) {
          var p = s.game.player;
          var ang = Math.atan2((p ? p.body.cy() : s.body.cy()) - s.body.cy(),
                               (p ? p.body.cx() : s.body.cx() + 40) - s.body.cx());
          orb(s, ang + (s.volleyN - 1) * 0.26, 240, s.dmg * 0.7, 1.3);
          s.volleyN++;
          G.Audio.play('arrow');
        }
      }
    },
    blink: {
      tell: 0.34, act: 0.16, rec: 0.42, poseW: 'parry', poseS: 'atk1b',
      onStart: function (s) {
        s.game.particles.death(s.body.cx(), s.body.cy(), '#3a2a55');
        s.blinkFade = 1;
      },
      onStrike: function (s) {
        // reappear on the player's far side so you have to turn around
        var p = s.game.player, w = s.game.world;
        if (p) {
          var side = (p.body.cx() > s.body.cx()) ? 1 : -1;
          var tx = p.body.cx() + side * 54;
          tx = M.clamp(tx, K.TILE * 2, w.pixelW() - K.TILE * 2 - s.body.w);
          if (!w.rectSolid(tx - s.body.w * 0.5, p.body.cy() - s.body.h * 0.5, s.body.w, s.body.h)) {
            s.body.x = tx - s.body.w * 0.5;
            s.body.y = p.body.cy() - s.body.h * 0.5;
          }
          s.facing = -side;
        }
        s.blinkFade = 0;
        s.game.particles.parryBurst(s.body.cx(), s.body.cy());
        arc(s, 50, 16, 'rgba(200,150,255,0.9)');
        G.Audio.play('dash');
      },
      onActive: function (s) { melee(s, 50, 44, s.dmg, 280); }
    },
    lance: {
      tell: 0.85, act: 0.55, rec: 0.70, poseW: 'aim', poseS: 'shoot',
      unblockable: true,
      onStart: function (s) { s.lanceAim = 0; G.Audio.play('charge'); },
      onTell: function (s, dt, k) {
        var p = s.game.player;
        if (p) s.facing = M.sign(p.body.cx() - s.body.cx()) || s.facing;
        s.lanceAim = k;
      },
      onStrike: function (s) { G.Audio.play('bossRoar'); shake(s, 9); },
      onActive: function (s, dt, k) {
        s.lanceOn = k;
        var b = s.body, p = s.game.player;
        var len = 420;
        var x = s.facing > 0 ? b.cx() : b.cx() - len;
        if (p && !p.dead && !s.lanceHit &&
            M.aabb(x, b.cy() - 15, len, 30, p.body.x, p.body.y, p.body.w, p.body.h)) {
          s.lanceHit = true;
          p.takeDamage(s.dmg * 1.25, s.facing, { kb: 340, unblockable: true });
        }
        for (var i = 0; i < 3; i++) {
          s.game.particles.spawn({
            x: b.cx() + s.facing * Math.random() * len, y: b.cy() + (Math.random() - 0.5) * 22,
            vx: s.facing * 260, vy: (Math.random() - 0.5) * 90,
            life: 0.2, size: 2 + Math.random() * 4, col: '#c08aff', kind: 1, drag: 2, glow: 1
          });
        }
      },
      onEnd: function (s) { s.lanceOn = 0; s.lanceHit = false; }
    },
    summon: {
      tell: 0.72, act: 0.30, rec: 0.75, poseW: 'atk3a', poseS: 'slam',
      onStart: function (s) { G.Audio.play('charge'); },
      onStrike: function (s) {
        G.Audio.play('bossRoar');
        var b = s.body, g = s.game;
        var kinds = s.phase >= 2 ? ['wraith', 'flyer'] : ['flyer', 'flyer'];
        for (var i = 0; i < kinds.length; i++) {
          g.spawnEnemy(kinds[i], b.cx() + (i ? 80 : -80), b.y + b.h - 10, { spawn: true, tier: s.tier, patrol: 60 });
        }
        g.particles.shockwave(b.cx(), b.cy(), 170, '#c08aff');
        shake(s, 8);
      }
    },
    storm: {
      tell: 0.80, act: 0.55, rec: 0.80, poseW: 'atk3a', poseS: 'slam',
      phase: 2,
      onStart: function (s) { s.stormN = 0; G.Audio.play('charge'); },
      onActive: function (s, dt, k) {
        var want = Math.floor(k * 10);
        while (s.stormN < want && s.stormN < 10) {
          orb(s, (s.stormN / 10) * Math.PI * 2, 190, s.dmg * 0.55, 0.25);
          s.stormN++;
        }
        if (s.stormN === 1) { G.Audio.play('bossRoar'); shake(s, 7); }
      }
    }
  };

  var VALDRIS_ACTIONS = {
    combo1: {
      tell: 0.38, act: 0.12, rec: 0.22, poseW: 'atk1a', poseS: 'atk1b',
      move: 190, chain: 'combo2',
      onStrike: function (s) { arc(s, 62, 20); G.Audio.play('swing', 1); },
      onActive: function (s) { melee(s, 62, 48, s.dmg * 0.85, 280); }
    },
    combo2: {
      tell: 0.22, act: 0.12, rec: 0.22, poseW: 'atk2a', poseS: 'atk2b',
      move: 200, chain: 'combo3',
      onStrike: function (s) { arc(s, 62, 20); G.Audio.play('swing', 2); },
      onActive: function (s) { melee(s, 62, 48, s.dmg * 0.9, 300); }
    },
    combo3: {
      tell: 0.30, act: 0.14, rec: 0.62, poseW: 'atk3a', poseS: 'atk3b',
      move: 240,
      onStrike: function (s) {
        arc(s, 70, 30, 'rgba(255,190,140,0.92)', 0.24);
        s.game.particles.shockwave(s.body.cx() + s.facing * 36, s.body.y + s.body.h, 130, '#ffb066');
        shake(s, 10); G.Audio.play('slam');
      },
      onActive: function (s) { melee(s, 70, 54, s.dmg * 1.3, 400); }
    },
    thrust: {
      tell: 0.52, act: 0.34, rec: 0.55, poseW: 'crouch', poseS: 'dash',
      onStart: function (s) { G.Audio.play('charge'); },
      onStrike: function (s) { G.Audio.play('dash'); },
      onActive: function (s) {
        s.body.vx = s.facing * 600;
        if (Math.random() < 0.85) s.game.ghosts.add(s, 'rgba(255,180,120,0.24)', 0.2);
        melee(s, 52, 42, s.dmg, 380);
      }
    },
    fissure: {
      tell: 0.70, act: 0.30, rec: 0.62, poseW: 'atk3a', poseS: 'slam',
      phase: 2, unblockable: true,
      onStart: function (s) { G.Audio.play('charge'); },
      onStrike: function (s) {
        G.Audio.play('slam'); shake(s, 13);
        s.game.particles.rubble(s.body.cx(), s.body.y + s.body.h, 24);
        s.game.particles.shockwave(s.body.cx(), s.body.y + s.body.h, 200, '#ff8a5a');
        var save = s.facing;
        wave(s, s.dmg * 0.9, 300, true);
        s.facing = -save; wave(s, s.dmg * 0.9, 300, true);
        s.facing = save;
      }
    },
    dive: {
      tell: 0.44, act: 1.05, rec: 0.62, poseW: 'crouch', poseS: 'slam',
      phase: 2,
      onStart: function (s) {
        var p = s.game.player;
        s.leapTargetX = p ? p.body.cx() : s.body.cx();
        G.Audio.play('charge');
      },
      onStrike: function (s) {
        s.body.vx = M.clamp((s.leapTargetX - s.body.cx()) * 1.6, -560, 560);
        s.body.vy = -700; s.leapAirborne = true; G.Audio.play('jump');
      },
      onActive: function (s, dt, k) {
        if (s.leapAirborne && s.body.onGround && k > 0.22) {
          s.leapAirborne = false; s.body.vx = 0;
          s.game.particles.shockwave(s.body.cx(), s.body.y + s.body.h, 210, '#ffb066');
          s.game.particles.rubble(s.body.cx(), s.body.y + s.body.h, 30);
          shake(s, 18); G.Audio.play('slam');
          wave(s, s.dmg, 360, true);
          var sv = s.facing; s.facing = -sv; wave(s, s.dmg, 360, true); s.facing = sv;
          var p = s.game.player;
          if (p && !p.dead && Math.abs(p.body.cx() - s.body.cx()) < 84 && p.body.onGround)
            p.takeDamage(s.dmg * 1.25, M.sign(p.body.cx() - s.body.cx()) || 1, { kb: 460, unblockable: true });
        }
      }
    },
    whirl: {
      tell: 0.52, act: 1.10, rec: 0.72, poseW: 'atk3a', poseS: 'atk2b',
      phase: 3, unblockable: true,
      onStart: function (s) { s.whirlTick = 0; G.Audio.play('bossRoar'); },
      onStrike: function (s) { shake(s, 7); },
      onActive: function (s, dt, k) {
        s.whirlSpin = (s.whirlSpin || 0) + dt * 22;
        s.body.vx = M.approach(s.body.vx, s.facing * 200, 500 * dt);
        s.whirlTick -= dt;
        if (Math.random() < 0.9) {
          var a = Math.random() * 6.28;
          s.game.particles.spawn({
            x: s.body.cx() + Math.cos(a) * 50, y: s.body.cy() + Math.sin(a) * 34,
            vx: Math.cos(a) * 220, vy: Math.sin(a) * 140,
            life: 0.24, size: 2 + Math.random() * 4, col: '#ffcf8a', kind: 1, drag: 2.6, glow: 1
          });
        }
        if (s.whirlTick <= 0) {
          s.whirlTick = 0.26;
          var p = s.game.player;
          if (p && !p.dead && M.dist(p.body.cx(), p.body.cy(), s.body.cx(), s.body.cy()) < 66) {
            p.takeDamage(s.dmg * 0.62, M.sign(p.body.cx() - s.body.cx()) || 1, { kb: 300, unblockable: true });
          }
          arc(s, 62, 24, 'rgba(255,210,150,0.7)', 0.14);
        }
      }
    },
    meteor: {
      tell: 0.85, act: 1.30, rec: 0.80, poseW: 'atk3a', poseS: 'slam',
      phase: 3,
      onStart: function (s) { s.meteorT = 0; G.Audio.play('bossRoar'); },
      onStrike: function (s) { shake(s, 10); },
      onActive: function (s, dt, k) {
        s.meteorT -= dt;
        if (s.meteorT <= 0) {
          s.meteorT = 0.16;
          var w = s.game.world;
          var px = s.game.player ? s.game.player.body.cx() : s.body.cx();
          var x = M.clamp(px + (Math.random() - 0.5) * 300, K.TILE, w.pixelW() - K.TILE);
          s.game.projectiles.push(new G.Projectile(s.game, {
            x: x, y: Math.max(8, s.body.y - 300), vx: (Math.random() - 0.5) * 40, vy: 300,
            grav: 420, dmg: s.dmg * 0.7, r: 6, kind: 'shard', owner: s, life: 5, col: '#ff9a5a'
          }));
        }
      }
    },
    summonHusks: {
      tell: 0.66, act: 0.28, rec: 0.72, poseW: 'atk3a', poseS: 'slam',
      phase: 3,
      onStrike: function (s) {
        G.Audio.play('bossRoar');
        var b = s.body, g = s.game;
        for (var i = 0; i < 2; i++)
          g.spawnEnemy('grunt', b.cx() + (i ? 100 : -100), b.y + b.h - 8, { spawn: true, tier: 3, patrol: 70 });
        g.particles.shockwave(b.cx(), b.cy(), 170, '#ff8a5a');
        shake(s, 8);
      }
    }
  };

  /* ---------------------------------------------------------- boss defs -- */
  var DEFS = {
    warden: {
      key: 'warden',
      name: 'THE WARDEN OF ASH',
      title: 'Keeper of the Ashen Gate',
      hp: 640, w: 36, h: 58, dmg: 22, xp: 420, gold: 220,
      speed: 96, poise: 210,
      actions: WARDEN_ACTIONS,
      phaseAt: [1.0, 0.55],
      rig: {
        dark: '#221a18', mid: '#372b26', light: '#4b3a32', accent: '#c96a2a',
        weapon: 'greatsword', helm: 'horned', cape: true, cloth: '#4a1a14',
        scale: 1.42, eyeCol: '#ff6a2a', rim: 'rgba(255,180,120,0.7)'
      },
      pick: function (s, dist) {
        var r = Math.random();
        if (s.phase >= 2 && r < 0.26 && dist > 110) return 'leap';
        if (dist > 180 && r < 0.70) return 'charge';
        if (dist < 90 && r < 0.34) return 'overhead';
        if (dist < 110) return 'slash1';
        return r < 0.5 ? 'charge' : 'slash1';
      }
    },
    choir: {
      key: 'choir',
      name: 'THE HOLLOW CHOIR',
      title: 'Voice Beneath the Vault',
      hp: 760, w: 30, h: 52, dmg: 24, xp: 620, gold: 320,
      speed: 110, poise: 180, flying: true,
      actions: CHOIR_ACTIONS,
      phaseAt: [1.0, 0.5],
      rig: {
        dark: '#1d1830', mid: '#2b2344', light: '#3d3160', accent: '#9a6ad0',
        weapon: 'staff', helm: 'crown', cape: true, cloth: '#2a1840',
        scale: 1.30, eyeCol: '#c08aff', rim: 'rgba(200,160,255,0.75)'
      },
      pick: function (s, dist) {
        var r = Math.random();
        if (s.phase >= 2 && r < 0.22) return 'storm';
        if (s.game.enemies.length < 4 && r < 0.20) return 'summon';
        if (dist < 120 && r < 0.55) return 'blink';
        if (dist > 200 && r < 0.34) return 'lance';
        return r < 0.55 ? 'volley' : 'blink';
      }
    },
    valdris: {
      key: 'valdris',
      name: 'KING VALDRIS, THE HOLLOW CROWN',
      title: 'He Who Would Not Die',
      hp: 1180, w: 38, h: 60, dmg: 26, xp: 1400, gold: 800,
      speed: 118, poise: 260,
      actions: VALDRIS_ACTIONS,
      phaseAt: [1.0, 0.66, 0.33],
      rig: {
        dark: '#1c1a24', mid: '#2e2a3a', light: '#443e56', accent: '#e0b64a',
        weapon: 'greatsword', helm: 'crown', cape: true, cloth: '#5a1626',
        scale: 1.48, eyeCol: '#ffd36b', rim: 'rgba(255,220,150,0.8)'
      },
      pick: function (s, dist) {
        var r = Math.random();
        if (s.phase >= 3) {
          if (r < 0.20) return 'whirl';
          if (r < 0.34) return 'meteor';
          if (r < 0.44 && s.game.enemies.length < 3) return 'summonHusks';
        }
        if (s.phase >= 2) {
          if (r < 0.20) return 'fissure';
          if (r < 0.36 && dist > 130) return 'dive';
        }
        if (dist > 200) return r < 0.6 ? 'thrust' : 'dive';
        if (dist < 110) return r < 0.75 ? 'combo1' : 'thrust';
        return r < 0.5 ? 'combo1' : 'thrust';
      }
    }
  };

  /* ------------------------------------------------------------- class --- */
  function Boss(game, kind, x, y, opts) {
    opts = opts || {};
    var d = DEFS[kind] || DEFS.warden;
    this.game = game;
    this.kind = kind;
    this.def = d;
    this.isBoss = true;
    this.tier = opts.tier || 1;

    var scale = 1 + (this.tier - 1) * 0.10;
    this.body = new G.Body(x, y - d.h, d.w, d.h);
    this.body.gravityScale = d.flying ? 0 : 1;
    this.maxHp = Math.round(d.hp * scale);
    this.hp = this.maxHp;
    this.dmg = d.dmg * scale;
    this.speed = d.speed;
    this.facing = -1;

    this.phase = 1;
    this.maxPhase = d.phaseAt.length;
    this.transition = 0;
    this.introT = opts.intro === false ? 0 : 2.0;
    this.spawning = 0;
    this.dead = false;
    this.deadT = 0;
    this.elite = false;
    this.aggro = true;

    this.poiseMax = d.poise;
    this.poise = this.poiseMax;
    this.staggerT = 0;
    this.hurtFlash = 0;

    this.action = null;
    this.actName = '';
    this.actPhase = '';
    this.actT = 0;
    this.actHitDone = false;
    this.actCd = 0.9;
    this.nextChain = null;

    this.animT = 0;
    this.runCycle = 0;
    this.state = 'idle';
    this.eyeGlow = 0.4;
    this.lanceOn = 0;
    this.lanceAim = 0;
    this.whirlSpin = 0;
    this.hoverPhase = 0;
    this.homeY = y - d.h;

    this.rig = A.makeRig(d.rig);
    this.pose = P.idle;
  }

  Boss.DEFS = DEFS;

  Boss.prototype.hurtbox = function () {
    var b = this.body;
    return { x: b.x - 3, y: b.y - 3, w: b.w + 6, h: b.h + 6 };
  };

  Boss.prototype.forceStagger = function (dur) {
    this.staggerT = Math.max(this.staggerT, dur);
    this.action = null; this.actPhase = ''; this.nextChain = null;
    this.state = 'stagger';
    this.game.floatText.add(this.body.cx(), this.body.y - 14, 'STAGGERED', '#ffd76b', 15);
  };

  Boss.prototype.onPoiseBreak = function () { this.forceStagger(1.15); };

  Boss.prototype.stagger = function (dur) {
    // parry stagger — shorter on bosses, but a real punish window
    this.forceStagger(Math.min(dur, 0.85));
  };

  Boss.prototype.takeDamage = function (amount, dirX, opts) {
    opts = opts || {};
    if (this.dead) return 'dead';
    if (this.transition > 0 || this.introT > 0) return 'iframe';

    // staggered bosses take extra damage — rewards the parry
    if (this.staggerT > 0) amount *= 1.45;

    this.hp -= amount;
    this.hurtFlash = 1;
    this.poise -= amount + (opts.heavy ? 26 : 0);

    var kb = (opts.kb || 200) * 0.10;
    this.body.vx += M.sign(dirX || 1) * kb;

    this.game.floatText.add(this.body.cx() + (Math.random() - 0.5) * 14, this.body.y - 6,
      Math.round(amount), opts.heavy ? '#ffd76b' : '#ffffff', opts.heavy ? 17 : 13);

    if (this.poise <= 0) { this.poise = this.poiseMax; this.onPoiseBreak(); }

    // phase gate
    var frac = this.hp / this.maxHp;
    if (this.phase < this.maxPhase && frac <= this.def.phaseAt[this.phase]) {
      this.enterPhase(this.phase + 1);
    }
    if (this.hp <= 0) this.die(dirX);
    return 'hit';
  };

  Boss.prototype.enterPhase = function (n) {
    this.phase = n;
    // Keep the phase spectacle brisk enough that the boss never feels stuck
    // in an invulnerable transition after a threshold is crossed.
    // Hit-stop also pauses this timer, so keep the visible transition short
    // enough that combat cannot leave the boss immune for an excessive time.
    this.transition = 0.9;
    this.action = null; this.actPhase = ''; this.nextChain = null;
    this.staggerT = 0;
    this.poise = this.poiseMax;
    this.hp = Math.max(this.hp, 1);
    var g = this.game, b = this.body;
    g.camera.addShake(20);
    g.flash.pop(0.5, '#ffd0a0');
    g.hitstop.add(0.22, 0.05);
    g.particles.shockwave(b.cx(), b.cy(), 300, '#ffcf8a');
    for (var i = 0; i < 60; i++) {
      var a = Math.random() * 6.28, sp = 120 + Math.random() * 420;
      g.particles.spawn({
        x: b.cx(), y: b.cy(), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.5 + Math.random() * 0.6, size: 2 + Math.random() * 4,
        col: Math.random() < 0.5 ? '#ffd76b' : '#ff8a4a', kind: 1, drag: 2.2, glow: 1
      });
    }
    G.Audio.play('bossRoar');
    g.floatText.add(b.cx(), b.y - 24, 'PHASE ' + n, '#ffd76b', 20, -30);
    // each phase makes the boss meaner
    this.speed = this.def.speed * (1 + (n - 1) * 0.16);
    this.dmg = this.def.dmg * (1 + (n - 1) * 0.13) * (1 + (this.tier - 1) * 0.10);
  };

  Boss.prototype.die = function () {
    if (this.dead) return;
    this.dead = true; this.deadT = 0; this.hp = 0;
    var g = this.game, b = this.body;
    g.camera.addShake(24);
    g.flash.pop(0.75, '#fff2d0');
    g.hitstop.add(0.35, 0.03);
    g.particles.death(b.cx(), b.cy(), this.rig.mid);
    g.particles.shockwave(b.cx(), b.cy(), 360, '#fff2d0');
    G.Audio.play('bossRoar');
    g.grantXp(Math.round(this.def.xp * (1 + (this.tier - 1) * 0.2)), b.cx(), b.cy());
    g.spawnGold(b.cx(), b.cy(), Math.round(this.def.gold * (g.player.fortuneMul || 1)));
    g.onBossKilled(this);
  };

  /* ------------------------------------------------------------ update -- */
  Boss.prototype.update = function (dt, world) {
    var g = this.game, p = g.player, b = this.body, d = this.def;
    this.animT += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3.2);

    if (this.dead) {
      this.deadT += dt;
      if (!d.flying) { b.applyGravity(dt); b.vx = M.approach(b.vx, 0, 700 * dt); b.move(world, dt); }
      this.pose = A.mix(this.pose, P.dead, Math.min(1, dt * 5));
      if (this.deadT < 2.2 && Math.random() < 0.35) {
        g.particles.spawn({
          x: b.cx() + (Math.random() - 0.5) * b.w, y: b.y + Math.random() * b.h,
          vx: (Math.random() - 0.5) * 60, vy: -70 - Math.random() * 130,
          life: 0.6, size: 2 + Math.random() * 5, col: '#ffcf8a', kind: 1, drag: 1.6, glow: 1
        });
      }
      return;
    }

    /* intro: roar, no attacks */
    if (this.introT > 0) {
      this.introT -= dt;
      if (Math.abs(this.introT - 1.3) < dt) { G.Audio.play('bossRoar'); g.camera.addShake(12); }
      b.vx = M.approach(b.vx, 0, 600 * dt);
      if (p) this.facing = M.sign(p.body.cx() - b.cx()) || this.facing;
      this.pose = A.mix(this.pose, this.introT > 0.9 ? P.atk3a : P.idle, Math.min(1, dt * 6));
      this.physics(dt, world);
      this.eyeGlow = 0.5 + Math.sin(this.animT * 9) * 0.25;
      return;
    }

    /* phase transition: invulnerable, staggered open */
    if (this.transition > 0) {
      this.transition -= dt;
      b.vx = M.approach(b.vx, 0, 800 * dt);
      this.pose = A.mix(this.pose, this.transition > 0.7 ? P.atk3a : P.idle, Math.min(1, dt * 6));
      this.physics(dt, world);
      this.eyeGlow = 1.2;
      if (Math.random() < 0.5) {
        g.particles.ember(b.cx() + (Math.random() - 0.5) * b.w, b.y + b.h);
      }
      return;
    }

    if (this.poise < this.poiseMax) this.poise = Math.min(this.poiseMax, this.poise + this.poiseMax * 0.28 * dt);
    this.actCd = Math.max(0, this.actCd - dt);

    if (this.staggerT > 0) {
      this.staggerT -= dt;
      this.state = 'stagger';
      b.vx = M.approach(b.vx, 0, 400 * dt);
      this.pose = A.mix(this.pose, P.hurt, Math.min(1, dt * 16));
      this.physics(dt, world);
      this.eyeGlow = 0.15;
      if (this.staggerT <= 0) { this.state = 'idle'; this.actCd = 0.35; }
      return;
    }

    var alive = p && !p.dead;
    var dx = alive ? p.body.cx() - b.cx() : 0;
    var dist = alive ? M.len(dx, p.body.cy() - b.cy()) : 999;

    /* ------------------------------------------------------ action runner */
    if (this.action) {
      var a = this.action;
      this.actT += dt;
      if (this.actPhase === 'tell') {
        var kt = M.clamp(this.actT / a.tell, 0, 1);
        if (a.onTell) a.onTell(this, dt, kt);
        else if (alive && kt < 0.55) this.facing = M.sign(dx) || this.facing;
        b.vx = M.approach(b.vx, 0, 700 * dt);
        if (this.actT >= a.tell) {
          this.actPhase = 'act'; this.actT = 0; this.actHitDone = false;
          if (a.onStrike) a.onStrike(this);
          if (a.move) b.vx = this.facing * a.move;
        }
      } else if (this.actPhase === 'act') {
        var ka = M.clamp(this.actT / a.act, 0, 1);
        if (a.onActive) a.onActive(this, dt, ka);
        if (this.actT >= a.act) {
          this.actPhase = 'rec'; this.actT = 0;
          if (a.onEnd) a.onEnd(this);
        }
      } else {
        b.vx = M.approach(b.vx, 0, 600 * dt);
        if (this.actT >= a.rec) {
          var chainTo = a.chain;
          this.action = null; this.actPhase = '';
          // chain into the follow-up if the player is still in range
          if (chainTo && Math.abs(dx) < 130 && Math.random() < 0.82) this.startAction(chainTo);
          else this.actCd = 0.45 + Math.random() * 0.55;
        }
      }
      this.updatePose(dt);
      this.physics(dt, world);
      this.eyeGlow = 0.35 + (this.actPhase === 'tell' ? M.clamp(this.actT / this.action_tell(), 0, 1) * 0.9 : 0.3);
      return;
    }

    /* --------------------------------------------------------- approach -- */
    this.state = 'chase';
    if (alive) this.facing = M.sign(dx) || this.facing;

    if (this.actCd <= 0 && alive) {
      var name = d.pick(this, dist);
      var chosen = d.actions[name];
      // respect phase gating on actions
      if (chosen && chosen.phase && this.phase < chosen.phase) name = d.flying ? 'volley' : 'combo1';
      if (!d.actions[name]) name = Object.keys(d.actions)[0];
      this.startAction(name);
    } else {
      var want = 0;
      if (dist > 90) want = M.sign(dx);
      else if (dist < 52) want = -M.sign(dx);
      if (!d.flying && want !== 0) {
        var ax = b.cx() + want * (b.w * 0.6 + 8);
        var ty = Math.floor((b.y + b.h + 8) / K.TILE);
        if (!world.isSolid(Math.floor(ax / K.TILE), ty) && !world.isPlatform(Math.floor(ax / K.TILE), ty)) want = 0;
      }
      b.vx = M.approach(b.vx, want * this.speed, 800 * dt);
    }

    this.updatePose(dt);
    this.physics(dt, world);
    this.eyeGlow = 0.4 + Math.sin(this.animT * 3) * 0.1;
  };

  Boss.prototype.action_tell = function () { return this.action ? Math.max(0.01, this.action.tell) : 1; };

  Boss.prototype.startAction = function (name) {
    var a = this.def.actions[name];
    if (!a) return;
    this.action = a; this.actName = name;
    this.actPhase = 'tell'; this.actT = 0;
    this.actHitDone = false;
    if (a.onStart) a.onStart(this);
  };

  Boss.prototype.physics = function (dt, world) {
    var b = this.body, d = this.def;
    if (d.flying) {
      var p = this.game.player;
      var targetY = p && !p.dead ? p.body.cy() - 54 : this.homeY;
      var bob = Math.sin(this.animT * 1.9 + this.hoverPhase) * 14;
      if (this.actPhase !== 'act') b.vy = M.damp(b.vy, ((targetY + bob) - b.cy()) * 2.6, 6, dt);
      b.move(world, dt);
    } else {
      b.applyGravity(dt);
      b.move(world, dt);
    }
    if (b.y > world.pixelH() + 200) { b.y = world.pixelH() - b.h - K.TILE * 3; b.vy = 0; }
  };

  Boss.prototype.updatePose = function (dt) {
    var target, blend = 14, a = this.action;
    if (a && this.actPhase) {
      var pw = P[a.poseW] || P.atk1a, ps = P[a.poseS] || P.atk1b;
      if (this.actPhase === 'tell') {
        target = A.mix(P.idle, pw, M.easeOutCubic(M.clamp(this.actT / a.tell, 0, 1)));
        blend = 24;
      } else if (this.actPhase === 'act') {
        target = A.mix(pw, ps, M.easeOutCubic(M.clamp(this.actT / a.act, 0, 1)));
        blend = 40;
      } else {
        target = A.mix(ps, P.idle, M.smoothstep(M.clamp(this.actT / a.rec, 0, 1)));
        blend = 14;
      }
    } else if (Math.abs(this.body.vx) > 24) {
      this.runCycle += dt * (3.6 + Math.abs(this.body.vx) / 74);
      var ph = Math.sin(this.runCycle) * 0.5 + 0.5;
      target = A.mix(P.run, P.runB, ph);
      target.bob = Math.abs(Math.cos(this.runCycle)) * -2.4;
      blend = 16;
    } else {
      target = A.mix(P.idle, P.idle, 0);
      target.bob = Math.sin(this.animT * 1.5) * 1.4;
      blend = 8;
    }
    if (!this.body.onGround && !this.def.flying) target = A.mix(target, this.body.vy < 0 ? P.jump : P.fall, 0.6);
    this.pose = A.mix(this.pose, target, Math.min(1, blend * dt));
    this.pose.capeA = M.lerp(this.pose.capeA, 0.3 + M.clamp(Math.abs(this.body.vx) / 240, 0, 1.4), Math.min(1, dt * 7));
  };

  Boss.prototype.snapshotPose = function () {
    var o = {}; for (var k in this.pose) o[k] = this.pose[k];
    return o;
  };

  /* -------------------------------------------------------------- draw -- */
  Boss.prototype.draw = function (ctx) {
    var b = this.body, d = this.def;
    var alpha = this.dead ? Math.max(0, 1 - this.deadT / 2.6) : 1;
    if (this.blinkFade) alpha *= 0.25;

    var flat = null;
    if (this.hurtFlash > 0.5) flat = 'rgba(255,245,240,0.95)';
    if (this.transition > 0 && Math.floor(this.transition * 14) % 2 === 0) flat = 'rgba(255,220,170,0.9)';

    // ground shadow anchors the big silhouette
    if (!d.flying) {
      ctx.save();
      ctx.globalAlpha = 0.35 * alpha;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(b.cx(), b.y + b.h - 1, b.w * 0.85, 5, 0, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    if (this.actName === 'whirl' && this.actPhase === 'act') {
      // spin visual: squash-rotate the whole rig
      ctx.translate(b.cx(), b.cy());
      ctx.scale(Math.cos(this.whirlSpin) >= 0 ? 1 : -1, 1);
      ctx.translate(-b.cx(), -b.cy());
    }
    A.drawHumanoid(ctx, this.rig, this.pose, b.cx(), b.cy() - 2, this.facing, {
      alpha: alpha, eyeGlow: this.eyeGlow, eyeCol: d.rig.eyeCol, flat: flat,
      weaponGlow: this.actPhase === 'act' ? 0.8 : 0.2,
      rimStrength: 0.6 + (this.actPhase === 'tell' ? 0.4 : 0)
    });
    ctx.restore();

    if (this.dead) return;

    /* lance beam */
    if (this.lanceOn > 0) {
      var len = 420;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var lg = ctx.createLinearGradient(b.cx(), 0, b.cx() + this.facing * len, 0);
      lg.addColorStop(0, 'rgba(220,180,255,0.95)');
      lg.addColorStop(1, 'rgba(150,90,255,0)');
      ctx.fillStyle = lg;
      var hh = 15 * (0.5 + Math.sin(this.animT * 40) * 0.1 + this.lanceOn * 0.5);
      ctx.fillRect(this.facing > 0 ? b.cx() : b.cx() - len, b.cy() - hh, len, hh * 2);
      ctx.restore();
    }
    /* lance aim line during tell */
    if (this.actName === 'lance' && this.actPhase === 'tell') {
      ctx.save();
      ctx.globalAlpha = 0.25 + this.lanceAim * 0.5;
      ctx.strokeStyle = '#c08aff';
      ctx.lineWidth = 1 + this.lanceAim * 2;
      ctx.setLineDash([9, 7]);
      ctx.beginPath();
      ctx.moveTo(b.cx(), b.cy());
      ctx.lineTo(b.cx() + this.facing * 420, b.cy());
      ctx.stroke();
      ctx.restore();
    }

    /* telegraph ring */
    if (this.actPhase === 'tell' && this.action) {
      var k = M.clamp(this.actT / this.action.tell, 0, 1);
      var warn = this.action.unblockable ? [255, 90, 60] : [255, 205, 130];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25 + k * 0.55;
      ctx.strokeStyle = 'rgba(' + warn.join(',') + ',0.95)';
      ctx.lineWidth = 2 + k * 2.5;
      ctx.beginPath();
      ctx.arc(b.cx(), b.cy(), 24 + (1 - k) * 40, 0, 6.2832);
      ctx.stroke();
      ctx.restore();
      if (this.action.unblockable) {
        ctx.save();
        ctx.globalAlpha = 0.5 + k * 0.5;
        ctx.fillStyle = '#ff8a5a';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('!', b.cx(), b.y - 16);
        ctx.restore();
      }
    }

    /* stagger prompt */
    if (this.staggerT > 0) {
      ctx.save();
      ctx.globalAlpha = 0.6 + Math.sin(this.animT * 16) * 0.3;
      ctx.fillStyle = '#ffd76b';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PUNISH', b.cx(), b.y - 14);
      ctx.restore();
    }
  };

  Boss.prototype.drawGhost = function (ctx, gh) {
    A.drawHumanoid(ctx, this.rig, gh.pose || this.pose, gh.x + gh.w * 0.5, gh.y + gh.h * 0.5 - 2, gh.facing,
      { flat: gh.col, alpha: (gh.life / gh.max) * 0.55, rim: false, eyeGlow: 0 });
  };

  Boss.prototype.lights = function (out) {
    var b = this.body;
    if (this.dead) {
      out.push({ x: b.cx(), y: b.cy(), r: 260 * Math.max(0, 1 - this.deadT / 2.2), col: [255, 210, 150], a: 0.7 });
      return;
    }
    var c = this.kind === 'choir' ? [190, 138, 255] : this.kind === 'valdris' ? [255, 210, 120] : [255, 130, 70];
    out.push({ x: b.cx(), y: b.cy() - b.h * 0.28, r: 120 + this.eyeGlow * 70, col: c, a: 0.35 + this.eyeGlow * 0.3 });
    if (this.transition > 0) out.push({ x: b.cx(), y: b.cy(), r: 380, col: [255, 200, 140], a: 0.7 });
    if (this.lanceOn > 0) out.push({ x: b.cx() + this.facing * 180, y: b.cy(), r: 260, col: [190, 138, 255], a: 0.6 });
    if (this.actPhase === 'tell' && this.action && this.action.unblockable) {
      out.push({ x: b.cx(), y: b.cy(), r: 180, col: [255, 110, 60], a: 0.45 * M.clamp(this.actT / this.action.tell, 0, 1) });
    }
  };

  return Boss;
})();
