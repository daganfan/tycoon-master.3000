# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **Camera and controls:** pointer-lock mouse look, first-person mode (V), over-the-shoulder third person with wall collision, crosshair interaction and context hints, and a Controls tab in Settings (sensitivity, invert Y, FOV, head bob).
- **Bigger bedroom:**
  - 8 m × 6.5 m, with a 2 m desk and monitor risers, a second table, bookcase, dresser, nightstand and 4 wall shelves.
  - Purchases land on free spots.
  - Working fixtures: light switch, door, drawers, curtains and PC power.
  - The bed can be shoved.
- **Breakable window**, repaired by the Window Guy or by Mom.
- **Achievements:** 24 trophies, 8 of them secret, shown in a Trophies app.
- **Performance:**
  - Cached shadows, reduced-resolution AO and bloom, and a fixed light pool so shaders don't recompile.
  - Shaders precompiled behind the loading screen.
  - Dynamic resolution, an adaptive Auto preset and a screen-redraw scheduler.
  - FPS overlay on F3. Draw calls are 60–75% lower.

### Changed
- Mini-games earn only while their window is open on a screen. Monitors and PCs are screens (+1 game each), TycoonOS XP shows 2 windows per screen, and background slots come from skills/items.
- The exchange rate starts at x0.30 and rises with upgrades. Prices were rebalanced: the Garage Key costs $650k and also gives x2.2.
- TycoonOS lays out at a fixed logical resolution, so every app fits small monitors.
- Tidy Up only moves an object's home when you deliberately place it (or press H). Tidy is smooth, ordered and idempotent.
- The calm physics setting (0%) is much more stable.
- Save version 5, with migrations for the screen model and the bigger room.

- **The Garage (Phase 2):**
  - A walk-in physical factory tycoon: Scrap-o-Matic Works, with 18 buy pads, droppers of real physics scrap, conveyors, upgrader gates, a furnace, a tank, a collect pad, a Robo-Helper and rebirths that give Factory Stars.
  - Two new PC games: Hot Dog Highway and Robo Car Wash.
  - 11 garage items, 10 quests, and a teaser for the LAN Café Lease.
- **Multiplayer:** peer-to-peer play with no server. Host a room and share a link; visitors walk around the host's home, shove props and play the host's screens together. Includes chat, emotes and a player list with kick.
- **Junk Mart:** 80 quirky decorations, about 35 of them with behaviours. Also 18 new eBuy items, 35 total cosmetics (Heavy Metal, Low-Grav, Neon, Glass, Rainbow, Giant/Tiny, Haunted and more) and 6 new OS themes.
- **Graphics:** post-processing with Low/Medium/High/Ultra/Auto presets, sunlight only through the window plus light shafts, a day/night cycle on the real clock, a detailed room, a new avatar and nicer cash.
- **Gameplay:**
  - Grab and carry with saved placement, R to stand things back up, and a Tidy Up button.
  - A 70-node skill tree with a Hardware branch, and 2–3 more upgrades in each mini-game.
- **Distribution:**
  - Installable PWA with offline play.
  - GitHub Pages deploy, plus Electron desktop installers for Windows, macOS and Linux built by GitHub Actions.
  - Polyfills for other browsers and a friendly screen when WebGL is missing.

### Changed
- Lemon Mogul demand never drops to zero (rain no longer stops sales) and shows a suggested price.
- Tokens are much harder to earn:
  - Chaos now fills a Chaos Meter with diminishing returns, and flopping in place gives nothing.
  - Grind thresholds are steeper.
  - The level curve for Mogul Tokens is slower.
- The Garage Key costs $2M; the Bedroom takes about 85–105 minutes for the balance bot.

- Playable Bedroom prototype:
  - Mini-tycoons: Lemon Mogul, Rubber Duck Works, Sock Syndicate, Couch Coin Mining.
  - TycoonOS screen interface (boot, lock, desktop, windows, taskbar, notifications), with OS 95, XP and Vaporwave themes.
  - TycoonOS apps: eBuy, App Store, Wallet, Mail, Task Manager, Drip Shop, Settings.
  - Physical cash (coins, bills, money bags) with magnet pickup and auto-merging.
  - Grind, Mogul and Chaos tokens. Chaos comes from toppling, coin avalanches, box towers and ragdolls.
  - 27-node skill tree with keystones, hidden nodes and respec.
  - 13 shop items that appear as physics props, extra screens and PCs.
  - 5 skins and 3 modifiers (Bouncy, Jelly, Gold-Plated) that change both looks and physics.
  - Onboarding quests, offline earnings, IndexedDB autosave and save export/import.
- Toolchain: Vite, TypeScript, Svelte 5, ESLint, Prettier, Vitest, Playwright and CI.
- Headless balance bot and pacing tests.
- Design docs: TycoonOS, a 30-game roster, and the owner's decisions.
- MVP implementation plan (`docs/IMPLEMENTATION_PLAN.md`).
- Initial game design document (`docs/GAME_DESIGN.md`).
- Roadmap, README, contributing guide, editor and git configuration.
