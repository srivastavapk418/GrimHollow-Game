/* ==========================================================================
   GRIMHOLLOW  —  11_game.js
   The machine: canvas setup, fixed-timestep loop, state machine, level
   lifecycle, pickups, XP/upgrades, and every callback the actors expect.
   ========================================================================== */
'use strict';

var G = (typeof G !== 'undefined') ? G : {};

G.Game = (function () {
  var M = G.M, K = G.K, T = G.T;

  var STATE = {
    LOADING: 'loading',
    TITLE: 'title',
    SELECT: 'select',
    UPGRADE: 'upgrade',
    PLAY: 'play',
    PAUSE: 'pause',
    DEAD: 'dead',
    CLEAR: 'clear',
    VICTORY: 'victory'
  };

  function Game(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.vw = 960; this.vh = 540;
    this.dpr = 1;

    this.save = G.Save.load();
    this.state = STATE.TITLE;
    this.prevState = STATE.TITLE;
    this.time = 0;
    this.overT = 0;

    this.particles = new G.Particles();
    this.camera = new G.Camera(this.vw, this.vh);
    this.floatText = new G.FloatText();
    this.slashes = new G.Slashes();
    this.ghosts = new G.Ghosts();
    this.hitstop = new G.Hitstop();
    this.flash = new G.Flash();
    this.lightPass = new G.LightPass();
    this.lights = [];

    this.world = null;
    this.terrain = null;
    this.parallax = null;
    this.level = null;
    this.levelIndex = 0;

    this.player = null;
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.boss = null;
    this.bossHidden = false;
    this.bossGhost = 1;
    this.hpGhost = 1;

    this.menu = new G.UI.Menu([]);
    this.pointerX = -1; this.pointerY = -1;

    this.comboCount = 0; this.comboTimer = 0;
    this.tipText = ''; this.tipAlpha = 0; this.tipT = 0; this.tipsShown = {};
    this.prompt = '';
    this.relicPopup = null;
    this.deathCause = '';

    this.runTime = 0; this.runKills = 0; this.runXp = 0; this.runGold = 0;
    this.runDeaths = 0; this.runSecrets = 0;
    this.checkpoint = null;
    this.arenaTriggered = false;
    this.exitOpen = false;

    this.acc = 0;
    this.last = 0;
    this.fps = 60; this.fpsAcc = 0; this.fpsN = 0;
    this.showDebug = false;
    this.paused = false;

    this.bindDOM();
    this.resize();
    this.toTitle();
  }

  Game.STATE = STATE;

  /* ==================================================== DOM / lifecycle == */

  Game.prototype.bindDOM = function () {
    var self = this;
    window.addEventListener('resize', function () { self.resize(); });
    window.addEventListener('orientationchange', function () { setTimeout(function () { self.resize(); }, 120); });

    // pointer → menus + touch controls
    function pos(ev) {
      var r = self.canvas.getBoundingClientRect();
      var t = (ev.touches && ev.touches[0]) || ev;
      return { x: (t.clientX - r.left) * (self.vw / r.width), y: (t.clientY - r.top) * (self.vh / r.height) };
    }

    this.canvas.addEventListener('mousemove', function (ev) {
      var p = pos(ev);
      self.pointerX = p.x; self.pointerY = p.y;
      if (self.inMenu()) self.menu.pointer(p.x, p.y);
    });
    this.canvas.addEventListener('mousedown', function (ev) {
      G.Audio.unlock();
      var p = pos(ev);
      if (self.inMenu()) {
        var hit = self.menu.pointer(p.x, p.y);
        if (hit >= 0 && !self.menu.items[hit].disabled) self.confirm();
      }
      ev.preventDefault();
    });

    /* --- touch: multi-finger virtual pad --- */
    var active = {};   // touch identifier -> action
    function touchStart(ev) {
      G.Audio.unlock();
      for (var i = 0; i < ev.changedTouches.length; i++) {
        var t = ev.changedTouches[i];
        var r = self.canvas.getBoundingClientRect();
        var x = (t.clientX - r.left) * (self.vw / r.width);
        var y = (t.clientY - r.top) * (self.vh / r.height);
        if (self.inMenu()) {
          var hit = self.menu.pointer(x, y);
          if (hit >= 0 && !self.menu.items[hit].disabled) self.confirm();
          continue;
        }
        var act = G.UI.touchHit(self.vw, self.vh, x, y);
        if (act) {
          active[t.identifier] = act;
          G.UI.touchState[act] = true;
          G.Input.setTouch(act, true);
        }
      }
      ev.preventDefault();
    }
    function touchEnd(ev) {
      for (var i = 0; i < ev.changedTouches.length; i++) {
        var t = ev.changedTouches[i];
        var act = active[t.identifier];
        if (act) {
          G.UI.touchState[act] = false;
          G.Input.setTouch(act, false);
          delete active[t.identifier];
        }
      }
      ev.preventDefault();
    }
    function touchMove(ev) {
      // sliding between buttons re-targets, so a thumb can roll from left to right
      for (var i = 0; i < ev.changedTouches.length; i++) {
        var t = ev.changedTouches[i];
        var r = self.canvas.getBoundingClientRect();
        var x = (t.clientX - r.left) * (self.vw / r.width);
        var y = (t.clientY - r.top) * (self.vh / r.height);
        var was = active[t.identifier];
        var now = G.UI.touchHit(self.vw, self.vh, x, y);
        if (was !== now) {
          if (was) { G.UI.touchState[was] = false; G.Input.setTouch(was, false); }
          if (now) { G.UI.touchState[now] = true; G.Input.setTouch(now, true); }
          if (now) active[t.identifier] = now; else delete active[t.identifier];
        }
      }
      ev.preventDefault();
    }
    this.canvas.addEventListener('touchstart', touchStart, { passive: false });
    this.canvas.addEventListener('touchend', touchEnd, { passive: false });
    this.canvas.addEventListener('touchcancel', touchEnd, { passive: false });
    this.canvas.addEventListener('touchmove', touchMove, { passive: false });

    window.addEventListener('blur', function () {
      if (self.state === STATE.PLAY) self.togglePause(true);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && self.state === STATE.PLAY) self.togglePause(true);
    });
  };

  Game.prototype.resize = function () {
    var w = window.innerWidth, h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Internal resolution is capped so weak phones stay at 60fps; the canvas is
    // then CSS-stretched to fill the window.
    var maxW = this.save.settings.quality === 'low' ? 860 : (this.save.settings.quality === 'high' ? 1600 : 1200);
    var scale = Math.min(1, maxW / w);
    this.vw = Math.round(w * scale);
    this.vh = Math.round(h * scale);
    this.canvas.width = this.vw;
    this.canvas.height = this.vh;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.setViewport(this.vw, this.vh);
    if (this.parallax) { this.parallax.vw = this.vw; this.parallax.vh = this.vh; }
    this.ctx.imageSmoothingEnabled = true;
  };

  /* ======================================================= state changes = */

  Game.prototype.inMenu = function () {
    return this.state === STATE.TITLE || this.state === STATE.SELECT ||
           this.state === STATE.UPGRADE || this.state === STATE.PAUSE ||
           this.state === STATE.DEAD || this.state === STATE.CLEAR ||
           this.state === STATE.VICTORY;
  };

  Game.prototype.toTitle = function () {
    this.state = STATE.TITLE;
    this.overT = 0;
    var hasSave = this.save.unlockedLevel > 0 || this.save.level > 1 || this.save.completed.some(Boolean);
    this.menu.set([
      { label: hasSave ? 'CONTINUE' : 'BEGIN', act: 'continue' },
      { label: 'THE ROAD', act: 'select', right: (this.save.unlockedLevel + 1) + '/' + G.LEVELS.length },
      { label: 'ATTUNEMENT', act: 'upgrade', right: this.availablePoints() > 0 ? '+' + this.availablePoints() : '' },
      { label: this.save.settings.muted ? 'SOUND: OFF' : 'SOUND: ON', act: 'sound' },
      { label: 'QUALITY: ' + (this.save.settings.quality || 'med').toUpperCase(), act: 'quality' },
      { label: 'ERASE PROGRESS', act: 'wipe' }
    ]);
    G.Audio.music('calm');
  };

  Game.prototype.toSelect = function () {
    this.state = STATE.SELECT;
    var items = [];
    for (var i = 0; i < G.LEVELS.length; i++) {
      items.push({ label: G.LEVELS[i].name, disabled: i > this.save.unlockedLevel, act: 'level', i: i });
    }
    this.menu.set(items);
    this.menu.index = M.clamp(this.save.unlockedLevel, 0, G.LEVELS.length - 1);
    G.Audio.music('calm');
  };

  Game.prototype.toUpgrade = function () {
    this.state = STATE.UPGRADE;
    var items = [];
    for (var i = 0; i < G.UI.STAT_INFO.length; i++) items.push({ label: G.UI.STAT_INFO[i].label, act: 'stat', i: i });
    this.menu.set(items);
  };

  Game.prototype.togglePause = function (force) {
    if (this.state === STATE.PLAY || force === true) {
      if (this.state !== STATE.PLAY) return;
      this.state = STATE.PAUSE;
      this.menu.set([
        { label: 'RESUME', act: 'resume' },
        { label: 'ATTUNEMENT', act: 'upgrade', right: this.availablePoints() > 0 ? '+' + this.availablePoints() : '' },
        { label: this.save.settings.muted ? 'SOUND: OFF' : 'SOUND: ON', act: 'sound' },
        { label: 'RESTART LEVEL', act: 'restart' },
        { label: 'ABANDON', act: 'quit' }
      ]);
      G.Audio.play('uiBig');
    } else if (this.state === STATE.PAUSE) {
      this.state = STATE.PLAY;
      G.Audio.play('ui');
    }
  };

  /* ========================================================== level load = */

  Game.prototype.startLevel = function (index, keepRunStats) {
    this.levelIndex = M.clamp(index, 0, G.LEVELS.length - 1);
    var d = G.Levels.get(this.levelIndex);
    this.level = d;

    this.world = G.Levels.world(this.levelIndex);
    this.terrain = new G.Terrain(this.world);
    this.parallax = new G.Parallax(d.biome, d.seed, this.vw, this.vh);

    var px = (d.spawn[0] + 0.5) * K.TILE - 11;
    var py = d.spawn[1] * K.TILE - 42;
    if (!this.player) this.player = new G.Player(this, px, py);
    this.player.applyStats(this.save);
    this.player.resetForLevel(px, py);

    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.pickups.length = 0;
    this.particles.clear();
    this.floatText.clear();
    this.slashes.clear();
    this.ghosts.clear();
    this.hitstop.clear();
    this.boss = null;
    this.bossHidden = false;
    this.bossGhost = 1;
    this.hpGhost = 1;
    this.arenaTriggered = false;
    this.exitOpen = !d.boss && !d.arena;
    this.checkpoint = { x: px, y: py, id: -1 };
    this.checkpointsTaken = {};
    this.secretsFound = {};
    this.tipsShown = {};
    this.tipText = ''; this.tipAlpha = 0;
    this.relicPopup = null;
    this.comboCount = 0; this.comboTimer = 0;
    this.prompt = '';

    if (!keepRunStats) {
      this.runTime = 0; this.runKills = 0; this.runXp = 0;
      this.runGold = 0; this.runDeaths = 0; this.runSecrets = 0;
    }

    // world entities
    for (var i = 0; i < (d.enemies || []).length; i++) {
      var e = d.enemies[i];
      this.spawnEnemy(e.t, (e.x + 0.5) * K.TILE, e.y * K.TILE, {
        tier: e.tier, patrol: e.patrol, elite: e.elite, face: e.face, spawn: false
      });
    }
    for (var p = 0; p < (d.pickups || []).length; p++) {
      var pk = d.pickups[p];
      this.spawnPickup(pk.t, (pk.x + 0.5) * K.TILE, pk.y * K.TILE - 14, { v: pk.v, still: true });
    }
    if (d.relic && !this.save.abilities[d.relic.id]) {
      this.pickups.push({
        kind: 'relic', relic: d.relic,
        x: (d.relic.x + 0.5) * K.TILE, y: d.relic.y * K.TILE - 22,
        vx: 0, vy: 0, t: 0, still: true, r: 16, taken: false
      });
    }
    for (var s = 0; s < (d.secrets || []).length; s++) {
      var sc = d.secrets[s];
      var sid = d.id + ':' + s;
      if (this.save.secrets.indexOf(sid) >= 0) continue;
      this.pickups.push({
        kind: 'secret', sid: sid, gold: sc.gold || 100,
        x: (sc.x + 0.5) * K.TILE, y: sc.y * K.TILE - 14,
        vx: 0, vy: 0, t: 0, still: true, r: 14, taken: false
      });
    }

    this.camera.snapTo(this.player.body.cx(), this.player.body.cy());
    this.camera.world = this.world;
    this.state = STATE.PLAY;
    this.overT = 0;
    G.Audio.music(d.boss ? 'tense' : 'calm');
    this.showTip(d.hint, 4.5);
  };

  Game.prototype.restartLevel = function () { this.startLevel(this.levelIndex, false); };

  Game.prototype.respawnAtCheckpoint = function () {
    var cp = this.checkpoint;
    this.player.applyStats(this.save);
    this.player.resetForLevel(cp.x, cp.y);
    this.projectiles.length = 0;
    this.particles.clear();
    this.slashes.clear();
    this.ghosts.clear();
    this.hitstop.clear();
    this.flash.a = 0;
    this.comboCount = 0;

    // respawn every non-boss enemy that was killed; bosses reset fully
    var d = this.level;
    this.enemies.length = 0;
    for (var i = 0; i < (d.enemies || []).length; i++) {
      var e = d.enemies[i];
      this.spawnEnemy(e.t, (e.x + 0.5) * K.TILE, e.y * K.TILE, {
        tier: e.tier, patrol: e.patrol, elite: e.elite, face: e.face, spawn: false
      });
    }
    if (this.boss) {
      this.boss = null;
      this.arenaTriggered = false;
      this.world.openGates();
      G.Audio.music('calm');
    }
    this.state = STATE.PLAY;
    this.overT = 0;
  };

  /* ============================================================ spawning = */

  Game.prototype.spawnEnemy = function (type, x, y, opts) {
    opts = opts || {};
    var e = new G.Enemy(this, type, x, y, opts);
    if (opts.spawn) {
      e.spawning = 0.55;
      this.particles.shockwave(x, y - 20, 90, '#8a6ad0');
      this.particles.death(x, y - 20, '#2a2040');
    }
    this.enemies.push(e);
    return e;
  };

  Game.prototype.spawnBoss = function () {
    var d = this.level;
    if (!d.boss || this.boss) return;
    this.boss = new G.Boss(this, d.boss.kind, (d.boss.x + 0.5) * K.TILE, d.boss.y * K.TILE, { tier: 1 });
    this.enemies.push(this.boss);
    this.world.closeGates();
    this.camera.addShake(10);
    this.flash.pop(0.3, '#ffd0a0');
    G.Audio.music('boss');
  };

  Game.prototype.spawnPickup = function (kind, x, y, opts) {
    opts = opts || {};
    this.pickups.push({
      kind: kind, x: x, y: y,
      vx: opts.still ? 0 : (Math.random() - 0.5) * 120,
      vy: opts.still ? 0 : -180 - Math.random() * 90,
      t: 0, still: !!opts.still, r: 12, taken: false,
      value: opts.v || (kind === 'gold' ? 20 : 0)
    });
  };

  Game.prototype.spawnGold = function (x, y, amount) {
    amount = Math.max(1, Math.round(amount));
    // split into a few coins so a kill feels like a payout
    var coins = M.clamp(Math.round(amount / 18), 1, 7);
    var each = Math.max(1, Math.round(amount / coins));
    for (var i = 0; i < coins; i++) {
      this.spawnPickup('gold', x + (Math.random() - 0.5) * 18, y, { v: each });
    }
  };

  /* =========================================================== callbacks = */

  Game.prototype.onParry = function () {
    this.comboTimer = 2.2;
    this.camera.zoomTarget = 1.04;
    var self = this;
    setTimeout(function () { self.camera.zoomTarget = 1; }, 150);
  };

  Game.prototype.onEnemyKilled = function (e) {
    this.runKills++;
    this.comboCount++;
    this.comboTimer = 2.2;
    if (this.comboCount > 0 && this.comboCount % 5 === 0) {
      this.floatText.add(this.player.body.cx(), this.player.body.y - 26,
        this.comboCount + ' CHAIN', '#ffd76b', 15);
    }
  };

  Game.prototype.onBossKilled = function (boss) {
    this.bossHidden = false;
    this.exitOpen = true;
    this.world.openGates();
    G.Audio.music('calm');
    var self = this;
    setTimeout(function () {
      if (self.state === STATE.PLAY) self.completeLevel();
    }, 2600);
  };

  Game.prototype.onPlayerDeath = function () {
    this.runDeaths++;
    this.save.totalDeaths++;
    G.Save.save(this.save);
    this.camera.zoomTarget = 1.10;
    var self = this;
    setTimeout(function () {
      if (self.player.dead && self.state === STATE.PLAY) self.toDeath();
    }, 1250);
  };

  Game.prototype.toDeath = function () {
    this.state = STATE.DEAD;
    this.overT = 0;
    this.camera.zoomTarget = 1;
    var hasCp = this.checkpoint && this.checkpoint.id >= 0;
    this.menu.set([
      { label: hasCp ? 'RISE AT CHECKPOINT' : 'RISE', act: 'respawn' },
      { label: 'RESTART LEVEL', act: 'restart' },
      { label: 'ATTUNEMENT', act: 'upgrade', right: this.availablePoints() > 0 ? '+' + this.availablePoints() : '' },
      { label: 'ABANDON', act: 'quit' }
    ]);
    G.Audio.music('calm');
  };

  Game.prototype.completeLevel = function () {
    var i = this.levelIndex;
    this.save.completed[i] = true;
    if (i + 1 > this.save.unlockedLevel && i + 1 < G.LEVELS.length) this.save.unlockedLevel = i + 1;

    /* Completing a stage should visibly advance the player's RPG level.
       Grant exactly one current-level XP threshold; existing enemy XP is
       preserved, so the player always gains at least one level per cleared
       stage without being given an arbitrary fixed amount. */
    var completionXp = this.xpForLevel(this.save.level);
    this.grantXp(completionXp, this.player.body.cx(), this.player.body.y);

    this.save.totalTime += this.runTime;
    G.Save.save(this.save);
    G.Audio.play('victory');

    if (i === G.LEVELS.length - 1) {
      this.state = STATE.VICTORY;
      this.overT = 0;
      this.menu.set([
        { label: 'RETURN TO THE ROAD', act: 'select' },
        { label: 'TITLE', act: 'title' }
      ]);
      G.Audio.music('calm');
      return;
    }
    this.state = STATE.CLEAR;
    this.overT = 0;
    this.menu.set([
      { label: 'NEXT: ' + G.Levels.get(i + 1).name, act: 'next' },
      { label: 'ATTUNEMENT', act: 'upgrade', right: this.availablePoints() > 0 ? '+' + this.availablePoints() : '' },
      { label: 'THE ROAD', act: 'select' }
    ]);
    G.Audio.music('calm');
  };

  /* ============================================================ progress = */

  Game.prototype.xpForLevel = function (lv) { return Math.round(100 * Math.pow(1.28, lv - 1)); };

  Game.prototype.grantXp = function (amount, x, y) {
    amount = Math.max(1, Math.round(amount * (this.player.focusMul ? 1 : 1)));
    this.save.xp += amount;
    this.runXp += amount;
    if (x != null) this.floatText.add(x, y - 18, '+' + amount + ' XP', '#9ab8ff', 12, -46);
    G.Audio.play('xp');
    var guard = 0;
    while (this.save.xp >= this.xpForLevel(this.save.level) && guard++ < 50) {
      this.save.xp -= this.xpForLevel(this.save.level);
      this.save.level++;
      this.floatText.add(this.player.body.cx(), this.player.body.y - 34,
        'LEVEL ' + this.save.level, '#ffd76b', 20, -34);
      this.particles.heal(this.player.body.cx(), this.player.body.cy());
      this.flash.pop(0.3, '#ffe6a8');
      G.Audio.play('levelup');
    }
  };

  Game.prototype.spentPoints = function () {
    var s = this.save.stats, n = 0;
    for (var k in s) n += s[k] || 0;
    return n;
  };
  Game.prototype.availablePoints = function () {
    return Math.max(0, (this.save.level - 1) - this.spentPoints());
  };
  Game.prototype.respecCost = function () { return 150 + this.spentPoints() * 40; };

  Game.prototype.spendPoint = function (statKey) {
    if (this.availablePoints() <= 0) { G.Audio.play('ui'); return false; }
    this.save.stats[statKey] = (this.save.stats[statKey] || 0) + 1;
    if (this.player) this.player.applyStats(this.save);
    G.Save.save(this.save);
    G.Audio.play('uiBig');
    return true;
  };

  Game.prototype.respec = function () {
    var cost = this.respecCost();
    if (this.save.gold < cost || this.spentPoints() === 0) { G.Audio.play('ui'); return false; }
    this.save.gold -= cost;
    for (var k in this.save.stats) this.save.stats[k] = 0;
    if (this.player) this.player.applyStats(this.save);
    G.Save.save(this.save);
    G.Audio.play('uiBig');
    return true;
  };

  Game.prototype.totalSecrets = function () {
    var n = 0;
    for (var i = 0; i < G.LEVELS.length; i++) n += (G.LEVELS[i].secrets || []).length;
    return n;
  };

  Game.prototype.fmtTime = function (s) {
    s = Math.max(0, Math.floor(s));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  };

  Game.prototype.showTip = function (text, dur) {
    if (!text) return;
    this.tipText = text;
    this.tipT = dur || 3.5;
  };

  /* =============================================================== input = */

  Game.prototype.confirm = function () {
    var it = this.menu.current();
    if (!it || it.disabled) return;
    G.Audio.unlock();
    G.Audio.play('uiBig');

    switch (it.act) {
      case 'continue':
        this.startLevel(this.save.unlockedLevel, false);
        break;
      case 'select': this.toSelect(); break;
      case 'title': this.toTitle(); break;
      case 'upgrade': this.prevState = this.state; this.toUpgrade(); break;
      case 'sound':
        this.save.settings.muted = !this.save.settings.muted;
        G.Audio.setMuted(this.save.settings.muted);
        G.Save.save(this.save);
        if (this.state === STATE.TITLE) this.toTitle(); else this.togglePauseMenuRefresh();
        break;
      case 'quality': {
        var order = ['low', 'med', 'high'];
        var cur = order.indexOf(this.save.settings.quality || 'med');
        this.save.settings.quality = order[(cur + 1) % order.length];
        G.Save.save(this.save);
        this.resize();
        this.toTitle();
        break;
      }
      case 'wipe':
        this.save = G.Save.wipe();
        if (this.player) this.player.applyStats(this.save);
        this.toTitle();
        break;
      case 'level': this.startLevel(it.i, false); break;
      case 'stat': this.spendPoint(G.UI.STAT_INFO[it.i].k); this.toUpgrade(); break;
      case 'resume': this.togglePause(); break;
      case 'restart': this.restartLevel(); break;
      case 'respawn': this.respawnAtCheckpoint(); break;
      case 'quit': this.toSelect(); break;
      case 'next': this.startLevel(this.levelIndex + 1, false); break;
    }
  };

  Game.prototype.togglePauseMenuRefresh = function () {
    if (this.state === STATE.PAUSE) {
      var idx = this.menu.index;
      this.state = STATE.PLAY;
      this.togglePause();
      this.menu.index = idx;
    }
  };

  Game.prototype.back = function () {
    G.Audio.play('ui');
    switch (this.state) {
      case STATE.SELECT: this.toTitle(); break;
      case STATE.UPGRADE:
        if (this.prevState === STATE.PAUSE) { this.state = STATE.PLAY; this.togglePause(); }
        else if (this.prevState === STATE.DEAD) this.toDeath();
        else if (this.prevState === STATE.CLEAR) this.completeLevelMenuAgain();
        else this.toSelect();
        break;
      case STATE.PAUSE: this.togglePause(); break;
      case STATE.PLAY: this.togglePause(); break;
      case STATE.DEAD: this.toSelect(); break;
      case STATE.CLEAR: this.toSelect(); break;
      case STATE.VICTORY: this.toTitle(); break;
      default: break;
    }
  };

  Game.prototype.completeLevelMenuAgain = function () {
    this.state = STATE.CLEAR;
    this.menu.set([
      { label: 'NEXT: ' + G.Levels.get(Math.min(this.levelIndex + 1, G.LEVELS.length - 1)).name, act: 'next' },
      { label: 'ATTUNEMENT', act: 'upgrade' },
      { label: 'THE ROAD', act: 'select' }
    ]);
  };

  Game.prototype.handleMenuInput = function () {
    var I = G.Input;
    if (I.pressed('up') || I.pressed('left')) this.menu.move(-1);
    if (I.pressed('down') || I.pressed('right')) this.menu.move(1);
    if (I.pressed('confirm') || I.pressed('jump') || I.pressed('attack')) this.confirm();
    if (I.pressed('pause')) this.back();

    if (this.state === STATE.SELECT && I.pressed('map')) { this.prevState = STATE.SELECT; this.toUpgrade(); }
    if (this.state === STATE.UPGRADE && I.pressed('respec')) this.respec();
  };

  /* ============================================================== update = */

  Game.prototype.update = function (dt) {
    this.time += dt;
    // Keep the simulation usable both from the browser frame loop and from
    // deterministic callers such as the headless verifier.  Previously only
    // frame() advanced hit-stop, so direct update() callers could freeze a
    // boss phase transition indefinitely after a hit.
    this.hitstop.update(dt);

    if (this.inMenu()) {
      this.overT += dt;
      this.handleMenuInput();
      if (this.state === STATE.PAUSE || this.state === STATE.DEAD ||
          this.state === STATE.CLEAR || this.state === STATE.VICTORY) {
        // keep the world's ambient motion alive behind the overlay
        this.particles.update(dt * 0.25, this.world);
        this.floatText.update(dt * 0.25);
      }
      G.Audio.tick(dt);
      return;
    }

    if (this.state !== STATE.PLAY) return;

    var I = G.Input;
    if (I.pressed('pause')) { this.togglePause(); return; }

    this.runTime += dt;

    // hitstop freezes gameplay but not UI/particles
    var hs = this.hitstop.factor();
    var wdt = dt * hs;

    this.world.update(wdt);
    this.player.update(wdt, this.world);

    /* --- enemies --- */
    for (var i = this.enemies.length - 1; i >= 0; i--) {
      var e = this.enemies[i];
      if (e.spawning > 0) { e.spawning -= wdt; continue; }
      e.update(wdt, this.world);
      if (e.dead && e.deadT > (e.isBoss ? 3.4 : 1.6)) {
        if (e === this.boss) this.boss = null;
        this.enemies.splice(i, 1);
      }
    }

    /* --- projectiles --- */
    for (var j = this.projectiles.length - 1; j >= 0; j--) {
      var pr = this.projectiles[j];
      pr.update(wdt, this.world);
      if (pr.dead) this.projectiles.splice(j, 1);
    }

    this.updatePickups(wdt);
    this.updateTriggers(wdt);

    /* --- world hazards on the player --- */
    var b = this.player.body;
    if (!this.player.dead) {
      var hd = this.world.rectHazard(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
      if (hd > 0) {
        var res = this.player.takeDamage(hd, this.player.facing * -1, { kb: 260, unblockable: true });
        if (res === 'hit') this.deathCause = 'Impaled.';
      }
      // fell out of the world
      if (b.y > this.world.pixelH() + 40) {
        this.deathCause = 'Lost to the dark.';
        this.player.hp = 0;
        this.player.die();
      }
    }

    /* --- fx / camera --- */
    this.particles.update(dt, this.world);
    this.floatText.update(dt);
    this.slashes.update(dt);
    this.ghosts.update(dt);
    this.flash.update(dt);
    this.camera.follow(this.player, dt, this.world, {});

    this.hpGhost = M.damp(this.hpGhost, this.player.hp / this.player.maxHp, 4, dt);
    if (this.boss) this.bossGhost = M.damp(this.bossGhost, this.boss.hp / this.boss.maxHp, 4, dt);

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboCount = 0;
    }
    if (this.tipT > 0) { this.tipT -= dt; this.tipAlpha = M.damp(this.tipAlpha, 1, 8, dt); }
    else this.tipAlpha = M.damp(this.tipAlpha, 0, 6, dt);
    if (this.relicPopup) {
      this.relicPopup.t += dt;
      if (this.relicPopup.t > this.relicPopup.max) this.relicPopup = null;
    }

    // ambient embers
    var bio = G.Biomes[this.level.biome];
    if (bio && Math.random() < bio.ember) {
      this.particles.ember(
        this.camera.x + Math.random() * this.vw,
        this.camera.y + this.vh + 10
      );
    }

    G.Audio.tick(dt);
  };

  /* ------------------------------------------------------------ triggers - */
  Game.prototype.updateTriggers = function (dt) {
    var d = this.level, b = this.player.body, tx = Math.floor(b.cx() / K.TILE);
    this.prompt = '';

    /* checkpoints */
    for (var c = 0; c < (d.checkpoints || []).length; c++) {
      if (this.checkpointsTaken[c]) continue;
      var cp = d.checkpoints[c];
      var cx = (cp[0] + 0.5) * K.TILE, cy = cp[1] * K.TILE;
      if (Math.abs(b.cx() - cx) < 30 && Math.abs(b.y + b.h - cy) < 60) {
        this.checkpointsTaken[c] = true;
        this.checkpoint = { x: cx - b.w * 0.5, y: cy - b.h, id: c };
        this.player.hp = this.player.maxHp;
        this.player.stam = this.player.maxStam;
        if (this.save.potions < this.save.maxPotions) this.save.potions = this.save.maxPotions;
        this.particles.heal(cx, cy - 20);
        this.particles.shockwave(cx, cy - 20, 120, '#ffd76b');
        this.floatText.add(cx, cy - 40, 'BEACON LIT', '#ffd76b', 15);
        this.flash.pop(0.22, '#ffe6a8');
        G.Audio.play('checkpoint');
        G.Save.save(this.save);
      }
    }

    /* contextual tips */
    for (var t = 0; t < (d.tips || []).length; t++) {
      if (this.tipsShown[t]) continue;
      var tp = d.tips[t];
      if (Math.abs(b.cx() - (tp.x + 0.5) * K.TILE) < 70 && Math.abs(b.cy() - tp.y * K.TILE) < 140) {
        this.tipsShown[t] = true;
        this.showTip(tp.text, 5);
      }
    }

    /* boss arena */
    if (d.arena && !this.arenaTriggered && tx >= d.arena.trigger) {
      this.arenaTriggered = true;
      if (d.boss) this.spawnBoss();
      else this.world.closeGates();
      this.showTip('', 0);
    }
    /* non-boss arena: gates reopen when the room is clear */
    if (d.arena && !d.boss && this.arenaTriggered && !this.exitOpen) {
      var alive = 0;
      for (var q = 0; q < this.enemies.length; q++) if (!this.enemies[q].dead) alive++;
      if (alive === 0) { this.exitOpen = true; this.world.openGates(); G.Audio.play('door'); }
    }

    /* exit */
    var ex = (d.exit[0] + 0.5) * K.TILE, ey = d.exit[1] * K.TILE;
    var nearExit = Math.abs(b.cx() - ex) < 34 && Math.abs(b.y + b.h - ey) < 70;
    if (nearExit) {
      if (this.exitOpen) {
        this.prompt = G.Input.hasTouch() ? 'JMP   enter the gate' : 'W  /  ↑   enter the gate';
        if (G.Input.down('up') || G.Input.down('jump')) {
          G.Audio.play('door');
          this.completeLevel();
        }
      } else {
        this.prompt = 'Sealed. Something still lives here.';
      }
    }
  };

  /* ------------------------------------------------------------- pickups - */
  Game.prototype.updatePickups = function (dt) {
    var b = this.player.body, s = this.save;
    for (var i = this.pickups.length - 1; i >= 0; i--) {
      var p = this.pickups[i];
      p.t += dt;
      if (!p.still) {
        p.vy += 1400 * dt;
        p.vx *= Math.exp(-2.2 * dt);
        var nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
        if (this.world.isSolid(Math.floor(nx / K.TILE), Math.floor(p.y / K.TILE))) { p.vx *= -0.4; nx = p.x; }
        if (this.world.isSolid(Math.floor(p.x / K.TILE), Math.floor((ny + 6) / K.TILE))) {
          p.vy *= -0.32; ny = p.y;
          if (Math.abs(p.vy) < 40) { p.vy = 0; p.still = true; }
        }
        p.x = nx; p.y = ny;
        if (p.y > this.world.pixelH() + 60) { this.pickups.splice(i, 1); continue; }
      }

      // magnet + collect
      var dx = b.cx() - p.x, dy = b.cy() - p.y;
      var dd = Math.sqrt(dx * dx + dy * dy);
      var pullR = p.kind === 'gold' ? 92 : 0;
      if (pullR && dd < pullR && dd > 1 && !this.player.dead) {
        p.x += (dx / dd) * (250 - dd * 1.4) * dt;
        p.y += (dy / dd) * (250 - dd * 1.4) * dt;
        p.still = true; p.vx = p.vy = 0;
      }

      if (dd < (p.r || 12) + 16 && !this.player.dead && !p.taken) {
        p.taken = true;
        if (p.kind === 'gold') {
          var amt = Math.round((p.value || 20) * (this.player.fortuneMul || 1));
          s.gold += amt; this.runGold += amt;
          this.floatText.add(p.x, p.y - 8, '+' + amt, '#e0b64a', 12);
          G.Audio.play('coin');
        } else if (p.kind === 'potion') {
          if (s.potions < s.maxPotions) {
            s.potions++;
            this.floatText.add(p.x, p.y - 8, 'POTION', '#4ec87a', 12);
            G.Audio.play('heal');
          } else {
            var g2 = 35;
            s.gold += g2; this.runGold += g2;
            this.floatText.add(p.x, p.y - 8, '+' + g2, '#e0b64a', 12);
            G.Audio.play('coin');
          }
        } else if (p.kind === 'relic') {
          s.abilities[p.relic.id] = true;
          this.player.applyStats(s);
          this.relicPopup = { name: p.relic.name, desc: p.relic.desc, t: 0, max: 4.2 };
          this.particles.shockwave(p.x, p.y, 220, '#ffd76b');
          this.particles.parryBurst(p.x, p.y);
          this.flash.pop(0.5, '#fff0c8');
          this.camera.addShake(9);
          G.Audio.play('levelup');
          G.Save.save(s);
        } else if (p.kind === 'secret') {
          if (s.secrets.indexOf(p.sid) < 0) s.secrets.push(p.sid);
          this.runSecrets++;
          var sg = Math.round(p.gold * (this.player.fortuneMul || 1));
          s.gold += sg; this.runGold += sg;
          this.floatText.add(p.x, p.y - 12, 'SECRET  +' + sg, '#ffd76b', 16);
          this.particles.shockwave(p.x, p.y, 170, '#ffd76b');
          this.flash.pop(0.3, '#ffe6a8');
          G.Audio.play('uiBig');
          G.Save.save(s);
        }
        this.pickups.splice(i, 1);
        continue;
      }

      if (p.kind === 'gold' && Math.random() < 0.10) {
        this.particles.spawn({
          x: p.x, y: p.y, vx: 0, vy: -18, life: 0.4, size: 1.5,
          col: '#ffe08a', kind: 0, drag: 1, glow: 1
        });
      }
    }
  };

  /* ================================================================ draw = */

  Game.prototype.draw = function () {
    var ctx = this.ctx, vw = this.vw, vh = this.vh;

    if (this.state === STATE.TITLE) { G.UI.title(ctx, this); return; }
    if (this.state === STATE.SELECT) { this.drawMenuBackdrop(); G.UI.levelSelect(ctx, this); return; }
    if (this.state === STATE.UPGRADE) { this.drawMenuBackdrop(); G.UI.upgrades(ctx, this); return; }

    if (!this.world) { G.UI.loading(ctx, vw, vh, 'Preparing'); return; }

    var cam = this.camera;
    var bio = G.Biomes[this.level.biome] || G.Biomes.ruins;

    /* 1. sky + parallax */
    this.parallax.draw(ctx, cam, this.time, this.world.pixelH());

    /* 2. world + actors, under camera transform */
    ctx.save();
    if (cam.zoom !== 1) {
      ctx.translate(vw * 0.5, vh * 0.5);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-vw * 0.5, -vh * 0.5);
    }

    this.terrain.draw(ctx, cam);
    this.terrain.drawDynamic(ctx, cam, this.time);

    var ox = cam.ox(), oy = cam.oy();

    // pickups
    ctx.save();
    ctx.translate(-ox, -oy);
    for (var i = 0; i < this.pickups.length; i++) this.drawPickup(ctx, this.pickups[i]);
    ctx.restore();

    G.Draw.ghosts(ctx, this.ghosts, cam);

    // enemies behind, then player, so the player is never hidden
    ctx.save();
    ctx.translate(-ox, -oy);
    for (var e = 0; e < this.enemies.length; e++) {
      var en = this.enemies[e];
      if (en.spawning > 0) { this.drawSpawnRift(ctx, en); continue; }
      if (!cam.visible(en.body.x - 60, en.body.y - 60, en.body.w + 120, en.body.h + 120)) continue;
      en.draw(ctx);
    }
    this.player.draw(ctx);
    for (var pj = 0; pj < this.projectiles.length; pj++) this.projectiles[pj].draw(ctx);
    ctx.restore();

    G.Draw.slashes(ctx, this.slashes, cam);
    G.Draw.particles(ctx, this.particles, cam);

    ctx.restore();

    /* 3. lighting */
    this.lights.length = 0;
    this.terrain.torchLights(this.lights, this.time);
    this.player.lights(this.lights, this.time);
    for (var l = 0; l < this.enemies.length; l++) {
      if (this.enemies[l].lights && this.enemies[l].spawning <= 0) this.enemies[l].lights(this.lights, this.time);
    }
    for (var lp = 0; lp < this.projectiles.length; lp++) {
      if (this.projectiles[lp].lights) this.projectiles[lp].lights(this.lights);
    }
    for (var pk = 0; pk < this.pickups.length; pk++) {
      var pu = this.pickups[pk];
      var col = pu.kind === 'gold' ? [255, 200, 90] : pu.kind === 'potion' ? [90, 230, 140] : [255, 220, 140];
      this.lights.push({ x: pu.x, y: pu.y, r: pu.kind === 'relic' ? 200 : 60, col: col, a: 0.5 });
    }
    this.lightPass.render(this.lights, cam, bio.ambient, vw, vh, this.save.settings.quality);
    this.lightPass.composite(ctx, vw, vh);

    /* 4. float text sits above lighting so damage numbers stay legible */
    G.Draw.floatText(ctx, this.floatText, cam);

    /* 5. post */
    G.Post.apply(ctx, vw, vh, {
      flash: this.flash,
      fog: bio.fog,
      quality: this.save.settings.quality,
      lowHealth: this.player.dead ? 0 : Math.max(0, 1 - (this.player.hp / this.player.maxHp) / 0.3) * 0.8
    });

    /* 6. HUD + overlays */
    G.UI.drawHUD(ctx, this);
    if (this.relicPopup) G.UI.relicPopup(ctx, this);

    if (this.state === STATE.PAUSE) G.UI.pause(ctx, this);
    else if (this.state === STATE.DEAD) G.UI.death(ctx, this);
    else if (this.state === STATE.CLEAR) G.UI.levelClear(ctx, this);
    else if (this.state === STATE.VICTORY) G.UI.victory(ctx, this);

    if (this.showDebug) this.drawDebug(ctx);
  };

  Game.prototype.drawMenuBackdrop = function () {
    var ctx = this.ctx;
    var g = ctx.createLinearGradient(0, 0, 0, this.vh);
    g.addColorStop(0, '#0a0810'); g.addColorStop(1, '#1d1424');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.vw, this.vh);
  };

  Game.prototype.drawSpawnRift = function (ctx, e) {
    var b = e.body, k = M.clamp(1 - e.spawning / 0.55, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var g = ctx.createRadialGradient(b.cx(), b.cy(), 0, b.cx(), b.cy(), 40 * (0.4 + k));
    g.addColorStop(0, 'rgba(190,140,255,0.8)');
    g.addColorStop(1, 'rgba(120,60,220,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(b.cx(), b.cy(), 40 * (0.4 + k), 0, 6.2832); ctx.fill();
    ctx.restore();
  };

  Game.prototype.drawPickup = function (ctx, p) {
    var bob = Math.sin(p.t * 3.4) * 3;
    ctx.save();
    if (p.kind === 'gold') {
      ctx.save();
      ctx.translate(p.x, p.y + bob * 0.5);
      ctx.scale(Math.cos(p.t * 5) * 0.5 + 0.6, 1);
      var g = ctx.createLinearGradient(-5, -5, 5, 5);
      g.addColorStop(0, '#fff0b0'); g.addColorStop(0.5, '#e0b64a'); g.addColorStop(1, '#8a6a1a');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, 6.2832); ctx.fill();
      ctx.restore();
    } else if (p.kind === 'potion') {
      ctx.translate(p.x, p.y + bob);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      G.UI.roundRect(ctx, -5, -7, 10, 14, 3); ctx.fill();
      ctx.fillStyle = '#4ec87a';
      G.UI.roundRect(ctx, -4, -4, 8, 10, 2); ctx.fill();
      ctx.fillStyle = '#8a6a4a';
      ctx.fillRect(-2.5, -9, 5, 3);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(140,255,190,0.35)';
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, 6.2832); ctx.fill();
    } else if (p.kind === 'relic') {
      ctx.translate(p.x, p.y + bob);
      ctx.rotate(Math.sin(p.t) * 0.15);
      ctx.globalCompositeOperation = 'lighter';
      var rg = ctx.createRadialGradient(0, 0, 0, 0, 0, 34);
      rg.addColorStop(0, 'rgba(255,220,140,0.55)');
      rg.addColorStop(1, 'rgba(255,180,60,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(0, 0, 34, 0, 6.2832); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#e0b64a';
      ctx.beginPath();
      ctx.moveTo(0, -13); ctx.lineTo(9, 0); ctx.lineTo(0, 13); ctx.lineTo(-9, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff4d0';
      ctx.beginPath();
      ctx.moveTo(0, -13); ctx.lineTo(0, 13); ctx.lineTo(-9, 0);
      ctx.closePath(); ctx.fill();
    } else if (p.kind === 'secret') {
      ctx.translate(p.x, p.y + bob);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + Math.sin(p.t * 4) * 0.2;
      ctx.strokeStyle = '#ffd76b';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 10 + Math.sin(p.t * 3) * 2, 0, 6.2832); ctx.stroke();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ffe6a8';
      ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  };

  Game.prototype.drawDebug = function (ctx) {
    var lines = [
      'fps ' + this.fps.toFixed(0),
      'state ' + this.state,
      'ents ' + this.enemies.length + ' proj ' + this.projectiles.length + ' part ' + this.particles.count,
      'cam ' + this.camera.x.toFixed(0) + ',' + this.camera.y.toFixed(0),
      'ply ' + this.player.body.x.toFixed(0) + ',' + this.player.body.y.toFixed(0) +
        ' (' + Math.floor(this.player.body.cx() / K.TILE) + ',' + Math.floor(this.player.body.cy() / K.TILE) + ')',
      'st ' + this.player.state + ' atk ' + (this.player.atk ? this.player.atkPhase : '-')
    ];
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(this.vw - 236, this.vh - 18 - lines.length * 14, 230, lines.length * 14 + 10);
    for (var i = 0; i < lines.length; i++) {
      G.UI.txt(ctx, lines[i], this.vw - 228, this.vh - 20 - (lines.length - 1 - i) * 14,
        { size: 11, col: '#8affc0', stroke: false });
    }
    ctx.restore();
  };

  /* ================================================================ loop = */

  Game.prototype.frame = function (now) {
    var realDt = Math.min(0.1, (now - this.last) / 1000 || 0);
    this.last = now;

    this.fpsAcc += realDt; this.fpsN++;
    if (this.fpsAcc >= 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }

    G.Input.poll();
    if (G.Input.pressed('debug')) this.showDebug = !this.showDebug;
    // fixed timestep with a bounded catch-up so physics stays deterministic
    var step = 1 / 120;
    this.acc += realDt;
    var iters = 0;
    while (this.acc >= step && iters < 8) {
      this.update(step);
      // edge-triggered inputs must fire on exactly one substep, not all of them
      G.Input.endFrame();
      this.acc -= step;
      iters++;
    }
    if (iters >= 8) this.acc = 0;
    if (iters === 0) G.Input.endFrame();

    this.draw();
  };

  Game.prototype.run = function () {
    var self = this;
    this.last = performance.now();
    function tick(now) {
      self.frame(now);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  };

  return Game;
})();

/* ================================================================= boot === */
G.boot = function () {
  var canvas = document.getElementById('game');
  if (!canvas) { console.error('grimhollow: no #game canvas'); return; }

  var game = new G.Game(canvas);
  G.game = game;

  G.Input.init();
  G.Audio.setMuted(!!game.save.settings.muted);

  // any first interaction unlocks WebAudio (browser autoplay policy)
  function unlock() {
    G.Audio.unlock();
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('mousedown', unlock);
    window.removeEventListener('touchstart', unlock);
  }
  window.addEventListener('keydown', unlock);
  window.addEventListener('mousedown', unlock);
  window.addEventListener('touchstart', unlock);

  var boot = document.getElementById('boot');
  if (boot) boot.style.display = 'none';

  game.run();
  return game;
};

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { G.boot(); });
  else G.boot();
}
