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

export const SKILL_NODES: SkillNodeDef[] = [
  { id: 'root', name: 'Broke Gamer', desc: 'Where it all begins.', branch: 'root', pos: { x: 0, y: 0 }, cost: {}, requires: [], effects: [] },

  // Hustle (Grind)
  { id: 'h1', name: 'Sweaty Palms', desc: '+1 click power', branch: 'hustle', pos: at(H, 1), cost: { grind: 1 }, requires: ['root'], effects: [{ stat: 'click.power', op: 'add', value: 1 }] },
  { id: 'h2', name: 'Speedrunner', desc: 'Grind Tokens need 20% fewer actions', branch: 'hustle', pos: at(H, 2), cost: { grind: 2 }, requires: ['h1'], effects: [{ stat: 'grind.threshold', op: 'mult', value: 0.8 }] },
  { id: 'h3', name: 'Combo Fingers', desc: 'x1.25 click power', branch: 'hustle', pos: at(H, 3), cost: { grind: 4 }, requires: ['h2'], effects: [{ stat: 'click.power', op: 'mult', value: 1.25 }] },
  { id: 'h4', name: 'Caffeine IV', desc: '+10% game speed', branch: 'hustle', pos: at(H, 4, -0.6), cost: { grind: 6 }, requires: ['h3'], effects: [{ stat: 'tycoon.speed', op: 'mult', value: 1.1 }] },
  { id: 'h6', name: 'Carpal Tunnel Insurance', desc: '+2 click power', branch: 'hustle', pos: at(H, 4, 0.6), cost: { grind: 8 }, requires: ['h3'], effects: [{ stat: 'click.power', op: 'add', value: 2 }] },
  { id: 'h5', name: 'Autoclicker Dreams', desc: 'KEYSTONE: the focused game presses its main button 3x/s for you', branch: 'hustle', pos: at(H, 5), cost: { grind: 12 }, requires: ['h4', 'h6'], effects: [{ flag: 'autoclick' }], keystone: true, hidden: true },

  // Business (Mogul)
  { id: 'b1', name: 'Spreadsheet Brain', desc: 'x1.15 exchange rate', branch: 'business', pos: at(B, 1), cost: { mogul: 1 }, requires: ['root'], effects: [{ stat: 'exchange.rate', op: 'mult', value: 1.15 }] },
  { id: 'b2', name: 'Extra Tab', desc: '+1 game slot', branch: 'business', pos: at(B, 2, -0.6), cost: { mogul: 2 }, requires: ['b1'], effects: [{ stat: 'slots', op: 'add', value: 1 }] },
  { id: 'b3', name: 'Haggler', desc: 'Shop prices -10%', branch: 'business', pos: at(B, 2, 0.6), cost: { mogul: 3 }, requires: ['b1'], effects: [{ stat: 'shop.discount', op: 'mult', value: 0.9 }] },
  { id: 'b4', name: 'Compound Interest', desc: '+25% offline earnings', branch: 'business', pos: at(B, 3, -0.6), cost: { mogul: 4 }, requires: ['b2'], effects: [{ stat: 'offline.rate', op: 'add', value: 0.25 }] },
  { id: 'b5', name: 'Night Shift', desc: 'x2 offline time cap', branch: 'business', pos: at(B, 4, -0.6), cost: { mogul: 5 }, requires: ['b4'], effects: [{ stat: 'offline.cap', op: 'mult', value: 2 }] },
  { id: 'b6', name: 'Auto Cash-Out', desc: 'KEYSTONE: games cash out by themselves every 10s', branch: 'business', pos: at(B, 3), cost: { mogul: 6 }, requires: ['b2', 'b3'], effects: [{ flag: 'autoCashout' }], keystone: true, hidden: true },
  { id: 'b7', name: 'Market Maker', desc: 'x1.3 exchange rate', branch: 'business', pos: at(B, 3, 0.6), cost: { mogul: 8 }, requires: ['b3'], effects: [{ stat: 'exchange.rate', op: 'mult', value: 1.3 }] },

  // Chaos Physics (Chaos)
  { id: 'c1', name: 'Butterfingers', desc: '+0.75 m coin pickup radius', branch: 'chaos', pos: at(C, 1), cost: { chaos: 1 }, requires: ['root'], effects: [{ stat: 'magnet.radius', op: 'add', value: 0.75 }] },
  { id: 'c2', name: 'Clumsy Genius', desc: '+1 Chaos Token per mayhem event', branch: 'chaos', pos: at(C, 2, 0.6), cost: { chaos: 2 }, requires: ['c1'], effects: [{ stat: 'chaos.mult', op: 'add', value: 1 }] },
  { id: 'c3', name: 'Bouncy Bucks', desc: 'Coins bounce higher', branch: 'chaos', pos: at(C, 2, -0.6), cost: { chaos: 2 }, requires: ['c1'], effects: [{ stat: 'coin.bounce', op: 'add', value: 0.35 }] },
  { id: 'c4', name: 'Coin Gravity', desc: 'KEYSTONE: coins roll toward you', branch: 'chaos', pos: at(C, 3, -0.6), cost: { chaos: 5 }, requires: ['c3'], effects: [{ flag: 'coins.seekPlayer' }], keystone: true, hidden: true },
  { id: 'c5', name: 'Avalanche Fund', desc: '+10% value of picked-up cash', branch: 'chaos', pos: at(C, 3, 0.6), cost: { chaos: 4 }, requires: ['c2'], effects: [{ stat: 'pickup.mult', op: 'mult', value: 1.1 }] },
  { id: 'c6', name: 'Insurance Fraud', desc: 'Mayhem cooldowns -40%', branch: 'chaos', pos: at(C, 4, 0.6), cost: { chaos: 6 }, requires: ['c5'], effects: [{ stat: 'chaos.cooldown', op: 'mult', value: 0.6 }] },

  // Style (Chaos + Grind)
  { id: 's1', name: 'Fashion Sense', desc: '+1 modifier slot per object', branch: 'style', pos: at(S, 1.6), cost: { chaos: 2, grind: 2 }, requires: ['h1', 'c1'], effects: [{ stat: 'cosmetic.slots', op: 'add', value: 1 }] },
  { id: 's2', name: 'Drip', desc: 'Cosmetics cost 20% fewer tokens', branch: 'style', pos: at(S, 2.6), cost: { chaos: 3, grind: 3 }, requires: ['s1'], effects: [{ stat: 'cosmetic.discount', op: 'mult', value: 0.8 }] },
  { id: 's3', name: 'Stacked Fits', desc: '+1 modifier slot per object', branch: 'style', pos: at(S, 3.6), cost: { chaos: 5, grind: 5 }, requires: ['s2'], effects: [{ stat: 'cosmetic.slots', op: 'add', value: 1 }] },
  { id: 's4', name: 'Gold Standard', desc: 'x1.1 exchange rate', branch: 'style', pos: at(90, 1.4), cost: { chaos: 3, mogul: 3 }, requires: ['b1', 'c1'], effects: [{ stat: 'exchange.rate', op: 'mult', value: 1.1 }] },

  // Automation (Mogul + Grind)
  { id: 'a1', name: 'Intern Bot', desc: 'Jammed belts unjam themselves after 5s', branch: 'automation', pos: at(A, 1.6), cost: { mogul: 2, grind: 3 }, requires: ['h1', 'b1'], effects: [{ flag: 'autoUnjam' }] },
  { id: 'a2', name: 'Bot Union', desc: '+15% game speed', branch: 'automation', pos: at(A, 2.6), cost: { mogul: 4, grind: 4 }, requires: ['a1'], effects: [{ stat: 'tycoon.speed', op: 'mult', value: 1.15 }] },
  { id: 'a3', name: 'Macro Recorder', desc: 'KEYSTONE: every running game presses its main button once per second', branch: 'automation', pos: at(A, 3.6), cost: { mogul: 6, grind: 6 }, requires: ['a2'], effects: [{ flag: 'macro' }], keystone: true, hidden: true },
];

export const nodeById = (id: string): SkillNodeDef | undefined => SKILL_NODES.find((n) => n.id === id);
