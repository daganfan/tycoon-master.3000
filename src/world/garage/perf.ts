import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Render layer for garage content. The main camera and the garage's own
 * shadow-casting light see it; the bedroom lights' shadow passes don't, so
 * a big factory doesn't multiply the bedroom's shadow cost.
 */
export const GARAGE_LAYER = 1;
/** Marker layer that forces a shadow camera to use its own layer mask. */
export const SHADOW_ONLY_LAYER = 31;

export function toGarageLayer(root: THREE.Object3D): void {
  root.traverse((o) => o.layers.set(GARAGE_LAYER));
}

/**
 * Merge static meshes under `root` that share a material (and shadow flags)
 * into one mesh each, cutting draw calls. Anything under a node in `keep`
 * (animated parts, sprites, things looked up by name) is left alone.
 */
export function mergeStatic(root: THREE.Object3D, keep: Set<THREE.Object3D> = new Set()): number {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
  const kept = (o: THREE.Object3D): boolean => {
    for (let n: THREE.Object3D | null = o; n && n !== root; n = n.parent) if (keep.has(n) || n.name) return true;
    return false;
  };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || kept(m)) return;
    const mat = m.material as THREE.Material;
    if (mat.transparent) return;
    const key = `${mat.uuid}|${m.castShadow}|${m.receiveShadow}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat, cast: m.castShadow, recv: m.receiveShadow, geos: [], meshes: [] }));
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()) as THREE.BufferGeometry;
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position!.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    b.geos.push(g);
    b.meshes.push(m);
  });
  let merged = 0;
  for (const b of buckets.values()) {
    if (b.geos.length < 2) continue;
    const geo = mergeGeometries(b.geos, false);
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.recv;
    root.add(mesh);
    for (const m of b.meshes) m.removeFromParent();
    merged += b.meshes.length - 1;
  }
  return merged;
}
