# Tycoon Master 3000

**A tycoon game about playing tycoon games.**

You start out broke, with nothing but a crusty old PC. You play tycoon games to earn a little cash, then upgrade your gear, expand your space, automate everything and unlock a huge skill tree with tokens you earn along the way. The world looks realistic, the physics don't behave, and you can collect skins and modifiers to make everything sillier.

> 🚧 **Status: pre-production.** The game design is being defined; no game code yet.

## Highlights

- 🎮 **Nested gameplay:** play many original mini-tycoons on in-world machines, and their profits fund your real empire.
- 🌳 **Huge skill tree:** 150+ nodes, unlocked with five token types (Grind, Mogul, Chaos, Pixel, Golden).
- 🏠 **Grow from a bedroom to a tower:** Bedroom → Garage → LAN Café → Indie Studio → Tycoon Tower → ???
- 🪙 **Quirky physics:** cash is physical, furniture tips over, and mayhem earns you Chaos Tokens.
- ✨ **Skins and skin modifiers:** Jelly, Bouncy, Heavy Metal, Gold-Plated, Low-Grav, Haunted… and they stack.
- 😤 **Prestige by "Rage Quit":** flip the desk, keep your legacy.

## Documentation

| Doc | What's inside |
|---|---|
| [Game Design Document](docs/GAME_DESIGN.md) | Full concept: loop, economy, tokens, skill tree, style, physics, MVP scope |
| [Roadmap](docs/ROADMAP.md) | Milestones from prototype to release |
| [Contributing](CONTRIBUTING.md) | Branching, commits and conventions |
| [Changelog](CHANGELOG.md) | Notable changes |

## Tech Stack (proposed)

TypeScript · Three.js (rendering) · Rapier (physics) · Vite (build), browser first.
*Not final. See [GDD §10](docs/GAME_DESIGN.md#10-scope-and-platform).*

## Repository Layout

```
.
├── docs/            Design docs and roadmap
├── README.md
├── CONTRIBUTING.md
└── CHANGELOG.md
```

Source folders (`src/`, `assets/`, `tests/`) will be added once the tech stack is confirmed.

## License

Not chosen yet. Until a license is added, all rights are reserved by the repository owner.
