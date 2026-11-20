import type { ItemDef } from '@/sim/types';

/**
 * Junk Mart: useless, quirky bedroom decorations. Each one is a normal ItemDef
 * (category 'decor', prop `decor:<id>`) so it flows through game.buyItem and
 * world.spawnItem → createProp like everything else.
 *
 * Vibe balance: vibe is purely additive per unit, so the decor budget is kept
 * in check by design: vibe follows a price tier (+0.1 under $50, +0.15 under
 * $200, +0.25 under $1k, +0.5 above), only one-off Absurd Luxuries go higher
 * (up to +3), and repeat units get pricier (growth 1.6) — so every extra dollar
 * buys less vibe. Everything below the luxury tier maxed out is ≈ +16 vibe;
 * the full catalogue ≈ +28 (≈ +85% exchange). Tests keep it under 30.
 */

export const DECOR_CATEGORIES = [
  { id: 'desk', label: 'Desk Toys', icon: '🧸' },
  { id: 'wall', label: 'Wall Stuff', icon: '🖼️' },
  { id: 'floor', label: 'Floor Junk', icon: '🚧' },
  { id: 'trophy', label: 'Trophies & Shrines', icon: '🏆' },
  { id: 'gadget', label: 'Gadgets', icon: '🔌' },
  { id: 'nature', label: 'Plants & Pets', icon: '🪴' },
  { id: 'luxury', label: 'Absurd Luxuries', icon: '💎' },
  { id: 'seasonal', label: 'Seasonal', icon: '🎃' },
] as const;

export type DecorCategory = (typeof DECOR_CATEGORIES)[number]['id'];
/** Where an item prefers to appear when bought (players can carry it anywhere later). */
export type DecorSpot = 'desk' | 'shelf' | 'floor' | 'wall';

export interface DecorDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  cat: DecorCategory;
  price: number;
  vibe: number;
  max: number;
  spot: DecorSpot;
  /** Short label for the fun behaviour, shown in the shop. */
  quirk?: string;
}

const d = (id: string, name: string, icon: string, cat: DecorCategory, price: number, vibe: number, max: number, spot: DecorSpot, desc: string, quirk?: string): DecorDef =>
  ({ id, name, icon, cat, price, vibe, max, spot, desc, quirk });

export const DECOR: DecorDef[] = [
  // Desk Toys
  d('rubber_chicken', 'Rubber Chicken', '🐔', 'desk', 5, 0.1, 3, 'desk', 'Screams when thrown. Same, buddy.', 'Squeaks'),
  d('bobblehead', 'Nodding Exec Bobblehead', '🎎', 'desk', 25, 0.1, 2, 'desk', 'Agrees with every business decision you make.', 'Bobbles'),
  d('desk_cactus', 'Desk Cactus', '🌵', 'desk', 12, 0.1, 3, 'desk', 'Low maintenance. High prickliness.'),
  d('ball_pendulum', 'Clacky Ball Pendulum', '⚪', 'desk', 45, 0.1, 1, 'desk', 'Physics, but make it stressful.', 'Swings'),
  d('stress_brain', 'Squishy Stress Brain', '🧠', 'desk', 8, 0.1, 3, 'desk', 'Squeeze it. It squeezes back (emotionally).', 'Squeaks'),
  d('desk_spinner', 'Executive Desk Spinner', '🌀', 'desk', 15, 0.1, 2, 'desk', 'Spins forever. Like your sleep schedule.', 'Spins'),
  d('zen_garden', 'Mini Zen Garden', '🪨', 'desk', 60, 0.15, 1, 'desk', 'Rake sand. Ignore emails.'),
  d('fortune_ball', 'Fortune Ball', '🎱', 'desk', 20, 0.1, 1, 'desk', 'Outlook: buy more junk.'),
  d('duck_squad', 'Rubber Duck Squad', '🦆', 'desk', 35, 0.1, 3, 'desk', 'Five ducks. One mission. Unknown.', 'Squeaks'),
  d('dipping_bird', 'Dipping Bird', '🐦', 'desk', 40, 0.1, 2, 'desk', 'Drinks water forever. A hydration icon.', 'Dips'),

  // Wall Stuff
  d('neon_open', '"OPEN 24/7" Neon Sign', '💡', 'wall', 450, 0.25, 1, 'wall', "You're always open for business. Unfortunately.", 'Glows'),
  d('singing_bass', 'Singing Bass Plaque', '🐟', 'wall', 120, 0.15, 1, 'wall', 'Sings when bumped. Repertoire: one song.', 'Sings'),
  d('backwards_clock', 'Backwards Clock', '🕰️', 'wall', 55, 0.15, 1, 'wall', 'Runs backwards. Time is a construct.', 'Ticks'),
  d('dartboard', 'Dartboard', '🎯', 'wall', 40, 0.1, 1, 'wall', 'No darts included. Just vibes.'),
  d('platinum_disc', 'Platinum Disc (Unreleased)', '💿', 'wall', 300, 0.25, 1, 'wall', 'Certified platinum in one bedroom.'),
  d('mounted_sock', 'Mounted Trophy Sock', '🧦', 'wall', 75, 0.15, 1, 'wall', 'Bagged it in the wild (behind the dryer).'),
  d('first_dollar', 'Framed First Dollar', '💵', 'wall', 10, 0.1, 1, 'wall', 'The first dollar. Ever. Probably.'),
  d('pennant', 'Team Pennant', '🚩', 'wall', 18, 0.1, 2, 'wall', 'GO TEAM! (Which team? Unclear.)'),
  d('moose_head', 'Plastic Moose Head', '🫎', 'wall', 250, 0.25, 1, 'wall', 'Its name is Gerald. Gerald judges you.'),
  d('fake_window', 'Sunset Window Sticker', '🌅', 'wall', 900, 0.25, 1, 'wall', 'A window to a better view. It is a sticker.', 'Glows'),

  // Floor Junk
  d('traffic_cone', 'Traffic Cone', '🚧', 'floor', 15, 0.1, 4, 'floor', 'Liberated from a roadwork site. Probably.'),
  d('giant_pencil', 'Giant Pencil', '✏️', 'floor', 80, 0.15, 1, 'floor', 'For writing very large cheques.'),
  d('bowling_pin', 'Bowling Pin', '🎳', 'floor', 22, 0.1, 6, 'floor', 'Collect all six. Knock them over. Repeat.'),
  d('beanbag_shark', 'Beanbag Shark', '🦈', 'floor', 140, 0.15, 1, 'floor', 'Comfy. Toothy. Emotionally available.'),
  d('pool_flamingo', 'Inflatable Pool Flamingo', '🦩', 'floor', 60, 0.15, 2, 'floor', 'There is no pool. It floats anyway.', 'Floaty'),
  d('cardboard_me', 'Cardboard Cutout of You', '🧍', 'floor', 95, 0.15, 1, 'floor', 'Now there are two of you. Neither is working.'),
  d('boom_box', 'Boom Box', '📻', 'floor', 180, 0.15, 1, 'floor', 'Plays phat beats only you can hear.', 'Thumps'),
  d('hamster_wheel', 'Hamster Wheel (No Hamster)', '🐹', 'floor', 70, 0.15, 1, 'floor', 'The hamster quit. The wheel keeps going.', 'Spins'),
  d('gnome', 'Gnorbert the Gnome', '🍄', 'floor', 45, 0.1, 2, 'floor', 'Moves when you are not looking. Or when you are.', 'Haunted'),
  d('exercise_ball', 'Exercise Ball', '🏐', 'floor', 30, 0.1, 2, 'floor', 'For sitting. Or bouncing. Mostly bouncing.', 'Bouncy'),

  // Trophies & Shrines
  d('participation_trophy', 'Participation Trophy', '🏆', 'trophy', 20, 0.1, 3, 'shelf', 'First place in showing up.'),
  d('golden_mouse', 'Golden Mouse Statue', '🖱️', 'trophy', 1500, 0.5, 1, 'desk', 'Honouring the click that started it all.'),
  d('coin_shrine', 'Shrine to the First Coin', '🪙', 'trophy', 400, 0.25, 1, 'shelf', 'Pray to it. It will not help. It might.', 'Glows'),
  d('employee_plaque', 'Employee of the Month', '🏅', 'trophy', 35, 0.1, 1, 'shelf', "You're the only employee. Every month."),
  d('blue_ribbon', 'Blue Ribbon', '🎗️', 'trophy', 8, 0.1, 2, 'desk', 'Best in Show (the show was your room).'),
  d('skull_candle', 'Spooky Skull Candle', '💀', 'trophy', 65, 0.15, 2, 'shelf', 'Ominous ambience for spreadsheets.', 'Flickers'),
  d('desk_globe', 'Spinning Desk Globe', '🌍', 'trophy', 110, 0.15, 1, 'desk', "Shows all the places you'll never commute to.", 'Spins'),
  d('marble_bust', 'Marble Bust of Yourself', '🗿', 'trophy', 5000, 0.6, 1, 'floor', 'Chiselled. Literally.'),
  d('velvet_rope', 'Velvet Rope Stand', '🎟️', 'trophy', 200, 0.25, 2, 'floor', 'Exclusive access to: the corner.'),
  d('tiny_podium', 'Tiny Winner Podium', '🥇', 'trophy', 45, 0.1, 1, 'desk', 'Put anything on it. Now it is a champion.'),

  // Gadgets
  d('lava_ocean', 'Lava Lamp XL (Ocean)', '🫧', 'gadget', 150, 0.15, 2, 'floor', 'Big blobs. Big feelings.', 'Glows'),
  d('lava_cosmic', 'Cosmic Lava Lamp', '🌌', 'gadget', 350, 0.25, 1, 'desk', 'Cycles through every colour of the universe.', 'Rainbow'),
  d('disco_ball', 'Disco Ball on a Stand', '🪩', 'gadget', 500, 0.25, 1, 'floor', 'Saturday night, every night.', 'Spins'),
  d('plasma_orb', 'Plasma Orb', '⚡', 'gadget', 220, 0.25, 1, 'desk', 'Touch it. Feel powerful. Feel slightly tingly.', 'Glows'),
  d('retro_console', 'Off-Brand Retro Console', '🕹️', 'gadget', 90, 0.15, 1, 'desk', "Plays one game: 'Loading...'."),
  d('robo_vac', 'Sentient Robot Vacuum', '🤖', 'gadget', 260, 0.25, 1, 'floor', 'Cleans nothing. Goes everywhere.', 'Roams'),
  d('walkie_talkies', 'Walkie-Talkie Pair', '📟', 'gadget', 28, 0.1, 1, 'desk', 'Over. Over? Hello? Over.'),
  d('mood_cube', 'Mood Cube', '🧊', 'gadget', 75, 0.15, 2, 'desk', 'Changes colour based on your mood (randomly).', 'Rainbow'),
  d('typewriter', 'Antique Typewriter', '📜', 'gadget', 130, 0.15, 1, 'desk', 'For writing business plans nobody reads.'),
  d('landline', 'Landline Phone', '☎️', 'gadget', 40, 0.1, 1, 'desk', 'Nobody has called since forever.'),

  // Plants & Pets
  d('bonsai', 'Potted Bonsai', '🌳', 'nature', 180, 0.15, 2, 'desk', 'Forty years old. Do not tell it about the tycoon.'),
  d('fish_tank', 'Fish Tank', '🐠', 'nature', 320, 0.25, 1, 'floor', 'Bubbles. Fish. Unlimited zen.', 'Swims'),
  d('pet_rock', 'Pet Rock', '🪨', 'nature', 5, 0.1, 3, 'desk', 'Well behaved. Never runs away. Never does anything.'),
  d('flytrap', 'Snappy Flytrap', '🪴', 'nature', 55, 0.15, 1, 'desk', 'Eats flies, fingers and sometimes receipts.', 'Sways'),
  d('sunflower', 'Sunflower in a Can', '🌻', 'nature', 25, 0.1, 2, 'shelf', 'Grows towards the monitor glow.'),
  d('goldfish_bowl', 'Goldfish Bowl', '🐟', 'nature', 40, 0.1, 2, 'desk', 'One fish. Name: Profits.', 'Swims'),
  d('office_palm', 'Sad Office Palm', '🌴', 'nature', 90, 0.15, 2, 'floor', 'Tropical vibes, fluorescent lighting.'),
  d('cat_bed', 'Empty Cat Bed', '🐈', 'nature', 60, 0.15, 1, 'floor', 'For the cat you will adopt after the IPO.'),
  d('glow_shroom', 'Glowing Mushroom Lamp', '🍄', 'nature', 110, 0.15, 2, 'shelf', 'Totally normal fungi. Just glows.', 'Glows'),
  d('ant_farm', 'Ant Farm', '🐜', 'nature', 35, 0.1, 1, 'desk', 'Tiny workers. Zero wages. Hmm.'),

  // Absurd Luxuries
  d('gold_toilet', 'Solid Gold Toilet', '🚽', 'luxury', 2_000_000, 3, 1, 'floor', "It's not plumbed in. That's not the point."),
  d('diamond_weight', 'Diamond Paperweight', '💎', 'luxury', 250_000, 1.4, 1, 'desk', 'Holds down papers worth less than it.'),
  d('caviar_tin', 'Empty Caviar Tin', '🥫', 'luxury', 12_000, 0.5, 1, 'desk', 'Ate it all. Kept the tin for the flex.'),
  d('gold_bars', 'Gold Bar Stack', '🧈', 'luxury', 80_000, 0.9, 1, 'floor', 'Load-bearing wealth.'),
  d('juice_tower', 'Fancy Grape Juice Tower', '🥂', 'luxury', 25_000, 0.6, 1, 'desk', 'Glasses of very fancy grape juice. Wobbly.'),
  d('velvet_throne', 'Velvet Gaming Throne', '👑', 'luxury', 500_000, 1.8, 1, 'floor', 'Too fancy to sit in. Dust it hourly.'),
  d('abstract_statue', 'Abstract Marble Sculpture', '🗿', 'luxury', 150_000, 1.1, 1, 'floor', "Experts call it 'Yes'."),
  d('money_plant', 'Money Plant (Literal)', '💸', 'luxury', 40_000, 0.7, 1, 'floor', "Bills on branches. Doesn't grow money. Yet.", 'Sways'),
  d('indoor_jetski', 'Indoor Jet Ski', '🚤', 'luxury', 750_000, 2, 1, 'floor', 'No water. Pure confidence.'),
  d('personal_atm', 'Personal ATM', '🏧', 'luxury', 30_000, 0.6, 1, 'floor', 'Dispenses nothing. Accepts everything.', 'Glows'),

  // Seasonal
  d('pumpkin', "Jack-o'-Lantern", '🎃', 'seasonal', 30, 0.1, 3, 'floor', 'Grins all year round.', 'Flickers'),
  d('tiny_tree', 'Tiny Festive Tree', '🎄', 'seasonal', 70, 0.15, 1, 'desk', 'Twinkles. Smells like plastic.', 'Twinkles'),
  d('foam_snowman', 'Foam Snowman', '⛄', 'seasonal', 45, 0.1, 1, 'floor', 'Never melts. Never leaves.'),
  d('spotted_egg', 'Giant Spotted Egg', '🥚', 'seasonal', 35, 0.1, 2, 'floor', 'Something is inside. It is waiting.', 'Wobbles'),
  d('heart_balloon', 'Heart Balloon', '🎈', 'seasonal', 12, 0.1, 4, 'floor', 'Floats to the ceiling. Peak romance.', 'Floats'),
  d('popper_crate', 'Party Popper Crate', '🎆', 'seasonal', 55, 0.15, 1, 'floor', 'Not explosive. Legally.'),
  d('party_hats', 'Party Hat Pyramid', '🥳', 'seasonal', 10, 0.1, 3, 'desk', 'Every day is somebody’s birthday.'),
  d('plastic_roast', 'Plastic Roast Dinner', '🍗', 'seasonal', 40, 0.1, 1, 'desk', 'A feast every day. Inedible.'),
  d('cauldron', 'Bubbling Cauldron', '🧪', 'seasonal', 95, 0.15, 1, 'floor', 'Brewing something. Mostly vibes.', 'Bubbles'),
  d('creepy_doll', 'Porcelain Doll', '🪆', 'seasonal', 66, 0.15, 1, 'shelf', 'Was on the shelf. Is now somewhere else.', 'Haunted'),
];

export const decorById = (id: string): DecorDef | undefined => DECOR.find((x) => x.id === id);

export const DECOR_PREFIX = 'decor:';
export const decorItemId = (id: string) => `jm_${id}`;

/** Junk Mart stock as regular shop items. */
export const DECOR_ITEMS: ItemDef[] = DECOR.map((x) => ({
  id: decorItemId(x.id),
  name: x.name,
  desc: x.desc,
  icon: x.icon,
  category: 'decor',
  baseCost: x.price,
  growth: x.max > 1 ? 1.6 : 1,
  max: x.max,
  mods: [{ stat: 'vibe', op: 'add', value: x.vibe }],
  prop: `${DECOR_PREFIX}${x.id}`,
  phase: 'bedroom',
}));

/** Total vibe if every decor item were maxed out. */
export const maxDecorVibe = (): number => DECOR.reduce((a, x) => a + x.vibe * x.max, 0);

/** Deterministic "deal of the day": one item at 20% off, changes every calendar day. */
export function dailyDeal(now = Date.now()): { id: string; discount: number } {
  const day = Math.floor(now / 86_400_000);
  // xorshift-ish hash so neighbouring days pick unrelated items
  let h = (day * 2654435761) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  const pool = DECOR.filter((x) => x.price < 1_000_000);
  return { id: pool[h % pool.length]!.id, discount: 0.2 };
}
