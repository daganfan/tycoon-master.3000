<script lang="ts">
  import { onMount } from 'svelte';
  import type { Game } from '@/sim/game';
  import { formatCash } from '@/core/num';
  import { drawTree, nodeAt, type TreeView } from './skillTreeRenderer';
  import type { SkillNodeDef } from '@/sim/types';

  let { game, onclose }: { game: Game; onclose: () => void } = $props();
  let canvas: HTMLCanvasElement;
  let tokens = $state({ grind: 0, mogul: 0, chaos: 0, pixel: 0, golden: 0 });
  let owned = $state(1);
  const view: TreeView = { x: 0, y: 40, zoom: 1 };
  let hover: SkillNodeDef | undefined;
  let drag: { x: number; y: number; moved: boolean } | null = null;

  onMount(() => {
    let raf = 0;
    const t0 = performance.now();
    const frame = () => {
      const dpr = Math.min(2, window.devicePixelRatio);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      const g = canvas.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawTree(g, w, h, game, view, hover, (performance.now() - t0) / 1000);
      tokens = { ...game.state.tokens };
      owned = game.state.nodes.length;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyT') {
        e.stopPropagation();
        onclose();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', key, true);
    };
  });

  function pos(e: PointerEvent | WheelEvent) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function down(e: PointerEvent) {
    drag = { x: e.clientX, y: e.clientY, moved: false };
    canvas.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    const p = pos(e);
    hover = nodeAt(view, canvas.clientWidth, canvas.clientHeight, p.x, p.y);
    canvas.style.cursor = hover ? 'pointer' : drag ? 'grabbing' : 'grab';
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (drag.moved) {
      view.x += dx / view.zoom;
      view.y += dy / view.zoom;
      drag.x = e.clientX;
      drag.y = e.clientY;
    }
  }
  function up() {
    if (drag && !drag.moved && hover) game.buyNode(hover.id);
    drag = null;
  }
  function wheel(e: WheelEvent) {
    e.preventDefault();
    view.zoom = Math.max(0.35, Math.min(2.5, view.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
  }
</script>

<div class="tree" role="dialog" aria-label="Skill tree">
  <canvas bind:this={canvas} onpointerdown={down} onpointermove={move} onpointerup={up} onwheel={wheel}></canvas>
  <header>
    <h2>🌳 Skill Tree</h2>
    <span class="tok">🟢 {tokens.grind} Grind</span>
    <span class="tok">🔵 {tokens.mogul} Mogul</span>
    <span class="tok">🟠 {tokens.chaos} Chaos</span>
    <span class="tok dim">🟣 {tokens.pixel}</span>
    <span class="tok dim">🟡 {tokens.golden}</span>
    <span class="spacer"></span>
    <button
      disabled={owned <= 1 || game.state.cash.lt(game.respecCost())}
      onclick={() => game.respec()}
      title="Refund all tokens">Respec ({formatCash(game.respecCost())})</button
    >
    <button class="close" onclick={onclose}>✕ Close (T)</button>
  </header>
  <footer>Drag to pan · scroll to zoom · click a glowing node to unlock it</footer>
</div>

<style>
  .tree {
    position: fixed;
    inset: 0;
    z-index: 30;
    pointer-events: auto;
  }
  canvas {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
  }
  header {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    gap: 14px;
    align-items: center;
    padding: 12px 18px;
    background: linear-gradient(#000c, #0000);
    color: #fff;
  }
  h2 {
    margin: 0 12px 0 0;
    font-size: 22px;
  }
  .tok {
    font-weight: 700;
    font-size: 16px;
  }
  .dim {
    opacity: 0.4;
  }
  .spacer {
    flex: 1;
  }
  button {
    font: inherit;
    font-weight: 700;
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid #fff4;
    background: #ffffff18;
    color: #fff;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .close {
    background: #e63946;
    border-color: #e63946;
  }
  footer {
    position: absolute;
    bottom: 14px;
    left: 18px;
    color: #fff8;
    font-size: 13px;
  }
</style>
