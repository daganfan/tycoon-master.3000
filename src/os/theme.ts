export interface OsTheme {
  name: string;
  font: string;
  bevel: boolean;
  radius: number;
  desktop: [string, string];
  window: string;
  titlebar: [string, string];
  titleText: string;
  text: string;
  muted: string;
  button: string;
  buttonHover: string;
  buttonText: string;
  accent: string;
  good: string;
  bad: string;
  taskbar: string;
  panel: string;
}

const T95: OsTheme = {
  name: 'TycoonOS 95', font: 'Tahoma, Verdana, sans-serif', bevel: true, radius: 0,
  desktop: ['#0a7f7f', '#087070'], window: '#c3c3c3', titlebar: ['#000a7a', '#1084d0'], titleText: '#fff',
  text: '#111', muted: '#555', button: '#c3c3c3', buttonHover: '#d6d6d6', buttonText: '#111', accent: '#000a7a',
  good: '#0a7a1f', bad: '#a01010', taskbar: '#c3c3c3', panel: '#dcdcdc',
};

const TXP: OsTheme = {
  name: 'TycoonOS XP', font: '"Trebuchet MS", "Segoe UI", sans-serif', bevel: false, radius: 8,
  desktop: ['#3a8dde', '#6fc04a'], window: '#ece9d8', titlebar: ['#0a54e3', '#3d95ff'], titleText: '#fff',
  text: '#111', muted: '#555', button: '#f4f3ee', buttonHover: '#fff8d6', buttonText: '#111', accent: '#0a54e3',
  good: '#2e8b22', bad: '#c42b1c', taskbar: '#245edb', panel: '#fbfaf5',
};

const TVAPOR: OsTheme = {
  name: 'TycoonOS ＶＡＰＯＲ', font: '"Courier New", monospace', bevel: false, radius: 4,
  desktop: ['#ff71ce', '#01cdfe'], window: '#2b1640', titlebar: ['#b967ff', '#ff71ce'], titleText: '#fff',
  text: '#f6e8ff', muted: '#c9a6e8', button: '#4a2670', buttonHover: '#6a3a9a', buttonText: '#fff', accent: '#05ffa1',
  good: '#05ffa1', bad: '#ff5277', taskbar: '#1a0d29', panel: '#3a1f57',
};

const TTERM: OsTheme = {
  name: 'TycoonOS //TERMINAL', font: '"Courier New", monospace', bevel: false, radius: 0,
  desktop: ['#020a02', '#041a06'], window: '#050d05', titlebar: ['#0b3d10', '#0f5c18'], titleText: '#5dff6a',
  text: '#5dff6a', muted: '#2fa83a', button: '#0b220d', buttonHover: '#123a16', buttonText: '#5dff6a', accent: '#1f9e2c',
  good: '#8dff7a', bad: '#ff5a5a', taskbar: '#031003', panel: '#071a08',
};

const TCANDY: OsTheme = {
  name: 'TycoonOS Candy', font: '"Trebuchet MS", "Segoe UI", sans-serif', bevel: false, radius: 14,
  desktop: ['#ffd1e8', '#c9f0ff'], window: '#fff6fb', titlebar: ['#ff8fc7', '#ffb86b'], titleText: '#fff',
  text: '#5a2a4a', muted: '#a0729a', button: '#ffe3f1', buttonHover: '#fff0c9', buttonText: '#5a2a4a', accent: '#ff5fa8',
  good: '#2ab07a', bad: '#e0404a', taskbar: '#ff8fc7', panel: '#fffafd',
};

const TMID: OsTheme = {
  name: 'TycoonOS Midnight', font: '"Segoe UI", Roboto, sans-serif', bevel: false, radius: 6,
  desktop: ['#0b1020', '#1b2340'], window: '#151a2b', titlebar: ['#1f2742', '#2b3560'], titleText: '#e6ecff',
  text: '#e6ecff', muted: '#8e9ac0', button: '#232b47', buttonHover: '#2e3860', buttonText: '#e6ecff', accent: '#6b8cff',
  good: '#4ade80', bad: '#f87171', taskbar: '#0e1324', panel: '#1b2135',
};

const TPAPER: OsTheme = {
  name: 'TycoonOS Sketch', font: '"Comic Sans MS", "Chalkboard SE", cursive', bevel: false, radius: 2,
  desktop: ['#f4f1e6', '#e9e4d2'], window: '#fbf9f1', titlebar: ['#d8d2bd', '#cfc8ae'], titleText: '#2b2b2b',
  text: '#2b2b2b', muted: '#7a7466', button: '#fffdf5', buttonHover: '#f1ecd8', buttonText: '#2b2b2b', accent: '#3a5bd9',
  good: '#2e7d32', bad: '#c62828', taskbar: '#e2dcc6', panel: '#fffef8',
};

const TGOLD: OsTheme = {
  name: 'TycoonOS Black Card', font: 'Georgia, "Times New Roman", serif', bevel: false, radius: 4,
  desktop: ['#0c0c0c', '#2a2213'], window: '#141414', titlebar: ['#3a2e12', '#b8902c'], titleText: '#ffe9a8',
  text: '#f6e7bd', muted: '#b39b60', button: '#221d12', buttonHover: '#33291a', buttonText: '#ffe9a8', accent: '#c9a040',
  good: '#9be08a', bad: '#ff7a6a', taskbar: '#0a0a0a', panel: '#1b1810',
};

const TGLITCH: OsTheme = {
  name: 'T̷y̵c̶o̸o̵n̷O̶S̸', font: '"Courier New", monospace', bevel: true, radius: 0,
  desktop: ['#ff00ff', '#00ffcc'], window: '#101010', titlebar: ['#00ffcc', '#ff00ff'], titleText: '#000',
  text: '#e8ffef', muted: '#ff7ae6', button: '#2a002a', buttonHover: '#003a33', buttonText: '#00ffcc', accent: '#ff00aa',
  good: '#00ff88', bad: '#ff3355', taskbar: '#000000', panel: '#1a001a',
};

const SKIN_THEMES: Record<string, OsTheme> = { vaporwave: TVAPOR, terminal: TTERM, candy: TCANDY, midnight: TMID, paper: TPAPER, gold: TGOLD, glitch: TGLITCH };
export const SKIN_THEME_IDS = Object.keys(SKIN_THEMES);

export function themeFor(tier: number, skinTheme?: string): OsTheme {
  if (skinTheme && SKIN_THEMES[skinTheme]) return SKIN_THEMES[skinTheme];
  return tier >= 1 ? TXP : T95;
}
