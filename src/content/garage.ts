import type { ItemDef } from '@/sim/types';

/**
 * Phase 2 — The Garage. Pure data shared by the sim (production math) and the
 * world (where things are built). Coordinates are world metres: the garage sits
 * behind the bedroom's front wall (z > 2.7), the door is at x ≈ 1.6.
 */
export const GARAGE = { x0: -3.4, x1: 6.6, z0: 2.7, z1: 10.7, h: 3.0 } as const;

/** Conveyor lines run along +x towards the furnace. */
export type LineId = 'A' | 'B';
export const LINES: Record<LineId, { z: number; x0: number; x1: number }> = {
  A: { z: 6.0, x0: -1.7, x1: 4.35 },
  B: { z: 8.0, x0: -1.7, x1: 4.35 },
};
export const BELT = { width: 0.62, top: 0.42 } as const;
export const FURNACE = { x: 4.95, z: 7.0, hx: 0.62, hz: 1.55 } as const;
export const TANK = { x: 6.02, z: 7.0, r: 0.36, h: 1.7 } as const;
export const COLLECT_PAD = { x: 5.55, z: 4.55 } as const;
export const REBIRTH_PAD = { x: 5.55, z: 3.45 } as const;

export type ScrapKind = 'cap' | 'duck' | 'phone' | 'sock' | 'gear' | 'crate';
export type UpgradeFx = 'paint' | 'gold' | 'wrap' | 'hat';
export type PadKind = 'furnace' | 'belt' | 'dropper' | 'upgrader' | 'speed' | 'decor' | 'robot';

export interface PadDef {
  id: string;
  name: string;
  desc: string;
  kind: PadKind;
  /** Cash price. */
  cost: number;
  /** Every one of these must be built first (this run). */
  requires: string[];
  /** Where the glowing floor button sits. */
  pad: { x: number; z: number };
  line?: LineId;
  /** Where the built piece goes (x along the line for droppers/upgraders). */
  at?: { x: number; z: number };
  dropper?: { rate: number; value: number; scrap: ScrapKind };
  upgrader?: { mult: number; fx: UpgradeFx };
  /** Speed pads: dropper rate multiplier. Decor pads: factory income multiplier. */
  mult?: number;
}

/**
 * The build order. Prices are tuned with tests/sim/garageBot.ts so the first
 * rebirth lands ~40–90 min after the Garage Key.
 */
export const PADS: PadDef[] = [
  { id: 'furnace', name: 'Scrap Furnace', desc: 'Melts scrap into money. Comes with a tank and a COLLECT pad.', kind: 'furnace', cost: 1000, requires: [],
    pad: { x: 3.4, z: 4.3 } },
  { id: 'belt_a', name: 'Conveyor A', desc: 'A rubber belt that carries scrap into the furnace.', kind: 'belt', cost: 2500, requires: ['furnace'], line: 'A',
    pad: { x: 2.2, z: 4.3 } },
  { id: 'drop_a1', name: 'Bottle-Cap Dropper', desc: 'Drops a bottle cap every 2 s.', kind: 'dropper', cost: 4000, requires: ['belt_a'], line: 'A',
    pad: { x: -1.25, z: 5.05 }, at: { x: -1.25, z: 6.0 }, dropper: { rate: 0.5, value: 60, scrap: 'cap' } },
  { id: 'drop_a2', name: 'Rubber Duck Dropper', desc: 'Quack. Ducks are worth more than caps.', kind: 'dropper', cost: 15000, requires: ['drop_a1'], line: 'A',
    pad: { x: -0.35, z: 5.05 }, at: { x: -0.35, z: 6.0 }, dropper: { rate: 0.5, value: 220, scrap: 'duck' } },
  { id: 'up_paint', name: 'Paint Booth', desc: 'Sprays everything bright. Scrap worth x1.5.', kind: 'upgrader', cost: 45000, requires: ['drop_a2'], line: 'A',
    pad: { x: 1.55, z: 5.05 }, at: { x: 1.55, z: 6.0 }, upgrader: { mult: 1.5, fx: 'paint' } },
  { id: 'drop_a3', name: 'Old Phone Dropper', desc: 'Drops cracked phones. Still has 3% battery.', kind: 'dropper', cost: 120000, requires: ['up_paint'], line: 'A',
    pad: { x: 0.55, z: 5.05 }, at: { x: 0.55, z: 6.0 }, dropper: { rate: 0.4, value: 1000, scrap: 'phone' } },
  { id: 'deco_rails', name: 'Safety Rails & Floor Paint', desc: 'Looks legit. Factory income +10%.', kind: 'decor', cost: 90000, requires: ['up_paint'],
    pad: { x: -2.55, z: 4.2 }, mult: 1.1 },
  { id: 'up_gold', name: 'Gold-Plater', desc: 'A thin layer of real-ish gold. Worth x2.', kind: 'upgrader', cost: 400000, requires: ['drop_a3'], line: 'A',
    pad: { x: 2.75, z: 5.05 }, at: { x: 2.75, z: 6.0 }, upgrader: { mult: 2, fx: 'gold' } },
  { id: 'speed_1', name: 'Overclocked Belts', desc: 'Droppers sync to faster belts: +30% drop rate.', kind: 'speed', cost: 650000, requires: ['up_gold'],
    pad: { x: 4.0, z: 3.4 }, mult: 1.3 },
  { id: 'robot', name: 'Robo-Helper', desc: 'Empties the tank for you every 30 s and pays out the coins.', kind: 'robot', cost: 900000, requires: ['up_gold'],
    pad: { x: 4.4, z: 4.3 } },
  { id: 'belt_b', name: 'Conveyor B', desc: 'A second production line.', kind: 'belt', cost: 1500000, requires: ['speed_1'], line: 'B',
    pad: { x: -2.55, z: 7.0 } },
  { id: 'drop_b1', name: 'Lost Sock Dropper', desc: 'Every sock that ever vanished ends up here.', kind: 'dropper', cost: 2200000, requires: ['belt_b'], line: 'B',
    pad: { x: -0.35, z: 7.0 }, at: { x: -0.35, z: 8.0 }, dropper: { rate: 0.5, value: 600, scrap: 'sock' } },
  { id: 'drop_b2', name: 'Gear Dropper', desc: 'Heavy, greasy, valuable gears.', kind: 'dropper', cost: 5000000, requires: ['drop_b1'], line: 'B',
    pad: { x: 0.55, z: 7.0 }, at: { x: 0.55, z: 8.0 }, dropper: { rate: 0.45, value: 1500, scrap: 'gear' } },
  { id: 'up_wrap', name: 'Shrink-Wrapper', desc: 'Factory-sealed means collectible. Worth x1.75.', kind: 'upgrader', cost: 6000000, requires: ['drop_b2'], line: 'B',
    pad: { x: 1.55, z: 7.0 }, at: { x: 1.55, z: 8.0 }, upgrader: { mult: 1.75, fx: 'wrap' } },
  { id: 'deco_neon', name: 'Neon Tubes & Disco Ball', desc: 'Workers love it (you are the workers). Factory income +15%.', kind: 'decor', cost: 6000000, requires: ['drop_b2'],
    pad: { x: -2.55, z: 5.35 }, mult: 1.15 },
  { id: 'up_hat', name: 'Tiny Top-Hat Station', desc: 'Every item gets a tiny top hat. Classy: worth x2.5.', kind: 'upgrader', cost: 10000000, requires: ['up_wrap'], line: 'B',
    pad: { x: 2.75, z: 7.0 }, at: { x: 2.75, z: 8.0 }, upgrader: { mult: 2.5, fx: 'hat' } },
  { id: 'mega', name: 'MEGA Dropper', desc: 'Drops entire crates of premium scrap.', kind: 'dropper', cost: 18000000, requires: ['up_hat'], line: 'B',
    pad: { x: -1.25, z: 7.0 }, at: { x: -1.25, z: 8.0 }, dropper: { rate: 0.25, value: 12000, scrap: 'crate' } },
  { id: 'speed_2', name: 'Turbo Belts', desc: 'Belts so fast they whistle: +35% drop rate.', kind: 'speed', cost: 25000000, requires: ['mega'],
    pad: { x: 3.7, z: 7.0 }, mult: 1.35 },
];

export const padById = (id: string): PadDef | undefined => PADS.find((p) => p.id === id);

/** Rebirth unlocks once these are built. */
export const REBIRTH_REQUIRES = ['mega', 'speed_2', 'deco_neon'];
/** Cash price of the n-th rebirth (0-based). */
export const rebirthCost = (stars: number): number => 30_000_000 * Math.pow(3, stars);
/** Permanent factory income bonus per Factory Star. */
export const STAR_BONUS = 0.75;
/** Robo-Helper collection interval (s) before the garage.robot stat. */
export const ROBOT_INTERVAL = 30;
/** Hard cap on live physical scrap bodies in the world. */
export const MAX_SCRAP = 150;

/** Garage-phase eBuy stock. Props for these are built by world/garage/garageProps.ts. */
export const GARAGE_ITEMS: ItemDef[] = [
  { id: 'g_power_strip', name: 'Industrial Power Strip', desc: '+1 game slot. Twelve outlets, one fuse.', icon: '🔌', category: 'hardware',
    baseCost: 1_200_000, growth: 1, max: 1, mods: [{ stat: 'slots', op: 'add', value: 1 }], phase: 'garage' },
  { id: 'g_shop_vac', name: 'Shop-Vac Coin Magnet', desc: '+1.5 m coin pickup radius. SHHHHHLUP.', icon: '🌪️', category: 'utility',
    baseCost: 350_000, growth: 3, max: 2, mods: [{ stat: 'magnet.radius', op: 'add', value: 1.5 }], phase: 'garage' },
  { id: 'g_heater', name: 'Space Heater', desc: '+8% game speed. Warm fingers click faster.', icon: '🔥', category: 'utility',
    baseCost: 800_000, growth: 3, max: 2, mods: [{ stat: 'tycoon.speed', op: 'mult', value: 1.08 }], phase: 'garage' },
  { id: 'g_neon', name: "Neon 'OPEN 24/7' Sign", desc: 'Vibe +3. Nobody is invited.', icon: '🌈', category: 'decor',
    baseCost: 2_000_000, growth: 1, max: 1, mods: [{ stat: 'vibe', op: 'add', value: 3 }], phase: 'garage' },
  { id: 'g_tool_chest', name: 'Rolling Tool Chest', desc: 'Factory scrap worth +15%. Every drawer is "misc".', icon: '🧰', category: 'furniture',
    baseCost: 2_500_000, growth: 4, max: 2, mods: [{ stat: 'garage.mult', op: 'mult', value: 1.15 }], phase: 'garage' },
  { id: 'g_grease', name: 'Industrial Belt Grease', desc: 'Factory droppers +10% faster.', icon: '🛢️', category: 'utility',
    baseCost: 1_000_000, growth: 3, max: 3, mods: [{ stat: 'garage.speed', op: 'mult', value: 1.1 }], phase: 'garage' },
  { id: 'g_soda_fridge', name: 'Garage Soda Fridge', desc: 'Grind Tokens need 10% fewer actions.', icon: '🧃', category: 'furniture',
    baseCost: 600_000, growth: 3, max: 1, mods: [{ stat: 'grind.threshold', op: 'mult', value: 0.9 }], phase: 'garage' },
  { id: 'g_camera', name: 'Security Camera', desc: 'Offline time cap x1.5. Watches the scrap while you sleep.', icon: '📹', category: 'utility',
    baseCost: 4_000_000, growth: 1, max: 1, mods: [{ stat: 'offline.cap', op: 'mult', value: 1.5 }], phase: 'garage' },
  { id: 'g_dehumidifier', name: 'Dehumidifier', desc: '+5% exchange rate. Dry money is better money.', icon: '💧', category: 'utility',
    baseCost: 6_000_000, growth: 3, max: 2, mods: [{ stat: 'exchange.rate', op: 'mult', value: 1.05 }], phase: 'garage' },
  { id: 'g_robo_battery', name: 'Robo-Helper Battery', desc: 'The Robo-Helper empties the tank 40% more often.', icon: '🔋', category: 'utility',
    baseCost: 3_000_000, growth: 1, max: 1, mods: [{ stat: 'garage.robot', op: 'mult', value: 0.6 }], phase: 'garage' },
  { id: 'g_disco_lamp', name: 'Shop Light Upgrade', desc: 'LED shop lights: factory income +8%. You can see the oil stain now.', icon: '💡', category: 'decor',
    baseCost: 1_500_000, growth: 1, max: 1, mods: [{ stat: 'garage.mult', op: 'mult', value: 1.08 }], phase: 'garage' },
  { id: 'lan_lease', name: 'LAN Café Lease', desc: 'Phase 3: The LAN Café. (Opening soon — the landlord is "reviewing your application".)', icon: '🏢', category: 'key',
    baseCost: 800_000_000, growth: 1, max: 1, mods: [], phase: 'garage' },
];
