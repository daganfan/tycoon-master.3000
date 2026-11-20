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

export function themeFor(tier: number, skinTheme?: string): OsTheme {
  if (skinTheme === 'vaporwave') return TVAPOR;
  return tier >= 1 ? TXP : T95;
}
