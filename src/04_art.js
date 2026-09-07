/* ==========================================================================
   GRIMHOLLOW  —  04_art.js
   Procedural character art. No sprite sheets: every actor is drawn from a
   small skeleton with tapered-capsule limbs, then rim-lit and shadowed.
   Poses are authored as joint-angle sets and blended, so animation is
   continuous rather than framed — cheap way to get fluid motion.
   ========================================================================== */
'use strict';

var G = (typeof G !== 'undefined') ? G : {};

G.Art = (function () {
  var M = G.M;

  /* ------------------------------------------------------------ shapes --- */

  /* Tapered capsule from (x,y) along angle a, length l, width w0→w1. */
  function capsule(ctx, x, y, a, l, w0, w1) {
    var ex = x + Math.sin(a) * l, ey = y + Math.cos(a) * l;
    var nx = Math.cos(a), ny = -Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(x + nx * w0 * 0.5, y + ny * w0 * 0.5);
    ctx.lineTo(ex + nx * w1 * 0.5, ey + ny * w1 * 0.5);
    ctx.arc(ex, ey, w1 * 0.5, Math.atan2(ny, nx), Math.atan2(-ny, -nx), true);
    ctx.lineTo(x - nx * w0 * 0.5, y - ny * w0 * 0.5);
    ctx.arc(x, y, w0 * 0.5, Math.atan2(-ny, -nx), Math.atan2(ny, nx), true);
    ctx.closePath();
    return { x: ex, y: ey };
  }

  function limb(ctx, x, y, aUp, lUp, aLo, lLo, w0, w1, w2, fill) {
    ctx.fillStyle = fill;
    var mid = capsule(ctx, x, y, aUp, lUp, w0, w1); ctx.fill();
    var end = capsule(ctx, mid.x, mid.y, aLo, lLo, w1, w2); ctx.fill();
    return { mid: mid, end: end };
  }

  function ellipse(ctx, x, y, rx, ry, rot, fill) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot || 0);
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.restore();
  }

  /* ---------------------------------------------------------- rig defs --- */
  /* Proportions in px, roughly matched to a 26x44 collision box for the hero. */
  function makeRig(o) {
    o = o || {};
    var r = {
      hipY: o.hipY == null ? 6 : o.hipY,       // hip offset below body centre
      torso: o.torso == null ? 17 : o.torso,
      neck: o.neck == null ? 3 : o.neck,
      headR: o.headR == null ? 6.0 : o.headR,
      upperArm: o.upperArm == null ? 9 : o.upperArm,
      foreArm: o.foreArm == null ? 9 : o.foreArm,
      thigh: o.thigh == null ? 11 : o.thigh,
      shin: o.shin == null ? 11 : o.shin,
      armW: o.armW == null ? 5.0 : o.armW,
      legW: o.legW == null ? 6.2 : o.legW,
      torsoW: o.torsoW == null ? 13 : o.torsoW,
      shoulderW: o.shoulderW == null ? 15 : o.shoulderW,
      dark: o.dark || '#1a1724',
      mid: o.mid || '#2a2536',
      light: o.light || '#3b3448',
      skin: o.skin || '#c9a184',
      accent: o.accent || '#c9853f',
      rim: o.rim || 'rgba(190,220,255,0.55)',
      cloth: o.cloth || null,
      weapon: o.weapon || null,        // 'sword'|'axe'|'bow'|'spear'|'shield'|null
      shield: o.shield || false,
      helm: o.helm || 'hood',          // 'hood'|'horned'|'plate'|'none'|'crown'|'skull'
      cape: o.cape || false,
      scale: o.scale == null ? 1 : o.scale,
      eyeCol: o.eyeCol || '#ffd36b'
    };
    return r;
  }

  /* ------------------------------------------------------------- poses --- */
  /* A pose is a flat object of angles (radians). Blend with mix(). */
  function pose(o) {
    return {
      lean: o.lean || 0, bob: o.bob || 0, squash: o.squash == null ? 1 : o.squash,
      headA: o.headA || 0,
      shA: o.shA || 0, elA: o.elA || 0,      // near arm (weapon arm)
      shB: o.shB || 0, elB: o.elB || 0,      // far arm
      hipA: o.hipA || 0, knA: o.knA || 0,    // near leg
      hipB: o.hipB || 0, knB: o.knB || 0,    // far leg
      wpn: o.wpn || 0, wpnX: o.wpnX || 0, wpnY: o.wpnY || 0,
      capeA: o.capeA == null ? 0.25 : o.capeA
    };
  }

  function mix(a, b, t) {
    var o = {};
    for (var k in a) o[k] = M.lerp(a[k], b[k], t);
    return o;
  }

  /* Angles: 0 points straight down, +ve swings forward (toward facing). */
  var P = {
    idle: pose({ lean: 0.03, shA: 0.30, elA: 0.55, shB: -0.22, elB: 0.34, hipA: 0.06, knA: -0.06, hipB: -0.07, knB: 0.08, wpn: -0.35 }),
    run: pose({ lean: 0.22, shA: 0.5, elA: 0.8, shB: -0.5, elB: 0.6, hipA: 0.7, knA: -0.7, hipB: -0.6, knB: 0.5, wpn: -0.5 }),
    runB: pose({ lean: 0.22, shA: -0.4, elA: 0.5, shB: 0.55, elB: 0.85, hipA: -0.6, knA: 0.5, hipB: 0.75, knB: -0.75, wpn: -0.4 }),
    jump: pose({ lean: 0.12, shA: -0.75, elA: 0.35, shB: -1.0, elB: 0.5, hipA: 0.55, knA: -1.05, hipB: -0.30, knB: 0.35, wpn: -0.9, capeA: 0.9 }),
    fall: pose({ lean: -0.06, shA: -1.25, elA: 0.45, shB: -1.45, elB: 0.55, hipA: 0.28, knA: -0.4, hipB: -0.45, knB: 0.6, wpn: -1.1, capeA: 1.15 }),
    land: pose({ lean: 0.30, squash: 0.84, bob: 4, shA: 0.9, elA: 1.0, shB: 0.6, elB: 0.9, hipA: 0.85, knA: -1.25, hipB: -0.8, knB: 1.15, wpn: 0.1 }),
    wall: pose({ lean: -0.16, shA: -1.5, elA: 0.4, shB: -1.7, elB: 0.9, hipA: 0.5, knA: -0.9, hipB: -0.15, knB: 0.75, wpn: -1.3, capeA: 0.55 }),
    dash: pose({ lean: 0.72, squash: 1.05, shA: -0.95, elA: 0.15, shB: -1.25, elB: 0.3, hipA: 0.95, knA: -0.5, hipB: -0.85, knB: 0.35, wpn: -1.35, capeA: 1.5 }),
    crouch: pose({ lean: 0.36, squash: 0.8, bob: 6, shA: 0.55, elA: 0.9, shB: 0.3, elB: 0.8, hipA: 1.1, knA: -1.6, hipB: -0.95, knB: 1.5, wpn: -0.2 }),
    // attack keyframes: wind → strike → recover
    atk1a: pose({ lean: -0.30, shA: -1.9, elA: -0.65, shB: 0.35, elB: 0.65, hipA: -0.2, knA: 0.2, hipB: 0.3, knB: -0.3, wpn: -1.5 }),
    atk1b: pose({ lean: 0.46, shA: 0.95, elA: 0.10, shB: -0.55, elB: 0.5, hipA: 0.5, knA: -0.35, hipB: -0.45, knB: 0.35, wpn: 0.85 }),
    atk1c: pose({ lean: 0.22, shA: 0.65, elA: 0.55, shB: -0.3, elB: 0.45, hipA: 0.3, knA: -0.2, hipB: -0.3, knB: 0.25, wpn: 0.25 }),
    atk2a: pose({ lean: 0.42, shA: 1.15, elA: 0.9, shB: -0.4, elB: 0.5, hipA: 0.35, knA: -0.3, hipB: -0.3, knB: 0.25, wpn: 1.5 }),
    atk2b: pose({ lean: -0.24, shA: -1.55, elA: -0.35, shB: 0.5, elB: 0.7, hipA: -0.25, knA: 0.25, hipB: 0.35, knB: -0.3, wpn: -1.75 }),
    atk3a: pose({ lean: -0.42, shA: -2.35, elA: -0.9, shB: -0.2, elB: 0.5, hipA: -0.35, knA: 0.3, hipB: 0.45, knB: -0.4, wpn: -2.1, capeA: -0.3 }),
    atk3b: pose({ lean: 0.66, squash: 0.94, shA: 1.5, elA: 0.25, shB: -0.7, elB: 0.4, hipA: 0.85, knA: -0.6, hipB: -0.7, knB: 0.5, wpn: 1.35 }),
    block: pose({ lean: -0.12, shA: -0.55, elA: 1.35, shB: -0.85, elB: 1.5, hipA: 0.25, knA: -0.35, hipB: -0.3, knB: 0.4, wpn: -0.1 }),
    parry: pose({ lean: -0.4, shA: -1.5, elA: 0.9, shB: -1.1, elB: 1.3, hipA: 0.15, knA: -0.3, hipB: -0.2, knB: 0.3, wpn: -1.9 }),
    hurt: pose({ lean: -0.55, shA: -1.15, elA: -0.5, shB: -1.4, elB: -0.35, hipA: -0.35, knA: 0.45, hipB: 0.4, knB: -0.35, wpn: -1.7, capeA: -0.5 }),
    dead: pose({ lean: 1.45, bob: 15, squash: 0.7, shA: 1.6, elA: 0.2, shB: 1.4, elB: 0.3, hipA: 1.5, knA: -0.4, hipB: 1.2, knB: -0.3, wpn: 1.6 }),
    slam: pose({ lean: 0.1, shA: -2.6, elA: -0.4, shB: -2.3, elB: -0.3, hipA: 0.4, knA: -1.3, hipB: -0.4, knB: 1.2, wpn: -2.6, capeA: 1.3 }),
    // ranged
    aim: pose({ lean: 0.05, shA: -1.45, elA: 0.05, shB: -1.2, elB: 1.25, hipA: 0.2, knA: -0.2, hipB: -0.25, knB: 0.3, wpn: -1.55 }),
    shoot: pose({ lean: -0.1, shA: -1.5, elA: 0.0, shB: -0.2, elB: 0.4, hipA: 0.2, knA: -0.2, hipB: -0.25, knB: 0.3, wpn: -1.6 })
  };

  /* --------------------------------------------------------- weapon art --- */
  function drawWeapon(ctx, rig, kind, hx, hy, a, glow) {
    var s = rig.scale;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(-a);
    switch (kind) {
      case 'sword': {
        var L = 30 * s;
        // crossguard
        ctx.fillStyle = rig.accent;
        ctx.fillRect(-5.5 * s, -2.0 * s, 11 * s, 3.0 * s);
        // grip
        ctx.fillStyle = '#2a1d16';
        ctx.fillRect(-1.6 * s, 0, 3.2 * s, 7 * s);
        ctx.fillStyle = rig.accent;
        ctx.beginPath(); ctx.arc(0, 7.5 * s, 2.1 * s, 0, 6.2832); ctx.fill();
        // blade (tapered, with a bright edge highlight)
        var grad = ctx.createLinearGradient(-2.6 * s, 0, 2.6 * s, 0);
        grad.addColorStop(0, '#8e97a8'); grad.addColorStop(0.42, '#e8eef8');
        grad.addColorStop(0.6, '#c3ccdb'); grad.addColorStop(1, '#6d7688');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-2.6 * s, -2.0 * s);
        ctx.lineTo(-1.5 * s, -L);
        ctx.lineTo(0, -L - 4.5 * s);
        ctx.lineTo(1.5 * s, -L);
        ctx.lineTo(2.6 * s, -2.0 * s);
        ctx.closePath(); ctx.fill();
        if (glow) {
          ctx.strokeStyle = 'rgba(180,225,255,' + (0.30 + glow * 0.55) + ')';
          ctx.lineWidth = 1.4 * s; ctx.stroke();
        }
        break;
      }
      case 'greatsword': {
        var GL = 44 * s;
        ctx.fillStyle = rig.accent; ctx.fillRect(-8 * s, -2.4 * s, 16 * s, 3.6 * s);
        ctx.fillStyle = '#231a14'; ctx.fillRect(-2.2 * s, 0, 4.4 * s, 11 * s);
        var g2 = ctx.createLinearGradient(-4.6 * s, 0, 4.6 * s, 0);
        g2.addColorStop(0, '#6b7383'); g2.addColorStop(0.45, '#dfe6f2'); g2.addColorStop(1, '#575e6d');
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.moveTo(-4.6 * s, -2.4 * s); ctx.lineTo(-3.2 * s, -GL);
        ctx.lineTo(0, -GL - 7 * s); ctx.lineTo(3.2 * s, -GL);
        ctx.lineTo(4.6 * s, -2.4 * s); ctx.closePath(); ctx.fill();
        break;
      }
      case 'axe': {
        ctx.fillStyle = '#3a2a1c'; ctx.fillRect(-2.0 * s, -26 * s, 4.0 * s, 34 * s);
        ctx.fillStyle = '#8f97a4';
        ctx.beginPath();
        ctx.moveTo(1.6 * s, -26 * s); ctx.lineTo(15 * s, -22 * s);
        ctx.lineTo(17 * s, -13 * s); ctx.lineTo(1.6 * s, -12 * s);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#cfd6e2';
        ctx.beginPath();
        ctx.moveTo(13 * s, -22.5 * s); ctx.lineTo(15.5 * s, -21.5 * s);
        ctx.lineTo(17 * s, -13.4 * s); ctx.lineTo(14 * s, -12.6 * s);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'spear': {
        ctx.fillStyle = '#3a2a1c'; ctx.fillRect(-1.7 * s, -34 * s, 3.4 * s, 48 * s);
        ctx.fillStyle = '#d3dae6';
        ctx.beginPath();
        ctx.moveTo(0, -46 * s); ctx.lineTo(3.6 * s, -33 * s);
        ctx.lineTo(0, -29 * s); ctx.lineTo(-3.6 * s, -33 * s);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'bow': {
        ctx.strokeStyle = '#5a4028'; ctx.lineWidth = 2.6 * s;
        ctx.beginPath(); ctx.arc(0, 0, 13 * s, -1.25, 1.25); ctx.stroke();
        ctx.strokeStyle = 'rgba(230,230,230,0.75)'; ctx.lineWidth = 1 * s;
        ctx.beginPath();
        ctx.moveTo(13 * s * Math.cos(-1.25), 13 * s * Math.sin(-1.25));
        ctx.lineTo(13 * s * Math.cos(1.25), 13 * s * Math.sin(1.25));
        ctx.stroke();
        break;
      }
      case 'staff': {
        ctx.fillStyle = '#42301f'; ctx.fillRect(-1.8 * s, -30 * s, 3.6 * s, 46 * s);
        var pg = ctx.createRadialGradient(0, -34 * s, 0, 0, -34 * s, 8 * s);
        pg.addColorStop(0, 'rgba(190,120,255,0.95)'); pg.addColorStop(1, 'rgba(120,60,220,0)');
        ctx.fillStyle = pg;
        ctx.beginPath(); ctx.arc(0, -34 * s, 8 * s, 0, 6.2832); ctx.fill();
        break;
      }
      case 'claw': {
        ctx.fillStyle = '#cfd6e2';
        for (var c = -1; c <= 1; c++) {
          ctx.beginPath();
          ctx.moveTo(c * 3.2 * s, 0);
          ctx.lineTo(c * 4.8 * s + 1.2 * s, -13 * s);
          ctx.lineTo(c * 3.2 * s - 1.0 * s, -11 * s);
          ctx.closePath(); ctx.fill();
        }
        break;
      }
    }
    ctx.restore();
  }

  function drawShield(ctx, rig, hx, hy, a) {
    var s = rig.scale;
    ctx.save();
    ctx.translate(hx, hy); ctx.rotate(-a);
    ctx.fillStyle = '#4a4436';
    ctx.beginPath();
    ctx.moveTo(-9 * s, -12 * s); ctx.lineTo(9 * s, -12 * s);
    ctx.lineTo(9 * s, 6 * s); ctx.lineTo(0, 15 * s); ctx.lineTo(-9 * s, 6 * s);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rig.accent; ctx.lineWidth = 1.8 * s; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.moveTo(-9 * s, -12 * s); ctx.lineTo(0, -12 * s); ctx.lineTo(0, 15 * s); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* ----------------------------------------------------------- head art --- */
  function drawHead(ctx, rig, x, y, a, facing, opts) {
    var s = rig.scale, R = rig.headR * s;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-a * 0.85);
    switch (rig.helm) {
      case 'hood':
        ctx.fillStyle = rig.dark;
        ctx.beginPath();
        ctx.moveTo(-R * 1.15, R * 0.75);
        ctx.quadraticCurveTo(-R * 1.35, -R * 1.35, R * 0.15, -R * 1.30);
        ctx.quadraticCurveTo(R * 1.45, -R * 1.05, R * 1.05, R * 0.85);
        ctx.quadraticCurveTo(0, R * 1.25, -R * 1.15, R * 0.75);
        ctx.closePath(); ctx.fill();
        // shadowed face opening
        ctx.fillStyle = '#0b0a10';
        ctx.beginPath(); ctx.ellipse(R * 0.42, R * 0.02, R * 0.62, R * 0.55, 0, 0, 6.2832); ctx.fill();
        break;
      case 'horned':
        ctx.fillStyle = rig.mid;
        ctx.beginPath(); ctx.ellipse(0, 0, R * 1.02, R * 1.12, 0, 0, 6.2832); ctx.fill();
        ctx.fillStyle = '#d8d2c4';
        ctx.beginPath();
        ctx.moveTo(-R * 0.5, -R * 0.75); ctx.quadraticCurveTo(-R * 2.1, -R * 1.9, -R * 1.0, -R * 0.15);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(R * 0.5, -R * 0.75); ctx.quadraticCurveTo(R * 2.1, -R * 1.9, R * 1.0, -R * 0.15);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#0b0a10';
        ctx.beginPath(); ctx.ellipse(R * 0.35, R * 0.05, R * 0.6, R * 0.42, 0, 0, 6.2832); ctx.fill();
        break;
      case 'plate':
        ctx.fillStyle = rig.mid;
        ctx.beginPath();
        ctx.moveTo(-R, -R * 0.9); ctx.lineTo(R * 0.95, -R * 1.0);
        ctx.lineTo(R * 1.1, R * 0.6); ctx.lineTo(0, R * 1.15); ctx.lineTo(-R * 1.05, R * 0.55);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#07070c';
        ctx.fillRect(R * 0.05, -R * 0.35, R * 1.0, R * 0.30);
        break;
      case 'crown':
        ctx.fillStyle = rig.mid;
        ctx.beginPath(); ctx.ellipse(0, 0, R * 1.0, R * 1.1, 0, 0, 6.2832); ctx.fill();
        ctx.fillStyle = '#e0b64a';
        ctx.beginPath();
        ctx.moveTo(-R * 1.05, -R * 0.85);
        for (var i = 0; i <= 4; i++) {
          var fx = -R * 1.05 + (R * 2.1) * (i / 4);
          ctx.lineTo(fx, -R * (i % 2 ? 1.75 : 1.05));
        }
        ctx.lineTo(R * 1.05, -R * 0.85);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#07070c';
        ctx.beginPath(); ctx.ellipse(R * 0.32, R * 0.05, R * 0.58, R * 0.4, 0, 0, 6.2832); ctx.fill();
        break;
      case 'skull':
        ctx.fillStyle = '#ddd6c4';
        ctx.beginPath(); ctx.ellipse(0, -R * 0.1, R * 1.0, R * 1.05, 0, 0, 6.2832); ctx.fill();
        ctx.fillStyle = '#1a1622';
        ctx.beginPath(); ctx.ellipse(R * 0.36, -R * 0.12, R * 0.3, R * 0.34, 0, 0, 6.2832); ctx.fill();
        ctx.beginPath(); ctx.ellipse(-R * 0.28, -R * 0.12, R * 0.26, R * 0.3, 0, 0, 6.2832); ctx.fill();
        ctx.fillRect(-R * 0.1, R * 0.5, R * 0.6, R * 0.4);
        break;
      default:
        ctx.fillStyle = rig.skin;
        ctx.beginPath(); ctx.ellipse(0, 0, R * 0.92, R * 1.0, 0, 0, 6.2832); ctx.fill();
        ctx.fillStyle = rig.dark;
        ctx.beginPath(); ctx.ellipse(0, -R * 0.55, R * 0.98, R * 0.6, 0, 0, 6.2832); ctx.fill();
        break;
    }
    // glowing eyes — the single strongest readability cue for enemy state
    if (opts && opts.eyeGlow > 0) {
      var eg = opts.eyeGlow;
      ctx.globalCompositeOperation = 'lighter';
      var col = opts.eyeCol || rig.eyeCol;
      for (var e = 0; e < 2; e++) {
        var ex = R * (0.28 + e * 0.34), ey = -R * 0.05;
        var rg = ctx.createRadialGradient(ex, ey, 0, ex, ey, R * 0.85 * (0.7 + eg * 0.6));
        rg.addColorStop(0, col);
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rg; ctx.globalAlpha = 0.55 + eg * 0.45;
        ctx.beginPath(); ctx.arc(ex, ey, R * 0.85 * (0.7 + eg * 0.6), 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------- body ----- */
  /* Draws a humanoid centred at (cx, cy) — cy is the body centre, feet land
     at cy + (hipY + thigh + shin). facing is -1 or 1. */
  function drawHumanoid(ctx, rig, p, cx, cy, facing, opts) {
    opts = opts || {};
    var s = rig.scale;
    var f = facing;

    ctx.save();
    ctx.translate(cx, cy + (p.bob || 0));
    ctx.scale(f, 1);
    if (p.squash !== 1) { ctx.scale(1 / Math.sqrt(p.squash), p.squash); }

    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;

    var darkC = opts.flat || rig.dark;
    var midC = opts.flat || rig.mid;
    var lightC = opts.flat || rig.light;

    var lean = p.lean;
    var hipX = 0, hipY = rig.hipY * s;
    // torso runs from hip upward, tilted by lean
    var shX = hipX + Math.sin(lean) * -rig.torso * s;
    var shY = hipY + Math.cos(lean) * -rig.torso * s;

    /* ---- cape (behind everything) ---- */
    if (rig.cape) {
      var ca = p.capeA;
      ctx.fillStyle = rig.cloth || '#3a1420';
      ctx.beginPath();
      ctx.moveTo(shX - 5 * s, shY - 1 * s);
      ctx.quadraticCurveTo(
        shX - 12 * s - Math.sin(ca) * 16 * s, shY + 12 * s,
        shX - 8 * s - Math.sin(ca) * 26 * s, shY + 30 * s + Math.cos(ca) * 4 * s
      );
      ctx.quadraticCurveTo(shX - 2 * s, shY + 26 * s, shX + 5 * s, shY + 2 * s);
      ctx.closePath(); ctx.fill();
    }

    /* ---- far limbs ---- */
    limb(ctx, shX, shY, p.shB + lean, rig.upperArm * s, p.shB + p.elB + lean, rig.foreArm * s,
         rig.armW * s, rig.armW * 0.82 * s, rig.armW * 0.7 * s, darkC);
    limb(ctx, hipX, hipY, p.hipB, rig.thigh * s, p.hipB + p.knB, rig.shin * s,
         rig.legW * s, rig.legW * 0.8 * s, rig.legW * 0.72 * s, darkC);

    /* ---- torso ---- */
    ctx.fillStyle = midC;
    capsule(ctx, hipX, hipY, lean + Math.PI, rig.torso * s, rig.torsoW * s, rig.shoulderW * s);
    ctx.fill();
    // chest plate highlight (lit from the front-top)
    if (!opts.flat) {
      ctx.fillStyle = lightC;
      ctx.save();
      ctx.translate(shX, shY); ctx.rotate(-lean);
      ctx.beginPath();
      ctx.moveTo(0.5 * s, -1 * s);
      ctx.lineTo(rig.shoulderW * 0.44 * s, 1 * s);
      ctx.lineTo(rig.torsoW * 0.30 * s, rig.torso * 0.80 * s);
      ctx.lineTo(0.5 * s, rig.torso * 0.86 * s);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    /* ---- near leg ---- */
    limb(ctx, hipX, hipY, p.hipA, rig.thigh * s, p.hipA + p.knA, rig.shin * s,
         rig.legW * 1.02 * s, rig.legW * 0.84 * s, rig.legW * 0.76 * s, midC);

    /* ---- head ---- */
    var hx = shX + Math.sin(lean) * -(rig.neck + rig.headR) * s;
    var hy = shY + Math.cos(lean) * -(rig.neck + rig.headR) * s;
    drawHead(ctx, rig, hx, hy, p.headA + lean * 0.5, f, opts);

    /* ---- near arm + weapon ---- */
    var arm = limb(ctx, shX, shY, p.shA + lean, rig.upperArm * s, p.shA + p.elA + lean, rig.foreArm * s,
                   rig.armW * 1.05 * s, rig.armW * 0.86 * s, rig.armW * 0.74 * s, lightC);
    if (rig.weapon) {
      drawWeapon(ctx, rig, rig.weapon, arm.end.x + (p.wpnX || 0) * s, arm.end.y + (p.wpnY || 0) * s,
                 p.shA + p.elA + lean + p.wpn, opts.weaponGlow || 0);
    }
    if (rig.shield) {
      var farEndX = shX + Math.sin(p.shB + lean) * rig.upperArm * s + Math.sin(p.shB + p.elB + lean) * rig.foreArm * s;
      var farEndY = shY + Math.cos(p.shB + lean) * rig.upperArm * s + Math.cos(p.shB + p.elB + lean) * rig.foreArm * s;
      drawShield(ctx, rig, farEndX, farEndY, p.shB + p.elB + lean);
    }

    /* ---- rim light on the leading edge ---- */
    if (!opts.flat && opts.rim !== false) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (opts.rimStrength == null ? 0.5 : opts.rimStrength);
      ctx.strokeStyle = rig.rim;
      ctx.lineWidth = 1.15 * s;
      ctx.beginPath();
      ctx.moveTo(hx + rig.headR * 0.75 * s, hy - rig.headR * 0.5 * s);
      ctx.quadraticCurveTo(shX + rig.shoulderW * 0.5 * s, shY + 1 * s, hipX + rig.torsoW * 0.42 * s, hipY);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.restore();
  }

  /* ----------------------------------------------------- non-humanoids --- */

  function drawBat(ctx, x, y, facing, t, opts) {
    opts = opts || {};
    var s = opts.scale || 1;
    var flap = Math.sin(t * 17) * 0.9;
    ctx.save();
    ctx.translate(x, y); ctx.scale(facing, 1);
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    var body = opts.flat || '#231b2b';
    var wing = opts.flat || '#1a1422';
    for (var w = -1; w <= 1; w += 2) {
      ctx.save();
      ctx.scale(1, 1);
      ctx.fillStyle = wing;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      var sp = 20 * s * (1 - Math.abs(flap) * 0.35);
      ctx.quadraticCurveTo(w * sp * 0.6, -8 * s + flap * 9 * s, w * sp, flap * 5 * s);
      ctx.quadraticCurveTo(w * sp * 0.75, 8 * s + flap * 4 * s, w * sp * 0.32, 7 * s);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ellipse(ctx, 0, 0, 7 * s, 8.5 * s, 0, body);
    ellipse(ctx, 3 * s, -5 * s, 5 * s, 4.6 * s, 0, body);
    // ears
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.moveTo(1 * s, -8 * s); ctx.lineTo(3 * s, -14 * s); ctx.lineTo(5.5 * s, -8 * s); ctx.closePath(); ctx.fill();
    if (opts.eyeGlow > 0 && !opts.flat) {
      ctx.globalCompositeOperation = 'lighter';
      var g = ctx.createRadialGradient(4.5 * s, -5 * s, 0, 4.5 * s, -5 * s, 7 * s);
      g.addColorStop(0, opts.eyeCol || '#ff5a4a'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(4.5 * s, -5 * s, 7 * s, 0, 6.2832); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  /* Floating cloaked wraith — no legs, trailing tatters. */
  function drawWraith(ctx, x, y, facing, t, opts) {
    opts = opts || {};
    var s = opts.scale || 1;
    ctx.save();
    ctx.translate(x, y); ctx.scale(facing, 1);
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    var col = opts.flat || '#241c33';
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(-10 * s, -14 * s);
    ctx.quadraticCurveTo(0, -24 * s, 10 * s, -14 * s);
    for (var i = 0; i < 5; i++) {
      var px = 10 * s - (20 * s) * (i / 4);
      var wob = Math.sin(t * 4 + i * 1.6) * 5 * s;
      ctx.quadraticCurveTo(px - 2 * s + wob, 14 * s + i * 2 * s, px - 4 * s, 22 * s + wob);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0a0810';
    ctx.beginPath(); ctx.ellipse(2 * s, -13 * s, 6 * s, 6.5 * s, 0, 0, 6.2832); ctx.fill();
    if (opts.eyeGlow > 0 && !opts.flat) {
      ctx.globalCompositeOperation = 'lighter';
      for (var e = 0; e < 2; e++) {
        var ex = (0 + e * 4) * s, ey = -13 * s;
        var g = ctx.createRadialGradient(ex, ey, 0, ex, ey, 7 * s);
        g.addColorStop(0, opts.eyeCol || '#9df'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex, ey, 7 * s, 0, 6.2832); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  return {
    capsule: capsule, limb: limb, ellipse: ellipse,
    makeRig: makeRig, pose: pose, mix: mix, P: P,
    drawHumanoid: drawHumanoid, drawWeapon: drawWeapon, drawHead: drawHead,
    drawBat: drawBat, drawWraith: drawWraith
  };
})();
