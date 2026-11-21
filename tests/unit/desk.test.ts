import { describe, expect, it } from 'vitest';
import { Game } from '@/sim/game';
import { createInitialState } from '@/sim/state';
import { num } from '@/core/num';
import { deserialize, serialize } from '@/sim/save';

const fresh = () => {
  const g = new Game(createInitialState(1, 0));
  g.setFlag('booted');
  g.state.cash = num(1e9);
  return g;
};

const earns = (g: Game, id: string): boolean => {
  const rt = g.state.tycoons[id]!;
  rt.upgrades = { ...rt.upgrades, stand: 3, mold: 5, dryer: 3 };
  const before = rt.lifetime;
  for (let i = 0; i < 300; i++) g.tick(0.1);
  return rt.lifetime > before;
};

describe('Games only run while open on a screen', () => {
  it('a closed game stops earning; reopening it resumes', () => {
    const g = fresh();
    expect(earns(g, 'lemon_mogul')).toBe(true);
    const notes: string[] = [];
    g.bus.on('notify', (n) => notes.push(n.text));
    g.closeApp('main', 'lemon_mogul');
    expect(g.isRunning('lemon_mogul')).toBe(false);
    expect(notes.some((n) => n.includes('Lemon Mogul paused'))).toBe(true);
    expect(earns(g, 'lemon_mogul')).toBe(false);
    g.openApp('main', 'lemon_mogul');
    expect(earns(g, 'lemon_mogul')).toBe(true);
  });

  it('the duck runs when it is the only open game (no phantom slot)', () => {
    const g = fresh();
    g.unlockTycoon('rubber_duck_works');
    g.closeApp('main', 'lemon_mogul');
    expect(g.planOpen('main', 'rubber_duck_works').pauses).toEqual([]);
    g.openApp('main', 'rubber_duck_works');
    expect(g.running().map((r) => r.id)).toEqual(['rubber_duck_works']);
  });

  it('opening a game on a full screen pushes the old one out (paused without a background slot)', () => {
    const g = fresh();
    g.unlockTycoon('rubber_duck_works');
    expect(g.planOpen('main', 'rubber_duck_works')).toEqual({ evict: 'lemon_mogul', pauses: ['lemon_mogul'] });
    g.openApp('main', 'rubber_duck_works');
    expect(g.isRunning('lemon_mogul')).toBe(false);
    expect(g.whereIs('lemon_mogul')).toEqual({ minimized: true, running: false });
    // A Refurbished PC adds a background slot: the minimized game resumes.
    g.buyItem('refurb_pc');
    expect(g.isRunning('lemon_mogul')).toBe(true);
  });

  it('a utility app pushes the game out on TycoonOS 95; closing it brings the game back', () => {
    const g = fresh();
    g.openApp('main', 'ebuy');
    expect(g.windowsOn('main')).toEqual(['ebuy']);
    expect(g.isRunning('lemon_mogul')).toBe(false);
    g.closeApp('main', 'ebuy');
    expect(g.windowsOn('main')).toEqual(['lemon_mogul']);
    expect(g.isRunning('lemon_mogul')).toBe(true);
  });

  it('minimizing keeps a game running only with a free background slot', () => {
    const g = fresh();
    g.minimizeApp('main', 'lemon_mogul');
    expect(g.isRunning('lemon_mogul')).toBe(false);
    g.buyItem('power_strip');
    expect(g.slots()).toBe(1);
    expect(g.isRunning('lemon_mogul')).toBe(true);
    expect(g.whereIs('lemon_mogul')).toEqual({ minimized: true, running: true });
  });

  it('TycoonOS XP shows 2 windows per screen; monitors add screens', () => {
    const g = fresh();
    g.unlockTycoon('rubber_duck_works');
    g.unlockTycoon('sock_syndicate');
    g.buyItem('os_xp');
    expect(g.windowsPerScreen()).toBe(2);
    expect(g.setRunning('rubber_duck_works', true)).toBe(true);
    expect(g.windowsOn('main')).toEqual(['lemon_mogul', 'rubber_duck_works']);
    expect(g.setRunning('sock_syndicate', true)).toBe(false);
    g.buyItem('used_monitor');
    expect(g.isRunning('sock_syndicate')).toBe(true);
    expect(g.capacity()).toBe(4);
    expect(g.running().length).toBeLessThanOrEqual(g.capacity());
  });

  it('a game moves between screens instead of running twice', () => {
    const g = fresh();
    g.buyItem('used_monitor');
    g.openApp('used_monitor#0', 'lemon_mogul');
    expect(g.windowsOn('main')).toEqual([]);
    expect(g.windowsOn('used_monitor#0')).toEqual(['lemon_mogul']);
    expect(g.whereIs('lemon_mogul')).toEqual({ screen: 'used_monitor#0' });
  });

  it('game actions only work on running games', () => {
    const g = fresh();
    expect(g.action('lemon_mogul', 'squeeze')).toBe(true);
    g.stopGame('lemon_mogul');
    expect(g.action('lemon_mogul', 'squeeze')).toBe(false);
  });
});

describe('Offline and saves with the desk', () => {
  it('only games running at save time earn offline', () => {
    const g = fresh();
    g.unlockTycoon('rubber_duck_works');
    g.state.tycoons.lemon_mogul!.upgrades = { stand: 5, sign: 3 };
    g.state.tycoons.rubber_duck_works!.upgrades = { mold: 5 };
    const back = new Game(deserialize(serialize(g.state)));
    back.applyOffline(3600);
    expect(back.state.tycoons.lemon_mogul!.money).toBeGreaterThan(0);
    expect(back.state.tycoons.rubber_duck_works!.lifetime).toBe(0);
  });

  it('migrates v3 saves: games that ran in a slot are laid out on screens', () => {
    const g = fresh();
    g.unlockTycoon('rubber_duck_works');
    g.unlockTycoon('sock_syndicate');
    g.state.items.used_monitor = 1;
    const raw = JSON.parse(serialize(g.state)) as Record<string, unknown> & { tycoons: Record<string, { installed: boolean }> };
    raw.version = 3;
    delete raw.desk;
    raw.tycoons.lemon_mogul!.installed = true;
    raw.tycoons.rubber_duck_works!.installed = true;
    raw.tycoons.sock_syndicate!.installed = true;
    const back = new Game(deserialize(JSON.stringify(raw)));
    expect(back.windowsOn('main')).toEqual(['lemon_mogul']);
    expect(back.windowsOn('used_monitor#0')).toEqual(['rubber_duck_works']);
    expect(back.state.desk.min).toEqual(['sock_syndicate']);
    expect(back.running().map((r) => r.id).sort()).toEqual(['lemon_mogul', 'rubber_duck_works']);
  });
});
