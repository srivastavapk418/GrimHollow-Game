# Grimhollow

> A dark, hand-crafted action-platformer about crossing a dying world, mastering movement, surviving brutal encounters, and facing the forces waiting at the end of the road.

### Live URL: https://grim-hollow-game.vercel.app/

![Grimhollow](https://img.shields.io/badge/Genre-Action%20Platformer-5b536b)
![Levels](https://img.shields.io/badge/Levels-10-c9a24e)
![Bosses](https://img.shields.io/badge/Bosses-3-a84b3a)
![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20Android%20PWA-4f78a8)

---

## ⚔️ What is Grimhollow?

**Grimhollow** is a self-contained 2D dark-fantasy action-platformer built around three things:

1. **Precise movement** — jump, double-jump, climb through carefully placed routes, dash, and recover from dangerous falls.
2. **Deliberate combat** — read enemy attacks, chain attacks, guard, parry, punish openings, and manage your resources.
3. **Exploration and progression** — discover secrets, collect gold, gain XP, unlock abilities, improve your stats, and push deeper into the world.

The game is designed to feel like a compact hand-crafted adventure rather than an endless procedural platformer. Every level is authored with its own layout, encounters, traversal challenges, secrets, checkpoints, and atmosphere.

---

## 🌑 The World

The journey contains **10 hand-authored levels** spread across distinct dark-fantasy environments.

Each stage can contain:

- Combat encounters
- Platforming challenges
- Vertical traversal sections
- Checkpoints
- Potions and gold
- Hidden secrets
- Relics and permanent abilities
- A boss encounter on designated stages

The level select screen, **The Road**, tracks which stages have been unlocked and which ones have been cleared.

### The Road

Your campaign progression is persistent. Unlocking a stage does **not** force you to replay previous stages in order. Once a level is available, you can revisit it from **The Road**.

The game separately tracks:

- **Furthest unlocked stage** — campaign progression shown on the title screen.
- **Current stage** — the actual level being played.
- **Cleared stages** — which levels have been completed.
- **Secrets found** — discovered hidden collectibles.

---

# 🗡️ Combat

Combat is built around spacing, timing, and reading enemy behavior rather than simply holding an attack button.

### Core combat actions

| Action                    | Purpose                                                                       |
| ------------------------- | ----------------------------------------------------------------------------- |
| **Attack**                | Strike enemies and chain attacks into combos.                                 |
| **Guard**                 | Reduce or defend against incoming attacks and create defensive opportunities. |
| **Parry / Perfect Guard** | Precisely timed defense that can create a punish window.                      |
| **Dash**                  | Quickly reposition, evade attacks, and traverse dangerous sections.           |
| **Dash Attack**           | A later combat ability that turns movement into offense.                      |
| **Potion**                | Restore health during a run.                                                  |
| **Plunge**                | A later ability for additional downward offensive movement.                   |

The combat system also uses **poise**, hit reactions, knockback, stagger windows, and different attack properties so heavier enemies cannot be treated exactly like basic enemies.

---

# 👹 Enemies

Grimhollow contains **seven enemy archetypes**, each built around a different threat profile.

| Enemy             | Role                                                          |
| ----------------- | ------------------------------------------------------------- |
| **Husk Soldier**  | Standard melee enemy and core combat matchup.                 |
| **Bulwark**       | Armored/shield-bearing enemy that is harder to break through. |
| **Bone Fletcher** | Ranged enemy that pressures the player from a distance.       |
| **Gloomwing**     | Flying enemy that attacks from above.                         |
| **Rotbound Ogre** | Heavy brute with high durability and dangerous attacks.       |
| **Veilstalker**   | Fast enemy capable of aggressive repositioning and dashes.    |
| **Hollow Wraith** | Flying ranged threat using magical projectiles.               |

Enemy stats and behavior include health, poise, attack windups, recovery, movement speed, range, aggression range, knockback, and special traits.

---

# 👑 Bosses

Three major multi-phase bosses stand between you and the end of the journey.

### The Warden of Ash

**Keeper of the Ashen Gate**

A heavy melee boss built around pressure, charges, powerful sword attacks, and punishable openings.

### The Hollow Choir

**Voice Beneath the Vault**

A mobile airborne boss that mixes ranged attacks, teleport-style movement, projectiles, and summoned threats.

### King Valdris, the Hollow Crown

**He Who Would Not Die**

The final major confrontation, with multiple phases and escalating attacks including close-range combos, dives, fissures, whirl attacks, meteors, and summons.

Bosses have their own health and poise systems, phase transitions, attack selection logic, telegraphed attacks, special attacks, and audiovisual feedback.

---

# 🧗 Movement & Platforming

Movement is a major part of the game's identity.

### Double Jump

Double-jump is available as a baseline traversal ability. It is deliberately part of the game's core movement rather than being locked behind campaign progression.

### Climb Routes

Long vertical walls are supplemented by **climb bars / recovery platforms**, allowing the player to route upward without relying entirely on highly precise wall-jump execution.

### Air Control

One of the game's relic abilities improves aerial steering after a double jump, giving greater control over difficult jumps and recovery situations.

### Recovery-Focused Level Design

Dangerous gaps are designed with recovery routes in mind so that a missed jump does not always mean an unavoidable death.

---

# 💎 Progression

Grimhollow combines campaign progression with RPG-style character growth.

### XP & Character Level

Defeating enemies and completing stages awards XP. Character level increases as XP thresholds are reached.

### Attunement

The **Attunement** screen lets you spend earned progression on permanent character statistics:

- **Vitality** — survivability
- **Power** — offensive strength
- **Speed** — movement-related improvement
- **Stamina** — endurance/resource capacity
- **Fortune** — luck-oriented progression
- **Focus** — concentration/combat-related progression

### Abilities / Relics

The game also contains permanent ability upgrades, including traversal and combat-oriented abilities.

Examples include:

- **Double Jump**
- **Air Control**
- **Dash Attack**
- **Plunge**

Some levels contain relic chambers and secret areas that reward exploration.

---

# 🧪 Resources

The player can find and carry **potions** for healing and collect **gold** during runs.

Gold and progression rewards are persistent, while run-specific statistics such as deaths and secrets discovered during the current stage are also used in the appropriate end-of-level summaries.

---

# 🎮 Controls

## Keyboard

| Input     | Action                                          |
| --------- | ----------------------------------------------- |
| **A / D** | Move left / right                               |
| **W / ↑** | Up / interact with level exits where applicable |
| **S / ↓** | Down where applicable                           |
| **Space** | Jump / double jump                              |
| **J**     | Attack                                          |
| **Shift** | Dash                                            |
| **K**     | Guard                                           |
| **L**     | Potion                                          |
| **Enter** | Confirm menu selections                         |
| **Esc**   | Pause / back where applicable                   |

> Exact game-state behavior can vary by screen; combat controls are active during gameplay while menu navigation uses the relevant selection controls.

## 📱 Android / Touch

Grimhollow is also designed to work as an installable **Progressive Web App (PWA)** on Android.

Touch controls provide virtual buttons for the core gameplay actions, and the **Control Layout** screen lets players reposition and resize the touch controls.

The custom layout is saved with the player's local game settings.

---

# ⚙️ Settings & Controls

The title screen provides a dedicated **Settings / Controls** section.

Available options include:

- **Control Layout** — reposition and resize touch controls and HUD elements.
- **Zoom** — adjust gameplay camera zoom.
- **Sound** — enable/disable game audio.
- **Reset Control Layout** — restore the default touch/HUD layout.

The gameplay camera zoom applies to **gameplay**, not to the title screen or menu screens.

---

# 💾 Save System

Grimhollow currently uses a **local browser/PWA save system** rather than an online account system.

The saved profile includes campaign and character data such as:

- Unlocked stages
- Cleared stages
- Most recently entered stage
- XP and character level
- Gold
- Character stats
- Abilities
- Potion capacity
- Discovered secrets
- Total deaths
- Total play time
- Gameplay settings
- Custom touch-control / HUD layout

The game also contains save-schema coercion/migration logic so older or partially malformed local save data can be handled without crashing the game.

> **Important:** these saves are local to the browser/PWA environment. There is currently no Google login, cloud synchronization, or server-side account save.

---

# 🔊 Audio & Atmosphere

The game uses **procedurally generated sound** and a dynamic music system with different musical moods for calmer areas, tense encounters, and boss fights.

Boss encounters also use dedicated roars, impact feedback, phase-transition effects, and screen-shake feedback to make attacks readable and impactful.

---

# 🖼️ Visual Style

Grimhollow uses a fully code-driven 2D rendering pipeline rather than relying on a large collection of external game assets.

The visual system includes:

- Hand-authored environments
- Parallax backgrounds
- Dynamic lighting and ambient effects
- Procedural particles
- Combat effects
- Screen shake
- Character rigs and animated poses
- Distinct enemy and boss silhouettes
- Thematic biomes and level decoration

The result is a deliberately dark, atmospheric presentation with readable combat silhouettes and strong contrast around important gameplay elements.

---

# 🧩 Technical Architecture

The game is designed as a **self-contained static web application**.

Core source modules include:

| File                | Responsibility                                           |
| ------------------- | -------------------------------------------------------- |
| `src/01_core.js`    | Math utilities, RNG, input, audio, persistence, tunables |
| `src/02_world.js`   | World/terrain systems                                    |
| `src/03_fx.js`      | Particles and visual effects                             |
| `src/04_art.js`     | Character and visual drawing helpers                     |
| `src/05_player.js`  | Player movement, combat, health, abilities               |
| `src/06_enemies.js` | Enemy archetypes and AI                                  |
| `src/07_bosses.js`  | Boss definitions, actions, phases, attacks               |
| `src/08_render.js`  | Main world and gameplay rendering                        |
| `src/09_levels.js`  | Hand-authored level definitions                          |
| `src/10_ui.js`      | HUD, menus, touch controls, settings, layout editor      |
| `src/11_game.js`    | Game state machine and orchestration                     |

The build process combines the source modules into the distributable game page.

---

# 🧪 Testing

The repository includes an automated test suite covering game logic and regression-sensitive systems.

Run:

```bash
node test.js
```

Build the distributable version with:

```bash
node build.js
```

The generated `dist/` directory contains the complete static site.

---

# 🌐 Running Locally

Because the game is self-contained, the simplest desktop test is to open:

```text
dist/index.html
```

in a modern browser.

For development and deployment, a local/static HTTP server is recommended so that PWA service-worker behavior can be tested correctly.

---

# 🚀 Deployment

The `dist` directory is the complete deployable web application.

It can be hosted on any static hosting platform that serves HTML, JavaScript, JSON, PNG/SVG assets, and the service worker over HTTPS.

### GitHub Pages

Run the build first, then publish the contents of `dist/` using the desired GitHub Pages workflow.

---

# 📲 Installing on Android

Grimhollow is distributed as a **Progressive Web App**, not a native APK.

1. Deploy the game over **HTTPS**.
2. Open the game in **Chrome on Android**.
3. Use Chrome's **Install app / Add to Home screen** option.
4. Launch Grimhollow from the installed app entry.

The project includes:

- Web app manifest
- Service worker
- 192×192 icon
- 512×512 icon
- Maskable icons
- Apple touch icon
- Cache/version handling for updated builds

---

# 🗺️ Design Philosophy

Grimhollow is built around a simple idea:

> **Make movement expressive, make combat readable, and make every level worth learning.**

That means the game intentionally rewards:

- Learning enemy patterns
- Using defensive timing instead of blindly attacking
- Exploring alternate routes
- Discovering secrets
- Mastering the double jump and climb routes
- Improving your character between stages
- Replaying earlier stages with better knowledge and abilities

The goal is not to make the player feel powerful immediately. The goal is to make the player feel **more capable because they understand the game better**.

---

# ✨ Current Feature Summary

- **10** hand-authored levels
- **3** multi-phase bosses
- **7** enemy archetypes
- Melee combat and combo attacks
- Guard/parry mechanics
- Poise and stagger system
- Dash and dash-attack progression
- Permanent double jump
- Climb-bar traversal routes
- Air-control relic
- Potions and gold
- XP and character leveling
- Six upgradeable stats
- Secrets and collectibles
- Checkpoints
- Dynamic boss phases
- Procedural audio
- Dynamic music moods
- Particles, lighting, screen shake, and combat effects
- Custom Android touch controls
- Custom HUD/control layout editor
- Gameplay camera zoom
- Local persistent saves
- PWA/offline-capable web distribution
- Automated test suite
- Self-contained static deployment

---

# 📌 Project Status

Grimhollow is an actively developed game project. The architecture is intentionally modular so that new enemies, levels, relics, combat abilities, bosses, visual effects, and progression systems can be added without replacing the entire game foundation.

Future development can build on the existing local save architecture to introduce optional account-based or cloud synchronization without requiring the core gameplay systems to be rewritten.

---

# 📄 License

No explicit open-source license is currently declared for this project.

Unless a license is added to the repository, treat the source code and game content as **all rights reserved** by the project owner.

---

## 🖤 Grimhollow

**The road does not end because the world is dead.**

**It ends when you stop walking.**
