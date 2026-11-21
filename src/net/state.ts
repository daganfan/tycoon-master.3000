import { inviteLink, type Emote, type RosterEntry } from './protocol';
import { saveProfile, type Profile } from './profile';
import { transportKind } from './transport';

/**
 * Lightweight multiplayer state + actions shared by the HUD panel and the
 * NetPlay OS app. The heavy session code (three.js, physics) registers the real
 * implementations when it loads, so importing this costs almost nothing.
 */

export type NetMode = 'off' | 'hosting' | 'joining' | 'guest' | 'lost' | 'ended';

export interface ChatLine {
  id: number;
  name: string;
  color: string;
  text: string;
  sys: boolean;
  at: number;
}

/** Plain shared state; UIs poll it (cheaply, via `rev`). */
export const netInfo = {
  mode: 'off' as NetMode,
  kind: typeof location !== 'undefined' ? transportKind(location.search) : 'p2p',
  code: '',
  link: '',
  status: '',
  hostName: '',
  you: '',
  control: true,
  players: [] as RosterEntry[],
  chat: [] as ChatLine[],
  /** Increments on every change so pollers can skip work. */
  rev: 0,
};

let chatId = 0;

export function touch(): void {
  netInfo.rev++;
}

export function addChat(name: string, color: string, text: string, sys = false): void {
  netInfo.chat = [...netInfo.chat.slice(-29), { id: chatId++, name, color, text, sys, at: Date.now() }];
  touch();
}

/** This page without ?join (your own room). */
export function homeUrl(): string {
  const u = new URL(location.href);
  u.searchParams.delete('join');
  return u.toString();
}

/** What the UI can ask for. Session code replaces these once loaded. */
export const netActions = {
  startHosting: async (): Promise<void> => {},
  stopHosting: (): void => {},
  kick: (_id: string): void => {},
  setControl: (_on: boolean): void => {},
  sendChat: (_text: string): void => {},
  emote: (_e: Emote): void => {},
  /** Profile changes also need to reach a live session. */
  profileChanged: (_p: Profile): void => {},
  leaveRoom: (): void => {
    location.href = homeUrl();
  },
  joinByCode: (code: string): void => {
    location.href = inviteLink(location.href, code);
  },
};

export function setProfile(p: Profile): Profile {
  const clean = saveProfile(p);
  netActions.profileChanged(clean);
  return clean;
}
