import type { CosmeticDef } from '@/sim/types';

export const COSMETICS: CosmeticDef[] = [
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
];

export const cosmeticById = (id: string): CosmeticDef | undefined => COSMETICS.find((c) => c.id === id);
