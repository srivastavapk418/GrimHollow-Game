/* ==========================================================================
   GRIMHOLLOW  —  05_player.js
   The hero. State machine + 3-hit combo chain, dash-attack, plunge, parry,
   coyote time, jump buffering, wall-jump, stamina.
   ========================================================================== */
'use strict';

var G = (typeof G !== 'undefined') ? G : {};

G.Player = (function () {
  var K = G.K, M = G.M, A = G.Art, In = G.Input;

  /* Attack definitions. Timing in seconds; reach/height in px.
     `lunge` is the forward impulse applied on the active frame — this is what
     makes swings feel like they commit weight rather than flail in place. */
  var ATK = {
    a1: { wind: 0.055, act: 0.085, rec: 0.115, dmg: 13, reach: 38, hy: 30, off: 16, lunge: 145, kb: 165, heavy: false, stam: 0 },
    a2: { wind: 0.055, act: 0.085, rec: 0.135, dmg: 15, reach: 40, hy: 32, off: 17, lunge: 160, kb: 180, heavy: false, stam: 0 },
    a3: { wind: 0.125, act: 0.110, rec: 0.245, dmg: 29, reach: 46, hy: 44, off: 19, lunge: 210, kb: 330, heavy: true, stam: 0 },
    air: { wind: 0.055, act: 0.100, rec: 0.130, dmg: 15, reach: 40, hy: 38, off: 15, lunge: 60, kb: 190, heavy: false, stam: 0 },
    dash: { wind: 0.030, act: 0.115, rec: 0.155, dmg: 21, reach: 46, hy: 32, off: 20, lunge: 460, kb: 250, heavy: false, stam: 8 },
    plunge: { wind: 0.10, act: 0.001, rec: 0.20, dmg: 34, reach: 74, hy: 40, off: 0, lunge: 0, kb: 380, heavy: true, stam: 10 }
  };

  function Player(game, x, y) {
    this.game = game;
    this.body = new G.Body(x, y, 22, 42);
    this.facing = 1;
    this.state = 'idle';
    this.stateT = 0;
    this.animT = 0;
    this.runCycle = 0;

    this.maxHp = K.BASE_HP;
    this.hp = this.maxHp;
    this.maxStam = K.BASE_STAMINA;
    this.stam = this.maxStam;
    this.stamDelay = 0;

    this.coyote = 0;
    this.jumpBuf = 0;
    this.jumpHeld = false;
    this.jumpsLeft = 1;
    this.airDashUsed = false;
    this.wallLock = 0;
    this.lastWallDir = 0;

    this.dashT = 0;
    this.dashCd = 0;
    this.iframe = 0;
    this.invuln = 0;

    this.atk = null;         // active attack def
    this.atkName = '';
    this.atkPhase = '';
    this.atkT = 0;
    this.atkHit = null;      // Set of entities already struck by this swing
    this.comboStep = 0;
    this.comboTimer = 0;
    this.atkBuffer = 0;
    this.didLunge = false;

    this.blocking = false;
    this.blockT = 0;
    this.parryFlash = 0;
    this.blockBreak = 0;

    this.hurtT = 0;
    this.dead = false;
    this.deadT = 0;

    this.plunging = false;
    this.plungeCharge = 0;

    this.weaponGlow = 0;
    this.eyeGlow = 0.35;
    this.lanternPhase = Math.random() * 6.28;
    this.footstepT = 0;

    this.rig = A.makeRig({
      dark: '#171422', mid: '#272033', light: '#3a3049',
      accent: '#c98a3f', cloth: '#5c1a28', cape: true,
      weapon: 'sword', helm: 'hood', rim: 'rgba(200,225,255,0.75)',
      scale: 1.0
    });
    this.pose = A.P.idle;
    this.lastPose = A.P.idle;
  }

  Player.prototype.applyStats = function (save) {
    var st = save.stats;
    this.maxHp = K.BASE_HP + st.vitality * 22;
    this.maxStam = K.BASE_STAMINA + st.stamina * 18;
    this.powerMul = 1 + st.power * 0.16;
    this.speedMul = 1 + st.speed * 0.055;
    this.fortuneMul = 1 + st.fortune * 0.22;
    this.focusMul = 1 + st.focus * 0.18;      // stamina regen + parry window
    this.abilities = save.abilities;
    this.hp = Math.min(this.hp || this.maxHp, this.maxHp);
    this.stam = this.maxStam;
  };

  Player.prototype.resetForLevel = function (x, y) {
    this.body.x = x; this.body.y = y;
    this.body.vx = this.body.vy = 0;
    this.hp = this.maxHp; this.stam = this.maxStam;
    this.state = 'idle'; this.dead = false; this.deadT = 0;
    this.atk = null; this.atkPhase = ''; this.comboStep = 0;
    this.iframe = 0; this.invuln = 0; this.hurtT = 0;
    this.dashT = 0; this.dashCd = 0; this.plunging = false;
    this.jumpsLeft = this.maxJumps(); this.airDashUsed = false;
    this.facing = 1;
  };

  Player.prototype.maxJumps = function () {
    return 2;
  };

  Player.prototype.centerX = function () { return this.body.cx(); };
  Player.prototype.centerY = function () { return this.body.cy(); };

  /* --------------------------------------------------------- attacking --- */

  Player.prototype.canAct = function () {
    return !this.dead && this.state !== 'hurt' && this.hurtT <= 0;
  };

  Player.prototype.startAttack = function (name) {
    var d = ATK[name];
    if (!d) return;
    if (d.stam > 0) {
      if (this.stam < d.stam) return;
      this.stam -= d.stam; this.stamDelay = K.STAM_REGEN_DELAY;
    }
    this.atk = d; this.atkName = name;
    this.atkPhase = 'wind'; this.atkT = 0;
    this.atkHit = [];
    this.didLunge = false;
    this.blocking = false;
    this.state = 'attack';
    this.weaponGlow = 1;
    G.Audio.play('swing', this.comboStep);
  };

  Player.prototype.tryAttack = function () {
    if (!this.canAct()) { this.atkBuffer = 0.16; return; }

    // Plunge: down + attack while airborne (relic-gated)
    if (!this.body.onGround && In.down('down') && this.abilities && this.abilities.plunge && !this.plunging) {
      this.startAttack('plunge');
      this.plunging = true;
      this.body.vx *= 0.2; this.body.vy = -110;
      this.plungeCharge = 0;
      return;
    }
    // Dash-attack: attack while dashing (relic-gated)
    if (this.dashT > 0 && this.abilities && this.abilities.dashAttack) {
      this.dashT = 0;
      this.startAttack('dash');
      return;
    }
    if (!this.body.onGround) { this.startAttack('air'); return; }

    // Ground combo chain — window keeps the chain alive between swings
    if (this.comboTimer > 0) this.comboStep = (this.comboStep + 1) % 3;
    else this.comboStep = 0;
    this.comboTimer = 0;
    this.startAttack(['a1', 'a2', 'a3'][this.comboStep]);
  };

  Player.prototype.attackHitbox = function () {
    if (!this.atk || this.atkPhase !== 'active') return null;
    var d = this.atk;
    if (this.atkName === 'plunge') {
      // ground-slam AoE centred on the feet
      return { x: this.body.cx() - d.reach, y: this.body.y + this.body.h - 18, w: d.reach * 2, h: 30 };
    }
    var x = this.facing > 0 ? this.body.x + this.body.w * 0.5 + d.off * 0.2
                            : this.body.x + this.body.w * 0.5 - d.reach - d.off * 0.2;
    var y = this.body.cy() - d.hy * 0.5 + (this.atkName === 'a3' ? -4 : 0);
    return { x: x, y: y, w: d.reach, h: d.hy };
  };

  Player.prototype.spawnSlashFx = function () {
    var d = this.atk, g = this.game;
    var cx = this.body.cx() + this.facing * 14, cy = this.body.cy() - 2;
    var col = 'rgba(230,245,255,0.92)';
    if (this.atkName === 'a1') g.slashes.add({ x: cx, y: cy, r: d.reach * 0.95, a0: -1.15, a1: 0.95, life: 0.13, width: 12, col: col, dir: this.facing });
    else if (this.atkName === 'a2') g.slashes.add({ x: cx, y: cy, r: d.reach * 0.95, a0: 1.0, a1: -1.15, life: 0.13, width: 12, col: col, dir: this.facing });
    else if (this.atkName === 'a3') g.slashes.add({ x: cx, y: cy - 4, r: d.reach * 1.05, a0: -1.9, a1: 1.15, life: 0.20, width: 19, col: 'rgba(255,236,200,0.95)', dir: this.facing });
    else if (this.atkName === 'dash') g.slashes.add({ x: cx, y: cy, r: d.reach, a0: -0.5, a1: 0.5, life: 0.16, width: 22, col: 'rgba(190,235,255,0.95)', dir: this.facing });
    else if (this.atkName === 'air') g.slashes.add({ x: cx, y: cy, r: d.reach, a0: -1.5, a1: 1.5, life: 0.16, width: 14, col: col, dir: this.facing });
    else if (this.atkName === 'plunge') {
      g.particles.shockwave(this.body.cx(), this.body.y + this.body.h, 150, '#ffd08a');
      g.particles.rubble(this.body.cx(), this.body.y + this.body.h, 18);
      g.particles.landPuff(this.body.cx(), this.body.y + this.body.h, true);
      g.camera.addShake(13);
      G.Audio.play('slam');
    }
    // faint air-displacement puff
    g.particles.dust(cx + this.facing * 10, cy, 4, 14, 'rgba(200,220,255,0.22)');
  };

  Player.prototype.resolveAttackHits = function () {
    var hb = this.attackHitbox();
    if (!hb) return;
    var g = this.game, hits = 0;
    for (var i = 0; i < g.enemies.length; i++) {
      var e = g.enemies[i];
      if (e.dead || e.spawning > 0) continue;
      if (this.atkHit.indexOf(e) >= 0) continue;
      var eb = e.hurtbox ? e.hurtbox() : { x: e.body.x, y: e.body.y, w: e.body.w, h: e.body.h };
      if (!M.aabb(hb.x, hb.y, hb.w, hb.h, eb.x, eb.y, eb.w, eb.h)) continue;
      this.atkHit.push(e);
      var dmg = this.atk.dmg * (this.powerMul || 1);
      var dir = M.sign(e.body.cx() - this.body.cx()) || this.facing;
      var res = e.takeDamage(dmg, dir, {
        kb: this.atk.kb, heavy: this.atk.heavy, source: this,
        plunge: this.atkName === 'plunge'
      });
      hits++;
      if (res === 'blocked') {
        g.particles.hitSparks(eb.x + eb.w * 0.5 - dir * 10, this.body.cy(), dir, false);
        g.hitstop.add(0.06);
        g.camera.addShake(3);
        G.Audio.play('block');
        // shields bounce you back — teaches you to go around
        this.body.vx = -dir * 190;
        continue;
      }
      var px = M.clamp(this.body.cx() + this.facing * 26, eb.x, eb.x + eb.w);
      g.particles.hitSparks(px, this.body.cy() - 2, this.facing, this.atk.heavy);
      g.particles.blood(px, this.body.cy() - 2, this.facing, this.atk.heavy ? 16 : 9);
      g.hitstop.add(this.atk.heavy ? K.HITSTOP_HEAVY : K.HITSTOP);
      g.camera.addShake(this.atk.heavy ? 8.5 : 4.5);
      g.flash.pop(this.atk.heavy ? 0.16 : 0.07, '#fff2d8');
      G.Audio.play(this.atk.heavy ? 'crit' : 'hit', this.atk.heavy);
      // A landed hit refunds a sliver of stamina — rewards aggression.
      this.stam = Math.min(this.maxStam, this.stam + 5);
    }
    if (hits && !this.body.onGround && this.atkName === 'air') {
      this.body.vy = Math.min(this.body.vy, -150);   // small pogo on air hit
      this.jumpsLeft = Math.max(this.jumpsLeft, 1);
    }
  };

  /* ------------------------------------------------------------ damage --- */

  Player.prototype.takeDamage = function (amount, dirX, opts) {
    opts = opts || {};
    if (this.dead) return 'dead';
    if (this.iframe > 0 || this.invuln > 0) return 'iframe';

    var g = this.game;
    var fromFront = (dirX === 0) || (M.sign(dirX) === -this.facing) || (M.sign(dirX) === this.facing ? false : true);
    // dirX is the direction the hit pushes the player. Facing the source means
    // the push direction is opposite to our facing.
    fromFront = (M.sign(dirX) !== this.facing) || dirX === 0;

    if (this.blocking && fromFront) {
      var pw = K.PARRY_WINDOW * (this.focusMul || 1);
      if (this.blockT <= pw && !opts.unblockable) {
        // ---- PERFECT PARRY ----
        this.parryFlash = 1;
        this.stam = Math.min(this.maxStam, this.stam + 28);
        g.particles.parryBurst(this.body.cx() + this.facing * 18, this.body.cy());
        g.hitstop.add(0.15, 0.02);
        g.camera.addShake(9);
        g.flash.pop(0.42, '#dff2ff');
        g.floatText.add(this.body.cx(), this.body.y - 8, 'PARRY', '#bfe8ff', 15);
        G.Audio.play('parry');
        if (opts.source && opts.source.stagger) opts.source.stagger(K.PARRY_STUN);
        this.body.vx = -M.sign(dirX || -this.facing) * 90;
        this.iframe = 0.28;
        g.onParry();
        return 'parried';
      }
      if (!opts.unblockable && this.stam >= K.STAM_BLOCK) {
        // ---- CHIP BLOCK ----
        this.stam -= K.STAM_BLOCK; this.stamDelay = K.STAM_REGEN_DELAY;
        amount *= 0.25;
        g.particles.hitSparks(this.body.cx() + this.facing * 16, this.body.cy(), this.facing, false);
        g.camera.addShake(4);
        G.Audio.play('block');
        this.hp -= amount;
        this.body.vx = M.sign(dirX || -this.facing) * 150;
        this.iframe = 0.20;
        if (this.stam < K.STAM_BLOCK) {
          this.blockBreak = 0.6; this.blocking = false;
          g.floatText.add(this.body.cx(), this.body.y - 8, 'GUARD BROKEN', '#ff9a5a', 12);
        }
        if (this.hp <= 0) this.die();
        return 'blocked';
      }
    }

    /* ---- full hit ---- */
    this.hp -= amount;
    this.iframe = K.INVULN_ON_HIT;
    this.hurtT = 0.28;
    this.state = 'hurt';
    this.atk = null; this.atkPhase = ''; this.plunging = false;
    this.blocking = false;
    this.dashT = 0;
    var kb = opts.kb == null ? 220 : opts.kb;
    this.body.vx = M.sign(dirX || -this.facing) * kb;
    this.body.vy = Math.min(this.body.vy, -190);

    g.particles.blood(this.body.cx(), this.body.cy(), M.sign(dirX || 1), 18);
    g.hitstop.add(0.09);
    g.camera.addShake(11);
    g.flash.pop(0.30, '#ff5a4a');
    g.flash.hurt();
    g.floatText.add(this.body.cx(), this.body.y - 6, '-' + Math.round(amount), '#ff8a7a', 14);
    G.Audio.play('hurt');

    if (this.hp <= 0) this.die();
    return 'hit';
  };

  Player.prototype.die = function () {
    if (this.dead) return;
    this.hp = 0;
    this.dead = true;
    this.deadT = 0;
    this.state = 'dead';
    this.game.particles.death(this.body.cx(), this.body.cy(), '#3a2030');
    this.game.camera.addShake(16);
    this.game.flash.pop(0.6, '#5a0c14');
    G.Audio.play('die');
    this.game.onPlayerDeath();
  };

  Player.prototype.heal = function (amount) {
    var before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    if (this.hp > before) {
      this.game.particles.heal(this.body.cx(), this.body.cy());
      this.game.floatText.add(this.body.cx(), this.body.y - 8, '+' + Math.round(this.hp - before), '#7dffb2', 14);
      G.Audio.play('heal');
    }
  };

  Player.prototype.usePotion = function () {
    var s = this.game.save;
    if (s.potions <= 0 || this.dead) { G.Audio.play('ui'); return; }
    if (this.hp >= this.maxHp) { this.game.floatText.add(this.body.cx(), this.body.y - 8, 'FULL', '#9aa', 11); return; }
    s.potions--;
    this.heal(K.POTION_HEAL + (this.game.save.stats.focus * 8));
  };

  Player.prototype.stagger = function () { /* player has no stagger; hurt covers it */ };

  /* ------------------------------------------------------------ update --- */

  Player.prototype.update = function (dt, world) {
    var b = this.body, g = this.game;
    this.animT += dt;
    this.stateT += dt;

    if (this.dead) {
      this.deadT += dt;
      b.applyGravity(dt);
      b.vx = M.approach(b.vx, 0, 900 * dt);
      b.move(world, dt);
      this.pose = A.mix(this.pose, A.P.dead, Math.min(1, dt * 9));
      return;
    }

    /* timers */
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.iframe = Math.max(0, this.iframe - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    this.atkBuffer = Math.max(0, this.atkBuffer - dt);
    this.wallLock = Math.max(0, this.wallLock - dt);
    this.parryFlash = Math.max(0, this.parryFlash - dt * 3.2);
    this.blockBreak = Math.max(0, this.blockBreak - dt);
    this.weaponGlow = Math.max(0, this.weaponGlow - dt * 3.5);
    this.hurtT = Math.max(0, this.hurtT - dt);

    /* stamina */
    if (this.stamDelay > 0) this.stamDelay -= dt;
    else if (!this.blocking) this.stam = Math.min(this.maxStam, this.stam + K.STAM_REGEN * (this.focusMul || 1) * dt);

    /* ------------------------------------------------ input intentions --- */
    var ax = In.axis();
    var wantJump = In.consume('jump');
    if (wantJump) this.jumpBuf = K.JUMP_BUFFER;
    else this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    this.jumpHeld = In.down('jump');

    if (In.consume('attack')) this.atkBuffer = 0.18;
    if (In.consume('potion')) this.usePotion();

    /* ------------------------------------------------------- block/parry - */
    var wantBlock = In.down('block') && this.blockBreak <= 0 && this.canAct() &&
                    !this.atk && this.dashT <= 0 && this.stam > 2;
    if (wantBlock && !this.blocking) { this.blocking = true; this.blockT = 0; }
    else if (!wantBlock && this.blocking) { this.blocking = false; }
    if (this.blocking) {
      this.blockT += dt;
      // holding guard slowly drains stamina so it isn't a free turtle button
      this.stam = Math.max(0, this.stam - 6 * dt);
      if (this.stam <= 0) { this.blocking = false; this.blockBreak = 0.5; }
    }

    /* ------------------------------------------------------------ dash --- */
    if (In.consume('dash') && this.canAct() && this.dashCd <= 0 && !this.atk &&
        this.stam >= K.STAM_DASH && (b.onGround || !this.airDashUsed)) {
      this.dashT = K.DASH_TIME;
      this.dashCd = K.DASH_COOLDOWN;
      this.iframe = Math.max(this.iframe, K.DASH_IFRAME);
      this.stam -= K.STAM_DASH; this.stamDelay = K.STAM_REGEN_DELAY;
      if (ax !== 0) this.facing = ax;
      if (!b.onGround) this.airDashUsed = true;
      b.vy = Math.min(b.vy, 0) * 0.15;
      this.blocking = false;
      this.state = 'dash';
      g.particles.dashTrail(b.cx(), b.cy(), this.facing);
      g.particles.dust(b.cx() - this.facing * 12, b.y + b.h - 4, 8, 16, 'rgba(190,215,255,0.30)');
      g.camera.addShake(2.2);
      G.Audio.play('dash');
    }

    /* ---------------------------------------------------------- attack --- */
    if (this.atkBuffer > 0 && !this.atk && this.canAct() && this.dashT <= 0) {
      this.atkBuffer = 0;
      this.tryAttack();
    } else if (this.atkBuffer > 0 && this.atk && this.atkPhase === 'recover' && this.atkName !== 'plunge') {
      // chain early: buffered input during recovery starts the next swing
      this.atkBuffer = 0;
      if (b.onGround || this.atkName === 'air') {
        this.comboTimer = K.COMBO_WINDOW;
        this.tryAttack();
      }
    }

    if (this.atk) {
      this.atkT += dt;
      var d = this.atk;
      if (this.atkPhase === 'wind') {
        if (this.atkName === 'plunge') { b.vx *= 0.86; b.vy = M.approach(b.vy, -60, 900 * dt); }
        if (this.atkT >= d.wind) {
          this.atkPhase = 'active'; this.atkT = 0;
          this.spawnSlashFx();
          if (this.atkName === 'plunge') {
            this.atkPhase = 'plunging';      // falls until it hits ground
            b.vy = 1250; b.vx = 0;
          } else if (!this.didLunge) {
            this.didLunge = true;
            var lu = d.lunge * (b.onGround ? 1 : 0.6);
            b.vx += this.facing * lu;
            if (this.atkName === 'dash') b.vy = Math.min(b.vy, 0);
          }
        }
      } else if (this.atkPhase === 'plunging') {
        b.vy = 1250;
        this.plungeCharge += dt;
        if (this.plungeCharge > 0.05 && Math.random() < 0.7) {
          g.particles.spawn({
            x: b.cx() + (Math.random() - 0.5) * 16, y: b.cy(),
            vx: (Math.random() - 0.5) * 60, vy: -260 - Math.random() * 160,
            life: 0.22, size: 2 + Math.random() * 4, col: 'rgba(255,190,120,0.6)', kind: 1, drag: 2, glow: 1
          });
        }
        if (b.onGround || b.landedHard) {
          this.atkPhase = 'active'; this.atkT = 0;
          this.spawnSlashFx();
          this.resolveAttackHits();
          this.plunging = false;
        }
      } else if (this.atkPhase === 'active') {
        this.resolveAttackHits();
        if (this.atkT >= d.act) { this.atkPhase = 'recover'; this.atkT = 0; }
      } else if (this.atkPhase === 'recover') {
        if (this.atkT >= d.rec) {
          this.atk = null; this.atkPhase = '';
          this.comboTimer = K.COMBO_WINDOW;
          this.plunging = false;
        }
      }
    }

    /* ---------------------------------------------------- wall mechanics - */
    var pressingIntoWall = (b.onWall !== 0) && (ax === b.onWall);
    var wallSliding = !b.onGround && b.onWall !== 0 && b.vy > 0 && pressingIntoWall && !this.atk && this.dashT <= 0;
    if (b.onWall !== 0) this.lastWallDir = b.onWall;

    /* ------------------------------------------------------- horizontal - */
    var speed = K.RUN_SPEED * (this.speedMul || 1);
    if (this.dashT > 0) {
      this.dashT -= dt;
      b.vx = this.facing * K.DASH_SPEED;
      b.vy = 0;
      if (Math.random() < 0.85) g.ghosts.add(this, 'rgba(140,200,255,0.26)', 0.2);
      g.particles.dashTrail(b.cx(), b.cy(), this.facing);
      if (this.dashT <= 0) { b.vx *= 0.5; this.state = 'idle'; }
    } else if (this.hurtT > 0) {
      b.vx = M.approach(b.vx, 0, 700 * dt);
    } else {
      var control = 1;
      if (this.atk) control = (this.atkPhase === 'recover') ? 0.42 : 0.14;
      if (this.blocking) control = 0.32;
      var target = ax * speed * control;
      if (this.wallLock > 0) target = b.vx;   // preserve wall-jump arc briefly

      if (b.onGround) {
        if (ax !== 0) b.vx = M.approach(b.vx, target, K.RUN_ACCEL * dt);
        else b.vx = M.approach(b.vx, 0, K.RUN_FRICTION * dt);
      } else {
        var airAccel = K.AIR_ACCEL * (this.abilities && this.abilities.airControl ? 1.35 : 1);
        if (ax !== 0 && this.wallLock <= 0) b.vx = M.approach(b.vx, target, airAccel * dt);
        else b.vx = M.approach(b.vx, 0, K.AIR_DRAG * dt);
      }
      if (ax !== 0 && !this.atk && this.wallLock <= 0 && !this.blocking) this.facing = ax;
    }

    /* --------------------------------------------------------- vertical - */
    if (b.onGround) { this.coyote = K.COYOTE; this.jumpsLeft = this.maxJumps(); this.airDashUsed = false; }
    else this.coyote = Math.max(0, this.coyote - dt);

    if (wallSliding) {
      b.vy = Math.min(b.vy, K.WALL_SLIDE_SPEED);
      if (Math.random() < 0.30) {
        g.particles.spawn({
          x: b.cx() + b.onWall * 11, y: b.y + Math.random() * b.h,
          vx: -b.onWall * 25, vy: -20 - Math.random() * 40,
          life: 0.3, size: 2 + Math.random() * 3, col: 'rgba(180,170,150,0.4)', kind: 2, drag: 2
        });
      }
    }

    if (this.jumpBuf > 0 && this.canAct() && this.dashT <= 0) {
      if (this.coyote > 0 || b.onGround) {
        b.vy = K.JUMP_VEL; this.coyote = 0; this.jumpBuf = 0;
        this.jumpsLeft = this.maxJumps() - 1;
        g.particles.landPuff(b.cx(), b.y + b.h, false);
        G.Audio.play('jump');
      } else if (b.onWall !== 0 && !b.onGround) {
        b.vy = K.WALL_JUMP_Y;
        b.vx = -b.onWall * K.WALL_JUMP_X;
        this.facing = -b.onWall;
        this.wallLock = K.WALL_STICK;
        this.jumpBuf = 0;
        this.jumpsLeft = this.maxJumps() - 1;
        this.airDashUsed = false;
        g.particles.dust(b.cx() + b.onWall * 10, b.cy(), 10, 12, 'rgba(200,190,170,0.5)');
        g.camera.addShake(2);
        G.Audio.play('jump');
      } else if (this.jumpsLeft > 0) {
        this.jumpsLeft--;
        b.vy = K.DOUBLE_JUMP_VEL;
        this.jumpBuf = 0;
        // twin-wind ring so the second jump reads clearly
        g.particles.shockwave(b.cx(), b.y + b.h * 0.8, 46, '#a8d8ff');
        for (var i = 0; i < 14; i++) {
          var an = Math.random() * Math.PI * 2;
          g.particles.spawn({
            x: b.cx(), y: b.y + b.h * 0.8,
            vx: Math.cos(an) * 150, vy: Math.sin(an) * 90 + 40,
            life: 0.3, size: 2 + Math.random() * 3, col: 'rgba(170,215,255,0.6)', kind: 1, drag: 3.4, glow: 1
          });
        }
        G.Audio.play('jump');
      }
    }

    // variable jump height
    if (b.vy < 0 && !this.jumpHeld) b.vy *= Math.pow(K.JUMP_CUT, dt * 60 * 0.5) || K.JUMP_CUT;

    if (this.dashT <= 0 && this.atkPhase !== 'plunging') {
      if (wallSliding) b.vy = Math.min(b.vy + K.GRAVITY * 0.35 * dt, K.WALL_SLIDE_SPEED);
      else b.applyGravity(dt, this.jumpHeld && b.vy < 0);
    }

    /* platform drop-through */
    if (In.down('down') && b.onGround && In.pressed('jump')) b.ignorePlatforms = 0.22;

    /* --------------------------------------------------------- movement - */
    var wasGround = b.onGround;
    b.move(world, dt);

    if (!wasGround && b.onGround) {
      var hard = b.landedHard;
      g.particles.landPuff(b.cx(), b.y + b.h, hard);
      if (hard) g.camera.addShake(4.5);
      G.Audio.play('land', hard);
      this.state = 'land'; this.stateT = 0;
    }

    /* footstep dust while running */
    if (b.onGround && Math.abs(b.vx) > 80 && !this.atk) {
      this.footstepT -= dt * (Math.abs(b.vx) / 200);
      if (this.footstepT <= 0) {
        this.footstepT = 0.19;
        g.particles.dust(b.cx() - M.sign(b.vx) * 8, b.y + b.h - 2, 3, 10, 'rgba(195,182,160,0.34)');
      }
    }

    /* -------------------------------------------------------- hazards --- */
    var hz = world.rectHazard(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
    if (hz > 0 && this.iframe <= 0) {
      if (hz >= 9999) {
        this.hp = 0; this.die();
      } else {
        this.takeDamage(hz, -M.sign(b.vx) || -this.facing, { kb: 240, unblockable: true });
      }
    }
    if (b.y > world.pixelH() + 120) { this.hp = 0; this.die(); }

    /* ---------------------------------------------------------- state ---- */
    if (!this.dead) {
      if (this.hurtT > 0) this.state = 'hurt';
      else if (this.atk) this.state = 'attack';
      else if (this.dashT > 0) this.state = 'dash';
      else if (wallSliding) this.state = 'wall';
      else if (!b.onGround) this.state = b.vy < -30 ? 'jump' : 'fall';
      else if (this.blocking) this.state = 'block';
      else if (this.state === 'land' && this.stateT < 0.13) this.state = 'land';
      else if (Math.abs(b.vx) > 24) this.state = 'run';
      else this.state = 'idle';
    }

    this.eyeGlow = 0.3 + (this.atk ? 0.5 : 0) + this.parryFlash * 0.7;
    this.updatePose(dt);
  };

  /* -------------------------------------------------------- animation --- */
  Player.prototype.updatePose = function (dt) {
    var b = this.body, P = A.P, target, blend = 14;

    switch (this.state) {
      case 'run': {
        this.runCycle += dt * (5.2 + Math.abs(b.vx) / 62);
        var ph = (Math.sin(this.runCycle) * 0.5 + 0.5);
        target = A.mix(P.run, P.runB, ph);
        target.bob = Math.abs(Math.cos(this.runCycle)) * -2.2;
        blend = 20;
        break;
      }
      case 'idle': {
        var br = Math.sin(this.animT * 1.9) * 0.045;
        target = A.mix(P.idle, P.idle, 0);
        target.lean = P.idle.lean + br;
        target.bob = Math.sin(this.animT * 1.9) * 1.0;
        target.shA = P.idle.shA + br * 1.6;
        target.headA = br * 0.8;
        blend = 8;
        break;
      }
      case 'jump': target = P.jump; blend = 16; break;
      case 'fall': target = P.fall; blend = 10; break;
      case 'land': target = P.land; blend = 28; break;
      case 'wall': target = P.wall; blend = 18; break;
      case 'dash': target = P.dash; blend = 30; break;
      case 'hurt': target = P.hurt; blend = 26; break;
      case 'block':
        target = this.blockT <= K.PARRY_WINDOW * (this.focusMul || 1) ? P.parry : P.block;
        blend = 24;
        break;
      case 'attack': {
        var d = this.atk, n = this.atkName;
        var wind = n === 'a1' ? P.atk1a : n === 'a2' ? P.atk2a : n === 'a3' ? P.atk3a :
                   n === 'dash' ? P.dash : n === 'plunge' ? P.slam : P.atk1a;
        var strike = n === 'a1' ? P.atk1b : n === 'a2' ? P.atk2b : n === 'a3' ? P.atk3b :
                     n === 'dash' ? P.atk1b : n === 'plunge' ? P.slam : P.atk1b;
        var rec = n === 'a3' ? P.atk1c : P.atk1c;
        if (this.atkPhase === 'wind') {
          target = A.mix(this.pose, wind, M.easeOutCubic(this.atkT / Math.max(0.01, d.wind)));
          blend = 34;
        } else if (this.atkPhase === 'plunging') {
          target = P.slam; blend = 30;
        } else if (this.atkPhase === 'active') {
          target = A.mix(wind, strike, M.easeOutCubic(this.atkT / Math.max(0.01, d.act)));
          blend = 46;
        } else {
          target = A.mix(strike, rec, M.smoothstep(this.atkT / Math.max(0.01, d.rec)));
          blend = 16;
        }
        break;
      }
      default: target = P.idle; blend = 10;
    }

    this.pose = A.mix(this.pose, target, Math.min(1, blend * dt));
    // cape drifts with horizontal speed
    this.pose.capeA = M.lerp(this.pose.capeA, 0.2 + M.clamp(Math.abs(b.vx) / 260, 0, 1.3) + (b.onGround ? 0 : 0.4), Math.min(1, dt * 8));
  };

  Player.prototype.snapshotPose = function () {
    var o = {}; for (var k in this.pose) o[k] = this.pose[k];
    return o;
  };

  /* ------------------------------------------------------------- draw ---- */
  Player.prototype.draw = function (ctx) {
    var b = this.body;
    var flicker = 1;
    // blink while invulnerable so the i-frame window is legible
    if (this.iframe > 0 && !this.dead) {
      flicker = (Math.floor(this.iframe * 26) % 2 === 0) ? 0.35 : 0.9;
    }
    var opts = {
      alpha: flicker,
      eyeGlow: this.eyeGlow,
      eyeCol: this.parryFlash > 0.1 ? '#cfefff' : '#ffd36b',
      weaponGlow: this.weaponGlow * 0.7 + (this.atkPhase === 'active' ? 0.5 : 0),
      rimStrength: 0.55 + this.parryFlash * 0.5
    };
    A.drawHumanoid(ctx, this.rig, this.pose, b.cx(), b.cy() - 2, this.facing, opts);

    // guard glint
    if (this.blocking) {
      var pw = K.PARRY_WINDOW * (this.focusMul || 1);
      var perfect = this.blockT <= pw;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = perfect ? 0.55 : 0.22;
      var gx = b.cx() + this.facing * 17, gy = b.cy() - 2;
      var gg = ctx.createRadialGradient(gx, gy, 2, gx, gy, 26);
      gg.addColorStop(0, perfect ? 'rgba(220,245,255,0.9)' : 'rgba(150,190,220,0.6)');
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(gx, gy, 26, 0, 6.2832); ctx.fill();
      ctx.restore();
    }
  };

  Player.prototype.drawGhost = function (ctx, gh) {
    A.drawHumanoid(ctx, this.rig, gh.pose || this.pose, gh.x + gh.w * 0.5, gh.y + gh.h * 0.5 - 2, gh.facing,
                   { flat: gh.col, alpha: (gh.life / gh.max) * 0.7, rim: false, eyeGlow: 0 });
  };

  /* light sources this actor contributes */
  Player.prototype.lights = function (out, t) {
    var b = this.body;
    var fl = 1 + Math.sin(t * 8.3 + this.lanternPhase) * 0.035 + Math.sin(t * 3.1) * 0.02;
    out.push({ x: b.cx(), y: b.cy() - 4, r: 168 * fl, col: [255, 216, 160], a: 0.60 });
    if (this.atkPhase === 'active') out.push({ x: b.cx() + this.facing * 26, y: b.cy(), r: 105, col: [255, 245, 215], a: 0.7 });
    if (this.dashT > 0) out.push({ x: b.cx(), y: b.cy(), r: 96, col: [150, 205, 255], a: 0.55 });
    if (this.parryFlash > 0) out.push({ x: b.cx(), y: b.cy(), r: 190 * this.parryFlash, col: [200, 235, 255], a: 0.85 * this.parryFlash });
  };

  Player.ATK = ATK;
  return Player;
})();
