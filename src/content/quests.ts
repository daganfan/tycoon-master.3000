import type { QuestDef } from '@/sim/types';

const c = (s: { counters: Record<string, number> }, k: string): number => s.counters[k] ?? 0;

/** Onboarding objectives (GDD §9), delivered as Mom's sticky notes / Mail. */
export const QUESTS: QuestDef[] = [
  { id: 'q_boot', title: 'Rent due. -Mom', text: 'Boot up the crusty PC (walk to the desk and press E).', reward: 0,
    done: (s) => s.flags.includes('booted') },
  { id: 'q_first_sale', title: 'First customer', text: 'Sell your first cup in Lemon Mogul.', reward: 2,
    done: (s) => (s.tycoons.lemon_mogul?.lifetime ?? 0) > 0 },
  { id: 'q_cash_out', title: 'Make it rain', text: 'Cash out from Lemon Mogul. Money comes out of the PC!', reward: 0,
    done: (s) => c(s, 'cashouts') >= 1 },
  { id: 'q_collect', title: 'Pick it up', text: 'Collect 20 coins from the floor.', reward: 5,
    done: (s) => c(s, 'coinsCollected') >= 20 },
  { id: 'q_monitor', title: 'Upgrade time', text: 'Buy a Second-hand Monitor in eBuy.', reward: 10,
    done: (s) => (s.items.used_monitor ?? 0) >= 1 },
  { id: 'q_node', title: 'Skill issue', text: 'Buy your first skill tree node (press T).', reward: 15,
    done: (s) => s.nodes.length > 1 },
  { id: 'q_duck', title: 'Diversify', text: 'Install Rubber Duck Works from the App Store.', reward: 25,
    done: (s) => s.tycoons.rubber_duck_works !== undefined },
  { id: 'q_chaos', title: 'Mayhem pays', text: 'Earn a Chaos Token by knocking stuff over.', reward: 40,
    done: (s) => c(s, 'chaosEvents') >= 1 },
  { id: 'q_socks', title: 'Sock it to them', text: 'Install Sock Syndicate.', reward: 150,
    done: (s) => s.tycoons.sock_syndicate !== undefined },
  { id: 'q_couch', title: 'Dig deep', text: 'Install Couch Coin Mining.', reward: 600,
    done: (s) => s.tycoons.couch_coin_mining !== undefined },
  { id: 'q_garage', title: 'Moving out', text: 'Save up for the Garage Key.', reward: 0,
    done: (s) => (s.items.garage_key ?? 0) >= 1 },
];
