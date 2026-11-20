# Implementation Plan: MVP

> **Status:** Proposal v0.1. Covers the MVP from [GDD §10](./GAME_DESIGN.md#10-scope-and-platform) and Roadmap Milestones 0–2 (plus the MVP slice of Milestone 3).
> No game code exists yet. Coding starts only after the owner approves this plan.

---

## 1. Recommended Answers to Open Questions

| # | Question (GDD §11) | Recommendation | Why |
|---|---|---|---|
| 1 | Tech stack | **TypeScript + Three.js + Rapier (`@dimforge/rapier3d-compat`) + Vite**, UI in **Svelte 5** | Browser-first and shareable. Three.js gives good PBR. Rapier handles hundreds of coins cheaply. Svelte keeps UI fast and small. Godot/Unity would mean a heavier toolchain and harder web sharing. |
| 5 | Camera | **Third-person orbit camera** around the avatar, with **"focus mode"** that zooms into a screen to play a mini-tycoon | You see the physics comedy in third person. Focus mode keeps the mini-games readable. |
| 6 | How playable are mini-tycoons? | **Hands-on early, automatable later.** Each has 1–2 active verbs (click, place, set price) and an idle tick. Bots/skills automate the verbs. | Gives Grind Tokens a purpose early and keeps the idle fantasy late. |
| 7 | Prestige layers | **3 layers:** Rage Quit → Sell the Company → The Recursion. **MVP ships 0** (Rage Quit lands in Milestone 4). | Matches the GDD. Keeps MVP scope small. |
| 8 | Art pipeline | **CC0 asset packs + light procedural work.** PBR textures and HDRIs from Poly Haven, base models from CC0 packs (e.g. Kenney, Quaternius), modified in Blender. Everything is glTF/GLB with KTX2 textures. | Realistic-like look without a modelling team. Every asset's license is tracked in `assets/CREDITS.md`. |
| 2, 3, 4, 9 | Title, multiplayer, monetization, license | **Owner decision.** Defaults: keep the working title, single-player, no monetization, choose license before first public build. | Business choices, not technical ones. |

---

## 2. Architecture

**Core rule: the simulation is pure TypeScript and knows nothing about rendering.** Rendering, physics and UI read from it and send it commands. This makes the economy testable, saveable and balanceable without a browser.

```
           ┌──────────── commands (buy, play, click) ───────────┐
           │                                                     ▼
┌──────────┴─────────┐   events    ┌───────────────────────────────────┐
│  UI (Svelte)        │◄───────────│  SIM CORE (pure TS, fixed tick)    │
│  HUD, shop, tree    │            │  economy · tokens · skill tree     │
└─────────────────────┘            │  stats pipeline · mini-tycoons     │
┌─────────────────────┐   events    │  milestones · unlocks · save state │
│  WORLD (Three.js +  │◄───────────│                                    │
│  Rapier)            │───────────►│                                    │
│  rooms, coins,      │ physics     └───────────────────────────────────┘
│  avatar, screens    │ events (chaos, pickups)
└─────────────────────┘
```

| Concept | Decision |
|---|---|
| **Game loop** | Fixed-step sim at 10 ticks/s. Physics at a 60 Hz fixed step. Render on `requestAnimationFrame` with interpolation. |
| **Big numbers** | `break_eternity.js` behind a thin `Num` wrapper, so idle numbers can grow past `1e308`. |
| **Content is data** | Skill nodes, shop items, mini-tycoons, skins and modifiers are typed TS data files (`src/content/`), validated at startup and in tests. |
| **Stats pipeline** | Every number that upgrades can affect (click power, payout rate, coin magnet radius…) is a named **Stat**. Sources add `add` / `mult` / `override` modifiers. The result is cached and recomputed only when a source changes. Skill nodes, hardware, decor and modifiers all work this way, so stacking is consistent. |
| **Event bus** | Typed events (`coin.collected`, `object.toppled`, `milestone.reached`…). Token awards and achievements subscribe to events instead of being hard-wired. |
| **Determinism** | A seeded RNG lives in sim state, so tests and balance simulations can reproduce results. |

---

## 3. Folder Layout

```
src/
  main.ts                 bootstrap
  core/                   loop, event bus, RNG, Num, stats pipeline
  sim/
    economy/              currencies, wallet, exchange rates, offline earnings
    tokens/               token types, award rules (event → token)
    skilltree/            graph model, purchase/respec logic
    tycoons/              mini-tycoon framework + one folder per game
      framework.ts
      lemon-mogul/
      rubber-duck-works/
      sock-syndicate/
    shop/                 purchasables, slots, ownership
    save/                 serialize, versioned migrations, IndexedDB
  world/                  Three.js + Rapier
    scene/                renderer, lighting, post-processing
    physics/              Rapier world, body factory, chaos detectors
    entities/             coins, furniture, machines, avatar (ragdoll)
    screens/              in-world screen → CanvasTexture bridge, focus mode
    cosmetics/            skin + modifier application (material + physics)
  ui/                     Svelte: HUD, shop, skill tree viewer, menus
  content/                data: nodes, items, skins, modifiers, tycoons
assets/                   glTF models, KTX2 textures, HDRIs, audio, CREDITS.md
tests/
  unit/                   Vitest: sim, economy, tree, save
  sim/                    headless balance runs ("bot plays 2 hours")
  e2e/                    Playwright: boot, buy, save/load smoke tests
```

---

## 4. Core Systems

### 4.1 Economy
- `Wallet` holds Cash, five token types and Legacy Points (Legacy is unused until Milestone 4).
- Costs scale geometrically: `cost = base × growth^owned`, with growth between 1.07 and 1.15. Each item's values live in its content file.
- Each mini-tycoon has its own internal currency. It converts to Cash through a per-game **exchange rate** stat.
- **Offline earnings:** on load, the game simulates elapsed time in coarse steps (capped, e.g. 8h; skills can raise the cap) and shows an "while you were away" summary.

### 4.2 Tokens
Award rules are data: `{ token, onEvent, condition, amount, cooldown }`.

| Token | MVP sources |
|---|---|
| Grind | Every N manual actions; active-play time streaks |
| Mogul | Mini-tycoon level-ups and milestones |
| Chaos | Physics detectors (§4.5): toppled furniture, coin avalanches, stacked towers, ragdoll falls |
| Pixel, Golden | Defined in data, but unearnable until Milestone 4–5 |

### 4.3 Skill Tree
- **Node:** `{ id, branch, pos, cost: Partial<Record<Token, Num>>, requires: id[], effects: Effect[], hidden?, keystone? }`
- **Effect** is either a stat modifier (`{ stat, op, value }`) or a **flag** for keystones that change behavior (`coins.bounceTowardPlayer`).
- Purchase rule: at least one neighbor is owned and the cost is affordable. Hidden nodes show as "?" until a neighbor is owned.
- Respec refunds 100% of tokens and costs Cash that scales with the number of nodes owned.
- **UI:** a pan/zoom canvas rendered from node `pos`, with branch colors and tooltips. It must stay fast at 150+ nodes, so draw on canvas, not with DOM nodes.
- MVP: about 25 nodes across Hustle, Business, Chaos Physics and Style.

### 4.4 Mini-Tycoon Framework
```ts
interface MiniTycoon {
  id: string;
  init(ctx: TycoonContext): TycoonState;
  tick(state, dt): void;               // idle progress
  actions: Record<string, ActionDef>;  // manual verbs (click, set price…)
  draw(state, g: CanvasRenderingContext2D, size): void; // stylized 2D
  milestones: MilestoneDef[];
}
```
- Each game draws to an offscreen 2D canvas. That canvas becomes a `CanvasTexture` on its in-world monitor. Redraws are throttled when the game isn't in focus.
- **Focus mode:** the camera eases onto the screen, and pointer input is raycast to UV coordinates and passed to the game.
- **Machines are slots:** hardware has `speed` and `quality` stats that multiply tick rate and payout.
- **MVP games:** Lemon Mogul (tutorial), Rubber Duck Works (ducks become physical objects when they jam), Sock Syndicate.

### 4.5 Physics and Chaos
- Rapier world with sleeping enabled, CCD only on fast objects, and collision groups (player, props, coins, static).
- **Physical cash:** coins come from a pool and render as `InstancedMesh`. There's a hard cap on live coins (e.g. 400). Past the cap, coins **merge** into bills, then cash bags, so the value stays physical without killing performance.
- **Pickup:** walk-over collection plus a magnet radius stat. Vacuum and magnet upgrades raise it.
- **Chaos detectors** (each emits an event, with cooldowns so they can't be farmed):
  - Topple: a prop's up-vector tilts past 60° after being upright.
  - Avalanche: more than X coins above a speed threshold in one second.
  - Tower: 5+ stacked props resting for 3 seconds.
  - Ragdoll: the avatar is airborne for more than 1.5 seconds or takes a big impact.
- **Comfort setting:** scales impulses, screen shake and ragdoll intensity (GDD §8).
- **Avatar:** a kinematic character controller while walking. It switches to a ragdoll of 5–7 capsules on big impacts or trips, then blends back.

### 4.6 Skins and Modifiers
- **Skin:** a material set and/or mesh variant for one target type (avatar, machine, furniture, cash, screen frame).
- **Modifier:** `{ id, rarity, visual: MaterialPatch | ShaderHook, physics: { mass?, restitution?, friction?, gravityScale?, scale? }, behavior?: 'haunted' | 'jelly' }`
- **Stacking:** physics patches are applied in rarity order (multiplicative). Visual patches compose through a small material-layer system. Jelly is a vertex-shader wobble driven by contact impulses.
- **MVP:** 5 skins; Jelly, Bouncy and Gold-Plated modifiers; 1 slot per object (more slots come from the Style branch).
- Gameplay effects stay small and go through the stats pipeline, e.g. Gold-Plated gives +1% Cash.

### 4.7 Save and Load
- The state is plain JSON: wallet, owned items/nodes, tycoon states, cosmetics, settings, RNG seed and a `version` field.
- Saves go to **IndexedDB** with a rotating set of 3 slots and a backup. The game autosaves every 30 seconds and on `visibilitychange`.
- **Migrations:** an ordered list `v1→v2→…` that runs on load and is unit-tested with fixture saves.
- Export/import uses base64 text, so you can copy a save between browsers.

---

## 5. Milestones and Tasks

Each task ends in a commit. Each milestone ends in a playable build and a short demo report.

### M0: Foundations (½ week)
1. Vite + TS (strict) + Svelte + ESLint + Prettier + Vitest + Playwright
2. GitHub Actions CI: typecheck, lint, unit tests, build
3. Core: loop, event bus, RNG, `Num`, stats pipeline, plus their tests

### M1: Tech Prototype (1–2 weeks)
1. Bedroom scene: HDRI lighting, PBR materials, shadows, a few CC0 props
2. Rapier world, prop bodies, a toppling desk/monitor
3. Coin pool, instancing, merging, pickup and magnet
4. Avatar controller, orbit camera, basic ragdoll
5. Screen bridge: a test canvas game on the monitor, plus focus mode

### M2: Core Loop / MVP (2–3 weeks)
1. Mini-tycoon framework, then Lemon Mogul end to end
2. Economy, shop (hardware + furniture), and slots
3. Tokens: Grind, Mogul, Chaos, with the chaos detectors
4. Skill tree model and canvas UI, 25 nodes
5. Rubber Duck Works and Sock Syndicate
6. Save/load, offline earnings, export/import
7. First-15-minutes onboarding (GDD §9)
8. MVP cosmetics: 5 skins and 3 modifiers (pulled forward from M3)

After the MVP, Milestones 3–6 follow `ROADMAP.md` unchanged.

---

## 6. Test Strategy

| Layer | Tool | What |
|---|---|---|
| Unit | Vitest | Stats pipeline math, cost curves, skill tree purchase rules, token award rules, save migrations, content validation (no orphan nodes, no unreachable nodes, all costs are positive) |
| Balance sim | Vitest, headless | Scripted "player bots" run the sim for N hours of game time with no rendering. They assert pacing targets (e.g. first skill node under 3 minutes, garage door affordable at 45–75 minutes) and catch runaway growth. |
| E2E | Playwright | Boot without console errors; play Lemon Mogul and earn coins; buy an item; save, reload and verify state |
| Visual | Playwright screenshots (parallax-threejs harness is optional) | A few fixed camera shots to catch lighting/material regressions |
| Performance | Manual + Chrome trace | 60 fps on a mid-range laptop with 400 coins and 3 screens active |

---

## 7. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Too many physics coins hurt performance | High | Pooling, instancing, sleeping, a hard cap with merging. Profile in M1 before building on it. |
| "Realistic-like" art takes too long | High | CC0 packs, a consistent HDRI/lighting preset, and a strict asset budget per room. The look comes from lighting and materials more than model count. |
| Idle economy balance breaks (too slow or exploding) | Medium | All numbers in data, headless balance sims in CI, and a debug panel for time-skip and currency injection. |
| Chaos Tokens get farmed by repeating one stunt | Medium | Per-detector cooldowns, diminishing returns, and a variety bonus. |
| Skill tree of 150+ nodes is hard to author | Medium | Data and layout in one file, a validation test, and later a small in-browser editor (dev-only). |
| Save corruption across versions | Medium | Versioned migrations, fixture tests and backup slots. |
| Accidental resemblance to existing games | Low | Mini-tycoons stay original concepts (GDD §4), and the art avoids recognizable IP. |

---

## 8. Agent and Tooling Use

| Tool | Used for |
|---|---|
| Plan agent | Reviewing architecture changes before big refactors |
| Explore / general-purpose agents | Parallel research (Rapier APIs, three.js techniques) when needed; reports kept short |
| parallax-threejs | Scene-graph and rendering debugging, visual regression from M1 |
| playwright | E2E and screenshot checks |
| typescript-lsp | Code navigation and type checks |
| code-review skill | Review each milestone's diff before merge |
| Token Shield | Keep sessions lean: one milestone per session, checkpoint state to disk, short reports |

---

## 9. Decisions Needed From the Owner

1. Approve the stack: **TS + Three.js + Rapier + Vite + Svelte**.
2. Approve the camera: **third-person orbit + focus mode**.
3. Approve the art approach: **CC0 asset packs + procedural**, with no custom modelling for the MVP.
4. MVP mini-tycoons: **Lemon Mogul, Rubber Duck Works, Sock Syndicate**. Do you want a different third game?
5. Title, monetization, license: keep the defaults for now?
