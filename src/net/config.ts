/**
 * Multiplayer tuning knobs. Everything network-related that the owner might
 * want to tweak lives here (see docs/MULTIPLAYER.md).
 */

/** Bump when the wire format changes; peers with a different value are turned away. */
export const PROTOCOL = 1;
/** Globally unique namespace for signaling (rooms of other apps never collide with ours). */
export const APP_ID = 'tycoon-master-3000.github.io/v1';
/** Host + guests. */
export const MAX_PLAYERS = 8;

/** Rates (Hz). */
export const BODY_HZ = 12;
export const POSE_HZ = 15;
export const STATE_HZ = 2;
export const ROSTER_HZ = 1;
export const SCREEN_FPS = 4;
/** Full keyframe of every body this often (seconds) so late joiners / lost packets heal. */
export const KEYFRAME_EVERY = 2;
/** Max changed bodies per delta packet (the rest wait for the next one, biggest movers first). */
export const BODY_BUDGET = 220;
/** Render remote things this far in the past (s) so there are usually two samples to blend. */
export const INTERP_DELAY = 0.12;

/** Hard limits on anything a peer sends us. */
export const MAX_MESSAGE_CHARS = 512 * 1024;
export const MAX_CHAT = 140;
export const MAX_NAME = 16;

/** Seconds of silence before a guest is dropped / a guest thinks the host is gone. */
export const GUEST_TIMEOUT = 15;
export const HOST_SILENCE = 8;
/** Seconds a guest waits for the host before giving up on joining. */
export const JOIN_TIMEOUT = 45;

/** Screen stream: width of the JPEG frames sent to guests that are using a screen. */
export const SCREEN_FRAME_W = 640;
export const SCREEN_FRAME_Q = 0.6;

/** Fastest a guest's body may move (m/s) before the host clamps it (anti-teleport). */
export const MAX_GUEST_SPEED = 12;
/** Anything a guest claims outside this box is clamped (m). Generous so new areas still work. */
export const WORLD_BOUNDS = { x: 30, yMin: -1, yMax: 12, z: 30 };

/** Hoodie colors offered in the color picker. */
export const PLAYER_COLORS = [
  '#e94b4b',
  '#f39c12',
  '#f1c40f',
  '#2ecc71',
  '#1abc9c',
  '#3498db',
  '#9b59b6',
  '#ff6fb5',
  '#ecf0f1',
  '#34495e',
];

/**
 * Signaling strategies for real (internet) play, used together. Nostr relays are
 * the default; BitTorrent trackers are a second, independent path.
 */
export type Strategy = 'nostr' | 'torrent';
export const STRATEGIES: Strategy[] = ['nostr', 'torrent'];

/**
 * Optional TURN relay for players behind strict NATs / corporate firewalls.
 * Empty by default (there are no servers). Set VITE_TURN_URL, VITE_TURN_USER and
 * VITE_TURN_PASS at build time to add one (see docs/MULTIPLAYER.md).
 */
export function turnServers(): RTCIceServer[] {
  // Written out literally so Vite can inline the values at build time.
  const url = import.meta.env?.VITE_TURN_URL as string | undefined;
  if (!url) return [];
  return [
    {
      urls: url.split(',').map((u) => u.trim()),
      username: import.meta.env.VITE_TURN_USER as string | undefined,
      credential: import.meta.env.VITE_TURN_PASS as string | undefined,
    },
  ];
}
