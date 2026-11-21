import { PLAYER_COLORS } from './config';
import { cleanColor, cleanName } from './protocol';

/** The player's multiplayer name + hoodie color, remembered in localStorage. */
export interface Profile {
  name: string;
  color: string;
}

const KEY = 'tm3000.profile';

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Profile>;
      return { name: cleanName(p.name), color: cleanColor(p.color) };
    }
  } catch {
    /* storage blocked */
  }
  const n = Math.floor(Math.random() * 900 + 100);
  return { name: `Mogul ${n}`, color: PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]! };
}

export function saveProfile(p: Profile): Profile {
  const clean = { name: cleanName(p.name), color: cleanColor(p.color) };
  try {
    localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    /* storage blocked */
  }
  return clean;
}
