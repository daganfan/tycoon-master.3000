import type { TokenId } from '@/sim/types';

/**
 * A trophy. Secret ones show as "???" until unlocked. Trophies the economy
 * sim can earn on its own pay Pixel tokens (saved up for a later phase) so
 * they never speed up the tuned bedroom/garage pacing; physical mischief pays
 * small Grind/Chaos rewards, and the two big secrets a Golden Token.
 */
export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  secret?: boolean;
  reward: { token: TokenId; amount: number };
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'hello_world', name: 'Hello, World', desc: 'Boot up the crusty PC.', icon: '🖥️', reward: { token: 'pixel', amount: 1 } },
  { id: 'cash_money', name: 'Cash Money', desc: 'Cash out a game for the first time.', icon: '💸', reward: { token: 'pixel', amount: 1 } },
  { id: 'penny_pincher', name: 'Penny Pincher', desc: 'Pick up 500 coins off the floor.', icon: '🪙', reward: { token: 'pixel', amount: 2 } },
  { id: 'retail_therapy', name: 'Retail Therapy', desc: 'Buy 10 things.', icon: '🛒', reward: { token: 'pixel', amount: 2 } },
  { id: 'hoarder', name: 'Hoarder', desc: 'Own 15 Junk Mart decorations.', icon: '🧸', reward: { token: 'pixel', amount: 2 } },
  { id: 'clean_freak', name: 'Clean Freak', desc: 'Tidy up the room 10 times.', icon: '🧹', reward: { token: 'grind', amount: 2 } },
  { id: 'feng_shui', name: 'Feng Shui', desc: 'Carry 10 things to a new home.', icon: '🪴', reward: { token: 'mogul', amount: 1 } },
  { id: 'butterfingers', name: 'Butterfingers', desc: 'Knock over 10 things.', icon: '🫳', reward: { token: 'pixel', amount: 2 } },
  { id: 'heavy_lifter', name: 'Heavy Lifter', desc: 'Shove heavy furniture 3 m in total.', icon: '🏋️', reward: { token: 'chaos', amount: 1 } },
  { id: 'interior_designer', name: 'Interior Designer', desc: 'Give the bed a new home.', icon: '🛏️', secret: true, reward: { token: 'golden', amount: 1 } },
  { id: 'tower_architect', name: 'Tower Architect', desc: 'Build a tower of junk.', icon: '🗼', reward: { token: 'pixel', amount: 2 } },
  { id: 'yeet', name: 'Yeet', desc: 'Throw something really, really fast.', icon: '🚀', reward: { token: 'chaos', amount: 1 } },
  { id: 'ball_in', name: 'Who Let The Ball In?', desc: 'Break the bedroom window.', icon: '🪟', secret: true, reward: { token: 'golden', amount: 1 } },
  { id: 'lights_out', name: 'Lights Out', desc: 'Flip the light switch.', icon: '💡', secret: true, reward: { token: 'grind', amount: 1 } },
  { id: 'disco', name: 'Disco Inferno', desc: 'Flip the lights 10 times in 5 seconds.', icon: '🪩', secret: true, reward: { token: 'chaos', amount: 1 } },
  { id: 'snoop', name: 'Snoop', desc: 'Open the sock drawer.', icon: '🧦', secret: true, reward: { token: 'grind', amount: 1 } },
  { id: 'turn_it_off', name: 'Have You Tried Turning It Off?', desc: "Press the PC's power button.", icon: '⏻', secret: true, reward: { token: 'grind', amount: 1 } },
  { id: 'power_nap', name: 'Power Nap', desc: 'Flop onto the bed.', icon: '😴', secret: true, reward: { token: 'chaos', amount: 1 } },
  { id: 'wipeout', name: 'Ragdoll Physics', desc: 'Pull off an epic wipeout.', icon: '🤸', reward: { token: 'pixel', amount: 2 } },
  { id: 'make_it_rain', name: 'Make It Rain', desc: 'Cause a coin avalanche.', icon: '💰', reward: { token: 'pixel', amount: 2 } },
  { id: 'tycoon_tycoon', name: 'Tycoon Tycoon', desc: 'Get any game to level 10.', icon: '📈', reward: { token: 'pixel', amount: 3 } },
  { id: 'multitasker', name: 'Multitasker', desc: 'Run 3 games at once.', icon: '🗂️', reward: { token: 'pixel', amount: 2 } },
  { id: 'mind_the_gap', name: 'Mind The Gap', desc: 'Walk into the garage.', icon: '🔑', reward: { token: 'pixel', amount: 3 } },
  { id: 'millionaire', name: 'Millionaire', desc: 'Earn $1,000,000 in total.', icon: '🤑', reward: { token: 'pixel', amount: 5 } },
];

const byId = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
export const achievementById = (id: string): AchievementDef | undefined => byId.get(id);
