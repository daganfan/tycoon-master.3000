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

**Target: 30 mini-tycoons** spread across the phases, so a full playthrough lasts **~20 hours**. All are original concepts (working names). Each one takes roughly 20–60 minutes to master, and later ones are unlocked by earlier milestones.

| # | Mini-Tycoon | Phase | Twist |
|---|---|---|---|
| 1 | **Lemon Mogul** | Bedroom | Tutorial. Pricing vs. weather. |
| 2 | **Rubber Duck Works** | Bedroom | Assembly line; ducks are physics objects that jam the belts. |
| 3 | **Sock Syndicate** | Bedroom | Matching pairs; unmatched socks are a "loss" resource. |
| 4 | **Couch Coin Mining** | Bedroom | Dig through couch cushions; deeper layers hold rarer finds. |
| 5 | **Hot Dog Highway** | Garage | Placing carts on a traffic map. |
| 6 | **Robo Car Wash** | Garage | Queue/throughput puzzle; robots occasionally rebel. |
| 7 | **Bee & Breakfast** | Garage | Bee hotel; happy bees make honey, angry bees make lawsuits. |
| 8 | **Garden Gnome Empire** | Garage | Breed gnome variants; rare gnomes sell to collectors. |
| 9 | **Yard Sale Kingpin** | Garage | Haggling; buy junk low, flip it high. |
| 10 | **Cloud Farm** | LAN Café | Harvest weather; sell rain to other games (cross-game economy). |
| 11 | **Haunted Hotel Inc.** | LAN Café | Fear = revenue, too much fear = lawsuits. |
| 12 | **Pizza Tower Defense** | LAN Café | Defend a pizzeria from hungry crowds by feeding them. |
| 13 | **Spaghetti Logistics** | LAN Café | Route noodles through a pipe network. |
| 14 | **Penguin Ice Cream Co.** | LAN Café | Keep the freezer cold; penguins work faster when it's colder. |
| 15 | **Dino Daycare** | LAN Café | Raise baby dinos; they grow and outgrow their pens. |
| 16 | **Meme Stock Exchange** | Indie Studio | Volatile market; buy hype, sell before it crashes. |
| 17 | **Space Pizza Express** | Indie Studio | Delivery routing across planets with travel time. |
| 18 | **Wizard School Admin** | Indie Studio | Students explode cauldrons; tuition vs. insurance. |
| 19 | **Moon Real Estate** | Indie Studio | Low-gravity buildings that drift if not anchored. |
| 20 | **Influencer Farm** | Indie Studio | Grow followers; trends decay over time. |
| 21 | **Time Travel Tours** | Indie Studio | Tourists change history; paradoxes reset routes. |
| 22 | **Volcano Spa Resort** | Tycoon Tower | Heat management; eruptions are both a hazard and a tourist draw. |
| 23 | **Kaiju Insurance** | Tycoon Tower | Sell policies; giant monsters arrive on a schedule you can predict. |
| 24 | **Submarine Sushi** | Tycoon Tower | Deep-sea fishing depth vs. pressure. |
| 25 | **Cat Café Galaxy** | Tycoon Tower | Cats choose their own tables; you design for chaos. |
| 26 | **Robot Uprising HR** | Tycoon Tower | Keep robot workers happy enough not to revolt. |
| 27 | **Black Hole Recycling** | Tycoon Tower | Feed trash to a black hole; it grows and pulls on everything. |
| 28 | **Parallel Universe Outlet** | Tycoon Tower | Buy goods from alternate universes; some are cursed. |
| 29 | **Tycoon Tycoon** | Tycoon Tower | A mini-tycoon about running a tycoon studio (recursion foreshadowing). |
| 30 | **Tycoon Master 3000** | The Recursion | The game itself, playable on an in-world screen. |

**Pacing target:** Bedroom ~1.5h, Garage ~3h, LAN Café ~4h, Indie Studio ~4.5h, Tycoon Tower ~5h, The Recursion ~2h. Total ~20h for a first full playthrough. Prestige and completionism extend it.

### 4.1 TycoonOS: Dynamic Screen Interfaces

Every in-world screen runs **TycoonOS**, a fake operating system with its own dynamic interface. Mini-tycoons are apps that run inside it.

- **Boot screen** → **lock screen** → **home screen/desktop** with app icons, a taskbar, a clock and notifications ("Payout ready!", "Monitor fell over").
- **Built-in apps:**
  - **Settings:** wallpaper, theme, brightness, physics comfort, volume.
  - **eBuy:** the in-world shop.
  - **Wallet:** Cash and tokens.
  - **Skill Tree:** also reachable from the HUD.
  - **App Store:** unlock and install new mini-tycoons.
  - **Mail:** story and quest hooks, including Mom's notes.
  - **Task Manager:** shows which games are running and what they earn.
- **OS versions scale with hardware:** TycoonOS 95 (chunky gray), then XP-ish (glossy), then Vista Pro (glass), then TycoonOS 3000 (holographic). Better hardware means a nicer and faster UI and more simultaneous app windows.
- **Windowed multitasking:** higher OS versions run several apps side by side on one screen.
- **Themes and wallpapers** are cosmetics that tie into the skin system.
- **Glitches:** overheating or power issues cause screen tearing, blue screens and fake viruses (comedy + light management).

**Shared systems:** each mini-tycoon has its own level, a prestige track and milestones. Milestones award **Tokens** (see §6).

**Decided:** hands-on early (1–2 active verbs each), automatable later through bots and skills.

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

**Decided:** this stack, with Svelte for the UI.

### MVP (first playable)

- Phase 1 (Bedroom) only
- 4 mini-tycoons (Bedroom set) running inside TycoonOS
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
| 1 | Final tech stack? | **Decided:** TS + Three.js + Rapier + Vite + Svelte |
| 2 | Final game title? | **Decided:** *Tycoon Master 3000* |
| 3 | Single-player only, or leaderboards/co-op later? | Leaderboards are cheap to add later |
| 4 | Monetization? | **Decided:** none |
| 5 | Camera? | **Decided:** third-person orbit + focus mode on screens |
| 6 | How playable are the mini-tycoons? | **Decided:** hands-on early, automatable later |
| 7 | Number of prestige layers? | See §7 |
| 8 | Art pipeline? | **Decided:** CC0 asset packs + procedural |
| 9 | License? | **Decided:** none needed |
