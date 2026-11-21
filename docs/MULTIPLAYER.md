# Multiplayer: invite friends into your room

Tycoon Master 3000 has **drop-in co-op**: you open your room, friends visit it,
walk around, shove your furniture, grab your coins (for you!) and play your
mini-tycoons on your screens with you. There is **no game server**: players'
browsers connect directly to each other.

## How to host (you)

1. Click **👥 Multiplayer** (bottom right).
2. Type your name and pick a hoodie color.
3. Click **🏠 Host a room**. You get a 6-character **room code** (like `K7XQ2M`)
   and an **invite link**. Click **Copy link**.
4. Send the link to your friends (chat, email, text...).
5. **Keep the game tab open and visible** while friends are over: your
   computer runs the room for everyone. Click **Close room** when you're done.

Up to **8 players** (you + 7 friends). Untick **"Guests can use my screens"**
if you only want visitors to watch (they can then see your screens but not click
on them — useful if you don't want anyone spending your cash).

You can also find all of this in the in-game PC: the **🌐 NetPlay** app.

## How to join (your friends)

- **Just open the link.** That's it: no account, no install, no download. It
  works on any computer with a modern browser (Chrome, Edge, Firefox, Safari).
- Or open the game, click **👥 Multiplayer**, type the room code and click **Join**.
- Connecting can take **10–30 seconds** the first time.
- While visiting, your **own save is not loaded and not changed**. Click
  **← Back to my room** (top of the screen) to go home.

## What you can do together

| | |
|---|---|
| Walk around | Everyone sees everyone (colored hoodie + name tag). |
| Shove stuff | Walk into furniture, boxes, ducks... it moves for everyone. |
| Coins | Coins a visitor picks up go into the **host's wallet**. The host sees "Alex picked up $12"; visitors get a 🪙 "helped" counter in the player list. |
| Play screens | Walk up to any monitor and press **E** (or click it). Visitors get their own cursor and windows on the host's computer and play the host's games co-op. |
| Chat | Press **Enter**, type, **Enter** to send (Esc cancels). The last 6 messages fade out. |
| Emotes | **1** wave, **2** dance, **3** flop. |
| Kick | The host can remove someone from the player list. |

## Limitations (honest list)

- **The host's tab must stay open.** If the host closes or reloads the game,
  the room ends. If the host's tab is in the background for a while, visitors
  see the room freeze (browsers pause hidden tabs) and it catches up when the
  host comes back.
- **Some networks block direct connections.** Peer-to-peer usually works at
  home and on phones, but very strict networks (some offices, schools, hotels,
  some mobile carriers) can prevent two browsers from connecting. Without a
  relay ("TURN") server there's nothing the game can do about that; try another
  network (e.g. a phone hotspot). See "Adding a TURN server" below.
- **Matchmaking uses public servers.** To *find* each other, browsers briefly
  exchange connection info through free public Nostr relays and BitTorrent
  trackers (both are tried at once). If they're all down, joining fails; try
  again later. After that, game data flows directly between players.
- **Both players need the same game version.** If someone gets a "different
  versions" message, both of you reload the page.
- Visitors watch the host's screens as a small video-like stream, so text is a
  bit blurrier than on your own PC.

## Privacy

- Like any peer-to-peer game or video call, **players in a room can see each
  other's IP address** (that's how direct connections work). Only invite people
  you know.
- The room code is also the password: signaling messages are encrypted with it,
  so people who don't have the link can't see or join the room.
- Nothing is stored on any server. Names, colors and chat exist only in the
  players' browsers and disappear when the room closes.

## Adding a TURN server later (optional, for strict networks)

A TURN server relays traffic for players who can't connect directly. It costs
money/bandwidth, which is why the game doesn't ship with one. If you get one
(e.g. from a hosted TURN provider, or your own `coturn`), build the game with:

```bash
VITE_TURN_URL="turn:turn.example.com:3478,turns:turn.example.com:5349" \
VITE_TURN_USER="username" \
VITE_TURN_PASS="password" \
npm run build
```

For the GitHub Pages deploy, add those three as repository **Variables/Secrets**
and pass them as environment variables to the build step of the workflow. Note
that anything baked into a static website is visible to players, so use TURN
credentials that are limited to your game (most providers offer this).

## For developers

- Code lives in `src/net/` (transport, protocol, replication, session) plus
  `src/world/remote.ts` (other players' avatars) and `src/ui/Multiplayer.svelte`.
- **Model:** host-authoritative "visit". The host simulates everything and
  streams: a save-format game state snapshot (2 Hz + on purchases), quantized
  body transforms (12 Hz deltas, keyframes every 2 s, 20 bytes/body), player
  poses (15 Hz), and JPEG frames of a screen only to the visitor using it
  (4 fps). Guests build a read-only copy of the room, pin every host-owned body
  as kinematic, interpolate 120 ms in the past, and send only inputs (pose,
  chat, screen clicks). Every guest message is validated, clamped and
  rate-limited on the host (see `src/net/protocol.ts`).
- **Transports:** `?net=local` uses `BroadcastChannel` between tabs of the same
  browser (no network needed; used by the automated tests). Default is
  WebRTC via [Trystero](https://github.com/dmotz/trystero) with Nostr +
  BitTorrent signaling together; `?net=nostr` or `?net=torrent` forces one.
- Tuning knobs (rates, limits, max players) are in `src/net/config.ts`.
- Tests: `tests/unit/net.test.ts` (codec, validation, interpolation) and
  `tests/e2e/multiplayer.spec.ts` (two tabs: host, join by code, snapshot,
  avatars, item purchase sync, chat).
- Try it locally: `npm run dev`, open `http://localhost:5173/?net=local`, host a
  room, then open the invite link in a second tab of the same browser.
