import type { ItemDef } from '@/sim/types';

/** Bedroom shop ("eBuy"). Stat modifiers are per unit owned. */
export const ITEMS: ItemDef[] = [
  { id: 'used_monitor', name: 'Second-hand Monitor', desc: '+12% game speed. Slightly cracked.', icon: '🖥️', category: 'hardware',
    baseCost: 40, growth: 2.4, max: 3, mods: [{ stat: 'tycoon.speed', op: 'mult', value: 1.12 }], prop: 'monitor', phase: 'bedroom' },
  { id: 'mech_keyboard', name: 'Clacky Keyboard', desc: '+1 click power. Wakes the neighbours.', icon: '⌨️', category: 'hardware',
    baseCost: 75, growth: 3, max: 3, mods: [{ stat: 'click.power', op: 'add', value: 1 }], prop: 'keyboard', phase: 'bedroom' },
  { id: 'refurb_pc', name: 'Refurbished PC', desc: '+1 game slot (run another game at once).', icon: '💻', category: 'hardware',
    baseCost: 350, growth: 6, max: 3, mods: [{ stat: 'slots', op: 'add', value: 1 }], prop: 'pc', phase: 'bedroom' },
  { id: 'desk_fan', name: 'Wobbly Desk Fan', desc: 'Cooling: +6% game speed.', icon: '🌀', category: 'utility',
    baseCost: 160, growth: 2.6, max: 3, mods: [{ stat: 'tycoon.speed', op: 'mult', value: 1.06 }], prop: 'fan', phase: 'bedroom' },
  { id: 'os_xp', name: 'TycoonOS XP License', desc: 'Glossy UI, 2 windows at once, +10% exchange rate.', icon: '🪟', category: 'utility',
    baseCost: 2500, growth: 1, max: 1, mods: [{ stat: 'os.tier', op: 'add', value: 1 }, { stat: 'exchange.rate', op: 'mult', value: 1.1 }], phase: 'bedroom' },
  { id: 'lava_lamp', name: 'Lava Lamp', desc: 'Vibe +1 (+3% exchange rate).', icon: '🪔', category: 'decor',
    baseCost: 60, growth: 2.2, max: 4, mods: [{ stat: 'vibe', op: 'add', value: 1 }], prop: 'lamp', phase: 'bedroom' },
  { id: 'poster', name: 'Motivational Poster', desc: 'Vibe +1. "HUSTLE" in comic sans.', icon: '🖼️', category: 'decor',
    baseCost: 90, growth: 2.2, max: 4, mods: [{ stat: 'vibe', op: 'add', value: 1 }], prop: 'poster', phase: 'bedroom' },
  { id: 'plant', name: 'Plastic Plant', desc: 'Vibe +2. Impossible to kill.', icon: '🪴', category: 'decor',
    baseCost: 400, growth: 2.5, max: 3, mods: [{ stat: 'vibe', op: 'add', value: 2 }], prop: 'plant', phase: 'bedroom' },
  { id: 'beanbag', name: 'Beanbag Chair', desc: 'Grind Tokens need 10% fewer actions.', icon: '🫘', category: 'furniture',
    baseCost: 220, growth: 3, max: 2, mods: [{ stat: 'grind.threshold', op: 'mult', value: 0.9 }], prop: 'beanbag', phase: 'bedroom' },
  { id: 'cardboard_boxes', name: 'Stack of Boxes', desc: 'Free physics props. Perfect for towers.', icon: '📦', category: 'furniture',
    baseCost: 25, growth: 1.6, max: 6, mods: [], prop: 'box', phase: 'bedroom' },
  { id: 'coin_magnet', name: 'Fridge Magnet (Large)', desc: '+1 m coin pickup radius.', icon: '🧲', category: 'utility',
    baseCost: 130, growth: 2.8, max: 4, mods: [{ stat: 'magnet.radius', op: 'add', value: 1 }], phase: 'bedroom' },
  { id: 'piggy_bank', name: 'Piggy Bank', desc: 'Doubles offline earnings time cap.', icon: '🐷', category: 'utility',
    baseCost: 1200, growth: 1, max: 1, mods: [{ stat: 'offline.cap', op: 'mult', value: 2 }], prop: 'piggy', phase: 'bedroom' },
  { id: 'garage_key', name: 'Garage Key', desc: 'Unlocks the Garage. (Phase 2 coming soon!)', icon: '🔑', category: 'key',
    baseCost: 1200000, growth: 1, max: 1, mods: [], phase: 'bedroom' },
];

export const itemById = (id: string): ItemDef | undefined => ITEMS.find((i) => i.id === id);
