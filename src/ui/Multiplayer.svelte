<script lang="ts">
  import { onMount } from 'svelte';
  import { PLAYER_COLORS } from '@/net/config';
  import { normalizeRoomCode } from '@/net/protocol';
  import { loadProfile } from '@/net/profile';
  import { netActions as act, netInfo, setProfile } from '@/net/state';

  /** HUD for multiplayer: the 👥 panel, the visitor banner, chat and emote hints. */
  let { open = $bindable(false) }: { open?: boolean } = $props();

  let info = $state(snapshot());
  let profile = $state(loadProfile());
  let joinCode = $state('');
  let joinErr = $state('');
  let copied = $state(false);
  let chatOpen = $state(false);
  let chatText = $state('');
  let nowMs = $state(Date.now());
  let chatInput: HTMLInputElement | undefined = $state();

  function snapshot() {
    const n = netInfo;
    return { ...n, players: [...n.players], chat: [...n.chat] };
  }

  const connected = $derived(info.mode === 'hosting' || info.mode === 'guest' || info.mode === 'lost');
  const isGuest = $derived(info.mode === 'guest' || info.mode === 'lost' || info.mode === 'ended');
  const recent = $derived(info.chat.slice(-6).filter((c) => chatOpen || nowMs - c.at < 12_000));

  onMount(() => {
    let rev = -1;
    const iv = setInterval(() => {
      nowMs = Date.now();
      if (netInfo.rev !== rev) {
        rev = netInfo.rev;
        info = snapshot();
      }
    }, 200);
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Enter' && connected) {
        e.preventDefault();
        chatOpen = true;
        setTimeout(() => chatInput?.focus(), 0);
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      clearInterval(iv);
      window.removeEventListener('keydown', key);
    };
  });

  function saveProfile() {
    profile = setProfile(profile);
  }

  function join() {
    const c = normalizeRoomCode(joinCode);
    if (!c) {
      joinErr = 'Codes are 6 letters/numbers, like K7XQ2M.';
      return;
    }
    saveProfile();
    act.joinByCode(c);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(info.link);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      copied = false;
    }
  }

  function chatKey(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.code === 'Enter') {
      if (chatText.trim()) act.sendChat(chatText);
      chatText = '';
      chatOpen = false;
      chatInput?.blur();
    } else if (e.code === 'Escape') {
      chatText = '';
      chatOpen = false;
      chatInput?.blur();
    }
  }
</script>

{#if isGuest}
  <div class="banner" data-testid="visit-banner">
    {#if info.mode === 'ended'}
      <span>🚪 {info.status || 'The visit is over.'}</span>
    {:else if info.mode === 'lost'}
      <span>📡 {info.status}</span>
    {:else}
      <span>🏠 Visiting <b>{info.hostName}</b>'s room{info.control ? '' : ' · screens are view-only'}</span>
    {/if}
    <button onclick={() => act.leaveRoom()} data-testid="leave-room">← Back to my room</button>
  </div>
{/if}

{#if open}
  <div class="panel mp" data-testid="mp-panel">
    <div class="head">
      <h3>👥 Multiplayer</h3>
      <button class="x" onclick={() => (open = false)} aria-label="Close">✕</button>
    </div>

    <div class="me">
      <input
        class="name"
        maxlength="16"
        bind:value={profile.name}
        onchange={saveProfile}
        onkeydown={(e) => e.stopPropagation()}
        aria-label="Your name"
        data-testid="mp-name"
      />
      <div class="colors">
        {#each PLAYER_COLORS as c (c)}
          <button
            class="swatch"
            class:on={profile.color === c}
            style:background={c}
            aria-label={`Hoodie color ${c}`}
            onclick={() => {
              profile.color = c;
              saveProfile();
            }}
          ></button>
        {/each}
      </div>
    </div>

    {#if info.mode === 'off'}
      <p class="small">Invite friends into your room. They just open a link — no account, no install.</p>
      <button class="primary wide" onclick={() => act.startHosting()} data-testid="mp-host">
        🏠 Host a room
      </button>
      <div class="or">or visit a friend</div>
      <div class="row">
        <input
          class="code"
          placeholder="ROOM CODE"
          maxlength="9"
          bind:value={joinCode}
          onkeydown={(e) => {
            e.stopPropagation();
            if (e.code === 'Enter') join();
          }}
          data-testid="mp-code-input"
        />
        <button onclick={join} data-testid="mp-join">Join</button>
      </div>
      {#if joinErr}<p class="err">{joinErr}</p>{/if}
      {#if info.status}<p class="err">{info.status}</p>{/if}
    {:else if info.mode === 'hosting'}
      <div class="code-big" data-testid="mp-code">{info.code}</div>
      <div class="row">
        <input
          class="link"
          readonly
          value={info.link}
          data-testid="mp-link"
          onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
        />
        <button class="primary" onclick={copy}>{copied ? 'Copied!' : 'Copy link'}</button>
      </div>
      {#if info.status}<p class="small">{info.status}</p>{/if}
      <label class="check">
        <input
          type="checkbox"
          checked={info.control}
          onchange={(e) => act.setControl((e.currentTarget as HTMLInputElement).checked)}
        />
        Guests can use my screens (and spend my cash)
      </label>
    {/if}

    {#if connected || info.mode === 'ended'}
      <h4>Players ({info.players.length}/8)</h4>
      <ul class="players" data-testid="mp-players">
        {#each info.players as p (p.id)}
          <li>
            <span class="dot" style:background={p.color}></span>
            <span class="pname">{p.name}{p.host ? ' 👑' : ''}{p.id === info.you ? ' (you)' : ''}</span>
            {#if p.helped}<span class="helped" title="Cash picked up for the host">🪙 {p.helped}</span>{/if}
            <span class="ping">{p.host && info.mode === 'hosting' ? 'host' : `${p.ping} ms`}</span>
            {#if info.mode === 'hosting' && !p.host}
              <button class="kick" onclick={() => act.kick(p.id)} title="Remove from room">Kick</button>
            {/if}
          </li>
        {/each}
      </ul>
      <p class="small">Enter: chat · 1 wave · 2 dance · 3 flop</p>
      {#if info.mode === 'hosting'}
        <button class="danger wide" onclick={() => act.stopHosting()} data-testid="mp-stop">
          Close room
        </button>
      {/if}
    {/if}
  </div>
{/if}

{#if connected || info.chat.length}
  <div class="chat" class:open={chatOpen} data-testid="chat">
    {#each recent as c (c.id)}
      <div class="line" class:sys={c.sys} class:fade={!chatOpen && nowMs - c.at > 9000}>
        {#if c.sys}<i>{c.text}</i>{:else}<b style:color={c.color}>{c.name}:</b> {c.text}{/if}
      </div>
    {/each}
    {#if chatOpen}
      <input
        bind:this={chatInput}
        bind:value={chatText}
        maxlength="140"
        placeholder="Say something… (Enter to send, Esc to cancel)"
        onkeydown={chatKey}
        onblur={() => (chatOpen = false)}
        data-testid="chat-input"
      />
    {/if}
  </div>
{/if}

<style>
  .panel {
    background: rgba(12, 14, 20, 0.88);
    backdrop-filter: blur(6px);
    color: #fff;
    border-radius: 12px;
    padding: 12px 16px;
    border: 1px solid #ffffff22;
  }
  .mp {
    position: fixed;
    right: 16px;
    bottom: 70px;
    width: min(340px, calc(100vw - 32px));
    max-height: calc(100vh - 100px);
    overflow: auto;
    z-index: 30;
    pointer-events: auto;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h3 {
    margin: 0;
  }
  h4 {
    margin: 12px 0 4px;
  }
  button {
    font: inherit;
    font-weight: 700;
    padding: 7px 12px;
    border-radius: 9px;
    border: 1px solid #ffffff33;
    background: rgba(40, 44, 60, 0.9);
    color: #fff;
    cursor: pointer;
  }
  .x {
    padding: 2px 8px;
  }
  .primary {
    background: #2563eb;
    border-color: #2563eb;
  }
  .danger {
    background: #8a1c1c;
    border-color: #8a1c1c;
  }
  .wide {
    width: 100%;
    margin-top: 8px;
  }
  input {
    font: inherit;
    background: #0b0c10;
    color: #fff;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 7px 9px;
    min-width: 0;
  }
  .me {
    margin: 10px 0;
  }
  .name {
    width: 100%;
    box-sizing: border-box;
  }
  .colors {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 6px;
  }
  .swatch {
    width: 22px;
    height: 22px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid #0006;
  }
  .swatch.on {
    border-color: #fff;
    transform: scale(1.15);
  }
  .row {
    display: flex;
    gap: 6px;
    margin-top: 6px;
  }
  .row input {
    flex: 1;
  }
  .code {
    text-transform: uppercase;
    letter-spacing: 2px;
  }
  .code-big {
    font-size: 34px;
    font-weight: 800;
    letter-spacing: 6px;
    text-align: center;
    color: #f6c537;
    margin: 6px 0;
  }
  .link {
    font-size: 12px;
  }
  .or {
    text-align: center;
    opacity: 0.6;
    margin: 10px 0 2px;
    font-size: 13px;
  }
  .small {
    font-size: 12px;
    opacity: 0.75;
    margin: 6px 0;
  }
  .err {
    color: #ff9c9c;
    font-size: 13px;
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 13px;
    margin-top: 8px;
  }
  .players {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .players li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-size: 14px;
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex: none;
  }
  .pname {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .helped {
    color: #ffd24a;
    font-size: 12px;
  }
  .ping {
    opacity: 0.6;
    font-size: 12px;
  }
  .kick {
    padding: 2px 8px;
    font-size: 12px;
  }
  .banner {
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 12px;
    align-items: center;
    background: rgba(37, 99, 235, 0.92);
    color: #fff;
    padding: 6px 8px 6px 16px;
    border-radius: 24px;
    z-index: 30;
    pointer-events: auto;
    max-width: calc(100vw - 32px);
  }
  .banner button {
    padding: 4px 12px;
    border-radius: 16px;
  }
  .chat {
    position: fixed;
    left: 14px;
    bottom: 64px;
    width: min(420px, calc(100vw - 28px));
    display: flex;
    flex-direction: column;
    gap: 3px;
    pointer-events: none;
    z-index: 25;
  }
  .chat.open {
    pointer-events: auto;
  }
  .line {
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    padding: 4px 10px;
    border-radius: 10px;
    font-size: 14px;
    width: fit-content;
    max-width: 100%;
    overflow-wrap: anywhere;
    transition: opacity 3s;
  }
  .line.sys {
    color: #cfe4ff;
  }
  .line.fade {
    opacity: 0;
  }
  .chat input {
    pointer-events: auto;
  }
</style>
