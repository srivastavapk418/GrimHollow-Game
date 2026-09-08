/* ==========================================================================
   GRIMHOLLOW  —  10_ui.js
   HUD, menus, upgrade screen, boss bar, on-screen touch controls.
   All screen-space. Menus are keyboard + mouse + touch driven through a tiny
   shared Menu helper so every screen behaves identically.
   ========================================================================== */
'use strict';

var G = (typeof G !== 'undefined') ? G : {};

G.UI = (function () {
  var M = G.M;

  var FONT = '"Segoe UI", Roboto, system-ui, -apple-system, sans-serif';
  var FONT_D = 'Georgia, "Times New Roman", serif';

  var C = {
    ink: '#e8e2d6',
    dim: '#9a9184',
    faint: '#5f594f',
    gold: '#e0b64a',
    blood: '#b8283c',
    hp: '#c4283c',
    hpBack: '#3a1119',
    stam: '#4ec8a8',
    stamBack: '#123329',
    xp: '#7ea6ff',
    panel: 'rgba(12,10,16,0.86)',
    edge: 'rgba(224,182,74,0.5)'
  };

  /* -------------------------------------------------------------- text --- */
  function txt(ctx, s, x, y, o) {
    o = o || {};
    ctx.save();
    ctx.font = (o.weight || '600') + ' ' + (o.size || 15) + 'px ' + (o.serif ? FONT_D : FONT);
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.baseline || 'alphabetic';
    if (o.glow) {
      ctx.shadowColor = o.glow;
      ctx.shadowBlur = o.glowSize || 14;
    }
    if (o.stroke !== false) {
      ctx.lineWidth = o.strokeW || 3;
      ctx.strokeStyle = o.strokeCol || 'rgba(0,0,0,0.72)';
      ctx.strokeText(s, x, y);
    }
    ctx.fillStyle = o.col || C.ink;
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.fillText(s, x, y);
    ctx.restore();
  }

  function panel(ctx, x, y, w, h, o) {
    o = o || {};
    ctx.save();
    ctx.fillStyle = o.fill || C.panel;
    roundRect(ctx, x, y, w, h, o.r == null ? 6 : o.r);
    ctx.fill();
    ctx.strokeStyle = o.edge || C.edge;
    ctx.lineWidth = o.lw || 1.5;
    ctx.stroke();
    if (o.inner !== false) {
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      roundRect(ctx, x + 3, y + 3, w - 6, h - 6, Math.max(0, (o.r == null ? 6 : o.r) - 2));
      ctx.stroke();
    }
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function bar(ctx, x, y, w, h, frac, col, back, o) {
    o = o || {};
    frac = M.clamp(frac, 0, 1);
    ctx.save();
    // backing
    ctx.fillStyle = back;
    roundRect(ctx, x, y, w, h, h * 0.35); ctx.fill();
    // ghost (recent loss) trail
    if (o.ghost != null && o.ghost > frac) {
      ctx.fillStyle = o.ghostCol || 'rgba(255,255,255,0.22)';
      roundRect(ctx, x, y, w * M.clamp(o.ghost, 0, 1), h, h * 0.35); ctx.fill();
    }
    if (frac > 0.001) {
      var g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, o.top || 'rgba(255,255,255,0.28)');
      g.addColorStop(0.35, col);
      g.addColorStop(1, o.bot || 'rgba(0,0,0,0.25)');
      ctx.fillStyle = g;
      roundRect(ctx, x, y, w * frac, h, h * 0.35); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      roundRect(ctx, x + 1, y + 1, Math.max(0, w * frac - 2), Math.max(1, h * 0.28), h * 0.2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, w, h, h * 0.35); ctx.stroke();
    ctx.restore();
  }

  /* -------------------------------------------------------------- menu --- */
  function Menu(items) {
    this.items = items || [];
    this.index = 0;
    this.rects = [];
    this.hover = -1;
  }
  Menu.prototype.set = function (items) {
    this.items = items;
    this.index = M.clamp(this.index, 0, Math.max(0, items.length - 1));
    // never park the cursor on a disabled row
    for (var i = 0; i < items.length; i++) {
      if (!items[this.index] || items[this.index].disabled) this.move(1);
      else break;
    }
  };
  Menu.prototype.move = function (d) {
    if (!this.items.length) return;
    var n = this.items.length, i = this.index;
    for (var k = 0; k < n; k++) {
      i = (i + d + n) % n;
      if (!this.items[i].disabled) { this.index = i; G.Audio.play('ui'); return; }
    }
  };
  Menu.prototype.current = function () { return this.items[this.index]; };
  Menu.prototype.pointer = function (px, py) {
    this.hover = -1;
    for (var i = 0; i < this.rects.length; i++) {
      var r = this.rects[i];
      if (!r) continue;
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
        this.hover = i;
        if (!this.items[i].disabled && this.index !== i) { this.index = i; G.Audio.play('ui'); }
        return i;
      }
    }
    return -1;
  };
  Menu.prototype.draw = function (ctx, x, y, w, gap, o) {
    o = o || {};
    this.rects.length = 0;
    var rowH = o.rowH || 40;
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      var ry = y + i * (rowH + gap);
      this.rects.push({ x: x, y: ry, w: w, h: rowH });
      var sel = i === this.index;
      var dis = !!it.disabled;

      if (sel && !dis) {
        ctx.save();
        var g = ctx.createLinearGradient(x, ry, x + w, ry);
        g.addColorStop(0, 'rgba(224,182,74,0.02)');
        g.addColorStop(0.15, 'rgba(224,182,74,0.20)');
        g.addColorStop(0.85, 'rgba(224,182,74,0.20)');
        g.addColorStop(1, 'rgba(224,182,74,0.02)');
        ctx.fillStyle = g;
        ctx.fillRect(x, ry, w, rowH);
        ctx.fillStyle = C.gold;
        ctx.fillRect(x, ry, 3, rowH);
        ctx.restore();
      }
      txt(ctx, it.label, x + 22, ry + rowH * 0.5 + 6, {
        size: o.size || 19,
        col: dis ? C.faint : (sel ? '#fff8e6' : C.dim),
        weight: sel ? '700' : '600',
        glow: sel && !dis ? 'rgba(224,182,74,0.6)' : null
      });
      if (it.right) {
        txt(ctx, it.right, x + w - 22, ry + rowH * 0.5 + 6, {
          size: (o.size || 19) - 2, align: 'right',
          col: dis ? C.faint : (sel ? C.gold : C.dim)
        });
      }
      if (sel && !dis) {
        txt(ctx, '▸', x + 8, ry + rowH * 0.5 + 6, { size: 16, col: C.gold });
      }
    }
    return y + this.items.length * (rowH + gap);
  };

  /* ------------------------------------------------------------- touch --- */
  /* User-customisable screen layout. Positions/sizes are persisted as viewport
     fractions, so the arrangement survives rotation and different phones. */
  var DEFAULT_TOUCH = {
    left:   { x: 0.055, y: 0.765, w: 0.105, h: 0.155 },
    right:  { x: 0.170, y: 0.765, w: 0.105, h: 0.155 },
    attack: { x: 0.895, y: 0.770, w: 0.090, h: 0.135, col: '#c4283c' },
    jump:   { x: 0.775, y: 0.735, w: 0.090, h: 0.135, col: '#4e8ad8' },
    dash:   { x: 0.895, y: 0.615, w: 0.090, h: 0.135, col: '#4ec8a8' },
    block:  { x: 0.775, y: 0.555, w: 0.090, h: 0.135, col: '#c8a24e' },
    potion: { x: 0.925, y: 0.465, w: 0.065, h: 0.100, col: '#4ec87a' },
    pause:  { x: 0.930, y: 0.045, w: 0.055, h: 0.085 }
  };

  var DEFAULT_HUD = {
    health: { x: 0.018, y: 0.028, w: 0.300, h: 0.115 },
    xp:     { x: 0.785, y: 0.028, w: 0.195, h: 0.085 },
    boss:   { x: 0.280, y: 0.120, w: 0.440, h: 0.100 }
  };

  var LAYOUT_META = [
    { id: 'left',   label: 'MOVE LEFT', group: 'touch', icon: '◀' },
    { id: 'right',  label: 'MOVE RIGHT', group: 'touch', icon: '▶' },
    { id: 'jump',   label: 'JUMP', group: 'touch', icon: 'JMP' },
    { id: 'attack', label: 'ATTACK', group: 'touch', icon: 'ATK' },
    { id: 'dash',   label: 'DASH', group: 'touch', icon: 'DSH' },
    { id: 'block',  label: 'GUARD', group: 'touch', icon: 'GRD' },
    { id: 'potion', label: 'POTION', group: 'touch', icon: '+' },
    { id: 'pause',  label: 'PAUSE', group: 'touch', icon: '‖' },
    { id: 'health', label: 'HEALTH BAR', group: 'hud' },
    { id: 'xp',     label: 'LEVEL / XP', group: 'hud' },
    { id: 'boss',   label: 'BOSS BAR', group: 'hud' }
  ];

  function cloneLayout(src) {
    var out = { touch: {}, hud: {} };
    var groups = ['touch', 'hud'];
    for (var gi = 0; gi < groups.length; gi++) {
      var gname = groups[gi], base = gname === 'touch' ? DEFAULT_TOUCH : DEFAULT_HUD;
      for (var k in base) {
        var v = (src && src[gname] && src[gname][k]) || base[k];
        out[gname][k] = { x: v.x, y: v.y, w: v.w, h: v.h };
      }
    }
    return out;
  }

  function getLayout(g) {
    if (!g || !g.save) return cloneLayout(null);
    if (!g.save.settings.layout) g.save.settings.layout = cloneLayout(null);
    return g.save.settings.layout;
  }

  function clampLayoutItem(v) {
    v.w = M.clamp(v.w, 0.035, 0.45);
    v.h = M.clamp(v.h, 0.035, 0.35);
    v.x = M.clamp(v.x, 0.005, 0.995 - v.w);
    v.y = M.clamp(v.y, 0.005, 0.995 - v.h);
  }

  function touchLayout(vw, vh, settings) {
    var layout = settings && settings.layout ? settings.layout : null;
    var base = cloneLayout(layout);
    var acts = {
      left:   { icon: '◀' }, right: { icon: '▶' }, jump: { icon: 'JMP', col: '#4e8ad8' },
      attack: { icon: 'ATK', col: '#c4283c' }, dash: { icon: 'DSH', col: '#4ec8a8' },
      block:  { icon: 'GRD', col: '#c8a24e' }, potion: { icon: '+', col: '#4ec87a' }, pause: { icon: '‖' }
    };
    var out = {};
    for (var k in acts) {
      var v = base.touch[k], m = acts[k];
      out[k] = {
        x: v.x * vw, y: v.y * vh, w: v.w * vw, h: v.h * vh,
        act: k, icon: m.icon, col: m.col
      };
    }
    return out;
  }

  var touchState = {};

  function drawTouch(ctx, vw, vh, g) {
    var L = touchLayout(vw, vh, g && g.save.settings);
    ctx.save();
    for (var k in L) {
      var b = L[k], on = !!touchState[b.act];
      var rr = Math.min(b.w, b.h) * 0.5;
      ctx.globalAlpha = on ? 0.70 : 0.30;
      ctx.fillStyle = b.col || '#d8d2c4';
      ctx.beginPath();
      ctx.ellipse(b.x + b.w * 0.5, b.y + b.h * 0.5, b.w * 0.5, b.h * 0.5, 0, 0, 6.2832);
      ctx.fill();
      ctx.globalAlpha = on ? 0.98 : 0.55;
      ctx.strokeStyle = '#0b0a10'; ctx.lineWidth = Math.max(1.5, Math.min(b.w, b.h) * 0.025); ctx.stroke();
      ctx.globalAlpha = on ? 1 : 0.78;
      txt(ctx, b.icon, b.x + b.w * 0.5, b.y + b.h * 0.5 + (b.icon.length > 1 ? Math.min(6, b.h * 0.12) : Math.min(7, b.h * 0.14)), {
        size: b.icon.length > 1 ? Math.min(b.w, b.h) * 0.25 : Math.min(b.w, b.h) * 0.38,
        align: 'center', col: '#0b0a10', weight: '800', stroke: false
      });
      // subtle highlight gives the controls a glassy, more game-like finish
      ctx.globalAlpha = on ? 0.22 : 0.10;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(b.x + b.w * 0.36, b.y + b.h * 0.28, b.w * 0.18, b.h * 0.11, -0.3, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }

  function touchHit(vw, vh, px, py, settings) {
    var L = touchLayout(vw, vh, settings);
    for (var k in L) {
      var b = L[k], cx = b.x + b.w * 0.5, cy = b.y + b.h * 0.5;
      var rx = b.w * 0.62, ry = b.h * 0.62;
      if (((px - cx) / rx) * ((px - cx) / rx) + ((py - cy) / ry) * ((py - cy) / ry) <= 1) return b.act;
    }
    return null;
  }

  /* --------------------------------------------------------------- HUD --- */
  function drawHUD(ctx, g) {
    var vw = g.vw, vh = g.vh, p = g.player, s = g.save;
    var pad = 16;
    var lay = getLayout(g);

    /* --- health / stamina cluster --- */
    var hb = lay.hud.health;
    var hx = hb.x * vw, hy = hb.y * vh, bw = hb.w * vw, hh = hb.h * vh;
    var bh = M.clamp(hh * 0.27, 11, 22);
    panel(ctx, hx - 6, hy - 6, bw + 12, hh + 12, { r: 7 });

    var hpFrac = p.hp / p.maxHp;
    bar(ctx, hx, hy, bw, bh, hpFrac, C.hp, C.hpBack, { ghost: g.hpGhost, ghostCol: 'rgba(255,180,180,0.30)' });
    txt(ctx, Math.max(0, Math.ceil(p.hp)) + ' / ' + Math.round(p.maxHp), hx + bw - 4, hy + bh - 3,
      { size: Math.max(9, Math.min(13, bh * 0.72)), align: 'right', col: '#ffdede', weight: '700' });

    var stFrac = p.stam / p.maxStam;
    var sy = hy + bh + Math.max(4, hh * 0.08);
    bar(ctx, hx, sy, bw * 0.82, Math.max(7, bh * 0.60), stFrac, C.stam, C.stamBack);
    if (p.blockBreak > 0) {
      txt(ctx, 'GUARD BROKEN', hx + bw * 0.82 + 8, sy + Math.max(8, bh * 0.58),
        { size: 10, col: '#ff9a5a', weight: '800' });
    }

    /* potions */
    var py = sy + Math.max(16, bh * 1.35);
    for (var i = 0; i < s.maxPotions; i++) {
      var have = i < s.potions;
      ctx.save();
      ctx.globalAlpha = have ? 1 : 0.28;
      ctx.fillStyle = have ? '#4ec87a' : '#2a2a30';
      roundRect(ctx, pad + i * 16, py, 11, 15, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1.5;
      roundRect(ctx, pad + i * 16, py, 11, 15, 3); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(pad + i * 16 + 2, py + 2, 3, 9);
      ctx.restore();
    }
    txt(ctx, 'L', pad + s.maxPotions * 16 + 6, py + 12, { size: 10, col: C.faint });

    /* --- level / xp --- */
    var xb = lay.hud.xp;
    var xx = xb.x * vw, xy = xb.y * vh, xw = xb.w * vw, xh = xb.h * vh;
    panel(ctx, xx - 8, xy - 6, xw + 16, xh + 12, { r: 7 });
    txt(ctx, 'LV ' + s.level, xx, xy + Math.max(14, xh * 0.34), { size: Math.max(13, Math.min(19, xh * 0.38)), col: C.gold, weight: '800' });
    var need = g.xpForLevel(s.level);
    var have2 = s.xp;
    txt(ctx, have2 + ' / ' + need, xx + xw, xy + Math.max(14, xh * 0.34), { size: 11, align: 'right', col: C.dim });
    bar(ctx, xx, xy + xh * 0.47, xw, Math.max(7, xh * 0.17), have2 / need, C.xp, '#16203a');
    txt(ctx, '◇ ' + s.gold, xx + xw, xy + xh * 0.90, { size: 12, align: 'right', col: C.gold, weight: '700' });

    /* --- ability readiness pips --- */
    var ax = pad, ay = vh - pad - 12;
    var pips = [
      { k: 'DASH', ready: p.dashCd <= 0, col: C.stam },
      { k: 'JUMP2', ready: true, col: '#9ab8ff' },
      { k: 'D-ATK', ready: s.abilities.dashAttack, col: '#ffb066', locked: !s.abilities.dashAttack },
      { k: 'PLUNGE', ready: s.abilities.plunge, col: '#ff8a5a', locked: !s.abilities.plunge }
    ];
    if (!G.Input.hasTouch()) {
      for (var pi = 0; pi < pips.length; pi++) {
        var pp = pips[pi];
        ctx.save();
        ctx.globalAlpha = pp.locked ? 0.20 : (pp.ready ? 0.92 : 0.35);
        ctx.fillStyle = pp.col;
        roundRect(ctx, ax, ay - 8, 46, 13, 3); ctx.fill();
        ctx.restore();
        txt(ctx, pp.k, ax + 23, ay + 2, { size: 8.5, align: 'center', col: '#0b0a10', weight: '800', stroke: false });
        ax += 52;
      }
    }

    /* --- level name / progress ribbon --- */
    txt(ctx, g.level.name.toUpperCase(), vw * 0.5, vh - pad + 2,
      { size: 12, align: 'center', col: C.faint, weight: '700' });

    /* --- combo counter --- */
    if (g.comboCount > 1 && g.comboTimer > 0) {
      var ck = M.clamp(g.comboTimer / 2.2, 0, 1);
      var cs = 30 + Math.min(24, g.comboCount * 1.6);
      txt(ctx, g.comboCount + '', vw - pad - 30, vh * 0.34, {
        size: cs, align: 'right', col: '#ffdf8a', weight: '800',
        alpha: 0.35 + ck * 0.65, glow: 'rgba(255,180,60,0.7)'
      });
      txt(ctx, 'HITS', vw - pad - 30, vh * 0.34 + 16, {
        size: 11, align: 'right', col: C.gold, weight: '700', alpha: 0.35 + ck * 0.65
      });
    }

    /* --- low health warning --- */
    if (hpFrac < 0.25 && !p.dead) {
      var pulse = 0.35 + Math.abs(Math.sin(g.time * 4)) * 0.4;
      txt(ctx, 'CRITICAL', pad + 4, pad + 62, { size: 12, col: '#ff5a5a', weight: '800', alpha: pulse });
    }

    /* --- boss bar --- */
    if (g.boss && !g.bossHidden) drawBossBar(ctx, g, g.boss);

    /* --- contextual tip --- */
    if (g.tipText && g.tipAlpha > 0.01) {
      var tw = ctx.measureText ? 0 : 0;
      ctx.save();
      ctx.font = '600 15px ' + FONT;
      tw = ctx.measureText(g.tipText).width;
      ctx.restore();
      var bx = vw * 0.5 - tw * 0.5 - 18;
      ctx.save();
      ctx.globalAlpha = g.tipAlpha;
      panel(ctx, bx, vh * 0.74, tw + 36, 38, { r: 5 });
      txt(ctx, g.tipText, vw * 0.5, vh * 0.74 + 24, { size: 15, align: 'center', col: C.ink });
      ctx.restore();
    }

    /* --- interaction prompt --- */
    if (g.prompt) {
      txt(ctx, g.prompt, vw * 0.5, vh * 0.66, {
        size: 14, align: 'center', col: C.gold, weight: '700',
        alpha: 0.6 + Math.sin(g.time * 5) * 0.3
      });
    }

    if (G.Input.hasTouch() && s.settings.showTouch !== false) drawTouch(ctx, vw, vh, g);
  }

  function drawBossBar(ctx, g, boss) {
    var vw = g.vw, vh = g.vh;
    var bb = getLayout(g).hud.boss;
    var x = bb.x * vw, y = bb.y * vh, w = bb.w * vw, h = M.clamp(bb.h * vh * 0.28, 8, 20);
    var frac = M.clamp(boss.hp / boss.maxHp, 0, 1);

    txt(ctx, boss.def.name, vw * 0.5, y - 12,
      { size: 16, align: 'center', col: '#f2e4c8', weight: '800', serif: true, glow: 'rgba(0,0,0,0.9)' });
    txt(ctx, boss.def.title, vw * 0.5, y + h + 16,
      { size: 10.5, align: 'center', col: C.faint, weight: '600' });

    ctx.save();
    ctx.fillStyle = 'rgba(6,5,9,0.8)';
    roundRect(ctx, x - 4, y - 4, w + 8, h + 8, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(224,182,74,0.45)'; ctx.lineWidth = 1.5;
    roundRect(ctx, x - 4, y - 4, w + 8, h + 8, 4); ctx.stroke();
    ctx.restore();

    bar(ctx, x, y, w, h, frac, '#9e1f2e', '#25090e',
      { ghost: g.bossGhost, ghostCol: 'rgba(255,200,160,0.35)', top: 'rgba(255,170,140,0.45)' });

    // phase division ticks
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 2;
    for (var i = 1; i < boss.def.phaseAt.length; i++) {
      var px = x + w * boss.def.phaseAt[i];
      ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + h); ctx.stroke();
    }
    ctx.restore();

    if (boss.transition > 0) {
      txt(ctx, 'PHASE ' + boss.phase, vw * 0.5, y + h * 0.5 + 5, {
        size: 11, align: 'center', col: '#ffe6a8', weight: '800',
        alpha: 0.5 + Math.abs(Math.sin(g.time * 8)) * 0.5
      });
    }
  }

  /* ------------------------------------------------------ title screen --- */
  function drawTitleArt(ctx, vw, vh, t) {
    // procedural crest: a cracked crown over a broken blade
    var cx = vw * 0.5, cy = vh * 0.235;
    ctx.save();
    ctx.translate(cx, cy);
    var s = Math.min(vw, vh) / 620;
    ctx.scale(s, s);

    // glow behind
    ctx.globalCompositeOperation = 'lighter';
    var gg = ctx.createRadialGradient(0, 0, 0, 0, 0, 200);
    gg.addColorStop(0, 'rgba(224,182,74,0.22)');
    gg.addColorStop(1, 'rgba(224,182,74,0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(0, 0, 200, 0, 6.2832); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // blade
    ctx.fillStyle = '#3b3a44';
    ctx.beginPath();
    ctx.moveTo(-9, 20); ctx.lineTo(9, 20); ctx.lineTo(7, 150); ctx.lineTo(0, 168); ctx.lineTo(-7, 150);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6d6b7a';
    ctx.beginPath();
    ctx.moveTo(-9, 20); ctx.lineTo(0, 20); ctx.lineTo(0, 168); ctx.lineTo(-7, 150);
    ctx.closePath(); ctx.fill();
    // fracture
    ctx.strokeStyle = '#14121a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-9, 96); ctx.lineTo(4, 104); ctx.lineTo(-6, 112); ctx.stroke();
    // guard
    ctx.fillStyle = '#8c7434';
    ctx.fillRect(-40, 10, 80, 11);
    ctx.fillStyle = '#c9a648';
    ctx.fillRect(-40, 10, 80, 4);

    // crown
    ctx.fillStyle = '#c9a648';
    ctx.beginPath();
    ctx.moveTo(-58, -6);
    ctx.lineTo(-58, -40); ctx.lineTo(-40, -18); ctx.lineTo(-20, -52);
    ctx.lineTo(0, -22); ctx.lineTo(20, -52); ctx.lineTo(40, -18);
    ctx.lineTo(58, -40); ctx.lineTo(58, -6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(-58, -14, 116, 8);
    ctx.fillStyle = '#f0d485';
    ctx.fillRect(-58, -6, 116, 3);
    // gems, pulsing
    var gems = [[-34, -20], [0, -26], [34, -20]];
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < gems.length; i++) {
      var pu = 0.6 + Math.sin(t * 2 + i * 1.7) * 0.35;
      var g2 = ctx.createRadialGradient(gems[i][0], gems[i][1], 0, gems[i][0], gems[i][1], 16);
      g2.addColorStop(0, 'rgba(255,90,60,' + (0.9 * pu).toFixed(2) + ')');
      g2.addColorStop(1, 'rgba(255,60,30,0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(gems[i][0], gems[i][1], 16, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }

  /* --------------------------------------------------------- upgrades --- */
  function drawEditorButton(ctx,x,y,w,h,label,action,g){
    var active = g.layoutEditor && g.layoutEditor.lastAction === action;
    panel(ctx,x,y,w,h,{r:6,fill:active?'rgba(224,182,74,0.24)':'rgba(35,30,42,0.92)',edge:active?C.gold:'rgba(224,182,74,0.35)'});
    txt(ctx,label,x+w/2,y+h*0.67,{size:10.5,align:'center',col:active?'#fff3c4':C.ink,weight:'800'});
  }

  function drawEditorHudPreview(ctx,g){
    var lay=getLayout(g), vw=g.vw, vh=g.vh;
    var hb=lay.hud.health, xb=lay.hud.xp, bb=lay.hud.boss;
    ctx.save(); ctx.globalAlpha=0.42;
    panel(ctx,hb.x*vw-6,hb.y*vh-6,hb.w*vw+12,hb.h*vh+12,{r:7});
    bar(ctx,hb.x*vw,hb.y*vh,hb.w*vw,Math.max(10,hb.h*vh*0.27),0.76,C.hp,C.hpBack);
    panel(ctx,xb.x*vw-6,xb.y*vh-6,xb.w*vw+12,xb.h*vh+12,{r:7});
    txt(ctx,'LV 7',xb.x*vw,xb.y*vh+18,{size:15,col:C.gold,weight:'800'});
    bar(ctx,xb.x*vw,xb.y*vh+25,xb.w*vw,7,0.58,C.xp,'#16203a');
    ctx.globalAlpha=0.28; ctx.fillStyle='#b43c3c'; ctx.fillRect(bb.x*vw,bb.y*vh,bb.w*vw,Math.max(8,bb.h*vh*0.28));
    ctx.restore();
  }

  var STAT_INFO = [
    { k: 'vitality', label: 'VITALITY', desc: '+22 max health per point', col: '#c4283c' },
    { k: 'power', label: 'POWER', desc: '+16% attack damage per point', col: '#e08a3c' },
    { k: 'speed', label: 'SWIFTNESS', desc: '+5.5% move & attack speed per point', col: '#4ec8a8' },
    { k: 'stamina', label: 'ENDURANCE', desc: '+18 max stamina, faster regen', col: '#4e9ad8' },
    { k: 'fortune', label: 'FORTUNE', desc: '+22% gold and drop chance per point', col: '#e0b64a' },
    { k: 'focus', label: 'FOCUS', desc: '+18% parry window and stagger damage', col: '#b48ad8' }
  ];

  return {
    C: C, FONT: FONT, FONT_D: FONT_D,
    txt: txt, panel: panel, bar: bar, roundRect: roundRect,
    Menu: Menu, STAT_INFO: STAT_INFO,
    drawHUD: drawHUD, drawBossBar: drawBossBar, drawTitleArt: drawTitleArt,
    drawTouch: drawTouch, touchHit: touchHit, touchLayout: touchLayout,
    touchState: touchState,
    DEFAULT_TOUCH: DEFAULT_TOUCH,
    DEFAULT_HUD: DEFAULT_HUD,
    LAYOUT_META: LAYOUT_META,
    cloneLayout: cloneLayout,
    getLayout: getLayout,
    clampLayoutItem: clampLayoutItem,
    touchLayout: touchLayout,
    touchHit: touchHit,

    layoutEditor: function (ctx, g) {
      var vw = g.vw, vh = g.vh, lay = getLayout(g);
      ctx.fillStyle = 'rgba(6,5,9,0.96)'; ctx.fillRect(0, 0, vw, vh);
      txt(ctx, 'CONTROL LAYOUT', vw * 0.5, Math.min(42, vh * 0.10), { size: Math.min(28, vw * 0.045), align: 'center', col: '#f4e9d2', weight: '800', serif: true });
      txt(ctx, 'Tap an item to select · drag to move · use the size controls below', vw * 0.5, Math.min(65, vh * 0.15), { size: 11.5, align: 'center', col: C.dim });

      // dim playfield and draw a representative HUD preview
      ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = '#1b1724'; ctx.fillRect(0, 0, vw, vh); ctx.restore();
      drawEditorHudPreview(ctx, g);

      var selected = g.layoutEditor && g.layoutEditor.selected || 'left';
      var meta = null;
      for (var mi = 0; mi < LAYOUT_META.length; mi++) if (LAYOUT_META[mi].id === selected) { meta = LAYOUT_META[mi]; break; }
      var all = [];
      for (var ai = 0; ai < LAYOUT_META.length; ai++) all.push(LAYOUT_META[ai]);
      for (var i = 0; i < all.length; i++) {
        var m = all[i], v = lay[m.group][m.id];
        var px = v.x * vw, py = v.y * vh, pw = v.w * vw, ph = v.h * vh;
        var isSel = m.id === selected;
        ctx.save();
        ctx.globalAlpha = m.group === 'touch' ? 0.74 : 0.55;
        if (m.group === 'touch') {
          ctx.fillStyle = (m.id === 'attack' ? '#c4283c' : m.id === 'jump' ? '#4e8ad8' : m.id === 'dash' ? '#4ec8a8' : m.id === 'block' ? '#c8a24e' : '#d8d2c4');
          ctx.beginPath(); ctx.ellipse(px + pw/2, py + ph/2, pw/2, ph/2, 0, 0, 6.2832); ctx.fill();
          txt(ctx, m.icon, px + pw/2, py + ph/2 + (m.icon.length > 1 ? 5 : 6), { size: Math.max(10, Math.min(pw,ph)*0.25), align:'center', col:'#0b0a10', weight:'800', stroke:false });
        } else {
          ctx.fillStyle = isSel ? 'rgba(224,182,74,0.22)' : 'rgba(90,130,180,0.16)';
          ctx.fillRect(px, py, pw, ph);
          ctx.strokeStyle = isSel ? C.gold : 'rgba(150,170,200,0.65)'; ctx.lineWidth = isSel ? 3 : 1.5; ctx.strokeRect(px,py,pw,ph);
          txt(ctx, m.label, px + pw/2, py + ph/2 + 5, { size: Math.max(9, Math.min(14, pw*0.06)), align:'center', col:'#fff3d0', weight:'800', stroke:false });
        }
        if (isSel) {
          ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.setLineDash([5,4]); ctx.strokeRect(px-3,py-3,pw+6,ph+6); ctx.setLineDash([]);
        }
        ctx.restore();
      }

      var selV = lay[meta.group][meta.id];
      var toolbarH = Math.min(86, Math.max(74, vh * 0.16));
      var ty = vh - toolbarH - 10;
      panel(ctx, 10, ty, vw - 20, toolbarH, { r: 9, fill: 'rgba(10,9,15,0.94)' });
      txt(ctx, meta.label + '  ·  ' + meta.group.toUpperCase(), 24, ty + 22, { size: 13, col: C.gold, weight:'800' });
      txt(ctx, 'X ' + Math.round(selV.x*100) + '%   Y ' + Math.round(selV.y*100) + '%   W ' + Math.round(selV.w*100) + '%   H ' + Math.round(selV.h*100) + '%', 24, ty + 40, { size: 10.5, col:C.dim });
      drawEditorButton(ctx, 24, ty + 48, 66, 28, 'W −', 'wminus', g);
      drawEditorButton(ctx, 96, ty + 48, 66, 28, 'W +', 'wplus', g);
      drawEditorButton(ctx, 168, ty + 48, 66, 28, 'H −', 'hminus', g);
      drawEditorButton(ctx, 240, ty + 48, 66, 28, 'H +', 'hplus', g);
      drawEditorButton(ctx, vw - 174, ty + 48, 74, 28, 'RESET', 'reset', g);
      drawEditorButton(ctx, vw - 92, ty + 48, 68, 28, 'DONE', 'done', g);
    },

    layoutEditorHit: function (g, px, py) {
      var vw=g.vw, vh=g.vh, lay=getLayout(g), meta=null;
      var selected = g.layoutEditor && g.layoutEditor.selected || 'left';
      for (var i=0;i<LAYOUT_META.length;i++) if (LAYOUT_META[i].id===selected) meta=LAYOUT_META[i];
      var toolbarH=Math.min(86,Math.max(74,vh*0.16)), ty=vh-toolbarH-10;
      var buttons=[
        {x:24,y:ty+48,w:66,h:28,a:'wminus'},{x:96,y:ty+48,w:66,h:28,a:'wplus'},
        {x:168,y:ty+48,w:66,h:28,a:'hminus'},{x:240,y:ty+48,w:66,h:28,a:'hplus'},
        {x:vw-174,y:ty+48,w:74,h:28,a:'reset'},{x:vw-92,y:ty+48,w:68,h:28,a:'done'}
      ];
      for(var bi=0;bi<buttons.length;bi++){var b=buttons[bi];if(px>=b.x&&px<=b.x+b.w&&py>=b.y&&py<=b.y+b.h)return {type:'button',action:b.a};}
      for(var ri=LAYOUT_META.length-1;ri>=0;ri--){var m=LAYOUT_META[ri],v=lay[m.group][m.id];if(px>=v.x*vw&&px<=v.x*vw+v.w*vw&&py>=v.y*vh&&py<=v.y*vh+v.h*vh)return {type:'item',id:m.id};}
      return null;
    },


    /* ---------------------------------------------------- full screens -- */

    title: function (ctx, g) {
      var vw = g.vw, vh = g.vh;
      // vignetted backdrop
      var bg = ctx.createLinearGradient(0, 0, 0, vh);
      bg.addColorStop(0, '#0a0810'); bg.addColorStop(0.6, '#140f1c'); bg.addColorStop(1, '#241626');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, vw, vh);

      // drifting embers
      for (var i = 0; i < 46; i++) {
        var t = g.time * 0.35 + i * 3.7;
        var x = ((i * 137.5 + Math.sin(t) * 40) % vw + vw) % vw;
        var y = vh - ((t * 22 + i * 61) % (vh + 120)) + 60;
        var a = 0.10 + (Math.sin(t * 2.3) * 0.5 + 0.5) * 0.4;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a;
        ctx.fillStyle = i % 3 === 0 ? '#ffb347' : '#e0b64a';
        ctx.beginPath(); ctx.arc(x, y, 1 + (i % 3), 0, 6.2832); ctx.fill();
        ctx.restore();
      }

      drawTitleArt(ctx, vw, vh, g.time);

      txt(ctx, 'GRIMHOLLOW', vw * 0.5, vh * 0.475, {
        size: Math.min(76, vw * 0.10), align: 'center', col: '#f4e9d2',
        weight: '800', serif: true, glow: 'rgba(224,182,74,0.35)', glowSize: 26, strokeW: 5
      });
      txt(ctx, 'C H R O N I C L E   O F   T H E   H O L L O W   C R O W N', vw * 0.5, vh * 0.475 + 26, {
        size: Math.min(13, vw * 0.019), align: 'center', col: C.gold, weight: '600'
      });

      var mw = Math.min(340, vw * 0.5);
      var my = vh * 0.56;
      g.menu.draw(ctx, (vw - mw) * 0.5, my, mw, 4, { rowH: 38, size: 18 });

      txt(ctx, 'W/A/S/D or arrows  ·  SPACE jump  ·  J attack  ·  SHIFT dash  ·  K guard  ·  L potion',
        vw * 0.5, vh - 34, { size: 11.5, align: 'center', col: C.faint });
      txt(ctx, 'ENTER / click to select   ·   gamepad supported',
        vw * 0.5, vh - 18, { size: 11, align: 'center', col: 'rgba(95,89,79,0.75)' });
    },

    levelSelect: function (ctx, g) {
      var vw = g.vw, vh = g.vh, s = g.save;
      ctx.fillStyle = 'rgba(6,5,9,0.93)'; ctx.fillRect(0, 0, vw, vh);

      txt(ctx, 'THE ROAD', vw * 0.5, 62, {
        size: 34, align: 'center', col: '#f4e9d2', weight: '800', serif: true
      });
      txt(ctx, 'Cleared ' + s.completed.filter(Boolean).length + ' of ' + G.LEVELS.length +
              '   ·   Secrets ' + s.secrets.length + '/' + g.totalSecrets() +
              '   ·   Deaths ' + s.totalDeaths,
        vw * 0.5, 84, { size: 12, align: 'center', col: C.dim });

      // node trail
      var n = G.LEVELS.length;
      var top = 116, avail = vh - top - 120;
      var rowH = Math.min(46, avail / n);
      var mw = Math.min(560, vw * 0.78);
      var mx = (vw - mw) * 0.5;

      g.menu.rects.length = 0;
      for (var i = 0; i < n; i++) {
        var L = G.LEVELS[i];
        var y = top + i * rowH;
        var unlocked = i <= s.unlockedLevel;
        var done = !!s.completed[i];
        var sel = g.menu.index === i;
        g.menu.rects.push({ x: mx, y: y, w: mw, h: rowH - 4 });

        if (sel) {
          ctx.save();
          var gr = ctx.createLinearGradient(mx, y, mx + mw, y);
          gr.addColorStop(0, 'rgba(224,182,74,0.02)');
          gr.addColorStop(0.5, 'rgba(224,182,74,0.16)');
          gr.addColorStop(1, 'rgba(224,182,74,0.02)');
          ctx.fillStyle = gr; ctx.fillRect(mx, y, mw, rowH - 4);
          ctx.restore();
        }
        // connector line + node
        var nx = mx + 26, ny = y + (rowH - 4) * 0.5;
        if (i > 0) {
          ctx.save();
          ctx.strokeStyle = unlocked ? 'rgba(224,182,74,0.4)' : 'rgba(95,89,79,0.25)';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(nx, y - rowH * 0.5 + 2); ctx.lineTo(nx, ny - 9); ctx.stroke();
          ctx.restore();
        }
        ctx.save();
        ctx.fillStyle = done ? C.gold : (unlocked ? '#4a4356' : '#221f28');
        ctx.beginPath(); ctx.arc(nx, ny, 8, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = unlocked ? 'rgba(240,220,170,0.7)' : 'rgba(95,89,79,0.4)';
        ctx.lineWidth = 2; ctx.stroke();
        if (L.boss) {
          ctx.fillStyle = done ? '#3a2a10' : '#c4283c';
          ctx.beginPath(); ctx.arc(nx, ny, 3.4, 0, 6.2832); ctx.fill();
        }
        ctx.restore();

        var label = unlocked ? (i + 1) + '.  ' + L.name : (i + 1) + '.  ' + '—'.repeat(Math.min(16, L.name.length));
        txt(ctx, label, nx + 22, ny + 5, {
          size: 16.5,
          col: unlocked ? (sel ? '#fff8e6' : C.ink) : C.faint,
          weight: sel ? '700' : '600'
        });
        var right = !unlocked ? 'LOCKED' : (done ? 'CLEARED' : (L.boss ? 'BOSS' : 'OPEN'));
        txt(ctx, right, mx + mw - 16, ny + 5, {
          size: 11, align: 'right', weight: '800',
          col: !unlocked ? C.faint : (done ? C.gold : (L.boss ? '#e06a5a' : C.dim))
        });
        var bio = G.Biomes[L.biome];
        txt(ctx, bio ? bio.name : '', mx + mw - 82, ny + 5, {
          size: 10.5, align: 'right', col: 'rgba(154,145,132,0.7)'
        });
      }

      txt(ctx, 'ENTER  begin   ·   U  upgrades   ·   ESC  back',
        vw * 0.5, vh - 34, { size: 12, align: 'center', col: C.dim });
      if (G.LEVELS[g.menu.index] && G.LEVELS[g.menu.index].hint && g.menu.index <= s.unlockedLevel) {
        txt(ctx, '"' + G.LEVELS[g.menu.index].hint + '"', vw * 0.5, vh - 56,
          { size: 12.5, align: 'center', col: 'rgba(224,182,74,0.75)', weight: '500' });
      }
    },

    upgrades: function (ctx, g) {
      var vw = g.vw, vh = g.vh, s = g.save;
      ctx.fillStyle = 'rgba(6,5,9,0.94)'; ctx.fillRect(0, 0, vw, vh);

      txt(ctx, 'ATTUNEMENT', vw * 0.5, 60, { size: 32, align: 'center', col: '#f4e9d2', weight: '800', serif: true });
      var pts = g.availablePoints();
      txt(ctx, pts > 0 ? pts + ' POINT' + (pts === 1 ? '' : 'S') + ' TO SPEND' : 'NO POINTS AVAILABLE',
        vw * 0.5, 84, { size: 13, align: 'center', col: pts > 0 ? C.gold : C.dim, weight: '700' });
      txt(ctx, 'Level ' + s.level + '   ·   ' + s.xp + ' / ' + g.xpForLevel(s.level) + ' XP   ·   ◇ ' + s.gold,
        vw * 0.5, 104, { size: 12, align: 'center', col: C.dim });

      var mw = Math.min(600, vw * 0.82);
      var mx = (vw - mw) * 0.5;
      var top = 132, rowH = Math.min(56, (vh - top - 130) / STAT_INFO.length);

      g.menu.rects.length = 0;
      for (var i = 0; i < STAT_INFO.length; i++) {
        var st = STAT_INFO[i];
        var val = s.stats[st.k] || 0;
        var y = top + i * rowH;
        var sel = g.menu.index === i;
        g.menu.rects.push({ x: mx, y: y, w: mw, h: rowH - 6 });

        panel(ctx, mx, y, mw, rowH - 8, {
          fill: sel ? 'rgba(30,24,18,0.9)' : 'rgba(14,12,18,0.75)',
          edge: sel ? C.edge : 'rgba(90,84,74,0.3)', r: 5, inner: false
        });
        ctx.save();
        ctx.fillStyle = st.col;
        ctx.globalAlpha = sel ? 1 : 0.6;
        ctx.fillRect(mx, y, 4, rowH - 8);
        ctx.restore();

        txt(ctx, st.label, mx + 18, y + 22, { size: 16, col: sel ? '#fff8e6' : C.ink, weight: '700' });
        txt(ctx, st.desc, mx + 18, y + 39, { size: 11.5, col: sel ? C.dim : 'rgba(154,145,132,0.65)' });

        // pip meter
        var maxPips = 10;
        for (var q = 0; q < maxPips; q++) {
          ctx.save();
          ctx.globalAlpha = q < val ? 1 : 0.18;
          ctx.fillStyle = q < val ? st.col : '#6a6478';
          roundRect(ctx, mx + mw - 30 - (maxPips - q) * 13, y + 14, 9, 16, 2);
          ctx.fill();
          ctx.restore();
        }
        txt(ctx, '' + val, mx + mw - 16, y + 28, { size: 15, align: 'right', col: st.col, weight: '800' });

        if (sel && pts > 0) {
          txt(ctx, 'ENTER  +1', mx + mw - 16, y + 44, { size: 10, align: 'right', col: C.gold, weight: '700' });
        }
      }

      txt(ctx, 'ENTER  spend point   ·   R  respec (costs ' + g.respecCost() + ' gold)   ·   ESC  back',
        vw * 0.5, vh - 34, { size: 12, align: 'center', col: C.dim });
      var rel = [];
      if (s.abilities.airControl) rel.push('Feathered Sigil');
      if (s.abilities.dashAttack) rel.push('Riftstep Charm');
      if (s.abilities.plunge) rel.push('Weight of Kings');
      txt(ctx, rel.length ? 'RELICS: ' + rel.join('  ·  ') : 'RELICS: none found',
        vw * 0.5, vh - 56, { size: 11.5, align: 'center', col: 'rgba(224,182,74,0.7)' });
    },

    settings: function (ctx, g) {
      var vw=g.vw, vh=g.vh;
      ctx.fillStyle='rgba(6,5,9,0.94)'; ctx.fillRect(0,0,vw,vh);
      txt(ctx,'SETTINGS',vw*0.5,58,{size:30,align:'center',col:'#f4e9d2',weight:'800',serif:true});
      txt(ctx,'Personalize mobile controls, HUD placement and rendering',vw*0.5,82,{size:12,align:'center',col:C.dim});
      var mw=Math.min(540,vw*0.82);
      g.menu.draw(ctx,(vw-mw)*0.5,112,mw,5,{rowH:42,size:17});
      txt(ctx,'CONTROL LAYOUT: drag items, then adjust W/H. Changes save automatically.',vw*0.5,vh-48,{size:11,align:'center',col:C.faint});
      txt(ctx,'ESC / back to return',vw*0.5,vh-28,{size:11,align:'center',col:C.faint});
    },

    pause: function (ctx, g) {
      var vw = g.vw, vh = g.vh;
      ctx.fillStyle = 'rgba(6,5,9,0.72)'; ctx.fillRect(0, 0, vw, vh);
      var mw = Math.min(320, vw * 0.6);
      var mh = g.menu.items.length * 42 + 130;
      var mx = (vw - mw) * 0.5, my = (vh - mh) * 0.5;
      panel(ctx, mx, my, mw, mh, { r: 8 });
      txt(ctx, 'PAUSED', vw * 0.5, my + 44, { size: 26, align: 'center', col: '#f4e9d2', weight: '800', serif: true });
      txt(ctx, g.level.name, vw * 0.5, my + 66, { size: 12, align: 'center', col: C.dim });
      g.menu.draw(ctx, mx + 18, my + 86, mw - 36, 2, { rowH: 38, size: 17 });
    },

    death: function (ctx, g) {
      var vw = g.vw, vh = g.vh;
      var k = M.clamp(g.overT / 1.1, 0, 1);
      ctx.fillStyle = 'rgba(20,2,6,' + (0.82 * k).toFixed(3) + ')'; ctx.fillRect(0, 0, vw, vh);
      ctx.save();
      ctx.globalAlpha = k;
      txt(ctx, 'YOU DIED', vw * 0.5, vh * 0.38, {
        size: Math.min(64, vw * 0.09), align: 'center', col: '#b8283c',
        weight: '800', serif: true, glow: 'rgba(184,40,60,0.5)', glowSize: 30, strokeW: 5
      });
      txt(ctx, g.deathCause || '', vw * 0.5, vh * 0.38 + 30, { size: 13, align: 'center', col: C.dim });
      txt(ctx, 'Deaths this run: ' + g.runDeaths + '   ·   Total: ' + g.save.totalDeaths,
        vw * 0.5, vh * 0.38 + 52, { size: 12, align: 'center', col: C.faint });
      var mw = Math.min(300, vw * 0.55);
      g.menu.draw(ctx, (vw - mw) * 0.5, vh * 0.55, mw, 3, { rowH: 38, size: 17 });
      ctx.restore();
    },

    levelClear: function (ctx, g) {
      var vw = g.vw, vh = g.vh;
      var k = M.clamp(g.overT / 0.9, 0, 1);
      ctx.fillStyle = 'rgba(8,7,12,' + (0.86 * k).toFixed(3) + ')'; ctx.fillRect(0, 0, vw, vh);
      ctx.save();
      ctx.globalAlpha = k;
      txt(ctx, g.level.boss ? 'SLAIN' : 'CLEARED', vw * 0.5, vh * 0.30, {
        size: Math.min(56, vw * 0.08), align: 'center', col: C.gold,
        weight: '800', serif: true, glow: 'rgba(224,182,74,0.45)', glowSize: 26, strokeW: 5
      });
      txt(ctx, g.level.name.toUpperCase(), vw * 0.5, vh * 0.30 + 28,
        { size: 14, align: 'center', col: C.ink, weight: '700' });

      var rows = [
        ['TIME', g.fmtTime(g.runTime)],
        ['FOES SLAIN', '' + g.runKills],
        ['XP EARNED', '+' + g.runXp],
        ['GOLD', '+' + g.runGold],
        ['DEATHS', '' + g.runDeaths],
        ['SECRETS', g.runSecrets + ' / ' + ((g.level.secrets || []).length)]
      ];
      var bw = Math.min(340, vw * 0.6), bx = (vw - bw) * 0.5, by = vh * 0.40;
      panel(ctx, bx, by, bw, rows.length * 26 + 20, { r: 6 });
      for (var i = 0; i < rows.length; i++) {
        var ry = by + 30 + i * 26;
        txt(ctx, rows[i][0], bx + 18, ry, { size: 12, col: C.dim, weight: '600' });
        txt(ctx, rows[i][1], bx + bw - 18, ry, { size: 13.5, align: 'right', col: C.ink, weight: '700' });
      }
      var mw = Math.min(300, vw * 0.55);
      g.menu.draw(ctx, (vw - mw) * 0.5, by + rows.length * 26 + 40, mw, 3, { rowH: 36, size: 16 });
      ctx.restore();
    },

    victory: function (ctx, g) {
      var vw = g.vw, vh = g.vh;
      var k = M.clamp(g.overT / 1.6, 0, 1);
      var bg = ctx.createLinearGradient(0, 0, 0, vh);
      bg.addColorStop(0, 'rgba(8,6,12,' + (0.94 * k).toFixed(3) + ')');
      bg.addColorStop(1, 'rgba(38,26,14,' + (0.94 * k).toFixed(3) + ')');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, vw, vh);
      ctx.save();
      ctx.globalAlpha = k;
      drawTitleArt(ctx, vw, vh * 0.82, g.time);
      txt(ctx, 'THE CROWN IS HOLLOW', vw * 0.5, vh * 0.52, {
        size: Math.min(48, vw * 0.07), align: 'center', col: '#f6ecd4',
        weight: '800', serif: true, glow: 'rgba(224,182,74,0.5)', glowSize: 30, strokeW: 5
      });
      txt(ctx, 'Valdris falls. The vault goes quiet. Whatever wore the crown is gone,',
        vw * 0.5, vh * 0.52 + 32, { size: 13.5, align: 'center', col: C.ink });
      txt(ctx, 'and for the first time in a long age, the Ashen Ruins are only ruins.',
        vw * 0.5, vh * 0.52 + 52, { size: 13.5, align: 'center', col: C.ink });
      txt(ctx, 'Total time ' + g.fmtTime(g.save.totalTime) + '   ·   Deaths ' + g.save.totalDeaths +
              '   ·   Secrets ' + g.save.secrets.length + '/' + g.totalSecrets(),
        vw * 0.5, vh * 0.52 + 82, { size: 12.5, align: 'center', col: C.gold, weight: '700' });
      var mw = Math.min(300, vw * 0.55);
      g.menu.draw(ctx, (vw - mw) * 0.5, vh * 0.68, mw, 3, { rowH: 36, size: 16 });
      ctx.restore();
    },

    relicPopup: function (ctx, g) {
      var vw = g.vw, vh = g.vh, r = g.relicPopup;
      if (!r) return;
      var k = M.clamp(r.t / 0.4, 0, 1) * M.clamp((r.max - r.t) / 0.5, 0, 1);
      ctx.save();
      ctx.globalAlpha = k;
      var bw = Math.min(440, vw * 0.7), bx = (vw - bw) * 0.5, by = vh * 0.30;
      panel(ctx, bx, by, bw, 108, { r: 8, edge: 'rgba(224,182,74,0.8)' });
      txt(ctx, 'RELIC RECOVERED', vw * 0.5, by + 28, { size: 11.5, align: 'center', col: C.gold, weight: '800' });
      txt(ctx, r.name, vw * 0.5, by + 56, { size: 23, align: 'center', col: '#fff4dc', weight: '800', serif: true });
      txt(ctx, r.desc, vw * 0.5, by + 82, { size: 12.5, align: 'center', col: C.ink });
      ctx.restore();
    },

    loading: function (ctx, vw, vh, msg, frac) {
      ctx.fillStyle = '#08070c'; ctx.fillRect(0, 0, vw, vh);
      txt(ctx, 'GRIMHOLLOW', vw * 0.5, vh * 0.46, {
        size: 30, align: 'center', col: '#f4e9d2', weight: '800', serif: true
      });
      txt(ctx, msg || 'Loading', vw * 0.5, vh * 0.46 + 26, { size: 12, align: 'center', col: C.dim });
      if (frac != null) {
        var bw = Math.min(280, vw * 0.5);
        bar(ctx, (vw - bw) * 0.5, vh * 0.46 + 42, bw, 6, frac, C.gold, '#241f14');
      }
    }
  };
})();
