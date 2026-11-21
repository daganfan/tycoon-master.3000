import type { SkillNodeDef } from '@/sim/types';

/** Place a node on a branch ray: angle in degrees, ring = distance step, side = lateral offset. */
function at(angle: number, ring: number, side = 0): { x: number; y: number } {
  const a = (angle * Math.PI) / 180;
  const r = ring * 110;
  return { x: Math.round(Math.cos(a) * r - Math.sin(a) * side * 95), y: Math.round(Math.sin(a) * r + Math.cos(a) * side * 95) };
}

const H = -90; // hustle up
const B = 0; // business right
const C = 180; // chaos left
const S = -135; // style up-left (between hustle and chaos)
const A = -45; // automation up-right (between hustle and business)
const HW = 45; // hardware down-right (between business and the bottom)
const L = 135; // legacy down-left (hidden until later phases)

export const SKILL_NODES: SkillNodeDef[] = [
  { id: 'root', name: 'Broke Gamer', desc: 'Where it all begins.', branch: 'root', pos: { x: 0, y: 0 }, cost: {}, requires: [], effects: [] },

  // Hustle (Grind)
  { id: 'h1', name: 'Sweaty Palms', desc: '+1 click power', branch: 'hustle', pos: at(H, 1), cost: { grind: 1 }, requires: ['root'], effects: [{ stat: 'click.power', op: 'add', value: 1 }] },
  { id: 'h2', name: 'Speedrunner', desc: 'Grind Tokens need 20% fewer actions', branch: 'hustle', pos: at(H, 2), cost: { grind: 2 }, requires: ['h1'], effects: [{ stat: 'grind.threshold', op: 'mult', value: 0.8 }] },
  { id: 'h3', name: 'Combo Fingers', desc: 'x1.25 click power', branch: 'hustle', pos: at(H, 3), cost: { grind: 4 }, requires: ['h2'], effects: [{ stat: 'click.power', op: 'mult', value: 1.25 }] },
  { id: 'h4', name: 'Caffeine IV', desc: '+10% game speed', branch: 'hustle', pos: at(H, 4, -0.6), cost: { grind: 6 }, requires: ['h3'], effects: [{ stat: 'tycoon.speed', op: 'mult', value: 1.1 }] },
  { id: 'h6', name: 'Carpal Tunnel Insurance', desc: '+2 click power', branch: 'hustle', pos: at(H, 4, 0.6), cost: { grind: 8 }, requires: ['h3'], effects: [{ stat: 'click.power', op: 'add', value: 2 }] },
  { id: 'h7', name: 'Knuckle Crack', desc: '+1 click power', branch: 'hustle', pos: at(H, 2.5, -0.5), cost: { grind: 3 }, requires: ['h2'], effects: [{ stat: 'click.power', op: 'add', value: 1 }] },
  { id: 'h8', name: 'Lucky Clicks', desc: '10% chance a manual main-button press counts twice', branch: 'hustle', pos: at(H, 3.4, 1), cost: { grind: 5 }, requires: ['h3'], effects: [{ stat: 'crit.chance', op: 'add', value: 0.1 }] },
  { id: 'h9', name: 'Grindset', desc: 'Grind Tokens need 15% fewer actions', branch: 'hustle', pos: at(H, 5, 0.9), cost: { grind: 10 }, requires: ['h6'], effects: [{ stat: 'grind.threshold', op: 'mult', value: 0.85 }] },
  { id: 'h11', name: 'Crit Machine', desc: 'Lucky clicks count 3x instead of 2x, +5% chance', branch: 'hustle', pos: at(H, 4.4, 1.5), cost: { grind: 9 }, requires: ['h8'], effects: [{ stat: 'crit.mult', op: 'add', value: 1 }, { stat: 'crit.chance', op: 'add', value: 0.05 }] },
  { id: 'h10', name: 'Iron Wrists', desc: 'x1.3 click power', branch: 'hustle', pos: at(H, 6), cost: { grind: 14 }, requires: ['h5', 'h9'], effects: [{ stat: 'click.power', op: 'mult', value: 1.3 }] },
  { id: 'h12', name: 'Jam Tourism', desc: 'KEYSTONE: jammed duck belts keep paying out (half speed) while tourists watch', branch: 'hustle', pos: at(H, 7, -0.6), cost: { grind: 16 }, requires: ['h10'], effects: [{ flag: 'ducks.jamPay' }], keystone: true, hidden: true },
  { id: 'h5', name: 'Autoclicker Dreams', desc: 'KEYSTONE: the focused game presses its main button 3x/s for you', branch: 'hustle', pos: at(H, 5), cost: { grind: 12 }, requires: ['h4', 'h6'], effects: [{ flag: 'autoclick' }], keystone: true, hidden: true },

  // Business (Mogul)
  { id: 'b1', name: 'Spreadsheet Brain', desc: 'x1.25 exchange rate', branch: 'business', pos: at(B, 1), cost: { mogul: 1 }, requires: ['root'], effects: [{ stat: 'exchange.rate', op: 'mult', value: 1.25 }] },
  { id: 'b2', name: 'Extra Tab', desc: '+1 background slot: a minimized game keeps running', branch: 'business', pos: at(B, 2, -0.6), cost: { mogul: 2 }, requires: ['b1'], effects: [{ stat: 'slots', op: 'add', value: 1 }] },
  { id: 'b3', name: 'Haggler', desc: 'Shop prices -10%', branch: 'business', pos: at(B, 2, 0.6), cost: { mogul: 3 }, requires: ['b1'], effects: [{ stat: 'shop.discount', op: 'mult', value: 0.9 }] },
  { id: 'b4', name: 'Compound Interest', desc: '+25% offline earnings', branch: 'business', pos: at(B, 3, -0.6), cost: { mogul: 4 }, requires: ['b2'], effects: [{ stat: 'offline.rate', op: 'add', value: 0.25 }] },
  { id: 'b5', name: 'Night Shift', desc: 'x2 offline time cap', branch: 'business', pos: at(B, 4, -0.6), cost: { mogul: 5 }, requires: ['b4'], effects: [{ stat: 'offline.cap', op: 'mult', value: 2 }] },
  { id: 'b6', name: 'Auto Cash-Out', desc: 'KEYSTONE: games cash out by themselves every 10s', branch: 'business', pos: at(B, 3), cost: { mogul: 6 }, requires: ['b2', 'b3'], effects: [{ flag: 'autoCashout' }], keystone: true, hidden: true },
  { id: 'b8', name: 'Tax Loophole', desc: 'x1.15 exchange rate', branch: 'business', pos: at(B, 4, 0.6), cost: { mogul: 9 }, requires: ['b7'], effects: [{ stat: 'exchange.rate', op: 'mult', value: 1.15 }] },
  { id: 'b9', name: 'Franchise', desc: '+10% game speed', branch: 'business', pos: at(B, 5, -0.6), cost: { mogul: 8 }, requires: ['b5'], effects: [{ stat: 'tycoon.speed', op: 'mult', value: 1.1 }] },
  { id: 'b10', name: 'Venture Capital', desc: 'Shop prices -10%', branch: 'business', pos: at(B, 5, 0.6), cost: { mogul: 10 }, requires: ['b8'], effects: [{ stat: 'shop.discount', op: 'mult', value: 0.9 }] },
  { id: 'b11', name: 'Lucky Tenth', desc: 'KEYSTONE: every 10th cash-out is doubled', branch: 'business', pos: at(B, 6), cost: { mogul: 12 }, requires: ['b9', 'b10'], effects: [{ flag: 'cashout.tenth' }], keystone: true, hidden: true },
  { id: 'b12', name: 'Dividends', desc: '+25% offline earnings', branch: 'business', pos: at(B, 7, -0.6), cost: { mogul: 12 }, requires: ['b11'], effects: [{ stat: 'offline.rate', op: 'add', value: 0.25 }] },
  { id: 'b13', name: 'Golden Parachute', desc: '+10% value of picked-up cash', branch: 'business', pos: at(B, 7, 0.6), cost: { mogul: 14 }, requires: ['b11'], effects: [{ stat: 'pickup.mult', op: 'mult', value: 1.1 }] },
  { id: 'b7', name: 'Market Maker', desc: 'x1.3 exchange rate', branch: 'business', pos: at(B, 3, 0.6), cost: { mogul: 8 }, requires: ['b3'], effects: [{ stat: 'exchange.rate', op: 'mult', value: 1.3 }] },

  // Chaos Physics (Chaos)
  { id: 'c1', name: 'Butterfingers', desc: '+0.75 m coin pickup radius', branch: 'chaos', pos: at(C, 1), cost: { chaos: 1 }, requires: ['root'], effects: [{ stat: 'magnet.radius', op: 'add', value: 0.75 }] },
  { id: 'c2', name: 'Clumsy Genius', desc: '+50% Chaos Meter points', branch: 'chaos', pos: at(C, 2, 0.6), cost: { chaos: 2 }, requires: ['c1'], effects: [{ stat: 'chaos.mult', op: 'add', value: 0.5 }] },
  { id: 'c3', name: 'Bouncy Bucks', desc: 'Coins bounce higher', branch: 'chaos', pos: at(C, 2, -0.6), cost: { chaos: 2 }, requires: ['c1'], effects: [{ stat: 'coin.bounce', op: 'add', value: 0.35 }] },
  { id: 'c4', name: 'Coin Gravity', desc: 'KEYSTONE: coins roll toward you', branch: 'chaos', pos: at(C, 3, -0.6), cost: { chaos: 5 }, requires: ['c3'], effects: [{ flag: 'coins.seekPlayer' }], keystone: true, hidden: true },
  { id: 'c5', name: 'Avalanche Fund', desc: '+10% value of picked-up cash', branch: 'chaos', pos: at(C, 3, 0.6), cost: { chaos: 4 }, requires: ['c2'], effects: [{ stat: 'pickup.mult', op: 'mult', value: 1.1 }] },
  { id: 'c6', name: 'Insurance Fraud', desc: 'Mayhem cooldowns -40%', branch: 'chaos', pos: at(C, 4, 0.6), cost: { chaos: 6 }, requires: ['c5'], effects: [{ stat: 'chaos.cooldown', op: 'mult', value: 0.6 }] },
  { id: 'c7', name: 'Domino Theory', desc: 'Knocking things over: x1.5 meter points', branch: 'chaos', pos: at(C, 4, -0.6), cost: { chaos: 5 }, requires: ['c4'], effects: [{ stat: 'chaos.topple', op: 'mult', value: 1.5 }] },
  { id: 'c8', name: 'Short Attention Span', desc: '"Did that already" fatigue wears off 50% faster', branch: 'chaos', pos: at(C, 5, 0.6), cost: { chaos: 7 }, requires: ['c6'], effects: [{ stat: 'chaos.decay', op: 'mult', value: 1.5 }] },
  { id: 'c9', name: 'Crash Test Dummy', desc: 'Real falls: x2 meter points', branch: 'chaos', pos: at(C, 5, -0.6), cost: { chaos: 6 }, requires: ['c7'], effects: [{ stat: 'chaos.ragdoll', op: 'mult', value: 2 }] },
  { id: 'c10', name: 'Shatterproof Wallet', desc: 'KEYSTONE: coins split when they hit the floor (+25% Cash per cash-out)', branch: 'chaos', pos: at(C, 6), cost: { chaos: 9 }, requires: ['c8', 'c9'], effects: [{ flag: 'coins.split' }], keystone: true, hidden: true },
  { id: 'c11', name: 'Seismic Stomp', desc: 'x1.25 Chaos Meter points', branch: 'chaos', pos: at(C, 7, 0.6), cost: { chaos: 10 }, requires: ['c10'], effects: [{ stat: 'chaos.mult', op: 'mult', value: 1.25 }] },
  { id: 'c12', name: 'Smaller Meter', desc: 'Chaos Tokens need 15% fewer points', branch: 'chaos', pos: at(C, 7, -0.6), cost: { chaos: 12 }, requires: ['c10'], effects: [{ stat: 'chaos.need', op: 'mult', value: 0.85 }] },

  // Style (Chaos + Grind)
  { id: 's1', name: 'Fashion Sense', desc: '+1 modifier slot per object', branch: 'style', pos: at(S, 1.6), cost: { chaos: 2, grind: 2 }, requires: ['h1', 'c1'], effects: [{ stat: 'cosmetic.slots', op: 'add', value: 1 }] },
  { id: 's2', name: 'Drip', desc: 'Cosmetics cost 20% fewer tokens', branch: 'style', pos: at(S, 2.6), cost: { chaos: 3, grind: 3 }, requires: ['s1'], effects: [{ stat: 'cosmetic.discount', op: 'mult', value: 0.8 }] },
  { id: 's3', name: 'Stacked Fits', desc: '+1 modifier slot per object', branch: 'style', pos: at(S, 3.6), cost: { chaos: 5, grind: 5 }, requires: ['s2'], effects: [{ stat: 'cosmetic.slots', op: 'add', value: 1 }] },
  { id: 's5', name: 'Color Theory', desc: 'Vibe +1', branch: 'style', pos: at(S, 2.6, 0.8), cost: { chaos: 2, grind: 2 }, requires: ['s1'], effects: [{ stat: 'vibe', op: 'add', value: 1 }] },
  { id: 's6', name: 'Trendsetter', desc: 'Cosmetics cost 15% fewer tokens', branch: 'style', pos: at(S, 3.6, -0.8), cost: { chaos: 4, grind: 4 }, requires: ['s2'], effects: [{ stat: 'cosmetic.discount', op: 'mult', value: 0.85 }] },
  { id: 's7', name: 'Feng Shui', desc: 'Vibe +2', branch: 'style', pos: at(S, 3.6, 0.8), cost: { chaos: 4, grind: 4 }, requires: ['s5'], effects: [{ stat: 'vibe', op: 'add', value: 2 }] },
  { id: 's8', name: 'Influencer', desc: 'x1.05 exchange rate', branch: 'style', pos: at(S, 4.6), cost: { chaos: 6, grind: 6 }, requires: ['s3', 's7'], effects: [{ stat: 'exchange.rate', op: 'mult', value: 1.05 }] },
  { id: 's9', name: 'Runway Ready', desc: '+1 modifier slot per object', branch: 'style', pos: at(S, 5.6), cost: { chaos: 8, grind: 8 }, requires: ['s8'], effects: [{ stat: 'cosmetic.slots', op: 'add', value: 1 }] },
  { id: 's4', name: 'Gold Standard', desc: 'x1.1 exchange rate', branch: 'style', pos: at(90, 1.4), cost: { chaos: 3, mogul: 3 }, requires: ['b1', 'c1'], effects: [{ stat: 'exchange.rate', op: 'mult', value: 1.1 }] },

  // Automation (Mogul + Grind)
  { id: 'a1', name: 'Intern Bot', desc: 'Jammed belts unjam themselves after 5s', branch: 'automation', pos: at(A, 1.6), cost: { mogul: 2, grind: 3 }, requires: ['h1', 'b1'], effects: [{ flag: 'autoUnjam' }] },
  { id: 'a2', name: 'Bot Union', desc: '+15% game speed', branch: 'automation', pos: at(A, 2.6), cost: { mogul: 4, grind: 4 }, requires: ['a1'], effects: [{ stat: 'tycoon.speed', op: 'mult', value: 1.15 }] },
  { id: 'a3', name: 'Macro Recorder', desc: 'KEYSTONE: every running game presses its main button once per second', branch: 'automation', pos: at(A, 3.6), cost: { mogul: 6, grind: 6 }, requires: ['a2'], effects: [{ flag: 'macro' }], keystone: true, hidden: true },
  { id: 'a4', name: 'Conveyor Coffee', desc: '+10% game speed', branch: 'automation', pos: at(A, 2.6, -0.8), cost: { mogul: 3, grind: 3 }, requires: ['a1'], effects: [{ stat: 'tycoon.speed', op: 'mult', value: 1.1 }] },
  { id: 'a5', name: 'Sock Bots', desc: 'KEYSTONE: bots auto-match socks (works without hamsters) and auto-sell piles of lost socks', branch: 'automation', pos: at(A, 3.6, -0.8), cost: { mogul: 5, grind: 5 }, requires: ['a4'], effects: [{ flag: 'socks.autoMatch' }], keystone: true, hidden: true },
  { id: 'a6', name: 'Night Bot', desc: '+15% offline earnings', branch: 'automation', pos: at(A, 2.6, 0.8), cost: { mogul: 3, grind: 3 }, requires: ['a1'], effects: [{ stat: 'offline.rate', op: 'add', value: 0.15 }] },
  { id: 'a7', name: 'Faster Macros', desc: 'Macro Recorder presses twice as often', branch: 'automation', pos: at(A, 4.6), cost: { mogul: 8, grind: 8 }, requires: ['a3'], effects: [{ stat: 'macro.rate', op: 'add', value: 1 }] },
  { id: 'a8', name: 'Weather Forecasts', desc: "KEYSTONE: Lemon Mogul sees the next weather and re-prices itself perfectly", branch: 'automation', pos: at(A, 3.6, 0.8), cost: { mogul: 5, grind: 4 }, requires: ['a6'], effects: [{ flag: 'lemon.forecast' }], keystone: true, hidden: true },
  { id: 'a9', name: 'Robo Vacuum', desc: '+1 m coin pickup radius', branch: 'automation', pos: at(A, 5.6), cost: { mogul: 6, grind: 6 }, requires: ['a7'], effects: [{ stat: 'magnet.radius', op: 'add', value: 1 }] },

  // Hardware (Mogul + Grind): overclocking, cooling, slots, OS speed
  { id: 'hw1', name: 'Overclock I', desc: '+8% game speed', branch: 'hardware', pos: at(HW, 1.6), cost: { mogul: 2, grind: 2 }, requires: ['b1'], effects: [{ stat: 'tycoon.speed', op: 'mult', value: 1.08 }] },
  { id: 'hw2', name: 'Thermal Paste', desc: 'Cooling: +5% game speed', branch: 'hardware', pos: at(HW, 2.6, -0.8), cost: { mogul: 3, grind: 3 }, requires: ['hw1'], effects: [{ stat: 'tycoon.speed', op: 'mult', value: 1.05 }] },
  { id: 'hw3', name: 'SSD Upgrade', desc: 'OS speed +25% (auto-clickers, macros, auto cash-out)', branch: 'hardware', pos: at(HW, 2.6, 0.8), cost: { mogul: 3, grind: 3 }, requires: ['hw1'], effects: [{ stat: 'os.speed', op: 'mult', value: 1.25 }] },
  { id: 'hw4', name: 'Overclock II', desc: '+12% game speed', branch: 'hardware', pos: at(HW, 3.6, -0.8), cost: { mogul: 6, grind: 5 }, requires: ['hw2'], effects: [{ stat: 'tycoon.speed', op: 'mult', value: 1.12 }] },
  { id: 'hw5', name: 'Extra RAM', desc: '+1 background slot: a minimized game keeps running', branch: 'hardware', pos: at(HW, 3.6, 0.8), cost: { mogul: 8, grind: 6 }, requires: ['hw3'], effects: [{ stat: 'slots', op: 'add', value: 1 }] },
  { id: 'hw6', name: 'Liquid Cooling', desc: 'x1.5 offline time cap', branch: 'hardware', pos: at(HW, 4.6, -0.8), cost: { mogul: 7, grind: 6 }, requires: ['hw4'], effects: [{ stat: 'offline.cap', op: 'mult', value: 1.5 }] },
  { id: 'hw7', name: 'RGB Everything', desc: 'Vibe +2', branch: 'hardware', pos: at(HW, 4.6, 0.8), cost: { mogul: 6, grind: 6 }, requires: ['hw5'], effects: [{ stat: 'vibe', op: 'add', value: 2 }] },
  { id: 'hw8', name: 'Dual Boot', desc: 'OS speed +25%', branch: 'hardware', pos: at(HW, 5.6), cost: { mogul: 9, grind: 8 }, requires: ['hw6', 'hw7'], effects: [{ stat: 'os.speed', op: 'mult', value: 1.25 }] },
  { id: 'hw9', name: 'Server Rack', desc: '+1 background slot: a minimized game keeps running', branch: 'hardware', pos: at(HW, 6.6), cost: { mogul: 14, grind: 12 }, requires: ['hw8'], effects: [{ stat: 'slots', op: 'add', value: 1 }] },

  // Legacy (Golden): placeholders for later phases — hidden and unpurchasable until then.
  { id: 'l1', name: 'Old Money', desc: 'x1.25 exchange rate', branch: 'legacy', pos: at(L, 2), cost: { golden: 1 }, requires: ['root'], effects: [{ stat: 'exchange.rate', op: 'mult', value: 1.25 }], hidden: true, phaseLocked: 'garage' },
  { id: 'l2', name: 'Heirloom PC', desc: '+1 background slot: a minimized game keeps running', branch: 'legacy', pos: at(L, 3), cost: { golden: 2 }, requires: ['l1'], effects: [{ stat: 'slots', op: 'add', value: 1 }], hidden: true, phaseLocked: 'garage' },
  { id: 'l3', name: 'Family Business', desc: '+50% offline earnings', branch: 'legacy', pos: at(L, 4, -0.6), cost: { golden: 3 }, requires: ['l2'], effects: [{ stat: 'offline.rate', op: 'add', value: 0.5 }], hidden: true, phaseLocked: 'lancafe' },
  { id: 'l4', name: 'Legend Status', desc: 'x2 click power', branch: 'legacy', pos: at(L, 4, 0.6), cost: { golden: 3 }, requires: ['l2'], effects: [{ stat: 'click.power', op: 'mult', value: 2 }], hidden: true, phaseLocked: 'lancafe' },
  { id: 'l5', name: 'Prestige Aura', desc: 'Vibe +5', branch: 'legacy', pos: at(L, 5), cost: { golden: 5 }, requires: ['l3', 'l4'], effects: [{ stat: 'vibe', op: 'add', value: 5 }], hidden: true, phaseLocked: 'studio' },
];

export const nodeById = (id: string): SkillNodeDef | undefined => SKILL_NODES.find((n) => n.id === id);
