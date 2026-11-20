import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';

export type Quality = 'auto' | 'low' | 'medium' | 'high' | 'ultra';
export type Level = Exclude<Quality, 'auto'>;
export const QUALITIES: Quality[] = ['auto', 'low', 'medium', 'high', 'ultra'];
const LEVELS: Level[] = ['low', 'medium', 'high', 'ultra'];

interface Preset {
  /** Max device pixel ratio. */
  dpr: number;
  shadowMap: number;
  /** PCF filter radius (soft shadow width, in texels). */
  shadowRadius: number;
  /** Whether lamps (point lights) cast shadows. */
  pointShadows: boolean;
  pointShadowMap: number;
  post: boolean;
  aa: 'none' | 'fxaa' | 'smaa';
  /** 0 = off, otherwise AO resolution scale. */
  ao: number;
  aoSamples: number;
  bloom: boolean;
  /** Floating dust particle count. */
  dust: number;
}

export const PRESETS: Record<Level, Preset> = {
  low: { dpr: 1, shadowMap: 1024, shadowRadius: 1, pointShadows: false, pointShadowMap: 256, post: false, aa: 'none', ao: 0, aoSamples: 0, bloom: false, dust: 0 },
  medium: { dpr: 1.25, shadowMap: 1024, shadowRadius: 2.5, pointShadows: false, pointShadowMap: 256, post: true, aa: 'fxaa', ao: 0.5, aoSamples: 8, bloom: true, dust: 120 },
  high: { dpr: 1.5, shadowMap: 2048, shadowRadius: 3, pointShadows: true, pointShadowMap: 512, post: true, aa: 'smaa', ao: 1, aoSamples: 12, bloom: true, dust: 220 },
  ultra: { dpr: 2, shadowMap: 4096, shadowRadius: 3.5, pointShadows: true, pointShadowMap: 1024, post: true, aa: 'smaa', ao: 1, aoSamples: 16, bloom: true, dust: 320 },
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
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + seed) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float scene = step(0.5, c.a);
      vec3 col = c.rgb;
      #ifdef USE_AO
        float ao = texture2D(tAO, vUv).r;
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
 * Owns the WebGLRenderer and the post-processing chain, applies quality presets
 * (with an Auto mode that measures frame times) and reduces effects while the
 * camera is focused on an in-world screen.
 */
export class Graphics {
  readonly renderer: THREE.WebGLRenderer;
  /** Called before each frame render (lighting animation etc). */
  readonly onFrame: ((dt: number, level: Level) => void)[] = [];
  /** Called after the preset changed (to resize shadow maps, dust...). */
  readonly onPreset: ((p: Preset, level: Level) => void)[] = [];
  quality: Quality = 'auto';
  active: Level = 'high';
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
  // auto quality measurement
  private autoT = 0;
  private autoFrames = 0;
  private autoSum = 0;
  private autoDone = false;
  private autoSteps = 0;
  private readonly forced: Level | null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false, stencil: false });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    const q = new URLSearchParams(location.search).get('gfx');
    this.forced = q && (LEVELS as string[]).includes(q) ? (q as Level) : null;
    this.active = this.forced ?? 'high';
  }

  get preset(): Preset {
    return PRESETS[this.active];
  }

  attach(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    this.scene = scene;
    this.camera = camera;
    this.applyPreset();
  }

  /** Set the user setting. 'auto' re-runs the frame time measurement. */
  setQuality(q: Quality): void {
    if (q === this.quality) return;
    this.quality = q;
    if (this.forced) return;
    if (q === 'auto') {
      this.autoDone = false;
      this.autoSteps = 0;
      this.resetAuto();
      this.active = 'high';
    } else this.active = q;
    this.applyPreset();
  }

  /** 0 = third person, 1 = camera fills a screen. */
  setFocus(blend: number): void {
    this.focus = blend;
  }

  resize(w: number, h: number): void {
    this.size.set(Math.max(1, w), Math.max(1, h));
    const dpr = Math.min(window.devicePixelRatio || 1, this.preset.dpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.size.x, this.size.y, false);
    if (this.composer) {
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(this.size.x, this.size.y);
      if (this.aoPass && this.preset.ao < 1) this.aoPass.setSize(Math.round(this.size.x * dpr * this.preset.ao), Math.round(this.size.y * dpr * this.preset.ao));
    }
  }

  private resetAuto(): void {
    this.autoT = 0;
    this.autoFrames = 0;
    this.autoSum = 0;
  }

  private measure(dt: number): void {
    if (this.forced || this.quality !== 'auto' || this.autoDone) return;
    if (document.visibilityState !== 'visible') return;
    this.autoT += dt;
    if (this.autoT < 1.2) return; // warm-up (shader compiles, texture uploads)
    this.autoFrames++;
    this.autoSum += dt;
    if (this.autoT < 3.2) return;
    const avg = this.autoSum / Math.max(1, this.autoFrames);
    const i = LEVELS.indexOf(this.active);
    this.resetAuto();
    if (avg > 1 / 45 && i > 0) {
      this.active = LEVELS[i - 1]!;
      this.applyPreset();
      if (++this.autoSteps > 3) this.autoDone = true;
    } else if (avg < 1 / 110 && this.active === 'high') {
      this.active = 'ultra';
      this.applyPreset();
      this.autoSteps++;
    } else this.autoDone = true;
  }

  private applyPreset(): void {
    const p = this.preset;
    this.disposeComposer();
    if (p.post && this.scene && this.camera) this.buildComposer(p);
    for (const f of this.onPreset) f(p, this.active);
    this.resize(this.size.x, this.size.y);
  }

  private buildComposer(p: Preset): void {
    const r = this.renderer;
    const scene = this.scene!;
    const camera = this.camera!;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false });
    const composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(scene, camera);
    composer.addPass(this.renderPass);
    if (p.ao > 0) {
      const ao = new GTAOPass(scene, camera, 256, 256);
      ao.output = GTAOPass.OUTPUT.Off;
      // Effects (light shafts, glass) must not land in the AO G-buffer.
      const internals = ao as unknown as { _overrideVisibility: () => void; _visibilityCache: THREE.Object3D[] };
      const hideBase = internals._overrideVisibility.bind(ao);
      internals._overrideVisibility = () => {
        hideBase();
        scene.traverse((o) => {
          if (o.userData.noAO && o.visible) {
            o.visible = false;
            internals._visibilityCache.push(o);
          }
        });
      };
      ao.needsSwap = false;
      ao.updateGtaoMaterial({ radius: 0.28, distanceExponent: 1.6, thickness: 1.2, scale: 1.1, samples: p.aoSamples, distanceFallOff: 1, screenSpaceRadius: false });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: p.aoSamples });
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
    if (p.aa === 'smaa') this.aaPass = new SMAAPass();
    else if (p.aa === 'fxaa') this.aaPass = new FXAAPass();
    if (this.aaPass) composer.addPass(this.aaPass);
    this.composer = composer;
  }

  private disposeComposer(): void {
    if (!this.composer) return;
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.composer = null;
    this.renderPass = null;
    this.aoPass = null;
    this.bloomPass = null;
    this.gradePass = null;
    this.aaPass = null;
  }

  /** Render one frame. */
  render(dt: number): void {
    const scene = this.scene;
    const camera = this.camera;
    if (!scene || !camera) return;
    this.measure(dt);
    for (const f of this.onFrame) f(dt, this.active);
    if (!this.composer) {
      this.renderer.render(scene, camera);
      return;
    }
    // While the camera fills a screen, AO/bloom/vignette fade out so the OS stays crisp.
    const f = this.focus;
    if (this.aoPass) {
      this.aoPass.enabled = f < 0.6;
      this.gradePass!.uniforms.aoAmount!.value = 1 - Math.min(1, f / 0.6);
    }
    if (this.bloomPass) {
      this.bloomPass.enabled = f < 0.9;
      this.bloomPass.strength = 0.32 * (1 - f);
    }
    if (this.aaPass) this.aaPass.enabled = f < 0.98;
    const u = this.gradePass!.uniforms;
    u.vignette!.value = 0.28 * (1 - f);
    u.seed!.value = (u.seed!.value + 0.618) % 10;
    this.composer.render(dt);
  }

  dispose(): void {
    this.disposeComposer();
    this.renderer.dispose();
  }
}
