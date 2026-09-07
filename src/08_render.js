/* ==========================================================================
   GRIMHOLLOW  —  08_render.js
   Chunked terrain baking, per-biome parallax skies, additive light buffer,
   post-processing. This file is where "good graphics" actually happens: no
   art assets, so every pixel is drawn from noise, gradients and geometry.
   ========================================================================== */
'use strict';

var G = (typeof G !== 'undefined') ? G : {};

G.Biomes = {
  ruins: {
    name: 'The Ashen Ruins',
    // Keep the silhouette mood while leaving routes and climb bars readable.
    ambient: [0.42, 0.39, 0.50],
    fog: 'rgba(46,40,58,0.55)',
    sky: [['#0b0a12', 0], ['#1b1524', 0.55], ['#31212c', 1]],
    rock: { d: '#241f2a', m: '#3a3242', l: '#4e4459', edge: '#5d5168', moss: 'rgba(96,120,70,0.20)' },
    accent: '#c96a2a',
    ember: 0.55
  },
  caverns: {
    name: 'The Weeping Deep',
    ambient: [0.34, 0.38, 0.52],
    fog: 'rgba(26,34,56,0.6)',
    sky: [['#05070f', 0], ['#0a1020', 0.5], ['#122036', 1]],
    rock: { d: '#141a2a', m: '#1e2740', l: '#2c3855', edge: '#3a4a6c', moss: 'rgba(60,140,150,0.18)' },
    accent: '#4ec8d8',
    ember: 0.22
  },
  citadel: {
    name: 'Vault of the Hollow Crown',
    ambient: [0.38, 0.35, 0.45],
    fog: 'rgba(38,32,44,0.55)',
    sky: [['#080711', 0], ['#141020', 0.5], ['#241a2a', 1]],
    rock: { d: '#1b1822', m: '#282433', l: '#393246', edge: '#4a4257', moss: 'rgba(200,160,70,0.14)' },
    accent: '#e0b64a',
    ember: 0.40
  }
};

/* Repair any accidental non-ascii in palette literals at load time so a typo
   can never produce an invalid CSS colour (silent black terrain). */
(function sanitizeBiomes() {
  var ok = /^#[0-9a-fA-F]{3,8}$/;
  var fallbacks = { d: '#20202a', m: '#2c2c38', l: '#3d3d4c', edge: '#4d4d5e' };
  for (var b in G.Biomes) {
    var r = G.Biomes[b].rock;
    for (var k in r) {
      if (typeof r[k] === 'string' && r[k][0] === '#' && !ok.test(r[k])) r[k] = fallbacks[k] || '#303040';
    }
  }
})();

/* ============================================================== terrain === */
/* Levels are up to ~300x60 tiles = 7200x1440 px. Baking that whole thing into
   one offscreen canvas is ~40MB and stalls on load, so bake 512px chunks
   lazily as the camera reaches them and keep a bounded LRU. */
G.Terrain = (function () {
  var K = G.K, T = G.T, M = G.M;
  var CH = 512;                 // chunk size in px
  var MAX_CHUNKS = 40;

  function Terrain(world) {
    this.world = world;
    this.bio = G.Biomes[world.biome] || G.Biomes.ruins;
    this.cols = Math.ceil(world.pixelW() / CH);
    this.rows = Math.ceil(world.pixelH() / CH);
    this.chunks = {};
    this.order = [];
    this.rng = G.RNG(world.seed ^ 0x9e37);
  }

  Terrain.prototype.key = function (cx, cy) { return cx + ',' + cy; };

  Terrain.prototype.evict = function () {
    while (this.order.length > MAX_CHUNKS) {
      var k = this.order.shift();
      delete this.chunks[k];
    }
  };

  Terrain.prototype.get = function (cx, cy) {
    var k = this.key(cx, cy);
    var c = this.chunks[k];
    if (c) return c;
    c = this.bake(cx, cy);
    this.chunks[k] = c;
    this.order.push(k);
    this.evict();
    return c;
  };

  Terrain.prototype.invalidate = function () { this.chunks = {}; this.order.length = 0; };

  /* --- one tile of rock, drawn with fake autotiling ---------------------- */
  Terrain.prototype.tileRock = function (ctx, w, tx, ty, ox, oy) {
    var t = K.TILE, p = this.bio.rock;
    var x = tx * t - ox, y = ty * t - oy;
    var n = M.hash2(tx, ty);

    // body: subtle per-tile value variation so large walls aren't flat
    ctx.fillStyle = n < 0.33 ? p.d : (n < 0.72 ? p.m : p.l);
    ctx.fillRect(x, y, t, t);

    // interior noise blocks
    var n2 = M.hash2(tx * 3.1, ty * 2.7);
    ctx.fillStyle = 'rgba(0,0,0,' + (0.05 + n2 * 0.10).toFixed(3) + ')';
    ctx.fillRect(x + (n2 * t * 0.5 | 0), y + (n * t * 0.5 | 0), t * 0.4, t * 0.35);

    var up = !w.isSolid(tx, ty - 1);
    var dn = !w.isSolid(tx, ty + 1);
    var lf = !w.isSolid(tx - 1, ty);
    var rt = !w.isSolid(tx + 1, ty);

    // lit top face
    if (up) {
      var g = ctx.createLinearGradient(0, y, 0, y + t * 0.6);
      g.addColorStop(0, p.edge);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, t, t * 0.6);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x, y, t, 2);
      // chipped silhouette on the top edge
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      if (n < 0.3) ctx.fillRect(x, y, t * 0.34, 3);
      if (n > 0.7) ctx.fillRect(x + t * 0.62, y, t * 0.38, 2);
      // moss / lichen
      if (n2 > 0.62) {
        ctx.fillStyle = p.moss;
        ctx.fillRect(x + n * t * 0.4, y + 1, t * (0.3 + n2 * 0.4), 3 + n2 * 3);
      }
    }
    // ambient occlusion on inner edges
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    if (dn) ctx.fillRect(x, y + t - 3, t, 3);
    if (lf) ctx.fillRect(x, y, 2, t);
    if (rt) ctx.fillRect(x + t - 2, y, 2, t);

    // mortar lines
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    if (ty % 2 === 0) ctx.fillRect(x + (n > 0.5 ? t * 0.5 : 0) | 0, y, 1, t);
    ctx.fillRect(x, y + t - 1, t, 1);

    // cracks
    if (n2 < 0.09) {
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + n * t, y + 2);
      ctx.lineTo(x + n * t + (n2 - 0.05) * 60, y + t - 2);
      ctx.stroke();
    }
  };

  Terrain.prototype.tilePlat = function (ctx, tx, ty, ox, oy) {
    var t = K.TILE, p = this.bio.rock;
    var x = tx * t - ox, y = ty * t - oy;
    var n = M.hash2(tx, ty * 1.7);
    var h = 8;
    ctx.fillStyle = p.m;
    ctx.fillRect(x, y, t, h);
    ctx.fillStyle = p.edge;
    ctx.fillRect(x, y, t, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, t, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x, y + h - 2, t, 2);
    // hanging bracket detail
    if (n > 0.66) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x + t * 0.42, y + h, 3, 5 + n * 5);
    }
  };

  Terrain.prototype.tileSpike = function (ctx, tx, ty, ox, oy, w) {
    var t = K.TILE;
    var x = tx * t - ox, y = ty * t - oy;
    var upright = !w.isSolid(tx, ty + 1) && w.isSolid(tx, ty - 1);
    ctx.save();
    if (upright) { ctx.translate(x + t / 2, y + t / 2); ctx.rotate(Math.PI); ctx.translate(-t / 2, -t / 2); }
    else ctx.translate(x, y);
    // base plate
    ctx.fillStyle = '#241f26';
    ctx.fillRect(0, t - 5, t, 5);
    for (var i = 0; i < 3; i++) {
      var bx = 2 + i * (t - 4) / 3;
      var bw = (t - 4) / 3 - 1;
      var g = ctx.createLinearGradient(0, t - 5, 0, 2);
      g.addColorStop(0, '#6b6472');
      g.addColorStop(0.6, '#9aa0ae');
      g.addColorStop(1, '#e6ecf5');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(bx, t - 4);
      ctx.lineTo(bx + bw / 2, 1);
      ctx.lineTo(bx + bw, t - 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.moveTo(bx + bw / 2, 1);
      ctx.lineTo(bx + bw, t - 4);
      ctx.lineTo(bx + bw / 2, t - 4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };

  Terrain.prototype.bake = function (cx, cy) {
    var w = this.world, t = K.TILE;
    var cv = document.createElement('canvas');
    cv.width = CH; cv.height = CH;
    var ctx = cv.getContext('2d');
    var ox = cx * CH, oy = cy * CH;
    var tx0 = Math.floor(ox / t), tx1 = Math.ceil((ox + CH) / t);
    var ty0 = Math.floor(oy / t), ty1 = Math.ceil((oy + CH) / t);

    for (var ty = ty0; ty <= ty1; ty++) {
      for (var tx = tx0; tx <= tx1; tx++) {
        if (!w.inBounds(tx, ty)) continue;
        var v = w.grid[w.idx(tx, ty)];
        if (v === T.SOLID) {
          // gate columns are drawn dynamically, never baked
          if (this.isGateTile(tx, ty)) continue;
          this.tileRock(ctx, w, tx, ty, ox, oy);
        } else if (v === T.PLAT) {
          this.tilePlat(ctx, tx, ty, ox, oy);
        } else if (v === T.SPIKE) {
          this.tileSpike(ctx, tx, ty, ox, oy, w);
        }
        // CRUMBLE is dynamic (it can vanish) — drawn in the live pass
      }
    }

    // baked decals sitting on exposed tops
    for (var i = 0; i < w.decals.length; i++) {
      var d = w.decals[i];
      if (d.x < tx0 - 1 || d.x > tx1 + 1 || d.y < ty0 - 1 || d.y > ty1 + 1) continue;
      var x = d.x * t - ox, y = d.y * t - oy;
      ctx.save();
      if (d.k === 0) {          // rubble pile
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x + 2, y - 3, 6 + d.r * 8, 3);
        ctx.fillStyle = this.bio.rock.l;
        ctx.fillRect(x + 3, y - 5, 4 + d.r * 5, 3);
      } else if (d.k === 1) {   // tufts of dead grass
        ctx.strokeStyle = 'rgba(120,120,90,0.35)';
        ctx.lineWidth = 1;
        for (var s = 0; s < 4; s++) {
          ctx.beginPath();
          ctx.moveTo(x + 4 + s * 4, y);
          ctx.lineTo(x + 4 + s * 4 + (d.r - 0.5) * 8, y - 5 - d.r * 6);
          ctx.stroke();
        }
      } else if (d.k === 2) {   // broken pillar stub
        ctx.fillStyle = this.bio.rock.m;
        ctx.fillRect(x + 5, y - 12 - d.r * 10, 12, 12 + d.r * 10);
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(x + 5, y - 12 - d.r * 10, 3, 12 + d.r * 10);
      } else {                  // chain hanging from above
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + t * 0.5, y);
        ctx.lineTo(x + t * 0.5 + (d.r - 0.5) * 6, y - 20 - d.r * 26);
        ctx.stroke();
      }
      ctx.restore();
    }
    return cv;
  };

  Terrain.prototype.isGateTile = function (tx, ty) {
    var gs = this.world.gates;
    for (var i = 0; i < gs.length; i++) {
      var g = gs[i];
      if (g.tx === tx && ty >= g.ty && ty < g.ty + g.th) return true;
    }
    return false;
  };

  Terrain.prototype.draw = function (ctx, cam) {
    var ox = cam.ox(), oy = cam.oy();
    var vw = cam.vw / cam.zoom, vh = cam.vh / cam.zoom;
    var c0 = Math.max(0, Math.floor(ox / CH)), c1 = Math.min(this.cols - 1, Math.floor((ox + vw) / CH));
    var r0 = Math.max(0, Math.floor(oy / CH)), r1 = Math.min(this.rows - 1, Math.floor((oy + vh) / CH));
    for (var cy = r0; cy <= r1; cy++) {
      for (var cx = c0; cx <= c1; cx++) {
        var cv = this.get(cx, cy);
        ctx.drawImage(cv, Math.round(cx * CH - ox), Math.round(cy * CH - oy));
      }
    }
  };

  /* Dynamic terrain layer: crumble tiles, gates, movers, saws. */
  Terrain.prototype.drawDynamic = function (ctx, cam, time) {
    var w = this.world, t = K.TILE, p = this.bio.rock;
    var ox = cam.ox(), oy = cam.oy();
    var vw = cam.vw / cam.zoom, vh = cam.vh / cam.zoom;
    var tx0 = Math.max(0, Math.floor(ox / t) - 1), tx1 = Math.min(w.w - 1, Math.floor((ox + vw) / t) + 1);
    var ty0 = Math.max(0, Math.floor(oy / t) - 1), ty1 = Math.min(w.h - 1, Math.floor((oy + vh) / t) + 1);

    /* crumbling tiles */
    for (var ty = ty0; ty <= ty1; ty++) {
      for (var tx = tx0; tx <= tx1; tx++) {
        if (w.grid[w.idx(tx, ty)] !== T.CRUMBLE) continue;
        var st = w.crumbleState[tx + ',' + ty];
        if (st && st.gone) continue;
        var shake = st && st.t > 0 ? (Math.random() - 0.5) * 2.4 : 0;
        var x = tx * t - ox + shake, y = ty * t - oy + shake;
        ctx.save();
        ctx.globalAlpha = st && st.t > 0 ? 0.6 + Math.sin(time * 40) * 0.25 : 1;
        ctx.fillStyle = p.m;
        ctx.fillRect(x, y, t, t);
        ctx.fillStyle = p.edge;
        ctx.fillRect(x, y, t, 2);
        // fracture lines make it read as breakable
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 3, y); ctx.lineTo(x + t * 0.45, y + t * 0.55); ctx.lineTo(x + 2, y + t);
        ctx.moveTo(x + t - 3, y); ctx.lineTo(x + t * 0.6, y + t * 0.5); ctx.lineTo(x + t, y + t - 4);
        ctx.stroke();
        ctx.restore();
      }
    }

    /* arena gates — portcullis sliding down */
    for (var gi = 0; gi < w.gates.length; gi++) {
      var g = w.gates[gi];
      if (g.anim <= 0.001) continue;
      var gx = g.tx * t - ox;
      var full = g.th * t;
      var drop = full * G.M.easeInQuad(G.M.clamp(g.anim, 0, 1));
      var gy = g.ty * t - oy - full + drop;
      ctx.save();
      ctx.fillStyle = '#191520';
      ctx.fillRect(gx, gy, t, full);
      ctx.strokeStyle = '#4a4257';
      ctx.lineWidth = 3;
      for (var b = 0; b < 3; b++) {
        ctx.beginPath();
        ctx.moveTo(gx + 4 + b * 8, gy);
        ctx.lineTo(gx + 4 + b * 8, gy + full);
        ctx.stroke();
      }
      ctx.strokeStyle = '#332c3c';
      ctx.lineWidth = 4;
      for (var r = 0; r < g.th * 2; r++) {
        ctx.beginPath();
        ctx.moveTo(gx, gy + r * (t / 2));
        ctx.lineTo(gx + t, gy + r * (t / 2));
        ctx.stroke();
      }
      // spiked bottom edge
      ctx.fillStyle = '#6b6472';
      for (var s2 = 0; s2 < 3; s2++) {
        ctx.beginPath();
        ctx.moveTo(gx + 2 + s2 * 8, gy + full);
        ctx.lineTo(gx + 6 + s2 * 8, gy + full + 7);
        ctx.lineTo(gx + 10 + s2 * 8, gy + full);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    /* moving platforms */
    for (var mi = 0; mi < w.movers.length; mi++) {
      var m = w.movers[mi];
      var mx = m.x - ox, my = m.y - oy;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(mx + 2, my + m.h, m.w, 4);
      ctx.fillStyle = p.m;
      ctx.fillRect(mx, my, m.w, m.h);
      ctx.fillStyle = p.edge;
      ctx.fillRect(mx, my, m.w, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(mx, my, m.w, 1);
      ctx.fillStyle = this.bio.accent;
      ctx.globalAlpha = 0.55 + Math.sin(time * 3 + mi) * 0.2;
      ctx.fillRect(mx + 3, my + m.h - 3, m.w - 6, 2);
      ctx.restore();
    }

    /* saw blades */
    for (var hi = 0; hi < w.hazards.length; hi++) {
      var hz = w.hazards[hi];
      if (hz.type !== 'saw') continue;
      var sx = hz.x - ox, sy = hz.y - oy;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(hz.spin);
      var teeth = 10;
      ctx.fillStyle = '#8f97a6';
      ctx.beginPath();
      for (var i2 = 0; i2 < teeth; i2++) {
        var a0 = (i2 / teeth) * 6.2832, a1 = ((i2 + 0.5) / teeth) * 6.2832;
        ctx.lineTo(Math.cos(a0) * hz.r, Math.sin(a0) * hz.r);
        ctx.lineTo(Math.cos(a1) * hz.r * 0.72, Math.sin(a1) * hz.r * 0.72);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#3a3a46';
      ctx.beginPath(); ctx.arc(0, 0, hz.r * 0.32, 0, 6.2832); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(-hz.r * 0.06, -hz.r * 0.7, hz.r * 0.12, hz.r * 1.4);
      ctx.restore();
      // motion blur ring
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = '#cfd6e2';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sx, sy, hz.r * 0.95, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }

    /* torches */
    for (var i3 = 0; i3 < w.torches.length; i3++) {
      var tr = w.torches[i3];
      if (!cam.visible(tr.x - 20, tr.y - 20, 40, 40, 60)) continue;
      var x2 = tr.x - ox, y2 = tr.y - oy;
      var fl = 0.75 + Math.sin(time * 9 + tr.flick) * 0.15 + Math.sin(time * 23 + tr.flick * 2) * 0.1;
      ctx.save();
      ctx.fillStyle = '#2a2028';
      ctx.fillRect(x2 - 2, y2 - 2, 4, 12);
      ctx.globalCompositeOperation = 'lighter';
      var fg = ctx.createRadialGradient(x2, y2 - 4, 0, x2, y2 - 4, 13 * fl);
      fg.addColorStop(0, 'rgba(255,245,200,0.95)');
      fg.addColorStop(0.4, 'rgba(255,160,60,0.6)');
      fg.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(x2, y2 - 4, 13 * fl, 0, 6.2832); ctx.fill();
      ctx.restore();
    }
  };

  Terrain.prototype.torchLights = function (out, time) {
    var w = this.world;
    for (var i = 0; i < w.torches.length; i++) {
      var tr = w.torches[i];
      var fl = 0.82 + Math.sin(time * 8.5 + tr.flick) * 0.10 + Math.sin(time * 21 + tr.flick * 3) * 0.07;
      out.push({ x: tr.x, y: tr.y - 4, r: 150 * fl, col: [255, 170, 80], a: 0.85 * fl });
    }
    for (var m = 0; m < w.movers.length; m++) {
      var mv = w.movers[m];
      out.push({ x: mv.x + mv.w * 0.5, y: mv.y + mv.h, r: 70, col: [180, 200, 255], a: 0.25 });
    }
  };

  Terrain.CHUNK = CH;
  return Terrain;
})();

/* ============================================================= parallax === */
G.Parallax = (function () {
  var M = G.M;

  function Parallax(biome, seed, vw, vh) {
    this.biome = biome;
    this.bio = G.Biomes[biome] || G.Biomes.ruins;
    this.vw = vw; this.vh = vh;
    this.layers = [];
    this.build(seed || 7);
  }

  Parallax.prototype.build = function (seed) {
    var rng = G.RNG(seed);
    var defs;
    if (this.biome === 'caverns') {
      defs = [
        { depth: 0.06, kind: 'stalactites', n: 26, alpha: 0.30, col: '#0b1020' },
        { depth: 0.14, kind: 'crystals', n: 18, alpha: 0.42, col: '#16263f' },
        { depth: 0.28, kind: 'columns', n: 12, alpha: 0.55, col: '#1a2438' },
        { depth: 0.46, kind: 'water', n: 1, alpha: 0.45, col: '#101a2c' }
      ];
    } else if (this.biome === 'citadel') {
      defs = [
        { depth: 0.05, kind: 'storm', n: 1, alpha: 0.5, col: '#191325' },
        { depth: 0.12, kind: 'spires', n: 14, alpha: 0.36, col: '#120e1c' },
        { depth: 0.26, kind: 'spires', n: 10, alpha: 0.55, col: '#1b1526' },
        { depth: 0.44, kind: 'arches', n: 8, alpha: 0.62, col: '#241c30' }
      ];
    } else {
      defs = [
        { depth: 0.04, kind: 'moon', n: 1, alpha: 1.0, col: '#e8dfc8' },
        { depth: 0.11, kind: 'towers', n: 12, alpha: 0.30, col: '#171322' },
        { depth: 0.24, kind: 'towers', n: 9, alpha: 0.48, col: '#20192b' },
        { depth: 0.42, kind: 'arches', n: 7, alpha: 0.60, col: '#2b2135' }
      ];
    }
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      var items = [];
      for (var j = 0; j < d.n; j++) {
        items.push({
          x: rng.next() * 4000,
          y: rng.next(),
          w: 30 + rng.next() * 150,
          h: 60 + rng.next() * 320,
          r: rng.next(),
          r2: rng.next()
        });
      }
      this.layers.push({ depth: d.depth, kind: d.kind, alpha: d.alpha, col: d.col, items: items, span: 4000 });
    }
  };

  Parallax.prototype.drawSky = function (ctx, vw, vh, camY, worldH) {
    var g = ctx.createLinearGradient(0, 0, 0, vh);
    var stops = this.bio.sky;
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][1], stops[i][0]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);
    // depth haze that darkens as you descend
    var deep = M.clamp(camY / Math.max(1, worldH - vh), 0, 1);
    if (deep > 0.01) {
      ctx.fillStyle = 'rgba(0,0,0,' + (deep * 0.35).toFixed(3) + ')';
      ctx.fillRect(0, 0, vw, vh);
    }
  };

  Parallax.prototype.draw = function (ctx, cam, time, worldH) {
    var vw = cam.vw, vh = cam.vh;
    this.drawSky(ctx, vw, vh, cam.y, worldH);

    for (var li = 0; li < this.layers.length; li++) {
      var L = this.layers[li];
      var ox = cam.ox() * L.depth;
      var oy = cam.oy() * L.depth * 0.5;
      ctx.save();
      ctx.globalAlpha = L.alpha;
      ctx.fillStyle = L.col;

      if (L.kind === 'moon') {
        var mx = vw * 0.76 - ox * 0.3, my = vh * 0.18 - oy * 0.3;
        ctx.globalCompositeOperation = 'lighter';
        var mg = ctx.createRadialGradient(mx, my, 0, mx, my, 130);
        mg.addColorStop(0, 'rgba(240,232,205,0.55)');
        mg.addColorStop(0.25, 'rgba(200,190,170,0.20)');
        mg.addColorStop(1, 'rgba(140,140,170,0)');
        ctx.fillStyle = mg;
        ctx.beginPath(); ctx.arc(mx, my, 130, 0, 6.2832); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(232,223,200,0.85)';
        ctx.beginPath(); ctx.arc(mx, my, 34, 0, 6.2832); ctx.fill();
        ctx.fillStyle = 'rgba(180,172,155,0.5)';
        ctx.beginPath(); ctx.arc(mx - 10, my - 6, 7, 0, 6.2832); ctx.fill();
        ctx.beginPath(); ctx.arc(mx + 12, my + 9, 5, 0, 6.2832); ctx.fill();
        ctx.restore();
        continue;
      }

      if (L.kind === 'storm') {
        // rolling cloud bands + occasional lightning wash
        for (var c = 0; c < 5; c++) {
          var cy2 = vh * (0.08 + c * 0.07) - oy * 0.4;
          var w2 = vw * 1.4;
          var sx = ((-ox * 0.5 + time * (6 + c * 3)) % w2) - w2 * 0.2;
          var cg = ctx.createLinearGradient(0, cy2 - 30, 0, cy2 + 40);
          cg.addColorStop(0, 'rgba(30,24,44,0)');
          cg.addColorStop(0.5, L.col);
          cg.addColorStop(1, 'rgba(20,16,32,0)');
          ctx.fillStyle = cg;
          ctx.beginPath();
          ctx.moveTo(sx - 200, cy2 + 40);
          for (var k = 0; k <= 10; k++) {
            var px = sx - 200 + k * (w2 / 10);
            ctx.lineTo(px, cy2 + Math.sin(k * 1.3 + c * 2 + time * 0.4) * 22);
          }
          ctx.lineTo(sx + w2, cy2 + 40);
          ctx.closePath(); ctx.fill();
        }
        var strike = Math.sin(time * 0.7) > 0.985 ? 1 : 0;
        if (strike) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = 'rgba(190,180,255,0.10)';
          ctx.fillRect(0, 0, vw, vh);
        }
        ctx.restore();
        continue;
      }

      if (L.kind === 'water') {
        var wy = vh * 0.72 - oy;
        ctx.fillStyle = L.col;
        ctx.fillRect(0, wy, vw, vh - wy);
        ctx.globalCompositeOperation = 'lighter';
        for (var r2 = 0; r2 < 10; r2++) {
          var ry = wy + r2 * 9;
          ctx.globalAlpha = L.alpha * (0.25 - r2 * 0.02);
          ctx.fillStyle = '#5fd4e8';
          var wob = Math.sin(time * 1.4 + r2 * 0.8) * 16;
          ctx.fillRect(-ox * 0.2 + wob, ry, vw * 1.4, 2);
        }
        ctx.restore();
        continue;
      }

      for (var i = 0; i < L.items.length; i++) {
        var it = L.items[i];
        var x = ((it.x - ox) % L.span + L.span) % L.span - L.span * 0.15;
        if (x < -260 || x > vw + 260) continue;

        if (L.kind === 'towers' || L.kind === 'spires') {
          var by = vh * (0.62 + it.y * 0.22) - oy;
          var h = it.h * (L.kind === 'spires' ? 1.25 : 1);
          ctx.beginPath();
          ctx.moveTo(x, by);
          ctx.lineTo(x, by - h);
          if (L.kind === 'spires') {
            ctx.lineTo(x + it.w * 0.5, by - h - it.w * 0.9);
            ctx.lineTo(x + it.w, by - h);
          } else {
            // broken, jagged crown
            ctx.lineTo(x + it.w * 0.2, by - h - it.r * 26);
            ctx.lineTo(x + it.w * 0.45, by - h + 8);
            ctx.lineTo(x + it.w * 0.72, by - h - it.r2 * 20);
            ctx.lineTo(x + it.w, by - h + 4);
          }
          ctx.lineTo(x + it.w, by);
          ctx.closePath();
          ctx.fill();
          // windows glowing faintly
          if (it.r > 0.45) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = L.alpha * 0.5;
            ctx.fillStyle = this.bio.accent;
            var rows = Math.floor(h / 46);
            for (var rr = 0; rr < rows; rr++) {
              if (M.hash2(i * 7 + rr, li) < 0.45) continue;
              ctx.fillRect(x + it.w * 0.32, by - h + 22 + rr * 46, 5, 9);
            }
            ctx.restore();
          }
        } else if (L.kind === 'arches') {
          var ay = vh * (0.74 + it.y * 0.14) - oy;
          var aw = it.w * 1.5, ah = it.h * 0.7;
          ctx.beginPath();
          ctx.moveTo(x, ay);
          ctx.lineTo(x, ay - ah);
          ctx.quadraticCurveTo(x + aw * 0.5, ay - ah - aw * 0.42, x + aw, ay - ah);
          ctx.lineTo(x + aw, ay);
          ctx.lineTo(x + aw - 14, ay);
          ctx.lineTo(x + aw - 14, ay - ah + 6);
          ctx.quadraticCurveTo(x + aw * 0.5, ay - ah - aw * 0.22, x + 14, ay - ah + 6);
          ctx.lineTo(x + 14, ay);
          ctx.closePath();
          ctx.fill();
        } else if (L.kind === 'stalactites') {
          var ty2 = -oy - 10;
          ctx.beginPath();
          ctx.moveTo(x, ty2);
          ctx.lineTo(x + it.w * 0.5, ty2 + it.h * 0.9);
          ctx.lineTo(x + it.w, ty2);
          ctx.closePath();
          ctx.fill();
        } else if (L.kind === 'columns') {
          var cy3 = vh * 0.9 - oy;
          ctx.fillRect(x, cy3 - it.h, it.w * 0.5, it.h);
          ctx.beginPath();
          ctx.moveTo(x - 6, cy3 - it.h);
          ctx.lineTo(x + it.w * 0.25, cy3 - it.h - 22);
          ctx.lineTo(x + it.w * 0.5 + 6, cy3 - it.h);
          ctx.closePath(); ctx.fill();
        } else if (L.kind === 'crystals') {
          var gy2 = vh * (0.7 + it.y * 0.2) - oy;
          var ch = it.h * 0.5;
          ctx.save();
          ctx.translate(x, gy2);
          ctx.rotate((it.r - 0.5) * 0.5);
          var cg2 = ctx.createLinearGradient(0, 0, 0, -ch);
          cg2.addColorStop(0, L.col);
          cg2.addColorStop(1, 'rgba(120,220,240,0.55)');
          ctx.fillStyle = cg2;
          ctx.beginPath();
          ctx.moveTo(-it.w * 0.22, 0);
          ctx.lineTo(0, -ch);
          ctx.lineTo(it.w * 0.22, 0);
          ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
    }
  };

  return Parallax;
})();

/* =========================================================== light pass === */
/* Lights render at half resolution into an offscreen canvas, then composite
   with 'multiply' so unlit geometry falls into shadow. Half-res is ~4x cheaper
   and the blur it introduces reads as a soft falloff, which is what we want. */
G.LightPass = (function () {
  function LightPass() {
    this.cv = document.createElement('canvas');
    this.ctx = this.cv.getContext('2d');
    this.w = 0; this.h = 0; this.div = 2;
  }

  LightPass.prototype.resize = function (w, h, quality) {
    this.div = quality === 'low' ? 3 : (quality === 'high' ? 1 : 2);
    var nw = Math.max(1, Math.ceil(w / this.div)), nh = Math.max(1, Math.ceil(h / this.div));
    if (nw !== this.w || nh !== this.h) {
      this.w = nw; this.h = nh;
      this.cv.width = nw; this.cv.height = nh;
    }
  };

  LightPass.prototype.render = function (lights, cam, ambient, vw, vh, quality) {
    this.resize(vw, vh, quality);
    var c = this.ctx, d = this.div;
    var amb = ambient || [0.3, 0.3, 0.36];
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = 'rgb(' + Math.round(amb[0] * 255) + ',' + Math.round(amb[1] * 255) + ',' + Math.round(amb[2] * 255) + ')';
    c.fillRect(0, 0, this.w, this.h);
    c.globalCompositeOperation = 'lighter';

    var ox = cam.ox(), oy = cam.oy();
    for (var i = 0; i < lights.length; i++) {
      var L = lights[i];
      var x = (L.x - ox) / d, y = (L.y - oy) / d, r = L.r / d;
      if (x + r < 0 || x - r > this.w || y + r < 0 || y - r > this.h) continue;
      var a = L.a == null ? 1 : L.a;
      var col = L.col || [255, 220, 170];
      var g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + a.toFixed(3) + ')');
      g.addColorStop(0.45, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (a * 0.42).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill();
    }
    return this.cv;
  };

  LightPass.prototype.composite = function (ctx, vw, vh) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.cv, 0, 0, this.w, this.h, 0, 0, vw, vh);
    ctx.restore();
    // gentle additive bloom pass reuses the same buffer for glow spill
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.16;
    ctx.drawImage(this.cv, 0, 0, this.w, this.h, 0, 0, vw, vh);
    ctx.restore();
  };

  return LightPass;
})();

/* ============================================================ fx drawing == */
G.Draw = {
  particles: function (ctx, parts, cam) {
    var ox = cam.ox(), oy = cam.oy();
    var pool = parts.pool;
    ctx.save();
    for (var i = 0; i < pool.length; i++) {
      var p = pool[i];
      if (!p.alive) continue;
      var x = p.x - ox, y = p.y - oy;
      if (x < -40 || y < -40 || x > cam.vw + 40 || y > cam.vh + 40) continue;
      var k = p.life / p.max;
      ctx.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
      ctx.globalAlpha = Math.min(1, k * 1.3);
      ctx.fillStyle = p.col;
      if (p.kind === 1) {                       // spark streak along velocity
        var vl = Math.min(18, Math.sqrt(p.vx * p.vx + p.vy * p.vy) * 0.028);
        var a = Math.atan2(p.vy, p.vx);
        ctx.save();
        ctx.translate(x, y); ctx.rotate(a);
        ctx.fillRect(-vl, -p.size * 0.35 * k, vl + p.size, Math.max(0.6, p.size * 0.7 * k));
        ctx.restore();
      } else if (p.kind === 2) {                // smoke puff
        ctx.globalAlpha *= 0.55;
        ctx.beginPath();
        ctx.arc(x, y, p.size * (1.6 - k * 0.6), 0, 6.2832);
        ctx.fill();
      } else if (p.kind === 3) {                // tumbling shard
        ctx.save();
        ctx.translate(x, y); ctx.rotate(p.rot);
        ctx.fillRect(-p.size * 0.5, -p.size * 0.35, p.size, p.size * 0.7);
        ctx.restore();
      } else if (p.kind === 4) {                // expanding ring
        var e = 1 - k;
        ctx.globalAlpha = k * k * 0.85;
        ctx.strokeStyle = p.col;
        ctx.lineWidth = Math.max(1, 5 * k);
        ctx.beginPath();
        ctx.arc(x, y, p.size * G.M.easeOutCubic(e), 0, 6.2832);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.5, p.size * (0.5 + k * 0.5)), 0, 6.2832);
        ctx.fill();
      }
    }
    ctx.restore();
  },

  slashes: function (ctx, sl, cam) {
    var ox = cam.ox(), oy = cam.oy();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < sl.items.length; i++) {
      var s = sl.items[i];
      var k = s.life / s.max;
      var x = s.x - ox, y = s.y - oy;
      var sweep = G.M.easeOutCubic(1 - k);
      var a0 = s.a0, a1 = s.a0 + (s.a1 - s.a0) * (0.35 + sweep * 0.65);
      ctx.save();
      ctx.translate(x, y);
      if (s.dir < 0) ctx.scale(-1, 1);
      ctx.globalAlpha = Math.min(1, k * 1.6) * 0.9;
      ctx.strokeStyle = s.col;
      ctx.lineCap = 'round';
      ctx.lineWidth = s.width * k;
      ctx.beginPath();
      ctx.arc(0, 0, s.r, a0, a1);
      ctx.stroke();
      // bright inner core
      ctx.globalAlpha = Math.min(1, k * 2) * 0.8;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = Math.max(1, s.width * k * 0.28);
      ctx.beginPath();
      ctx.arc(0, 0, s.r, a0, a1);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  },

  ghosts: function (ctx, gh, cam) {
    var ox = cam.ox(), oy = cam.oy();
    ctx.save();
    for (var i = 0; i < gh.items.length; i++) {
      var g = gh.items[i];
      ctx.save();
      ctx.translate(-ox, -oy);
      if (g.draw) {
        g.draw(ctx, g);
      } else {
        ctx.globalAlpha = (g.life / g.max) * 0.4;
        ctx.fillStyle = g.col;
        ctx.fillRect(g.x, g.y, g.w, g.h);
      }
      ctx.restore();
    }
    ctx.restore();
  },

  floatText: function (ctx, ft, cam) {
    var ox = cam.ox(), oy = cam.oy();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < ft.items.length; i++) {
      var it = ft.items[i];
      var k = it.life / it.max;
      var x = Math.round(it.x - ox), y = Math.round(it.y - oy);
      ctx.globalAlpha = Math.min(1, k * 2.2);
      ctx.font = 'bold ' + Math.round(it.size * (1 + (1 - k) * 0.12)) + 'px "Segoe UI", system-ui, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(it.text, x, y);
      ctx.fillStyle = it.col;
      ctx.fillText(it.text, x, y);
    }
    ctx.restore();
  }
};

/* ============================================================== post fx === */
G.Post = (function () {
  var grainCv = null;

  function buildGrain() {
    grainCv = document.createElement('canvas');
    grainCv.width = 128; grainCv.height = 128;
    var c = grainCv.getContext('2d');
    var img = c.createImageData(128, 128);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = 118 + Math.random() * 30;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 26;
    }
    c.putImageData(img, 0, 0);
  }

  return {
    apply: function (ctx, vw, vh, opts) {
      opts = opts || {};
      var flash = opts.flash, quality = opts.quality || 'med';

      // fog / depth wash
      if (opts.fog) {
        ctx.save();
        ctx.globalAlpha = 0.20;
        ctx.fillStyle = opts.fog;
        ctx.fillRect(0, 0, vw, vh);
        ctx.restore();
      }

      // vignette
      ctx.save();
      var vg = ctx.createRadialGradient(vw * 0.5, vh * 0.5, Math.min(vw, vh) * 0.34,
                                        vw * 0.5, vh * 0.5, Math.max(vw, vh) * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.62)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, vw, vh);
      ctx.restore();

      // low-health / hurt pulse
      if (flash && flash.hurtPulse > 0.01) {
        ctx.save();
        var hp = flash.hurtPulse;
        var hg = ctx.createRadialGradient(vw * 0.5, vh * 0.5, Math.min(vw, vh) * 0.22,
                                          vw * 0.5, vh * 0.5, Math.max(vw, vh) * 0.62);
        hg.addColorStop(0, 'rgba(160,0,20,0)');
        hg.addColorStop(1, 'rgba(160,0,20,' + (hp * 0.55).toFixed(3) + ')');
        ctx.fillStyle = hg;
        ctx.fillRect(0, 0, vw, vh);
        ctx.restore();
      }
      if (opts.lowHealth > 0.01) {
        ctx.save();
        var lg = ctx.createRadialGradient(vw * 0.5, vh * 0.5, Math.min(vw, vh) * 0.26,
                                          vw * 0.5, vh * 0.5, Math.max(vw, vh) * 0.66);
        lg.addColorStop(0, 'rgba(120,0,16,0)');
        lg.addColorStop(1, 'rgba(120,0,16,' + (opts.lowHealth * 0.5).toFixed(3) + ')');
        ctx.fillStyle = lg;
        ctx.fillRect(0, 0, vw, vh);
        ctx.restore();
      }

      // impact flash
      if (flash && flash.a > 0.002) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(0.9, flash.a);
        ctx.fillStyle = flash.col;
        ctx.fillRect(0, 0, vw, vh);
        ctx.restore();
      }

      // film grain
      if (quality !== 'low') {
        if (!grainCv) buildGrain();
        ctx.save();
        ctx.globalAlpha = 0.055;
        ctx.globalCompositeOperation = 'overlay';
        var gx = -(Math.random() * 128 | 0), gy = -(Math.random() * 128 | 0);
        for (var y = gy; y < vh; y += 128)
          for (var x = gx; x < vw; x += 128)
            ctx.drawImage(grainCv, x, y);
        ctx.restore();
      }

      // letterbox scanline softening for a slightly filmic look
      if (quality === 'high') {
        ctx.save();
        ctx.globalAlpha = 0.05;
        ctx.fillStyle = '#000';
        for (var sy = 0; sy < vh; sy += 3) ctx.fillRect(0, sy, vw, 1);
        ctx.restore();
      }
    }
  };
})();
