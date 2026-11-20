import type * as THREE from 'three';

type Axis = 'x' | 'y' | 'z';

/** Little runtime behaviours a decor model can declare for its parts. */
export type Behavior =
  | { k: 'spin'; node: THREE.Object3D; axis: Axis; speed: number }
  | { k: 'bob'; node: THREE.Object3D; axis?: Axis; amp: number; freq: number; phase?: number }
  /** Rotational oscillation. `half` keeps only one side of the swing (cradles). */
  | { k: 'sway'; node: THREE.Object3D; axis: Axis; amp: number; freq: number; phase?: number; half?: number }
  /** Swim back and forth along X, turning to face the direction of travel. */
  | { k: 'swim'; node: THREE.Object3D; amp: number; freq: number; phase?: number }
  | { k: 'pulse'; mat: THREE.MeshStandardMaterial; base: number; amp: number; freq: number }
  | { k: 'flicker'; mat: THREE.MeshStandardMaterial; base: number }
  | { k: 'hue'; mat?: THREE.MeshStandardMaterial; speed: number; phase?: number; sat?: number; light?: number }
  /** Speaker-cone thump: rhythmic scale pulse. */
  | { k: 'thump'; node: THREE.Object3D; bpm: number }
  /** Spring-loaded part that reacts to the body being knocked about (bobbleheads). */
  | { k: 'wobble'; node: THREE.Object3D; amp?: number }
  | { k: 'squeak'; pitch: number }
  /** Plays a jingle when bumped and flaps `node` while singing. */
  | { k: 'sing'; node?: THREE.Object3D; mouth?: THREE.Object3D }
  /** Haunted: random hops (`hop`), gentle rocking (`rock`) or driving around (`roam`). */
  | { k: 'haunt'; mode: 'hop' | 'rock' | 'roam'; interval: number }
  /** Custom gravity scale (balloons float up, pool toys drift). */
  | { k: 'float'; gravity: number };

export type DecorSpotKind = 'desk' | 'shelf' | 'floor' | 'wall';

export interface Recipe {
  /** Build the model into `g` (origin bottom-centre, facing +Z). Returns behaviours. */
  build(g: THREE.Group, variant: number): Behavior[] | void;
  collider?: 'box' | 'cyl' | 'ball';
  density?: number;
  restitution?: number;
  friction?: number;
  linearDamping?: number;
  /** Optional point light (subject to a global budget). */
  light?: { color: string; intensity: number; distance?: number; y: number };
  /** Spot preference for non-decor gear (decor items take it from content). */
  spot?: DecorSpotKind;
}
