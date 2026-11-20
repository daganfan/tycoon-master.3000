# Tycoon Master 3000: Game Design Document

> **Status:** Draft v0.1, the base concept. Nothing here is locked. Anything marked **🟡 Open** still needs a decision.

---

## 1. The Pitch

**A tycoon game about playing tycoon games.**

You start out broke, sitting in a tiny bedroom with a junky second-hand PC. The only thing you're good at is playing tycoon games. So you play them, and you earn a little cash, then a little more. You reinvest it in better hardware, more screens, more rooms, more machines and staff who play for you. You end up running a sprawling empire built entirely on tycoon games, and eventually you start *making* them.

**Three pillars:**

1. **Satisfying number-go-up.** It's a classic tycoon/idle loop: start with nothing and keep growing.
2. **A huge skill tree.** You unlock it with several kinds of tokens, and each kind comes from a different playstyle.
3. **Realistic-looking world, ridiculous physics.** Everything looks believable, but it behaves absurdly, and you can unlock skins and skin modifiers to make it even sillier.

**Tone:** affectionate parody of the tycoon genre, self-aware, and recursive. The last joke is that one of the games you play is *this* game.

---

## 2. Core Loop

```
  ┌─────────────────────────────────────────────────────────────┐
  │                                                             │
  ▼                                                             │
PLAY mini-tycoons on your machines ──► EARN Cash + Tokens       │
                                            │                   │
                                            ▼                   │
                         SPEND: hardware, furniture, rooms,     │
                         bots/staff, skill tree, skins          │
                                            │                   │
                                            ▼                   │
                     More machines, faster games, automation ───┘
                                            │
                                            ▼
                         PRESTIGE ("Rage Quit") for Legacy bonuses
```

### Two layers

| Layer | What it is | Where you are |
|---|---|---|
| **Inner layer: mini-tycoons** | Small self-contained tycoon games played on in-world screens (2D/stylized UI) | On a monitor, arcade cabinet, phone, etc. |
| **Outer layer: your empire** | A 3D physics-driven world you walk around, decorate and expand | Bedroom → Garage → … → Tycoon Tower |

Progress in the inner layer **pays out to the outer layer**. Each mini-tycoon converts its in-game money into real Cash at an exchange rate that you can upgrade.

---

## 3. Progression Phases (the Outer Layer)

Each phase is a new physical location with more space, more slots for machines, and new mechanics.

| # | Location | Unlocks / Theme |
|---|---|---|
| 1 | **Mom's Spare Bedroom** | One crusty PC, one mini-tycoon, everything done by hand. Coins literally pile up on the floor. |
| 2 | **The Garage** | Multiple PCs, first automation (cheap "bot" helpers), first token types. |
| 3 | **LAN Café / Arcade** | Customers pay to play your machines, arcade cabinets, staff hiring, decor that affects income. |
| 4 | **Indie Studio** | You start **building your own mini-tycoons** (choose modules and theme, then release them for revenue). |
| 5 | **Tycoon Tower** | Multi-floor building, departments, huge automation, late-game skill branches. |
| 6 | **The Recursion** | *(Endgame/secret)* You discover Tycoon Master 3000 inside a machine. Playing it nests a new run inside your run. |

🟡 **Open:** exact number of phases, and whether phases are distinct maps or one expanding map.

---

## 4. Mini-Tycoons (the Inner Layer)

Each mini-tycoon is a short, original, self-contained management game with its **own twist mechanic**. Players unlock them over time, run several in parallel, and eventually automate them.

Starter list (all original concepts, working names):

| Mini-Tycoon | Twist |
|---|---|
| **Lemon Mogul** | Tutorial game. Pricing vs. weather. |
| **Rubber Duck Works** | Assembly line; ducks are physics objects that jam the belts. |
| **Hot Dog Highway** | Placing carts on a traffic map. |
| **Sock Syndicate** | Matching pairs; unmatched socks are a "loss" resource. |
| **Cloud Farm** | Harvest weather; sell rain to other games (cross-game economy). |
| **Haunted Hotel Inc.** | Guests are scared on purpose; fear = revenue, too much fear = lawsuits. |
| **Robo Car Wash** | Queue/throughput puzzle; robots occasionally rebel. |
| **Meme Stock Exchange** | Volatile market; buy hype, sell before it crashes. |
| **Space Pizza Express** | Delivery routing across planets with travel time. |
| **Tycoon Tycoon** | Late game: a mini-tycoon about running a tycoon studio (recursion foreshadowing). |

**Shared systems:** each mini-tycoon has its own level, a prestige track and milestones. Milestones award **Tokens** (see §6).

🟡 **Open:** How hands-on are the mini-tycoons: real playable mini-games, or mostly idle with a few clicks? (Proposal: hands-on early, automatable later.)

---

## 5. Economy

### Currencies

| Currency | Source | Used for |
|---|---|---|
| **Cash ($)** | Payouts from mini-tycoons, customers, released games | Hardware, furniture, rooms, staff, most purchases |
| **Tokens** (several types, §6) | Specific activities and milestones | Skill tree, skins and modifiers |
| **Legacy Points** | Prestige ("Rage Quit") | Permanent meta-upgrades that survive resets |

### Purchasables (Cash)

- **Hardware:** PCs, monitors, consoles, arcade cabinets, server racks. Each one is a "slot" that runs a mini-tycoon and has speed/quality stats.
- **Furniture and decor:** chairs, desks, lights, plants and posters. Decor gives small buffs ("Vibe" stat), and it's all physics objects.
- **Rooms and buildings:** expand the space, unlock the next phase.
- **Staff and bots:** play mini-tycoons for you (automation). Staff have traits; bots are cheaper but have glitches.
- **Utilities:** power, internet and cooling. Overloaded power trips breakers, and overheated PCs smoke (comedy + light management).

---

## 6. Tokens and the Skill Tree

### Token Types

Each token type rewards a different way of playing, so every playstyle feeds the tree.

| Token | Earned by | Flavor |
|---|---|---|
| 🟢 **Grind Tokens** | Active play: clicks, manual actions, time spent | "Hustle" |
| 🔵 **Mogul Tokens** | Mini-tycoon milestones and levels | "Business" |
| 🟠 **Chaos Tokens** | Physics events: knocking things over, coin avalanches, stacking towers, ragdoll stunts | "Mayhem" |
| 🟣 **Pixel Tokens** | Prestiging individual mini-tycoons | "Mastery" |
| 🟡 **Golden Tokens** | Rare: achievements, secrets, global prestige | "Legend" |

### Skill Tree

One large, zoomable tree (**target: 150+ nodes** at launch), split into branches that radiate from a central "Broke Gamer" root node. Nodes cost one or more token types, and mixed-cost nodes connect branches.

| Branch | Main Token | Examples |
|---|---|---|
| **Hustle** | Grind | +click power, combo multipliers, "speedrunner" bonuses |
| **Business** | Mogul | Better exchange rates, more mini-tycoon slots, price negotiation |
| **Automation** | Mogul + Grind | Bot efficiency, staff traits, offline earnings |
| **Hardware** | Mogul + Pixel | Faster machines, overclocking, cooling, power capacity |
| **Chaos Physics** | Chaos | Coin magnetism, bouncier cash, explosion payouts, gravity toggles |
| **Style** | Chaos + Pixel | Unlock skin slots, modifier stacking, rarer drop chances |
| **Legacy** | Golden | Prestige multipliers, starting bonuses, secret content |

**Design rules:**
- Keystone nodes change *how you play*, not just numbers (e.g., "Coins now bounce toward you", "Bots can play two games at once but argue").
- A respec costs something but stays affordable, so experimenting is encouraged.
- Some nodes are hidden until discovered (fog-of-war on the tree).

---

## 7. Prestige: "Rage Quit"

When progress slows down, you can **Rage Quit**: flip the desk (literally, physics ragdoll animation), lose your Cash, rooms and hardware, and keep:
- Legacy Points (based on lifetime earnings)
- Golden Tokens
- Unlocked skins and modifiers
- Selected skill-tree branches (the Legacy branch decides how much is kept)

Later layers: **"Sell the Company"** (bigger reset) and **"The Recursion"** (nested run).

🟡 **Open:** how many prestige layers, and their pacing.

---

## 8. Visual Style and Physics

### Art direction: "Realistic-like"

- Believable materials (PBR), real-world proportions, good lighting and shadows, cozy clutter.
- **The joke comes from contrast:** the world looks like a real messy gamer room, but it behaves like a cartoon.
- Mini-tycoons on screens use their *own* distinct stylized looks (pixel art, flat vector, retro CRT), which keeps them distinct from the realistic outer world.

### Quirky physics

Everything in the outer world is a physics object:
- **Cash is physical:** coins and bills spawn, pile up, roll under the bed, and have to be collected (vacuum and magnet upgrades).
- **Furniture wobbles, tips and stacks.** Bumping a desk can send the monitor flying.
- **Ragdoll avatar:** trip over cables, fall off chairs, get launched by a coin avalanche.
- **Physics events earn Chaos Tokens.** Mayhem is a resource, not just a bug.
- Physics can be toggled more or less chaotic in settings (accessibility / motion comfort).

### Skins and skin modifiers

**Skins** change appearance; **modifiers** change appearance *and* physical behavior. They can be applied to the avatar, machines, furniture, cash and even the mini-tycoon screens.

| Modifier | Effect |
|---|---|
| **Jelly** | Object wobbles and squishes |
| **Bouncy** | High restitution, bounces everywhere |
| **Heavy Metal** | Very heavy, chrome look, dents things |
| **Low-Grav** | Floats slowly |
| **Gold-Plated** | Shiny gold; tiny Cash bonus |
| **Pixelated** | Rendered as voxels/low-poly |
| **Neon** | Glows, emits light |
| **Tiny / Giant** | Scale change (affects physics) |
| **Haunted** | Moves on its own occasionally |

- **Rarity tiers:** Common → Rare → Epic → Legendary → *Glitched* (secret).
- **Stacking:** the Style branch unlocks multiple modifiers per object (Jelly + Gold-Plated + Giant).
- **Sources:** token purchases, achievements, milestone drops, earned (not bought) loot boxes.
- Mostly cosmetic. Gameplay effects stay small so they never become mandatory.

---

## 9. Player Experience: First 15 Minutes

1. Wake up in the bedroom. There's a sticky note: "Rent due. -Mom".
2. Boot the crusty PC and play **Lemon Mogul** (guided tutorial).
3. The first payout clinks out of the PC as physical coins. Pick them up.
4. Buy a second-hand monitor. It arrives and promptly falls over (physics intro).
5. Earn the first Grind and Mogul tokens, then open the skill tree and buy the first node.
6. Unlock **Rubber Duck Works**. Now two games run at once.
7. Knock over a coin pile by accident and get your first **Chaos Token** ("Mayhem pays!").
8. Tease: a locked garage door with a price tag.

---

## 10. Scope and Platform

### Proposed tech stack

| Area | Proposal | Why |
|---|---|---|
| Platform | **Browser first** (desktop), with a later Electron/Steam wrapper | Easy to share and test, runs anywhere |
| Language | **TypeScript** | Type safety for a big economy/skill-tree codebase |
| 3D rendering | **Three.js** | Mature, good PBR/lighting for the realistic-like look |
| Physics | **Rapier** (WASM) | Fast, deterministic, good for piles of coins |
| UI | HTML/CSS overlay (React or Svelte) | Skill tree, shops and mini-tycoon screens |
| Build | **Vite** | Fast dev server and builds |
| Save | LocalStorage/IndexedDB plus export/import, cloud saves later | Simple to start |

🟡 **Open:** confirm stack. Alternatives: **Godot 4** (desktop-first, built-in physics) or **Unity** (strongest realistic visuals, heavier toolchain).

### MVP (first playable)

- Phase 1 (Bedroom) only
- 2–3 mini-tycoons
- Cash + 3 token types
- ~25 skill tree nodes
- Physical cash with pickup
- 5 skins, 3 modifiers
- Save/load

See [`ROADMAP.md`](./ROADMAP.md) for milestones.

---

## 11. Open Questions

| # | Question | Notes |
|---|---|---|
| 1 | Final tech stack? | See §10 |
| 2 | Final game title? | Working title: *Tycoon Master 3000* |
| 3 | Single-player only, or leaderboards/co-op later? | Leaderboards are cheap to add later |
| 4 | Monetization? | Premium, free, or none. If any, cosmetics only, no pay-to-win |
| 5 | First person, third person, or isometric camera in the outer world? | Proposal: third person with free camera |
| 6 | How playable are the mini-tycoons? | See §4 |
| 7 | Number of prestige layers? | See §7 |
| 8 | Art pipeline: custom models, asset packs, or procedural? | Affects the "realistic-like" goal a lot |
| 9 | License for the code? | Repo owner's choice |
