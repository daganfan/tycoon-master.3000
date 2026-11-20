import type { QuestDef } from '@/sim/types';

const pad = (s: { garage?: { pads: string[]; stars: number } }, id: string): boolean => !!s.garage && (s.garage.pads.includes(id) || s.garage.stars > 0);

/** Phase 2 objectives, appended after "Moving out" (Garage Key). */
export const GARAGE_QUESTS: QuestDef[] = [
  { id: 'q_g_enter', title: 'Smells like oil', text: 'Walk through the bedroom door into the garage.', reward: 0,
    done: (s) => s.flags.includes('garage:entered') || (s.garage?.pads.length ?? 0) > 0 || (s.garage?.stars ?? 0) > 0 },
  { id: 'q_g_pad', title: 'Step right up', text: 'Stand on a glowing pad in the factory plot to build the Scrap Furnace.', reward: 500,
    done: (s) => pad(s, 'furnace') },
  { id: 'q_g_conveyor', title: 'It moves!', text: 'Build Conveyor A and your first dropper.', reward: 2000,
    done: (s) => pad(s, 'drop_a1') },
  { id: 'q_g_collect', title: 'Empty the tank', text: 'Step on the green COLLECT pad next to the furnace.', reward: 5000,
    done: (s) => (s.garage?.collects ?? 0) >= 1 },
  { id: 'q_g_hotdog', title: 'Street food empire', text: 'Install Hot Dog Highway from the App Store.', reward: 20000,
    done: (s) => s.tycoons.hot_dog_highway !== undefined },
  { id: 'q_g_gold', title: 'Bling it', text: 'Build the Gold-Plater. Everything is better gold.', reward: 50000,
    done: (s) => pad(s, 'up_gold') },
  { id: 'q_g_robot', title: 'Robo buddy', text: 'Build the Robo-Helper so the tank empties itself.', reward: 100000,
    done: (s) => pad(s, 'robot') },
  { id: 'q_g_carwash', title: 'Squeaky clean', text: 'Install Robo Car Wash.', reward: 500000,
    done: (s) => s.tycoons.robo_car_wash !== undefined },
  { id: 'q_g_rebirth', title: 'Born again', text: 'Finish the factory and step on the golden REBIRTH pad.', reward: 0,
    done: (s) => (s.garage?.stars ?? 0) >= 1 },
  { id: 'q_g_lease', title: 'Moving up (again)', text: 'Save up for the LAN Café Lease.', reward: 0,
    done: (s) => (s.items.lan_lease ?? 0) >= 1 },
];
