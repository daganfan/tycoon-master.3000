# Tycoon Master 3000

**A tycoon game about playing tycoon games.**

You start out broke, with nothing but a crusty old PC. You play tycoon games to earn a little cash, then upgrade your gear, expand your space, automate everything and unlock a huge skill tree with tokens you earn along the way. The world looks realistic, the physics don't behave, and you can collect skins and modifiers to make everything sillier.

> 🚧 **Status: playable prototype.** The Bedroom phase is playable: 4 mini-tycoons inside TycoonOS, physical cash, tokens, a 27-node skill tree, shop, cosmetics and saves.

## Highlights

- 🎮 **Nested gameplay:** play original mini-tycoons inside **TycoonOS** on in-world screens, and their profits fund your real empire. 30 games planned (~20 hours).
- 🌳 **Huge skill tree:** 150+ nodes, unlocked with five token types (Grind, Mogul, Chaos, Pixel, Golden).
- 🏠 **Grow from a bedroom to a tower:** Bedroom → Garage → LAN Café → Indie Studio → Tycoon Tower → ???
- 🪙 **Quirky physics:** cash is physical, furniture tips over, and mayhem earns you Chaos Tokens.
- ✨ **Skins and skin modifiers:** Jelly, Bouncy, Heavy Metal, Gold-Plated, Low-Grav, Haunted… and they stack.
- 😤 **Prestige by "Rage Quit":** flip the desk, keep your legacy.

## Documentation

| Doc | What's inside |
|---|---|
| [Game Design Document](docs/GAME_DESIGN.md) | Full concept: loop, economy, tokens, skill tree, style, physics, MVP scope |
| [Implementation Plan](docs/IMPLEMENTATION_PLAN.md) | MVP architecture, systems, milestones, tests, risks |
| [Roadmap](docs/ROADMAP.md) | Milestones from prototype to release |
| [Contributing](CONTRIBUTING.md) | Branching, commits and conventions |
| [Changelog](CHANGELOG.md) | Notable changes |

## Running It

Requires Node 22+.

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm test` | Unit tests + headless balance (pacing) tests |
| `npm run e2e` | Browser smoke test (Playwright) |
| `npm run balance` | Print a simulated bot playthrough |
| `npm run check` | Typecheck + lint + tests + build |

Add `?fresh` to the URL to start a new game without touching your save.

## Controls

| Key | Action |
|---|---|
| WASD / arrows | Walk (Shift to sprint, Space to jump) |
| Drag mouse / scroll | Orbit / zoom camera |
| E or click a screen | Use the nearest screen (TycoonOS) |
| Esc | Step back from a screen |
| T | Skill tree |
| F | Flop over (mayhem!) |

## Tech Stack

TypeScript · Three.js (rendering) · Rapier (physics) · Svelte 5 (HUD) · Vite (build), browser first.
See the [Implementation Plan](docs/IMPLEMENTATION_PLAN.md) for the architecture.

## Repository Layout

```
.
├── src/
│   ├── core/        Loop, events, RNG, big numbers, stats pipeline
│   ├── sim/         Pure game simulation (economy, tokens, tree, tycoons, saves)
│   ├── content/     Data: items, skill nodes, cosmetics, quests
│   ├── os/          TycoonOS: canvas UI toolkit, desktop, apps, game views
│   ├── world/       Three.js + Rapier: room, props, cash, avatar, camera
│   └── ui/          Svelte HUD and skill tree overlay
├── tests/           unit/, sim/ (balance), e2e/ (Playwright)
├── scripts/         Dev scripts (balance report)
└── docs/            Design docs, plan, roadmap
```

## License

No license. All rights reserved by the repository owner.
