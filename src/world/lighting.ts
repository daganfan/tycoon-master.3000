import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { keepAlpha, type Graphics } from './render';
import { mat, ROOM, WINDOW, type RoomRefs } from './room';
import { rand, softDot } from './textures';

const SUN_POS = new THREE.Vector3(7, 4.6, 0.2);
const SUN_TARGET = new THREE.Vector3(-0.6, 0.2, 0.75);
const MAX_DUST = 320;

const BEAM_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BEAM_FRAG = /* glsl */ `
  uniform vec3 color;
  uniform float strength;
  uniform float time;
  varying vec2 vUv;
  void main() {
    float across = pow(max(0.0, sin(3.14159 * vUv.x)), 1.4);
    float along = smoothstep(0.0, 0.06, vUv.y) * pow(max(0.0, 1.0 - vUv.y), 1.6);
    float shimmer = 0.85 + 0.15 * sin(vUv.x * 9.0 + time * 0.4) * sin(vUv.y * 5.0 - time * 0.25);
    gl_FragColor = vec4(color * strength * across * along * shimmer, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const DUST_VERT = /* glsl */ `
  attribute float seed;
  uniform float time;
  uniform float size;
  uniform float pixelRatio;
  varying float vTwinkle;
  void main() {
    vec3 p = position;
    float t = time * (0.15 + 0.1 * fract(seed * 7.0));
    p += vec3(sin(t + seed * 6.28) * 0.06, sin(t * 0.7 + seed * 12.0) * 0.09 - mod(time * 0.004 + seed, 0.08), cos(t * 0.8 + seed * 3.0) * 0.06);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * pixelRatio * (1.0 + fract(seed * 13.0)) / max(0.2, -mv.z);
    vTwinkle = 0.45 + 0.55 * sin(time * (0.6 + fract(seed * 5.0)) + seed * 40.0);
  }`;
const DUST_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 color;
  uniform float strength;
  varying float vTwinkle;
  void main() {
    float a = texture2D(map, gl_PointCoord).a;
    gl_FragColor = vec4(color * a * strength * vTwinkle, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const smooth = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Room lighting: sun (or moon) through the window with fake light shafts and
 * dust, a warm ceiling lamp, bounce light, screen glow, and a subtle day/night
 * cycle tied to the real clock.
 */
export class Lighting {
  readonly sun = new THREE.DirectionalLight('#ffe6c4', 4);
  readonly hemi = new THREE.HemisphereLight('#dfe9ff', '#6b5440', 0.3);
  readonly lamp = new THREE.PointLight('#ffcf94', 4, 0, 2);
  readonly bounce = new THREE.PointLight('#ffc89a', 1, 4.5, 2);
  readonly glow = new THREE.PointLight('#9fd4ff', 0.6, 2.6, 2);
  private readonly bulb: THREE.MeshStandardMaterial;
  private readonly beamMat: THREE.ShaderMaterial;
  private readonly dustMat: THREE.ShaderMaterial;
  private readonly dust: THREE.Points;
  private readonly hourOverride: number | null;
  private time = 0;
  private cycleT = 99;
  private glowT = 0;
  private readonly beam: THREE.Mesh;
  private readonly tmpColor = new THREE.Color();
  private readonly glowTarget = new THREE.Color('#9fd4ff');
  private glowLevel = 0.5;
  private glowLevelTarget = 0.5;
  private sunAmount = 1;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly gfx: Graphics,
    private readonly room: RoomRefs,
    /** Average colour of the main screen (sRGB 0..1), read back asynchronously; null = unknown. */
    private readonly screenColor: () => THREE.Color | null,
  ) {
    // These stay real lights; decor/prop point lights go through the pool (perf.ts).
    for (const l of [this.lamp, this.bounce, this.glow]) l.userData.realLight = true;
    const r = gfx.renderer;
    const pmrem = new THREE.PMREMGenerator(r);
    const envScene = new RoomEnvironment();
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    envScene.dispose();
    pmrem.dispose();
    scene.environmentIntensity = 0.45;
    scene.background = new THREE.Color('#1a1d24');
    const q = new URLSearchParams(location.search).get('hour');
    this.hourOverride = q !== null && !Number.isNaN(Number(q)) ? Number(q) : null;

    // Sun through the window. Walls cast shadows, so light only enters through the opening.
    const sun = this.sun;
    sun.position.copy(SUN_POS);
    sun.target.position.copy(SUN_TARGET);
    sun.castShadow = true;
    sun.shadow.bias = -0.00025;
    sun.shadow.normalBias = 0.025;
    this.fitSunShadow();
    scene.add(sun, sun.target, this.hemi);

    // Ceiling lamp: flush dome with a glowing frosted shade.
    const { h } = ROOM;
    const fixture = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.025, 40), mat('#b9a27a', 0.3, 0.9));
    base.position.y = -0.0125;
    fixture.add(base);
    this.bulb = mat('#fff8ec', 0.25, 0, { emissive: '#ffd9a6', emissiveIntensity: 2.2 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.17, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), this.bulb);
    dome.rotation.x = Math.PI;
    dome.scale.set(1, 0.55, 1);
    dome.position.y = -0.024;
    fixture.add(dome);
    const nub = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 8), mat('#b9a27a', 0.3, 0.9));
    nub.position.y = -0.12;
    fixture.add(nub);
    fixture.position.set(0, h, 0);
    scene.add(fixture);
    this.lamp.position.set(0, h - 0.17, 0);
    this.lamp.shadow.bias = -0.002;
    this.lamp.shadow.normalBias = 0.02;
    this.lamp.shadow.camera.near = 0.12;
    scene.add(this.lamp);

    // Bounce: the sunlit floor patch lights the room a little.
    this.bounce.position.set(0.8, 0.35, 0.7);
    scene.add(this.bounce);

    // Screen glow (follows the monitor).
    this.glow.position.set(0, 0, 0.35);
    this.room.screen.mesh.add(this.glow);

    // Light shaft + dust motes.
    const beamGeo = this.beamGeometry();
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color('#ffd9a8') }, strength: { value: 0.1 }, time: { value: 0 } },
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    keepAlpha(this.beamMat, THREE.OneFactor);
    const beam = (this.beam = new THREE.Mesh(beamGeo, this.beamMat));
    beam.renderOrder = 5;
    beam.userData.noAO = true;
    beam.frustumCulled = false;
    scene.add(beam);
    this.dustMat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: softDot() },
        color: { value: new THREE.Color('#ffe8c8') },
        strength: { value: 0.6 },
        time: { value: 0 },
        size: { value: 9 },
        pixelRatio: { value: 1 },
      },
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      transparent: true,
      depthWrite: false,
    });
    keepAlpha(this.dustMat, THREE.OneFactor);
    this.dust = new THREE.Points(this.dustGeometry(), this.dustMat);
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 6;
    scene.add(this.dust);

    gfx.onPreset.push((p) => {
      const s = this.sun.shadow;
      s.mapSize.set(p.shadowMap, p.shadowMap);
      s.radius = p.shadowRadius;
      s.map?.dispose();
      s.map = null;
      this.lamp.castShadow = p.pointShadows;
      this.lamp.shadow.mapSize.set(p.pointShadowMap, p.pointShadowMap);
      this.lamp.shadow.radius = p.shadowRadius;
      this.lamp.shadow.map?.dispose();
      this.lamp.shadow.map = null;
      this.dust.geometry.setDrawRange(0, p.dust);
      this.dust.visible = p.dust > 0;
      this.beam.visible = p.beam;
    });
    gfx.onFrame.push((dt) => this.update(dt));
  }

  /** Fit the orthographic shadow camera tightly around the room as seen from the sun. */
  private fitSunShadow(): void {
    const cam = this.sun.shadow.camera;
    cam.position.copy(SUN_POS);
    cam.lookAt(SUN_TARGET);
    cam.updateMatrixWorld(true);
    const inv = cam.matrixWorldInverse;
    const { hx, hz, h } = ROOM;
    const box = new THREE.Box3();
    const p = new THREE.Vector3();
    for (const x of [-hx, hx + WINDOW.depth])
      for (const y of [0, h])
        for (const z of [-hz, hz]) box.expandByPoint(p.set(x, y, z).applyMatrix4(inv));
    cam.left = box.min.x - 0.05;
    cam.right = box.max.x + 0.05;
    cam.bottom = box.min.y - 0.05;
    cam.top = box.max.y + 0.05;
    cam.near = Math.max(0.1, -box.max.z - 0.5);
    cam.far = -box.min.z + 0.5;
    cam.updateProjectionMatrix();
  }

  private sunDir(): THREE.Vector3 {
    return SUN_TARGET.clone().sub(SUN_POS).normalize();
  }

  /** A prism extruded from the window opening along the sun direction (4 soft sides). */
  private beamGeometry(): THREE.BufferGeometry {
    const d = this.sunDir();
    const x = ROOM.hx + 0.02;
    const y0 = WINDOW.y - WINDOW.h / 2 + 0.05;
    const y1 = WINDOW.y + WINDOW.h / 2 - 0.05;
    const z0 = WINDOW.z - WINDOW.w / 2 + 0.05;
    const z1 = WINDOW.z + WINDOW.w / 2 - 0.05;
    const L = (y1 + 0.1) / -d.y; // reaches the floor
    const c = [new THREE.Vector3(x, y0, z0), new THREE.Vector3(x, y1, z0), new THREE.Vector3(x, y1, z1), new THREE.Vector3(x, y0, z1)];
    const pos: number[] = [];
    const uv: number[] = [];
    const seg = 12;
    for (let s = 0; s < 4; s++) {
      const a = c[s]!;
      const b = c[(s + 1) % 4]!;
      for (let i = 0; i < seg; i++) {
        const v0 = i / seg;
        const v1 = (i + 1) / seg;
        const quad = [
          [0, v0],
          [1, v0],
          [1, v1],
          [0, v0],
          [1, v1],
          [0, v1],
        ];
        for (const [u, v] of quad) {
          const p = a.clone().lerp(b, u!).addScaledVector(d, v! * L);
          pos.push(p.x, p.y, p.z);
          uv.push(u!, v!);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  }

  private dustGeometry(): THREE.BufferGeometry {
    const d = this.sunDir();
    const r = rand(123);
    const pos = new Float32Array(MAX_DUST * 3);
    const seed = new Float32Array(MAX_DUST);
    const L = (WINDOW.y + WINDOW.h / 2) / -d.y;
    for (let i = 0; i < MAX_DUST; i++) {
      const t = 0.05 + r() * 0.75;
      const p = new THREE.Vector3(ROOM.hx, WINDOW.y + (r() - 0.5) * WINDOW.h * 0.9, WINDOW.z + (r() - 0.5) * WINDOW.w * 0.9).addScaledVector(d, t * L);
      pos.set([p.x, Math.max(0.05, p.y), p.z], i * 3);
      seed[i] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    return g;
  }

  private hour(): number {
    if (this.hourOverride !== null) return this.hourOverride;
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60;
  }

  /** Day/night: sky colour, sun/moon strength and colour, lamp and ambient levels. */
  private applyCycle(): void {
    const hr = this.hour();
    const day = smooth(5.5, 8, hr) * (1 - smooth(18, 20.5, hr));
    const dusk = Math.max(Math.exp(-((hr - 19) ** 2) / 1.2), Math.exp(-((hr - 7) ** 2) / 0.8)) * 0.85;
    this.sunAmount = day;
    const sunCol = this.tmpColor.set('#a9bcff').lerp(new THREE.Color('#ffe6c4'), day).lerp(new THREE.Color('#ffa860'), dusk * day);
    this.sun.color.copy(sunCol);
    this.sun.intensity = 0.4 + 6 * day;
    this.scene.environmentIntensity = 0.2 + 0.14 * day;
    this.hemi.intensity = 0.1 + 0.1 * day;
    this.lamp.intensity = 1.6 + 4.4 * (1 - day);
    this.bulb.emissiveIntensity = 1.8 + 1.4 * (1 - day);
    this.bounce.intensity = 2.2 * day;
    this.bounce.color.copy(sunCol).lerp(new THREE.Color('#c08050'), 0.4);
    const sky = this.room.sky.uniforms;
    sky.day!.value = day;
    sky.dusk!.value = dusk;
    sky.intensity!.value = 0.45 + 1.05 * day;
    this.room.glass.envMapIntensity = 1.2 + 2 * (1 - day);
    const bu = this.beamMat.uniforms;
    bu.strength!.value = 0.012 + 0.06 * day;
    (bu.color!.value as THREE.Color).copy(sunCol);
    this.dustMat.uniforms.strength!.value = 0.08 + 0.35 * day;
  }

  /**
   * Screen glow colour. The world reads the screen texture's 1x1 mip back
   * asynchronously (no canvas readback stall on the main thread).
   */
  private sampleScreen(): void {
    const c = this.screenColor();
    if (!c) return;
    this.glowTarget.setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace);
    const lum = this.glowTarget.r * 0.3 + this.glowTarget.g * 0.6 + this.glowTarget.b * 0.1;
    this.glowLevelTarget = Math.min(1, lum * 3);
    if (lum > 0.001) this.glowTarget.multiplyScalar(1 / Math.max(this.glowTarget.r, this.glowTarget.g, this.glowTarget.b));
  }

  update(dt: number): void {
    this.time += dt;
    this.cycleT += dt;
    if (this.cycleT > 5) {
      this.cycleT = 0;
      this.applyCycle();
    }
    this.glowT -= dt;
    if (this.glowT <= 0) {
      this.glowT = 0.35;
      this.sampleScreen();
    }
    const k = 1 - Math.pow(0.02, dt);
    this.glow.color.lerp(this.glowTarget, k);
    this.glowLevel += (this.glowLevelTarget - this.glowLevel) * k;
    this.glow.intensity = this.glowLevel * (0.5 + 0.9 * (1 - this.sunAmount));
    this.beamMat.uniforms.time!.value = this.time;
    this.dustMat.uniforms.time!.value = this.time;
    this.dustMat.uniforms.pixelRatio!.value = this.gfx.renderer.getPixelRatio() * (this.gfx.renderer.domElement.height / Math.max(1, this.gfx.renderer.getPixelRatio()) / 720);
    this.room.update(dt);
  }
}
