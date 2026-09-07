/* ==========================================================================
   GRIMHOLLOW  —  09_levels.js
   Ten hand-authored levels across three biomes.

   Coordinate convention: everything is in TILES.
     - `build` ops are consumed by G.World's authoring DSL (see 02_world.js)
     - spawn/exit/enemy/pickup Y values are the *floor-top row*, i.e. the
       entity's feet rest at y * TILE. This makes hand-placing things on a
       floor trivial: use the same Y you passed to the floor rect.
   ========================================================================== */
'use strict';

var G = (typeof G !== 'undefined') ? G : {};

G.LEVELS = (function () {

  /* ---- tiny authoring helpers ------------------------------------------ */
  function frame(w, h, gy, thick) {
    // outer shell: floor slab, side walls, and a void gutter below
    return [
      ['rect', 0, gy, w, (h - gy)],
      ['rect', 0, 0, 2, h],
      ['rect', w - 2, 0, 2, h]
    ];
  }
  function pit(x, w, gy, h) { return ['clear', x, gy, w, h - gy]; }
  function torches(list) { return list.map(function (t) { return ['torch', t[0], t[1], t[2]]; }); }
  function cat() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) {
      var a = arguments[i];
      if (!a) continue;
      if (a.length && Array.isArray(a[0])) { for (var j = 0; j < a.length; j++) out.push(a[j]); }
      else out.push(a);
    }
    return out;
  }
  function E(t, x, y, o) {
    o = o || {};
    return { t: t, x: x, y: y, tier: o.tier || 1, patrol: o.patrol || 0, elite: !!o.elite, face: o.face || -1 };
  }

  /* ======================================================================
     1 — THE ASHEN THRESHOLD          teaches: move, jump, attack, combo
     ====================================================================== */
  var L1 = {
    id: 1, name: 'The Ashen Threshold', biome: 'ruins',
    w: 148, h: 30, seed: 1101, gy: 22,
    spawn: [5, 22], exit: [142, 22],
    trainingDoubleJump: true,
    hint: 'A / D  move   ·   SPACE  jump twice for a double jump   ·   J  attack',
    tips: [
      { x: 12, y: 22, text: 'A / D to move  ·  SPACE to jump' },
      { x: 30, y: 22, text: 'J to attack — press again to chain a 3-hit combo' },
      { x: 74, y: 22, text: 'Press SPACE again in mid-air to double-jump — it can save a fall' }
    ],
    build: cat(
      frame(148, 30, 22),
      // gentle opening rise
      ['stair', 16, 21, 3, 1, 2],
      ['rect', 22, 19, 10, 3],
      ['stair', 32, 19, 3, 1, 2],
      // Recovery ledges make every early fall escapable, even if the player
      // misses the first crossing.  The second jump is taught here too.
      pit(40, 4, 22, 30),
      ['plat', 40, 25, 2], ['plat', 42, 23, 2],
      ['plat', 45, 18, 5],
      ['plat', 53, 15, 4],
      // ruined pillar hall
      ['pillar', 60, 15, 7, 2],
      ['pillar', 68, 13, 9, 2],
      ['rect', 58, 12, 14, 2],
      // climb bars route over the sealed ruin: no wall-jump precision needed
      ['plat', 56, 20, 2], ['plat', 56, 17, 2], ['plat', 56, 14, 2],
      ['plat', 72, 15, 2], ['plat', 72, 18, 2],
      pit(76, 5, 22, 30),
      ['plat', 76, 25, 2], ['plat', 79, 23, 2],
      ['plat', 82, 17, 6],
      // spike stretch on solid ground — punishes careless running
      ['spike', 94, 21, 3],
      ['rect', 100, 19, 8, 3],
      ['plat', 110, 16, 5],
      pit(118, 4, 22, 30),
      ['plat', 118, 25, 2], ['plat', 120, 23, 2],
      // final approach + gate arch
      ['rect', 124, 20, 6, 2],
      ['pillar', 132, 14, 8, 2],
      ['pillar', 138, 14, 8, 2],
      ['rect', 132, 13, 8, 1],
      // a second set of bars makes the exit arch traversable in both directions
      ['plat', 128, 18, 3], ['plat', 130, 15, 2],
      ['plat', 140, 16, 2], ['plat', 140, 19, 2],
      torches([[10, 20], [26, 17], [58, 10], [70, 10], [88, 15], [104, 17], [130, 12], [140, 12]])
    ),
    enemies: [
      E('grunt', 24, 19, { patrol: 40 }),
      E('grunt', 50, 22, { patrol: 70 }),
      E('grunt', 66, 22, { patrol: 60 }),
      E('grunt', 88, 22, { patrol: 80 }),
      E('grunt', 104, 19, { patrol: 40 }),
      E('grunt', 128, 20, { patrol: 60 }),
      E('grunt', 134, 22, { patrol: 50 })
    ],
    checkpoints: [[58, 22], [106, 19]],
    pickups: [{ t: 'potion', x: 55, y: 15 }, { t: 'gold', x: 84, y: 17, v: 30 }],
    secrets: [{ x: 70, y: 12, gold: 120 }]
  };

  /* ======================================================================
     2 — THE BROKEN BARBICAN          teaches: climb bars  ·  RELIC: air control
     ====================================================================== */
  var L2 = {
    id: 2, name: 'The Broken Barbican', biome: 'ruins',
    w: 152, h: 36, seed: 1202, gy: 28,
    spawn: [5, 28], exit: [146, 12],
    hint: 'Follow the climb bars. Press SPACE twice for a double jump.',
    tips: [
      { x: 30, y: 28, text: 'Use the stone bars to climb safely — no precision wall-jump needed' },
      { x: 96, y: 20, text: 'The relic improves mid-air steering after a double jump' }
    ],
    build: cat(
      frame(152, 36, 28),
      ['stair', 14, 27, 4, 1, 2],
      ['rect', 22, 24, 8, 4],
      // ---- wall-jump shaft: two facing walls, exit at the top ----
      ['rect', 34, 8, 3, 20],
      ['rect', 44, 8, 3, 20],
      pit(37, 7, 28, 36),
      // stepped bars through the shaft: each rise is comfortably jumpable
      ['plat', 31, 24, 2], ['plat', 31, 21, 2], ['plat', 31, 18, 2],
      ['plat', 31, 15, 2], ['plat', 31, 12, 2], ['plat', 31, 9, 2],
      ['plat', 37, 22, 7], ['plat', 39, 19, 3], ['plat', 37, 15, 7],
      ['plat', 39, 12, 3], ['plat', 41, 9, 2],
      ['rect', 47, 8, 10, 2],
      ['plat', 48, 12, 8],
      // upper battlement walk with archer nests
      ['rect', 58, 14, 12, 3],
      ['pillar', 60, 10, 4, 2],
      ['pillar', 66, 10, 4, 2],
      ['rect', 74, 18, 10, 3],
      pit(70, 4, 28, 36),
      // ---- relic chamber ----
      ['rect', 88, 22, 18, 3],
      ['pillar', 90, 15, 7, 2],
      ['pillar', 102, 15, 7, 2],
      ['rect', 88, 14, 18, 1],
      // second shaft — needs the double jump to clear cleanly
      ['rect', 110, 10, 3, 18],
      ['plat', 113, 24, 6], ['plat', 113, 22, 4],
      ['plat', 113, 19, 6], ['plat', 113, 17, 4],
      ['plat', 113, 14, 6], ['plat', 113, 12, 4],
      ['rect', 120, 10, 4, 2],
      ['rect', 126, 16, 8, 3],
      ['plat', 136, 13, 6],
      ['rect', 142, 12, 8, 3],
      torches([[12, 26], [36, 20], [45, 13], [62, 12], [76, 16], [92, 20], [104, 20], [112, 14], [128, 14], [144, 10]])
    ),
    enemies: [
      E('grunt', 26, 24, { patrol: 50 }),
      E('grunt', 40, 22, { patrol: 40 }),
      E('archer', 62, 14, { patrol: 0 }),
      E('grunt', 66, 10, { patrol: 40 }),
      E('grunt', 78, 18, { patrol: 50 }),
      E('archer', 92, 22, { patrol: 0 }),
      E('grunt', 100, 22, { patrol: 40 }),
      E('grunt', 116, 24, { patrol: 30 }),
      E('archer', 130, 16, { patrol: 0 }),
      E('grunt', 144, 12, { patrol: 40 })
    ],
    checkpoints: [[48, 12], [88, 22]],
    relic: { id: 'airControl', x: 97, y: 22, name: 'Feathered Sigil', desc: 'AERIAL MASTERY — stronger steering after a double jump' },
    pickups: [{ t: 'potion', x: 40, y: 15 }, { t: 'gold', x: 64, y: 14, v: 40 }],
    secrets: [{ x: 120, y: 10, gold: 160 }]
  };

  /* ======================================================================
     3 — GALLERY OF HUSKS             teaches: shields (go around), crumbling floors
     ====================================================================== */
  var L3 = {
    id: 3, name: 'Gallery of Husks', biome: 'ruins',
    w: 164, h: 38, seed: 1303, gy: 30,
    spawn: [5, 30], exit: [158, 16],
    hint: 'Shielded foes block the front — dash past and strike the back',
    tips: [
      { x: 34, y: 30, text: 'Shields stop frontal hits. Dash (SHIFT) through, then attack' },
      { x: 92, y: 24, text: 'Cracked stone gives way a moment after you land' }
    ],
    build: cat(
      frame(164, 38, 30),
      ['rect', 0, 0, 164, 2],
      ['stair', 12, 29, 3, 1, 2],
      ['rect', 18, 27, 14, 3],
      ['pillar', 20, 21, 6, 2],
      ['pillar', 28, 21, 6, 2],
      ['rect', 18, 20, 14, 1],
      // shield corridor: low ceiling, no room to jump over
      ['rect', 34, 24, 22, 2],
      ['rect', 34, 30, 22, 8],
      pit(56, 5, 30, 38),
      ['plat', 57, 26, 4],
      ['rect', 62, 28, 10, 2],
      // crumbling bridge over a lethal drop
      ['crumble', 74, 27, 3],
      ['crumble', 79, 27, 3],
      ['crumble', 84, 27, 3],
      pit(72, 18, 30, 38),
      // fixed recovery bars remain available after the crumbling bridge drops
      ['plat', 72, 34, 3], ['plat', 76, 31, 3], ['plat', 80, 28, 3],
      ['rect', 90, 24, 12, 3],
      ['plat', 92, 19, 8],
      ['pillar', 100, 17, 7, 2],
      // vertical gallery
      ['rect', 104, 30, 16, 8],
      ['plat', 106, 25, 6],
      ['plat', 114, 21, 6],
      ['plat', 106, 17, 6],
      ['rect', 122, 14, 10, 3],
      ['mover', 134, 20, 4, 0, -6, 5, 0],
      ['rect', 140, 26, 8, 3],
      ['crumble', 148, 25, 4],
      ['rect', 154, 19, 8, 3],
      ['plat', 148, 20, 5],
      torches([[14, 28], [24, 19], [40, 22], [52, 22], [66, 26], [94, 22], [108, 23], [116, 19], [126, 12], [142, 24], [156, 17]])
    ),
    enemies: [
      E('grunt', 22, 27, { patrol: 40 }),
      E('shielder', 40, 30, { patrol: 40 }),
      E('grunt', 48, 30, { patrol: 40 }),
      E('shielder', 66, 28, { patrol: 30 }),
      E('archer', 96, 24, { patrol: 0 }),
      E('grunt', 92, 24, { patrol: 40 }),
      E('flyer', 80, 22, { patrol: 90 }),
      E('grunt', 110, 30, { patrol: 60 }),
      E('shielder', 116, 30, { patrol: 40 }),
      E('archer', 126, 14, { patrol: 0 }),
      E('grunt', 143, 26, { patrol: 40 }),
      E('grunt', 157, 19, { patrol: 30 })
    ],
    checkpoints: [[62, 28], [104, 30]],
    pickups: [{ t: 'potion', x: 96, y: 19 }, { t: 'gold', x: 124, y: 14, v: 50 }, { t: 'potion', x: 150, y: 20 }],
    secrets: [{ x: 30, y: 20, gold: 200 }]
  };

  /* ======================================================================
     4 — THE ASHEN GATE               BOSS: The Warden of Ash
     ====================================================================== */
  var L4 = {
    id: 4, name: 'The Ashen Gate', biome: 'ruins',
    w: 124, h: 30, seed: 1404, gy: 24,
    spawn: [5, 24], exit: [118, 24],
    hint: 'Perfect-block with K just as a blow lands to parry it',
    tips: [
      { x: 16, y: 24, text: 'Hold K to guard. Tap it right as a hit lands to PARRY' },
      { x: 46, y: 24, text: 'A red flash means unblockable — dodge, do not guard' }
    ],
    build: cat(
      frame(124, 30, 24),
      ['rect', 0, 0, 124, 2],
      // approach gauntlet
      ['rect', 14, 20, 10, 4],
      ['plat', 26, 18, 6],
      ['rect', 34, 21, 8, 3],
      ['spike', 44, 23, 4],
      ['plat', 50, 19, 6],
      ['rect', 58, 20, 8, 4],
      // ---- arena: 44 tiles wide, gates at both ends ----
      ['gate', 68, 14, 10],
      ['gate', 112, 14, 10],
      ['rect', 68, 24, 46, 6],
      ['plat', 76, 18, 6],
      ['plat', 92, 16, 7],
      ['plat', 104, 18, 6],
      ['pillar', 70, 8, 6, 2],
      ['pillar', 110, 8, 6, 2],
      ['rect', 68, 6, 46, 2],
      torches([[10, 22], [20, 18], [38, 19], [62, 18],
               [72, 20], [80, 16], [96, 14], [108, 16], [116, 20]])
    ),
    enemies: [
      E('grunt', 18, 20, { patrol: 40 }),
      E('archer', 30, 18, { patrol: 0 }),
      E('grunt', 38, 21, { patrol: 40 }),
      E('shielder', 52, 19, { patrol: 30 }),
      E('grunt', 62, 20, { patrol: 40 })
    ],
    checkpoints: [[62, 20]],
    arena: { x0: 68, x1: 114, trigger: 74 },
    boss: { kind: 'warden', x: 104, y: 24 },
    pickups: [{ t: 'potion', x: 28, y: 18 }, { t: 'potion', x: 64, y: 20 }]
  };

  /* ======================================================================
     5 — THE WEEPING DESCENT          caverns  ·  RELIC: dash-attack
     ====================================================================== */
  var L5 = {
    id: 5, name: 'The Weeping Descent', biome: 'caverns',
    w: 150, h: 48, seed: 1505, gy: 40,
    spawn: [5, 14], exit: [144, 40],
    hint: 'Descend. Everything down here can fly.',
    tips: [
      { x: 14, y: 12, text: 'Fall further to descend — long falls are safe here' },
      { x: 78, y: 26, text: 'Dash into a foe to strike mid-dash once you hold the relic' }
    ],
    build: cat(
      ['rect', 0, 0, 2, 48],
      ['rect', 148, 0, 2, 48],
      ['rect', 0, 0, 150, 2],
      ['rect', 0, 40, 150, 8],
      // ---- upper terrace ----
      ['rect', 2, 14, 22, 3],
      ['plat', 26, 13, 6],
      ['rect', 34, 15, 10, 3],
      ['spike', 44, 17, 3],
      ['plat', 48, 12, 6],
      // ---- stepped descent, alternating sides ----
      ['rect', 56, 16, 12, 3],
      ['plat', 44, 21, 8],
      ['rect', 24, 23, 16, 3],
      ['plat', 16, 28, 7],
      ['rect', 4, 31, 14, 3],
      ['mover', 20, 34, 4, 12, 0, 6, 0],
      ['rect', 36, 33, 12, 3],
      ['spike', 36, 32, 4],
      ['plat', 50, 30, 7],
      // ---- relic alcove ----
      ['rect', 62, 27, 16, 3],
      ['pillar', 64, 21, 6, 2],
      ['pillar', 74, 21, 6, 2],
      ['rect', 62, 20, 16, 1],
      // ---- crystal shafts ----
      ['rect', 84, 24, 3, 16],
      ['plat', 87, 34, 6],
      ['plat', 87, 29, 6],
      ['rect', 94, 22, 12, 3],
      ['plat', 100, 17, 6],
      ['rect', 108, 26, 10, 3],
      ['mover', 120, 30, 4, 0, -8, 5, 0.5],
      ['rect', 126, 34, 10, 3],
      ['crumble', 136, 33, 4],
      ['spike', 118, 39, 6],
      ['rect', 140, 32, 8, 3],
      torches([[8, 12], [30, 12], [60, 14], [30, 21], [8, 29], [42, 31], [66, 25], [76, 25],
               [90, 32], [98, 20], [112, 24], [130, 32], [144, 30]])
    ),
    enemies: [
      E('grunt', 10, 14, { patrol: 40 }),
      E('flyer', 30, 18, { patrol: 110 }),
      E('grunt', 38, 15, { patrol: 30 }),
      E('archer', 60, 16, { patrol: 0, tier: 2 }),
      E('flyer', 48, 26, { patrol: 120 }),
      E('grunt', 30, 23, { patrol: 50, tier: 2 }),
      E('shielder', 10, 31, { patrol: 30, tier: 2 }),
      E('grunt', 40, 33, { patrol: 40, tier: 2 }),
      E('flyer', 80, 22, { patrol: 100 }),
      E('archer', 98, 22, { patrol: 0, tier: 2 }),
      E('grunt', 100, 22, { patrol: 40, tier: 2 }),
      E('flyer', 112, 20, { patrol: 130 }),
      E('grunt', 112, 26, { patrol: 40, tier: 2 }),
      E('grunt', 130, 34, { patrol: 40, tier: 2 }),
      E('shielder', 143, 32, { patrol: 20, tier: 2 })
    ],
    checkpoints: [[62, 27], [108, 26]],
    relic: { id: 'dashAttack', x: 70, y: 27, name: 'Riftstep Charm', desc: 'DASH-ATTACK — attack during a dash to lunge through foes' },
    pickups: [{ t: 'potion', x: 52, y: 30 }, { t: 'gold', x: 102, y: 17, v: 60 }, { t: 'potion', x: 128, y: 34 }],
    secrets: [{ x: 18, y: 28, gold: 240 }]
  };

  /* ======================================================================
     6 — THE DROWNED HALLS            caverns  ·  saws, wraiths
     ====================================================================== */
  var L6 = {
    id: 6, name: 'The Drowned Halls', biome: 'caverns',
    w: 176, h: 38, seed: 1606, gy: 30,
    spawn: [5, 30], exit: [170, 18],
    hint: 'Wraiths fire homing orbs. A parry sends them back.',
    tips: [
      { x: 60, y: 30, text: 'Parry a projectile to reflect it — reflected shots hit hard' }
    ],
    build: cat(
      frame(176, 38, 30),
      ['rect', 0, 0, 176, 2],
      ['rect', 14, 26, 12, 4],
      ['plat', 28, 24, 6],
      // saw corridor
      ['rect', 36, 28, 26, 2],
      ['saw', 42, 25, 0, 0, 3, 1.1],
      ['saw', 52, 25, 6, 0, 4, 1.1],
      ['rect', 36, 20, 26, 2],
      pit(62, 6, 30, 38),
      ['plat', 63, 26, 5],
      ['rect', 68, 28, 12, 2],
      // wraith gallery — open vertical space
      ['rect', 80, 30, 24, 8],
      ['plat', 82, 24, 7],
      ['plat', 94, 20, 7],
      ['plat', 82, 16, 7],
      ['pillar', 90, 8, 8, 2],
      ['rect', 104, 26, 12, 3],
      ['saw', 110, 23, 0, 6, 3.5, 1.0],
      // spike gauntlet with moving platforms
      pit(116, 22, 30, 38),
      // a non-timing-dependent way out if the moving platform is missed
      ['plat', 116, 34, 3], ['plat', 119, 31, 3], ['plat', 122, 28, 3],
      ['mover', 118, 26, 4, 0, -7, 4, 0],
      ['mover', 126, 22, 4, 8, 0, 5, 0.5],
      ['plat', 132, 26, 5],
      ['mover', 138, 24, 4, 0, 6, 4.5, 0.25],
      ['rect', 138, 30, 24, 8],
      ['spike', 144, 29, 8],
      ['plat', 144, 22, 6],
      ['rect', 154, 24, 8, 3],
      ['plat', 164, 20, 6],
      ['rect', 168, 22, 8, 3],
      torches([[16, 24], [30, 22], [40, 18], [56, 18], [72, 26], [84, 22], [96, 18],
               [108, 24], [134, 24], [150, 20], [158, 22], [172, 20]])
    ),
    enemies: [
      E('grunt', 18, 26, { patrol: 40, tier: 2 }),
      E('archer', 30, 24, { patrol: 0, tier: 2 }),
      E('grunt', 46, 28, { patrol: 40, tier: 2 }),
      E('shielder', 56, 28, { patrol: 30, tier: 2 }),
      E('wraith', 74, 24, { patrol: 90 }),
      E('grunt', 72, 28, { patrol: 40, tier: 2 }),
      E('flyer', 88, 22, { patrol: 120 }),
      E('wraith', 96, 18, { patrol: 100 }),
      E('grunt', 86, 30, { patrol: 50, tier: 2 }),
      E('shielder', 98, 30, { patrol: 30, tier: 2, elite: true }),
      E('archer', 108, 26, { patrol: 0, tier: 2 }),
      E('flyer', 124, 20, { patrol: 140 }),
      E('wraith', 134, 18, { patrol: 110 }),
      E('grunt', 148, 30, { patrol: 50, tier: 2 }),
      E('grunt', 156, 24, { patrol: 30, tier: 2 }),
      E('archer', 166, 20, { patrol: 0, tier: 2 }),
      E('grunt', 171, 22, { patrol: 20, tier: 2 })
    ],
    checkpoints: [[68, 28], [104, 26], [138, 30]],
    pickups: [{ t: 'potion', x: 66, y: 26 }, { t: 'potion', x: 86, y: 16 }, { t: 'gold', x: 146, y: 22, v: 80 }],
    secrets: [{ x: 92, y: 8, gold: 300 }]
  };

  /* ======================================================================
     7 — THE VAULT CHOIR              BOSS: The Hollow Choir
     ====================================================================== */
  var L7 = {
    id: 7, name: 'The Vault Choir', biome: 'caverns',
    w: 126, h: 34, seed: 1707, gy: 26,
    spawn: [5, 26], exit: [120, 26],
    hint: 'It blinks behind you. Keep moving.',
    build: cat(
      frame(126, 34, 26),
      ['rect', 0, 0, 126, 2],
      ['rect', 14, 22, 10, 4],
      ['plat', 26, 20, 6],
      ['rect', 34, 23, 10, 3],
      ['saw', 46, 24, 0, 0, 3, 1.0],
      ['plat', 50, 20, 6],
      ['rect', 58, 22, 8, 4],
      // arena with three tiers so a flying boss can't just hover out of reach
      ['gate', 70, 16, 10],
      ['gate', 116, 16, 10],
      ['rect', 70, 26, 48, 8],
      ['plat', 76, 20, 8],
      ['plat', 90, 15, 9],
      ['plat', 104, 20, 8],
      ['pillar', 72, 8, 8, 2],
      ['pillar', 114, 8, 8, 2],
      ['rect', 70, 6, 48, 2],
      torches([[10, 24], [20, 20], [38, 21], [62, 20],
               [74, 22], [82, 18], [94, 13], [108, 18], [118, 22]])
    ),
    enemies: [
      E('grunt', 18, 22, { patrol: 40, tier: 2 }),
      E('wraith', 30, 18, { patrol: 90 }),
      E('shielder', 38, 23, { patrol: 30, tier: 2 }),
      E('archer', 52, 20, { patrol: 0, tier: 2 }),
      E('grunt', 62, 22, { patrol: 40, tier: 2 })
    ],
    checkpoints: [[62, 22]],
    arena: { x0: 70, x1: 118, trigger: 78 },
    boss: { kind: 'choir', x: 106, y: 26 },
    pickups: [{ t: 'potion', x: 28, y: 20 }, { t: 'potion', x: 66, y: 22 }]
  };

  /* ======================================================================
     8 — RAMPART OF CROWNS            citadel  ·  RELIC: plunge
     ====================================================================== */
  var L8 = {
    id: 8, name: 'Rampart of Crowns', biome: 'citadel',
    w: 184, h: 38, seed: 1808, gy: 30,
    spawn: [5, 30], exit: [178, 14],
    hint: 'Ogres telegraph slowly and hit through guard. Assassins do not.',
    tips: [
      { x: 40, y: 30, text: 'Ogre blows are unblockable — read the wind-up and leave' },
      { x: 120, y: 24, text: 'Airborne, hold S and press J to plunge straight down' }
    ],
    build: cat(
      frame(184, 38, 30),
      ['rect', 0, 0, 184, 2],
      ['rect', 12, 26, 16, 4],
      ['pillar', 14, 20, 6, 2],
      ['pillar', 24, 20, 6, 2],
      ['rect', 12, 19, 16, 1],
      // brute courtyard — flat, wide, nowhere to hide
      ['rect', 32, 30, 30, 8],
      ['plat', 36, 24, 7],
      ['plat', 50, 24, 7],
      pit(62, 6, 30, 38),
      ['plat', 63, 26, 5],
      // assassin rooftops
      ['rect', 68, 27, 10, 3],
      ['plat', 80, 23, 6],
      ['rect', 88, 25, 10, 3],
      ['plat', 100, 21, 6],
      ['rect', 108, 24, 10, 3],
      ['spike', 78, 29, 10],
      ['rect', 68, 30, 52, 8],
      // ---- plunge relic tower: only exit is straight up ----
      ['rect', 120, 12, 3, 18],
      ['rect', 136, 12, 3, 18],
      ['rect', 120, 30, 19, 8],
      ['plat', 123, 26, 13],
      ['plat', 123, 21, 6],
      ['plat', 131, 17, 6],
      ['rect', 120, 10, 19, 2],
      // crumbling floor above a spike bed — plunge cracks it open
      ['crumble', 126, 24, 6],
      ['spike', 124, 29, 12],
      // ---- final rampart ----
      ['rect', 142, 26, 12, 3],
      ['mover', 156, 22, 4, 0, -6, 4.5, 0],
      ['rect', 162, 18, 10, 3],
      ['plat', 152, 16, 6],
      ['rect', 174, 16, 8, 3],
      torches([[14, 24], [26, 24], [36, 22], [56, 22], [70, 25], [92, 23], [110, 22],
               [122, 24], [136, 24], [128, 14], [146, 24], [166, 16], [178, 14]])
    ),
    enemies: [
      E('grunt', 18, 26, { patrol: 40, tier: 3 }),
      E('archer', 26, 26, { patrol: 0, tier: 3 }),
      E('brute', 44, 30, { patrol: 40 }),
      E('grunt', 38, 30, { patrol: 50, tier: 3 }),
      E('grunt', 56, 30, { patrol: 50, tier: 3 }),
      E('assassin', 72, 27, { patrol: 80 }),
      E('archer', 82, 23, { patrol: 0, tier: 3 }),
      E('assassin', 92, 25, { patrol: 90 }),
      E('shielder', 110, 24, { patrol: 30, tier: 3 }),
      E('grunt', 100, 30, { patrol: 60, tier: 3 }),
      E('brute', 114, 30, { patrol: 30, elite: true }),
      E('assassin', 128, 30, { patrol: 60 }),
      E('archer', 133, 17, { patrol: 0, tier: 3 }),
      E('grunt', 146, 26, { patrol: 40, tier: 3 }),
      E('shielder', 166, 18, { patrol: 30, tier: 3 }),
      E('assassin', 176, 16, { patrol: 40 })
    ],
    checkpoints: [[68, 27], [123, 26], [142, 26]],
    relic: { id: 'plunge', x: 133, y: 17, name: 'Weight of Kings', desc: 'PLUNGE — airborne, hold S + J to slam down' },
    pickups: [{ t: 'potion', x: 40, y: 24 }, { t: 'potion', x: 102, y: 21 }, { t: 'gold', x: 154, y: 16, v: 100 }],
    secrets: [{ x: 20, y: 19, gold: 350 }]
  };

  /* ======================================================================
     9 — THE HOLLOW ASCENT            citadel  ·  vertical, elites
     ====================================================================== */
  var L9 = {
    id: 9, name: 'The Hollow Ascent', biome: 'citadel',
    w: 112, h: 60, seed: 1909, gy: 52,
    spawn: [7, 48], exit: [100, 8],
    hint: 'Up. All the way up.',
    build: cat(
      ['rect', 0, 0, 2, 60],
      ['rect', 110, 0, 2, 60],
      ['rect', 0, 52, 112, 8],
      ['rect', 0, 0, 112, 2],
      // tier 1 — the base hall
      ['rect', 2, 48, 18, 4],
      ['plat', 22, 46, 7],
      ['rect', 32, 48, 16, 4],
      ['spike', 48, 51, 6],
      ['rect', 56, 47, 14, 5],
      ['plat', 72, 44, 7],
      ['rect', 82, 46, 16, 6],
      // tier 2 — wall-jump chimney
      ['rect', 96, 34, 3, 12],
      ['rect', 84, 34, 3, 12],
      ['plat', 87, 42, 9],
      ['plat', 87, 37, 9],
      ['rect', 70, 38, 14, 3],
      ['plat', 60, 36, 7],
      ['rect', 46, 38, 12, 3],
      ['crumble', 38, 37, 6],
      ['rect', 22, 38, 14, 3],
      ['plat', 12, 35, 8],
      // tier 3 — moving platform gauntlet
      ['rect', 2, 32, 10, 3],
      ['mover', 14, 30, 4, 0, -7, 4.5, 0],
      ['mover', 24, 28, 4, 10, 0, 6, 0.3],
      ['rect', 38, 28, 12, 3],
      ['saw', 44, 25, 0, 5, 3.2, 1.0],
      ['mover', 52, 26, 4, 0, 6, 4, 0.6],
      ['rect', 64, 26, 14, 3],
      ['plat', 80, 24, 7],
      ['rect', 90, 26, 18, 3],
      // tier 4 — the crown stair
      ['plat', 96, 21, 8],
      ['plat', 84, 18, 8],
      ['plat', 72, 15, 8],
      ['rect', 56, 16, 14, 3],
      ['pillar', 58, 10, 6, 2],
      ['pillar', 66, 10, 6, 2],
      ['rect', 56, 9, 14, 1],
      ['mover', 42, 14, 4, 0, -5, 4, 0],
      ['rect', 28, 12, 12, 3],
      ['plat', 42, 9, 6],
      ['rect', 50, 6, 10, 3],
      ['plat', 62, 8, 6],
      ['rect', 72, 10, 10, 3],
      ['plat', 84, 12, 6],
      ['rect', 94, 10, 14, 3],
      ['rect', 96, 6, 3, 4],
      torches([[8, 46], [26, 44], [40, 46], [62, 45], [86, 44],
               [88, 40], [96, 36], [74, 36], [50, 36], [26, 36],
               [6, 30], [42, 26], [68, 24], [94, 24],
               [88, 19], [60, 14], [32, 10], [54, 5], [98, 8]])
    ),
    enemies: [
      E('grunt', 12, 48, { patrol: 40, tier: 3 }),
      E('shielder', 36, 48, { patrol: 40, tier: 3 }),
      E('archer', 62, 47, { patrol: 0, tier: 3 }),
      E('brute', 88, 46, { patrol: 30 }),
      E('assassin', 74, 38, { patrol: 60 }),
      E('archer', 50, 38, { patrol: 0, tier: 3 }),
      E('grunt', 28, 38, { patrol: 40, tier: 3 }),
      E('flyer', 30, 34, { patrol: 140 }),
      E('wraith', 20, 30, { patrol: 100, tier: 2 }),
      E('grunt', 42, 28, { patrol: 40, tier: 3 }),
      E('shielder', 68, 26, { patrol: 40, tier: 3, elite: true }),
      E('archer', 96, 26, { patrol: 0, tier: 3 }),
      E('assassin', 100, 26, { patrol: 40, elite: true }),
      E('wraith', 84, 20, { patrol: 90, tier: 2 }),
      E('grunt', 60, 16, { patrol: 40, tier: 3 }),
      E('brute', 32, 12, { patrol: 30, elite: true }),
      E('archer', 76, 10, { patrol: 0, tier: 3 }),
      E('assassin', 102, 10, { patrol: 30, elite: true })
    ],
    checkpoints: [[56, 47], [64, 26], [56, 16]],
    pickups: [
      { t: 'potion', x: 24, y: 46 }, { t: 'potion', x: 62, y: 36 },
      { t: 'gold', x: 82, y: 24, v: 120 }, { t: 'potion', x: 44, y: 9 }
    ],
    secrets: [{ x: 62, y: 9, gold: 500 }]
  };

  /* ======================================================================
     10 — VAULT OF THE HOLLOW CROWN   BOSS: King Valdris
     ====================================================================== */
  var L10 = {
    id: 10, name: 'Vault of the Hollow Crown', biome: 'citadel',
    w: 132, h: 34, seed: 2010, gy: 26,
    spawn: [5, 26], exit: [126, 26],
    hint: 'Three phases. He does not stop between them.',
    build: cat(
      frame(132, 34, 26),
      ['rect', 0, 0, 132, 2],
      ['rect', 12, 22, 12, 4],
      ['plat', 26, 20, 6],
      ['rect', 34, 22, 10, 4],
      ['spike', 44, 25, 4],
      ['plat', 50, 19, 7],
      ['rect', 60, 22, 8, 4],
      // ---- final arena: wide, two low platforms, tall ceiling for the dive ----
      ['gate', 72, 14, 12],
      ['gate', 122, 14, 12],
      ['rect', 72, 26, 52, 8],
      ['plat', 80, 20, 8],
      ['plat', 108, 20, 8],
      ['plat', 94, 15, 8],
      ['pillar', 74, 6, 8, 2],
      ['pillar', 88, 6, 8, 2],
      ['pillar', 106, 6, 8, 2],
      ['pillar', 120, 6, 8, 2],
      ['rect', 72, 4, 52, 2],
      torches([[10, 24], [20, 20], [38, 20], [64, 20],
               [76, 22], [84, 18], [98, 13], [112, 18], [124, 22],
               [76, 8], [122, 8]])
    ),
    enemies: [
      E('grunt', 16, 22, { patrol: 40, tier: 3 }),
      E('archer', 28, 20, { patrol: 0, tier: 3 }),
      E('shielder', 38, 22, { patrol: 30, tier: 3 }),
      E('assassin', 54, 19, { patrol: 40 }),
      E('brute', 64, 22, { patrol: 20 })
    ],
    checkpoints: [[60, 22]],
    arena: { x0: 72, x1: 124, trigger: 80 },
    boss: { kind: 'valdris', x: 112, y: 26 },
    pickups: [{ t: 'potion', x: 30, y: 20 }, { t: 'potion', x: 52, y: 19 }, { t: 'potion', x: 68, y: 22 }]
  };

  return [L1, L2, L3, L4, L5, L6, L7, L8, L9, L10];
})();

/* -------------------------------------------------------------- helpers --- */
G.Levels = {
  count: function () { return G.LEVELS.length; },
  get: function (i) { return G.LEVELS[G.M.clamp(i, 0, G.LEVELS.length - 1)]; },

  /* Turn an authored level into a live G.World. */
  world: function (i) {
    var d = this.get(i);
    return new G.World({
      name: d.name, biome: d.biome, w: d.w, h: d.h, seed: d.seed, build: d.build
    });
  },

  /* Static sanity pass used by the smoke test: catches typos that would
     otherwise show up as an unreachable exit or a player spawning in rock. */
  validate: function () {
    var problems = [];
    for (var i = 0; i < G.LEVELS.length; i++) {
      var d = G.LEVELS[i];
      var w;
      try { w = this.world(i); }
      catch (e) { problems.push('L' + d.id + ' build threw: ' + e.message); continue; }
      var K = G.K, T = G.T;

      function solidAt(tx, ty) { return w.at(tx, ty) === T.SOLID; }
      function freeBody(tx, ty) {
        // 1x2 tile clearance for a standing actor whose feet are at row ty
        return !solidAt(tx, ty - 1) && !solidAt(tx, ty - 2);
      }
      function grounded(tx, ty) { return solidAt(tx, ty) || w.at(tx, ty) === T.PLAT; }

      if (!d.spawn) problems.push('L' + d.id + ' has no spawn');
      else {
        if (!freeBody(d.spawn[0], d.spawn[1])) problems.push('L' + d.id + ' spawn is inside geometry at ' + d.spawn);
        if (!grounded(d.spawn[0], d.spawn[1])) problems.push('L' + d.id + ' spawn has no floor at ' + d.spawn);
      }
      if (!d.exit) problems.push('L' + d.id + ' has no exit');
      else if (!freeBody(d.exit[0], d.exit[1])) problems.push('L' + d.id + ' exit is inside geometry at ' + d.exit);

      var lists = [['enemies', d.enemies], ['pickups', d.pickups]];
      for (var li = 0; li < lists.length; li++) {
        var arr = lists[li][1] || [];
        for (var j = 0; j < arr.length; j++) {
          var e = arr[j];
          if (e.x < 1 || e.x >= d.w - 1 || e.y < 1 || e.y >= d.h) {
            problems.push('L' + d.id + ' ' + lists[li][0] + '[' + j + '] out of bounds (' + e.x + ',' + e.y + ')');
          } else if (!freeBody(e.x, e.y)) {
            problems.push('L' + d.id + ' ' + lists[li][0] + '[' + j + '] embedded in rock (' + e.x + ',' + e.y + ')');
          }
        }
      }
      if (d.checkpoints) {
        for (var c = 0; c < d.checkpoints.length; c++) {
          var cp = d.checkpoints[c];
          if (!freeBody(cp[0], cp[1])) problems.push('L' + d.id + ' checkpoint[' + c + '] embedded (' + cp + ')');
        }
      }
      if (d.relic && !freeBody(d.relic.x, d.relic.y)) problems.push('L' + d.id + ' relic embedded');
      if (d.boss) {
        if (!d.arena) problems.push('L' + d.id + ' has a boss but no arena');
        if (!freeBody(d.boss.x, d.boss.y)) problems.push('L' + d.id + ' boss spawn embedded');
      }
    }
    return problems;
  }
};
