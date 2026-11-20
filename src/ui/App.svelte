<script lang="ts">
  import { onMount } from 'svelte';
  import type { Game } from '@/sim/game';
  import { formatCash, formatNum } from '@/core/num';
  import SkillTree from './SkillTree.svelte';
  import { ui } from './store.svelte';

  let { game, onReset }: { game: Game; onReset: () => void } = $props();

  let hud = $state({ cash: '$0', floor: '', tokens: { grind: 0, mogul: 0, chaos: 0 }, quest: '', questTitle: '', exchange: '1.00' });
  let toasts = $state<{ id: number; text: string; tone: string }[]>([]);
  let nextId = 0;

  function toast(text: string, tone: string) {
    const id = nextId++;
    toasts = [...toasts.slice(-3), { id, text, tone }];
    setTimeout(() => (toasts = toasts.filter((t) => t.id !== id)), 3500);
  }

  onMount(() => {
    const offs = [
      game.bus.on('token', (e) => toast(`+${e.amount} ${e.token.toUpperCase()} token · ${e.reason}`, e.token)),
      game.bus.on('questDone', () => {}),
      game.bus.on('notify', (e) => {
        if (!ui.focused) toast(e.text, e.tone);
      }),
    ];
    const iv = setInterval(() => {
      const s = game.state;
      const q = game.activeQuest();
      hud = {
        cash: formatCash(s.cash),
        floor: s.floorCash.gt(0) ? formatCash(s.floorCash) : '',
        tokens: { grind: s.tokens.grind, mogul: s.tokens.mogul, chaos: s.tokens.chaos },
        quest: q?.text ?? 'All bedroom goals done! The Garage awaits…',
        questTitle: q?.title ?? '🎉 Bedroom complete',
        exchange: game.exchangeRate().toFixed(2),
      };
    }, 150);
    const key = (e: KeyboardEvent) => {
      if (e.code === 'KeyT' && !ui.tree && !ui.modal) ui.tree = true;
    };
    window.addEventListener('keydown', key);
    return () => {
      offs.forEach((o) => o());
      clearInterval(iv);
      window.removeEventListener('keydown', key);
    };
  });

  let importText = $state('');
  let copied = $state(false);
</script>

{#if ui.loading}
  <div class="loading">
    <div class="logo">🪙</div>
    <h1>TYCOON MASTER 3000</h1>
    <p>{ui.loading}</p>
  </div>
{/if}

{#if !ui.loading && !ui.focused}
  <div class="top-left panel" data-testid="hud-cash">
    <div class="cash">{hud.cash}</div>
    {#if hud.floor}<div class="floor">🪙 {hud.floor} on the floor — go pick it up!</div>{/if}
    <div class="tokens">
      <span title="Grind tokens (manual actions)">🟢 {formatNum(hud.tokens.grind)}</span>
      <span title="Mogul tokens (game levels)">🔵 {formatNum(hud.tokens.mogul)}</span>
      <span title="Chaos tokens (physics mayhem)">🟠 {formatNum(hud.tokens.chaos)}</span>
      <span class="dim" title="Exchange rate">💱 x{hud.exchange}</span>
    </div>
  </div>

  <div class="sticky" data-testid="quest">
    <strong>{hud.questTitle}</strong>
    <p>{hud.quest}</p>
  </div>
{/if}

{#if !ui.loading}

  <div class="hint">{ui.hint}</div>

  <div class="buttons">
    <button onclick={() => (ui.tree = true)}>🌳 Skills <kbd>T</kbd></button>
    {#if ui.focused}
      <button onclick={() => ui.unfocus?.()}>🚶 Step back <kbd>Esc</kbd></button>
    {:else}
      <button onclick={() => ui.focusMain?.()} data-testid="use-pc">🖥️ Use PC <kbd>E</kbd></button>
      <button onclick={() => ui.tidy?.()} data-testid="tidy" title="Put all furniture and props back in place">🧹 Tidy up</button>
    {/if}
  </div>

  <div class="toasts">
    {#each toasts as t (t.id)}
      <div class="toast {t.tone}">{t.text}</div>
    {/each}
  </div>
{/if}

{#if ui.tree}
  <SkillTree {game} onclose={() => (ui.tree = false)} />
{/if}

{#if ui.modal}
  <div class="backdrop">
    <div class="modal">
      {#if ui.modal.kind === 'offline'}
        <h2>☕ While you were away…</h2>
        <p>Your games kept running for <b>{ui.modal.time}</b> (at reduced speed).</p>
        {#if ui.modal.cash}<p>Auto cash-out dumped <b>{ui.modal.cash}</b> on the floor.</p>{:else}<p>Cash out in each game to collect your earnings.</p>{/if}
        <button class="primary" onclick={() => (ui.modal = null)}>Nice</button>
      {:else if ui.modal.kind === 'export'}
        <h2>📋 Export save</h2>
        <textarea readonly rows="6">{ui.modal.code}</textarea>
        <div class="row">
          <button
            class="primary"
            onclick={async () => {
              try {
                await navigator.clipboard.writeText(ui.modal?.kind === 'export' ? ui.modal.code : '');
                copied = true;
              } catch {
                copied = false;
              }
            }}>{copied ? 'Copied!' : 'Copy'}</button
          >
          <button onclick={() => ((ui.modal = null), (copied = false))}>Close</button>
        </div>
      {:else if ui.modal.kind === 'import'}
        <h2>📥 Import save</h2>
        <textarea rows="6" bind:value={importText} placeholder="Paste a save code"></textarea>
        {#if ui.modal.error}<p class="err">{ui.modal.error}</p>{/if}
        <div class="row">
          <button class="primary" onclick={() => ui.modal?.kind === 'import' && ui.modal.onImport(importText)}>Import</button>
          <button onclick={() => (ui.modal = null)}>Cancel</button>
        </div>
      {:else if ui.modal.kind === 'reset'}
        <h2>🗑️ Reset everything?</h2>
        <p>This deletes your save. There is no undo. Mom will be disappointed.</p>
        <div class="row">
          <button class="danger" onclick={onReset}>Yes, reset</button>
          <button onclick={() => (ui.modal = null)}>Cancel</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .panel {
    background: rgba(12, 14, 20, 0.72);
    backdrop-filter: blur(6px);
    color: #fff;
    border-radius: 12px;
    padding: 10px 16px;
    border: 1px solid #ffffff22;
  }
  .top-left {
    position: fixed;
    top: 14px;
    left: 14px;
    min-width: 220px;
  }
  .cash {
    font-size: 30px;
    font-weight: 800;
    letter-spacing: -0.5px;
  }
  .floor {
    color: #ffd24a;
    font-size: 13px;
    font-weight: 600;
    margin-top: 2px;
  }
  .tokens {
    display: flex;
    gap: 12px;
    margin-top: 6px;
    font-weight: 700;
  }
  .dim {
    opacity: 0.7;
  }
  .sticky {
    position: fixed;
    top: 18px;
    right: 18px;
    width: 250px;
    background: #fff59d;
    color: #333;
    padding: 12px 14px;
    transform: rotate(1.5deg);
    box-shadow: 0 6px 16px #0006;
    font-family: 'Comic Sans MS', 'Marker Felt', cursive;
  }
  .sticky p {
    margin: 6px 0 0;
    font-size: 14px;
  }
  .hint {
    position: fixed;
    bottom: 70px;
    left: 50%;
    transform: translateX(-50%);
    color: #fff;
    background: rgba(0, 0, 0, 0.55);
    padding: 8px 14px;
    border-radius: 20px;
    font-size: 14px;
    white-space: nowrap;
  }
  .buttons {
    position: fixed;
    bottom: 16px;
    right: 16px;
    display: flex;
    gap: 8px;
  }
  button {
    font: inherit;
    font-weight: 700;
    padding: 9px 14px;
    border-radius: 10px;
    border: 1px solid #ffffff33;
    background: rgba(12, 14, 20, 0.8);
    color: #fff;
    cursor: pointer;
    pointer-events: auto;
  }
  button:hover {
    background: rgba(40, 44, 60, 0.9);
  }
  kbd {
    font-size: 11px;
    opacity: 0.7;
    border: 1px solid #fff5;
    border-radius: 4px;
    padding: 0 4px;
  }
  .toasts {
    position: fixed;
    top: 120px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
  }
  .toast {
    background: #1c2a44ee;
    color: #fff;
    font-weight: 700;
    padding: 8px 16px;
    border-radius: 20px;
    animation: pop 0.25s ease-out;
  }
  .toast.chaos {
    background: #d9631eee;
  }
  .toast.grind {
    background: #1f9d55ee;
  }
  .toast.mogul {
    background: #2563ebee;
  }
  .toast.good {
    background: #1f7a35ee;
  }
  @keyframes pop {
    from {
      transform: scale(0.6);
      opacity: 0;
    }
  }
  .loading {
    position: fixed;
    inset: 0;
    background: #08090d;
    color: #fff;
    display: grid;
    place-content: center;
    text-align: center;
    pointer-events: auto;
  }
  .logo {
    font-size: 90px;
    animation: spin 1.6s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotateY(360deg);
    }
  }
  .backdrop {
    position: fixed;
    inset: 0;
    background: #0008;
    display: grid;
    place-content: center;
    pointer-events: auto;
    z-index: 40;
  }
  .modal {
    background: #15171f;
    color: #fff;
    border-radius: 14px;
    padding: 22px 26px;
    width: min(520px, 90vw);
    border: 1px solid #ffffff22;
  }
  .modal h2 {
    margin-top: 0;
  }
  textarea {
    width: 100%;
    font-family: monospace;
    font-size: 12px;
    background: #0b0c10;
    color: #9fe;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 8px;
    box-sizing: border-box;
  }
  .row {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }
  .primary {
    background: #2563eb;
    border-color: #2563eb;
  }
  .danger {
    background: #b91c1c;
    border-color: #b91c1c;
  }
  .err {
    color: #ff8080;
  }
</style>
