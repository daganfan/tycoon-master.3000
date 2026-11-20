# Contributing

## Workflow

1. Branch off the default branch: `feature/<short-name>`, `fix/<short-name>` or `docs/<short-name>`.
2. Keep pull requests focused on one feature or fix.
3. Update docs when behavior or design changes. The [GDD](docs/GAME_DESIGN.md) is the source of truth for design.
4. Add an entry to [CHANGELOG.md](CHANGELOG.md) under **Unreleased** for notable changes.

## Commit Messages

Use short, imperative summaries with an optional type prefix:

```
feat: add coin pickup magnet
fix: stop desk from clipping through floor
docs: expand skill tree branches in GDD
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `art`, `balance`.

## Design Changes

For anything that changes the game design (new currencies, phases, skill tree branches):
- Update `docs/GAME_DESIGN.md` in the same PR.
- Mark undecided items with **🟡 Open** and add them to the Open Questions table.

## Code Style

Will be defined (and enforced by linters/formatters) once the tech stack is confirmed. Until then, follow `.editorconfig`.
