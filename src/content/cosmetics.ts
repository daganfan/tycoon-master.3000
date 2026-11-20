import type { CosmeticDef } from '@/sim/types';

/**
 * Runtime visual effects implemented in world/cosmeticFx.ts (on top of the
 * plain colour/material/physics patch every cosmetic already gets).
 */
export interface CosmeticFxSpec {
  /** Pulsing emissive glow in this colour. */
  pulse?: string;
  /** See-through glassy materials. */
  glass?: boolean;
  /** Hue cycle speed (cycles per second). */
  rainbow?: number;
  /** Flat-shaded, low-res look. */
  pixel?: boolean;
  /** Random hops and spins. */
  haunted?: boolean;
  /** Pulls loose coins towards the object (strength). */
  magnet?: number;
  /** Squeak on impact (pitch). */
  squeak?: number;
}

export type CosmeticDefX = CosmeticDef & { fx?: CosmeticFxSpec };


export const COSMETICS: CosmeticDefX[] = [
  // Skins
  { id: 'skin_retro_beige', name: 'Retro Beige', desc: 'The PC your uncle had in 1997.', kind: 'skin', targets: ['pc'], rarity: 'common',
    cost: { grind: 3 }, visual: { color: '#d8cfb4', roughness: 0.7 } },
  { id: 'skin_neon_hacker', name: 'Neon Hacker', desc: 'Hoodie with LEDs. Very mysterious.', kind: 'skin', targets: ['avatar'], rarity: 'rare',
    cost: { grind: 5, chaos: 2 }, visual: { color: '#1a1a24', emissive: '#29f0ff' } },
  { id: 'skin_gold_rush', name: 'Gold Rush', desc: 'Coins so shiny they hum.', kind: 'skin', targets: ['coins'], rarity: 'rare',
    cost: { chaos: 4 }, visual: { color: '#ffd24a', metalness: 1, roughness: 0.15 } },
  { id: 'skin_walnut', name: 'Walnut Desk', desc: 'Real fake wood.', kind: 'skin', targets: ['desk'], rarity: 'common',
    cost: { grind: 2 }, visual: { color: '#6b4226', roughness: 0.55 } },
  { id: 'skin_vaporwave', name: 'Vaporwave OS', desc: 'A E S T H E T I C screen theme.', kind: 'skin', targets: ['screen'], rarity: 'epic',
    cost: { grind: 6, mogul: 2 }, visual: { theme: 'vaporwave' } },
  // Modifiers
  { id: 'mod_bouncy', name: 'Bouncy', desc: 'Bounces everywhere.', kind: 'modifier', targets: ['props', 'coins', 'avatar'], rarity: 'rare',
    cost: { chaos: 3 }, visual: {}, physics: { restitution: 0.95, friction: 0.3 } },
  { id: 'mod_jelly', name: 'Jelly', desc: 'Wobbles and squishes on impact.', kind: 'modifier', targets: ['props', 'pc', 'desk', 'avatar'], rarity: 'epic',
    cost: { chaos: 5 }, visual: { wobble: 1, roughness: 0.2 }, physics: { restitution: 0.6, mass: 0.7 } },
  { id: 'mod_gold', name: 'Gold-Plated', desc: 'Shiny gold. +2% exchange rate per equipped slot.', kind: 'modifier',
    targets: ['props', 'pc', 'desk', 'coins', 'avatar'], rarity: 'legendary', cost: { chaos: 6, mogul: 2 },
    visual: { color: '#e8b730', metalness: 1, roughness: 0.2 }, physics: { mass: 1.6 }, mods: [{ stat: 'exchange.rate', op: 'mult', value: 1.02 }] },
  // More skins
  { id: 'skin_carbon', name: 'Carbon Fibre Rig', desc: 'Weighs nothing. Costs everything.', kind: 'skin', targets: ['pc'], rarity: 'rare',
    cost: { grind: 5 }, visual: { color: '#26272b', roughness: 0.3, metalness: 0.4 } },
  { id: 'skin_bubblegum', name: 'Bubblegum Fit', desc: 'Pink. Proudly pink.', kind: 'skin', targets: ['avatar'], rarity: 'common',
    cost: { grind: 3 }, visual: { color: '#ff8fc7', roughness: 0.5 } },
  { id: 'skin_camo', name: 'Bedroom Camo', desc: 'Blends in perfectly with the laundry pile.', kind: 'skin', targets: ['avatar'], rarity: 'rare',
    cost: { grind: 4, chaos: 1 }, visual: { color: '#5b6b3a', roughness: 0.9 } },
  { id: 'skin_marble_desk', name: 'Marble Slab', desc: 'A desk fit for an emperor of spreadsheets.', kind: 'skin', targets: ['desk'], rarity: 'epic',
    cost: { grind: 6, mogul: 2 }, visual: { color: '#ece9e2', roughness: 0.18 } },
  { id: 'skin_cyber_desk', name: 'Cyber Desk', desc: 'Underglow sold separately. Just kidding, it is included.', kind: 'skin', targets: ['desk', 'props'], rarity: 'rare',
    cost: { grind: 4, chaos: 1 }, visual: { color: '#1b1f2a', emissive: '#ff2bd6', roughness: 0.3 } },
  { id: 'skin_diamond_coins', name: 'Diamond Coins', desc: 'Every coin is a tiny glittering flex.', kind: 'skin', targets: ['coins'], rarity: 'epic',
    cost: { mogul: 3, chaos: 2 }, visual: { color: '#bfefff', metalness: 0.2, roughness: 0.02 }, fx: { glass: true } },
  { id: 'skin_pixel_coins', name: 'Pixel Coins', desc: 'Retro coins with chunky 8-bit edges.', kind: 'skin', targets: ['coins'], rarity: 'rare',
    cost: { grind: 4 }, visual: { color: '#ffd84a', roughness: 0.9, metalness: 0 }, fx: { pixel: true } },
  { id: 'skin_toxic', name: 'Toxic Slime', desc: 'Everything looks radioactive. Do not lick.', kind: 'skin', targets: ['props', 'pc'], rarity: 'rare',
    cost: { chaos: 2, grind: 2 }, visual: { color: '#7dff3a', emissive: '#2a8a00', roughness: 0.3 } },
  { id: 'skin_terminal', name: 'Green Terminal', desc: 'Green on black. Very hacker. Much secure.', kind: 'skin', targets: ['screen'], rarity: 'rare',
    cost: { grind: 4 }, visual: { theme: 'terminal' } },
  { id: 'skin_candy_os', name: 'Candy OS', desc: 'Pastel windows that smell faintly of strawberries.', kind: 'skin', targets: ['screen'], rarity: 'common',
    cost: { grind: 3 }, visual: { theme: 'candy' } },
  { id: 'skin_midnight', name: 'Midnight Mode', desc: 'Dark mode for people who never sleep.', kind: 'skin', targets: ['screen'], rarity: 'rare',
    cost: { grind: 4, mogul: 1 }, visual: { theme: 'midnight' } },
  { id: 'skin_paper_os', name: 'Paper Prototype', desc: 'Your OS, sketched in pencil on graph paper.', kind: 'skin', targets: ['screen'], rarity: 'epic',
    cost: { grind: 5, mogul: 2 }, visual: { theme: 'paper' } },
  { id: 'skin_gold_os', name: 'Gold Card OS', desc: 'Black and gold. Smells like a private lounge.', kind: 'skin', targets: ['screen'], rarity: 'legendary',
    cost: { mogul: 5, grind: 4 }, visual: { theme: 'gold' } },
  { id: 'skin_glitch_os', name: 'ERR0R.OS', desc: 'Something went wrong. It looks great though.', kind: 'skin', targets: ['screen'], rarity: 'glitched',
    cost: { chaos: 6, mogul: 3 }, visual: { theme: 'glitch' } },
  { id: 'skin_missing_tex', name: 'Missing Texture', desc: 'You forgot to load. Magenta forever.', kind: 'skin', targets: ['avatar', 'props'], rarity: 'glitched',
    cost: { chaos: 7, grind: 3 }, visual: { color: '#ff00ff', emissive: '#550055', roughness: 1 }, fx: { pixel: true } },
  // More modifiers (effects live in world/cosmeticFx.ts)
  { id: 'mod_heavy_metal', name: 'Heavy Metal', desc: 'Chrome-plated and four times heavier. Clank.', kind: 'modifier', targets: ['props', 'pc', 'desk', 'coins', 'avatar'], rarity: 'epic',
    cost: { chaos: 4, mogul: 1 }, visual: { color: '#cfd3d8', metalness: 1, roughness: 0.12 }, physics: { mass: 4, gravityScale: 1.4, restitution: 0.05 } },
  { id: 'mod_lowgrav', name: 'Low-Grav', desc: 'Gravity is more of a suggestion now.', kind: 'modifier', targets: ['props', 'pc', 'coins', 'avatar'], rarity: 'rare',
    cost: { chaos: 3 }, visual: {}, physics: { gravityScale: 0.25 } },
  { id: 'mod_neon', name: 'Neon', desc: 'Pulsing cyan glow. Visible from space (the hallway).', kind: 'modifier', targets: ['props', 'pc', 'desk', 'coins', 'avatar'], rarity: 'rare',
    cost: { grind: 3, chaos: 2 }, visual: {}, fx: { pulse: '#29f0ff' } },
  { id: 'mod_glass', name: 'Glass', desc: 'See-through and fragile-looking. It is not fragile.', kind: 'modifier', targets: ['props', 'pc', 'desk', 'coins'], rarity: 'epic',
    cost: { chaos: 4, grind: 2 }, visual: { roughness: 0.05, metalness: 0 }, fx: { glass: true } },
  { id: 'mod_rainbow', name: 'Rainbow', desc: 'Cycles through every colour. Forever.', kind: 'modifier', targets: ['props', 'pc', 'desk', 'coins', 'avatar'], rarity: 'epic',
    cost: { chaos: 5 }, visual: {}, fx: { rainbow: 0.15 } },
  { id: 'mod_giant', name: 'Giant', desc: 'Everything is 60% bigger, colliders and all.', kind: 'modifier', targets: ['props'], rarity: 'legendary',
    cost: { chaos: 6, mogul: 2 }, visual: {}, physics: { scale: 1.6 } },
  { id: 'mod_tiny', name: 'Tiny', desc: 'Pocket-sized everything. Adorable chaos.', kind: 'modifier', targets: ['props'], rarity: 'epic',
    cost: { chaos: 4 }, visual: {}, physics: { scale: 0.55 } },
  { id: 'mod_haunted', name: 'Haunted', desc: 'Things hop and spin when nobody is looking.', kind: 'modifier', targets: ['props', 'pc', 'avatar'], rarity: 'epic',
    cost: { chaos: 5 }, visual: { emissive: '#1a3a2a' }, fx: { haunted: true } },
  { id: 'mod_pixelated', name: 'Pixelated', desc: 'Flat-shaded, low-poly, totally retro.', kind: 'modifier', targets: ['props', 'pc', 'desk', 'coins', 'avatar'], rarity: 'rare',
    cost: { grind: 4 }, visual: { roughness: 1 }, fx: { pixel: true } },
  { id: 'mod_magnetic', name: 'Magnetic', desc: 'Loose coins are pulled towards it.', kind: 'modifier', targets: ['props', 'pc', 'desk', 'avatar'], rarity: 'legendary',
    cost: { chaos: 4, mogul: 3 }, visual: { metalness: 0.8, roughness: 0.3 }, fx: { magnet: 4 } },
  { id: 'mod_squeaky', name: 'Squeaky', desc: 'Squeaks on every impact. Every. Single. One.', kind: 'modifier', targets: ['props', 'pc', 'desk', 'avatar'], rarity: 'common',
    cost: { chaos: 2 }, visual: {}, physics: { restitution: 0.5 }, fx: { squeak: 1 } },
  { id: 'mod_glitched', name: 'Glitched', desc: 'Reality.exe has stopped responding.', kind: 'modifier', targets: ['props', 'pc', 'avatar'], rarity: 'glitched',
    cost: { chaos: 8, mogul: 3 }, visual: { emissive: '#00ffaa' }, fx: { rainbow: 1.3, haunted: true, pixel: true } },
];

export const cosmeticById = (id: string): CosmeticDefX | undefined => COSMETICS.find((c) => c.id === id);
