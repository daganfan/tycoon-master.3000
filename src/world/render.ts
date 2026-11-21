import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { AutoTuner, FrameStats, GpuTimer, LightPool, POOL_SIZE, ShadowScheduler, VIRTUAL_LIGHT_LAYER, adoptObject, type SceneTweaks, type TunerLevel } from './perf';

export type Quality = 'auto' | 'low' | 'medium' | 'high' | 'ultra';
export type Level = Exclude<Quality, 'auto'>;
export const QUALITIES: Quality[] = ['auto', 'low', 'medium', 'high', 'ultra'];
const LEVELS: Level[] = ['low', 'medium', 'high', 'ultra'];

export interface Preset {
  /** Max device pixel ratio (before dynamic resolution scaling). */
  dpr: number;
  /** Lowest dynamic render scale for this preset. */
  minScale: number;
  shadowMap: number;
  /** PCF filter radius (soft shadow width, in texels). */
  shadowRadius: number;
  /** Re-render shadow maps every N frames while things move (1 = every frame). */
  shadowInterval: number;
  /** Whether the ceiling lamp casts (cached, cube) shadows. Ultra only: 6 extra scene passes. */
  pointShadows: boolean;
  pointShadowMap: number;
  /**
   * Post-processing chain (HDR target, grading, AA). Low renders straight to
   * the canvas with context MSAA instead: lightest path, but switching to or
   * from Low recompiles scene shaders once (tone mapping moves).
   */
  post: boolean;
  aa: 'fxaa' | 'smaa';
  /** 0 = off, otherwise AO resolution scale (depth-aware upsampled). */
  ao: number;
  aoSamples: number;
  bloom: boolean;
  /** Bloom resolution scale. */
  bloomScale: number;
  /** Floating dust particle count. */
  dust: number;
  /** Fake light shaft through the window. */
  beam: boolean;
  tweaks: SceneTweaks;
}

/*
 * Medium/High/Ultra share one pipeline (scene -> HDR target -> AO -> bloom ->
 * grade -> AA) and every preset shares one light setup, so Auto moving between
 * Medium and High only swaps post passes: scene shaders never recompile.
 * Ultra adds cached lamp shadows and real glass refraction.
 */
export const PRESETS: Record<Level, Preset> = {
  low: { post: false, dpr: 1, minScale: 0.7, shadowMap: 1024, shadowRadius: 1, shadowInterval: 3, pointShadows: false, pointShadowMap: 256, aa: 'fxaa', ao: 0, aoSamples: 0, bloom: false, bloomScale: 0.5, dust: 0, beam: false, tweaks: { minCasterRadius: 0.06, transmission: false } },
  medium: { post: true, dpr: 1.25, minScale: 0.6, shadowMap: 1024, shadowRadius: 2.5, shadowInterval: 2, pointShadows: false, pointShadowMap: 256, aa: 'fxaa', ao: 0.5, aoSamples: 8, bloom: true, bloomScale: 0.5, dust: 120, beam: true, tweaks: { minCasterRadius: 0.04, transmission: false } },
  high: { post: true, dpr: 1.5, minScale: 0.6, shadowMap: 2048, shadowRadius: 3, shadowInterval: 1, pointShadows: false, pointShadowMap: 512, aa: 'smaa', ao: 0.75, aoSamples: 12, bloom: true, bloomScale: 0.75, dust: 220, beam: true, tweaks: { minCasterRadius: 0.02, transmission: false } },
  ultra: { post: true, dpr: 2, minScale: 0.7, shadowMap: 4096, shadowRadius: 3.5, shadowInterval: 1, pointShadows: true, pointShadowMap: 512, aa: 'smaa', ao: 1, aoSamples: 16, bloom: true, bloomScale: 1, dust: 320, beam: true, tweaks: { minCasterRadius: 0, transmission: true } },
};

/**
 * Screens (TycoonOS canvases) must stay pixel-exact: they write alpha 0 into the
 * HDR buffer and the grading pass skips tone mapping, AO and vignette for them.
 */
export function markScreenMaterial(m: THREE.Material): void {
  m.userData.screen = true;
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace(/}\s*$/, '\tgl_FragColor.a = 0.0;\n}');
  };
  m.customProgramCacheKey = () => 'tm-screen';
}

/** Additive effects (light shafts, dust) must not touch the screen mask in alpha. */
export function keepAlpha(m: THREE.Material, src: THREE.BlendingSrcFactor = THREE.SrcAlphaFactor): void {
  m.blending = THREE.CustomBlending;
  m.blendSrc = src;
  m.blendDst = THREE.OneFactor;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
}

/** Tone mapping + filmic grading + vignette + dither + sRGB, with the screen mask. */
const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tAO: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    aoTexel: { value: new THREE.Vector2(1, 1) },
    cNear: { value: 0.03 },
    cFar: { value: 60 },
    aoAmount: { value: 1 },
    exposure: { value: 1 },
    saturation: { value: 1.06 },
    contrast: { value: 1.04 },
    warmth: { value: 0.03 },
    vignette: { value: 0.28 },
    seed: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tAO;
    uniform sampler2D tDepth;
    uniform vec2 aoTexel;
    uniform float cNear, cFar;
    uniform float aoAmount, exposure, saturation, contrast, warmth, vignette, seed;
    varying vec2 vUv;
    vec3 tmRrtOdt(vec3 v) {
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 tmAces(vec3 color) {
      const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      color *= exposure / 0.6;
      color = ACESInputMat * color;
      color = tmRrtOdt(color);
      color = ACESOutputMat * color;
      return clamp(color, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) {
      return mix(c * 12.92, pow(c, vec3(0.41666)) * 1.055 - 0.055, step(0.0031308, c));
    }
    #ifdef USE_AO
    float linZ(float d) { return cNear * cFar / (cFar - d * (cFar - cNear)); }
    // Joint bilateral upsample of the low-res AO: bilinear weights x depth similarity.
    float upAO(vec2 uv) {
      vec2 p = uv / aoTexel - 0.5;
      vec2 f = fract(p);
      vec2 b = (floor(p) + 0.5) * aoTexel;
      float zc = linZ(texture2D(tDepth, uv).r);
      float sum = 0.0;
      float wsum = 0.0;
      for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
        vec2 suv = b + vec2(float(i), float(j)) * aoTexel;
        float w = (i == 0 ? 1.0 - f.x : f.x) * (j == 0 ? 1.0 - f.y : f.y);
        float z = linZ(texture2D(tDepth, suv).r);
        w *= 1.0 / (0.02 + abs(z - zc) / zc * 25.0);
        sum += texture2D(tAO, suv).r * w;
        wsum += w;
      }
      return wsum > 1e-5 ? sum / wsum : texture2D(tAO, uv).r;
    }
    #endif
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + seed) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float scene = step(0.5, c.a);
      vec3 col = c.rgb;
      #ifdef USE_AO
        float ao = upAO(vUv);
        col *= mix(1.0, ao, aoAmount * scene);
      #endif
      vec3 g = tmAces(col);
      g.r *= 1.0 + warmth; g.b *= 1.0 - warmth;
      float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
      g = mix(vec3(l), g, saturation);
      g = clamp((g - 0.5) * contrast + 0.5, 0.0, 1.0);
      vec2 d = vUv - 0.5;
      g *= 1.0 - vignette * smoothstep(0.25, 0.95, dot(d, d) * 2.2);
      vec3 outc = mix(clamp(col, 0.0, 1.0), g, scene);
      outc = toSRGB(outc);
      outc += (hash(vUv * 1024.0) - 0.5) / 255.0;
      gl_FragColor = vec4(outc, 1.0);
    }`,
};

/**
 * Owns the WebGLRenderer and the post-processing chain, applies quality
 * presets, runs dynamic resolution scaling (and the Auto preset), schedules
 * shadow map updates, drives the point light pool and reduces effects while
 * the camera is focused on an in-world screen.
 */
export class Graphics {
  readonly renderer: THREE.WebGLRenderer;
  /** Called before each frame render (lighting animation etc). */
  readonly onFrame: ((dt: number, level: Level) => void)[] = [];
  /** Called after the preset changed (to resize shadow maps, dust...). */
  readonly onPreset: ((p: Preset, level: Level) => void)[] = [];
  quality: Quality = 'auto';
  active: Level = 'medium';
  /** Returns true when something that casts shadows moved this frame (set by the world). */
  motion: () => boolean = () => true;
  /** Where the player is (point light pool relevance). */
  readonly focusPoint = new THREE.Vector3();
  readonly tuner = new AutoTuner();
  readonly frames = new FrameStats(240);
  readonly shadows = new ShadowScheduler();
  pool: LightPool | null = null;
  /** CPU ms spent in the world update (set by the world, overlay only). */
  cpuMs = 0;
  /** Extra overlay lines (screens etc). */
  extraStats: () => string = () => '';
  private gpu: GpuTimer;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private aoPass: GTAOPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private gradePass: ShaderPass | null = null;
  private aaPass: SMAAPass | FXAAPass | null = null;
  private size = new THREE.Vector2(1, 1);
  private focus = 0;
  private scaleApplied = -1;
  private tunerVersion = -1;
  private lastNow = 0;
  private scanT = 0;
  private shadowLights: THREE.Light[] = [];
  private lastDraws = 0;
  private lastTris = 0;
  private readonly forced: Level | null;

  constructor(canvas: HTMLCanvasElement, initial: Quality = 'auto') {
    this.forced = this.forcedLevel();
    const startLevel: Level = this.forcedLevel() ?? (initial === 'auto' ? 'medium' : initial);
    // Post presets do their own AA, so context MSAA is only worth it when starting on Low.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: startLevel === 'low', powerPreference: 'high-performance', preserveDrawingBuffer: false, stencil: false });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.transmissionResolutionScale = 0.5;
    r.info.autoReset = false;
    this.gpu = new GpuTimer(r.getContext() as WebGL2RenderingContext);
    this.quality = this.forced ?? initial;
    this.active = this.forced ?? (initial === 'auto' ? 'medium' : initial);
    this.resetTuner();
  }

  private forcedLevel(): Level | null {
    const q = new URLSearchParams(location.search).get('gfx');
    return q && (LEVELS as string[]).includes(q) ? (q as Level) : null;
  }

  get preset(): Preset {
    return PRESETS[this.active];
  }

  /** Effective render scale (dynamic resolution); full while reading a screen. */
  get renderScale(): number {
    return this.focus > 0.5 ? 1 : this.tuner.scale;
  }

  attach(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    this.scene = scene;
    this.camera = camera;
    this.pool = new LightPool(scene);
    this.applyPreset();
  }

  private resetTuner(): void {
    const auto = !this.forced && this.quality === 'auto';
    const lvl: TunerLevel = this.active === 'ultra' ? 'high' : this.active;
    this.tuner.reset(lvl, auto, this.preset.minScale);
    this.tunerVersion = this.tuner.version;
  }

  /** Set the user setting. 'auto' starts at Medium and adapts. */
  setQuality(q: Quality): void {
    if (q === this.quality || this.forced) return;
    this.quality = q;
    const prev = this.active;
    this.active = q === 'auto' ? 'medium' : q;
    this.resetTuner();
    if (prev !== this.active) this.applyPreset();
    else this.resize(this.size.x, this.size.y);
  }

  /** 0 = third person, 1 = camera fills a screen. */
  setFocus(blend: number): void {
    this.focus = blend;
  }

  resize(w: number, h: number): void {
    this.size.set(Math.max(1, w), Math.max(1, h));
    const p = this.preset;
    const scale = this.renderScale;
    this.scaleApplied = scale;
    const dpr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, p.dpr) * scale);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.size.x, this.size.y, false);
    if (this.composer) {
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(this.size.x, this.size.y);
      const W = this.size.x * dpr;
      const H = this.size.y * dpr;
      if (this.aoPass) {
        const aw = Math.max(1, Math.round(W * p.ao));
        const ah = Math.max(1, Math.round(H * p.ao));
        this.aoPass.setSize(aw, ah);
        (this.gradePass!.uniforms.aoTexel!.value as THREE.Vector2).set(1 / aw, 1 / ah);
      }
      if (this.bloomPass && p.bloomScale < 1) this.bloomPass.setSize(Math.round(W * p.bloomScale), Math.round(H * p.bloomScale));
    }
    this.shadows.invalidate();
  }

  /** Apply the preset's scene rules to a newly spawned object (call right after adding it). */
  adopt(root: THREE.Object3D): void {
    root.updateMatrixWorld(true);
    adoptObject(root, this.preset.tweaks);
    this.scanT = 0;
  }

  private scan(): void {
    const scene = this.scene;
    if (!scene) return;
    adoptObject(scene, this.preset.tweaks);
    const lights: THREE.Light[] = [];
    scene.traverse((o) => {
      const l = o as THREE.Light;
      if (l.isLight && l.castShadow) lights.push(l);
    });
    this.shadowLights = lights;
  }

  private applyPreset(): void {
    const p = this.preset;
    this.disposeComposer();
    if (p.post && this.scene && this.camera) this.buildComposer(p);
    for (const f of this.onPreset) f(p, this.active);
    this.shadows.interval = p.shadowInterval;
    this.scan();
    this.resize(this.size.x, this.size.y);
  }

  private buildComposer(p: Preset): void {
    const r = this.renderer;
    const scene = this.scene!;
    const camera = this.camera!;
    // The scene pass keeps its depth: AO reconstructs normals from it (no second scene render).
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false });
    rt.depthTexture = new THREE.DepthTexture(1, 1);
    const composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(scene, camera);
    composer.addPass(this.renderPass);
    if (p.ao > 0) {
      const ao = new GTAOPass(scene, camera, 256, 256, { depthTexture: composer.readBuffer.depthTexture! });
      ao.output = GTAOPass.OUTPUT.Off;
      ao.needsSwap = false;
      ao.updateGtaoMaterial({ radius: 0.28, distanceExponent: 1.6, thickness: 1.2, scale: 1.1, samples: p.aoSamples, distanceFallOff: 1, screenSpaceRadius: false });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: Math.min(8, p.aoSamples) });
      composer.addPass(ao);
      this.aoPass = ao;
    }
    if (p.bloom) {
      const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 1.6);
      keepAlpha(bloom.blendMaterial, THREE.OneFactor);
      composer.addPass(bloom);
      this.bloomPass = bloom;
    }
    const grade = new ShaderPass(GradeShader);
    grade.material.toneMapped = false;
    if (this.aoPass) {
      grade.material.defines.USE_AO = '';
      grade.uniforms.tAO!.value = this.aoPass.gtaoMap;
    }
    composer.addPass(grade);
    this.gradePass = grade;
    this.aaPass = p.aa === 'smaa' ? new SMAAPass() : new FXAAPass();
    composer.addPass(this.aaPass);
    this.composer = composer;
  }

  private disposeComposer(): void {
    if (!this.composer) return;
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.renderTarget1.depthTexture?.dispose();
    this.composer.renderTarget2.depthTexture?.dispose();
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.composer = null;
    this.renderPass = null;
    this.aoPass = null;
    this.bloomPass = null;
    this.gradePass = null;
    this.aaPass = null;
  }

  /**
   * Compile every material (hidden ones too) without blocking the page, then
   * warm the post chain. Call behind the loading screen.
   */
  async precompile(): Promise<void> {
    const scene = this.scene;
    const camera = this.camera;
    if (!scene || !camera) return;
    this.scan();
    const hidden: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (!o.visible && !(o as THREE.Light).isLight) {
        hidden.push(o);
        o.visible = true;
      }
    });
    const mask = camera.layers.mask;
    camera.layers.enableAll();
    camera.layers.disable(VIRTUAL_LIGHT_LAYER);
    try {
      await this.renderer.compileAsync(scene, camera);
    } catch {
      /* compile on first use instead */
    } finally {
      camera.layers.mask = mask;
      for (const o of hidden) o.visible = false;
    }
    this.composer?.render(0);
  }

  /** Render one frame. */
  render(dt: number): void {
    const scene = this.scene;
    const camera = this.camera;
    if (!scene || !camera) return;
    const now = performance.now();
    const interval = this.lastNow ? now - this.lastNow : 16.7;
    this.lastNow = now;
    this.frames.push(interval);
    if (this.focus < 0.05) this.tuner.frame(interval, this.gpu.ms, document.visibilityState !== 'visible');
    if (this.tuner.version !== this.tunerVersion) {
      this.tunerVersion = this.tuner.version;
      if (this.tuner.auto && this.tuner.level !== this.active) {
        this.active = this.tuner.level;
        this.applyPreset();
      }
    }
    if (Math.abs(this.renderScale - this.scaleApplied) > 1e-3) this.resize(this.size.x, this.size.y);
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 2;
      this.scan();
    }

    for (const f of this.onFrame) f(dt, this.active);
    camera.updateMatrixWorld();
    this.pool?.update(dt, camera, this.focusPoint);
    this.shadows.schedule(this.shadowLights, this.motion(), dt);

    const info = this.renderer.info;
    info.reset();
    this.gpu.begin();
    if (!this.composer) this.renderer.render(scene, camera);
    else {
      // While the camera fills a screen, AO/bloom/vignette fade out so the OS stays crisp.
      const f = this.focus;
      const u = this.gradePass!.uniforms;
      if (this.aoPass) {
        const depth = this.composer.readBuffer.depthTexture;
        this.aoPass.enabled = f < 0.6;
        this.aoPass.gtaoMaterial.uniforms.tDepth!.value = depth;
        this.aoPass.pdMaterial.uniforms.tDepth!.value = depth;
        u.aoAmount!.value = 1 - Math.min(1, f / 0.6);
        u.tDepth!.value = depth;
        u.cNear!.value = camera.near;
        u.cFar!.value = camera.far;
      }
      if (this.bloomPass) {
        this.bloomPass.enabled = f < 0.9;
        this.bloomPass.strength = 0.32 * (1 - f);
      }
      if (this.aaPass) this.aaPass.enabled = f < 0.98;
      u.vignette!.value = 0.28 * (1 - f);
      u.seed!.value = (u.seed!.value + 0.618) % 10;
      this.composer.render(dt);
    }
    this.gpu.end();
    this.lastDraws = info.render.calls;
    this.lastTris = info.render.triangles;
  }

  /** Text for the F3 overlay. */
  stats(): string {
    const ms = this.frames.avg(60);
    const label = this.forced ? `${this.active} (forced)` : this.quality === 'auto' ? `auto → ${this.active}` : this.active;
    const gpu = this.gpu.available && this.gpu.ms >= 0 ? `  gpu ${this.gpu.ms.toFixed(1)} ms` : '';
    const px = Math.round(this.renderer.getPixelRatio() * this.size.x);
    const pool = this.pool?.candidates ?? 0;
    return (
      `${(1000 / Math.max(1, ms)).toFixed(0)} fps  ${ms.toFixed(1)} ms  worst ${this.frames.max(120).toFixed(0)} ms\n` +
      `preset ${label}  scale ${Math.round(this.renderScale * 100)}% (${px}px wide)\n` +
      `cpu ${this.cpuMs.toFixed(1)} ms${gpu}\n` +
      `draws ${this.lastDraws}  tris ${(this.lastTris / 1000).toFixed(0)}k  programs ${this.renderer.info.programs?.length ?? 0}\n` +
      `shadow maps ${this.shadows.updates}/s  lamps ${pool}→${Math.min(pool, POOL_SIZE)} pooled` +
      this.extraStats()
    );
  }

  dispose(): void {
    this.disposeComposer();
    this.renderer.dispose();
  }
}
