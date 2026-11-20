import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mat } from './room';
import { fabricSet } from './textures';

/**
 * Stylised-realistic teen gamer. Origin = physics body centre, floor at y = -0.65,
 * the face looks down local -z.
 */
export interface AvatarRig {
  root: THREE.Group;
  torso: THREE.Object3D;
  headPivot: THREE.Group;
  eyes: THREE.Object3D[];
  hips: THREE.Group[];
  knees: THREE.Group[];
  shoulders: THREE.Group[];
  elbows: THREE.Group[];
  materials: THREE.MeshStandardMaterial[];
}

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
};
const rb = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2));

export function buildAvatarModel(): AvatarRig {
  const root = new THREE.Group();
  const hoodieSet = fabricSet('#4a6fa5', [7, 7]);
  const denimSet = fabricSet('#34445f', [6, 6]);
  const shoeSet = fabricSet('#b8322e', [1, 1]);
  const hoodie = mat('#ffffff', 0.92, 0, { map: hoodieSet.map, normalMap: hoodieSet.normal, normalScale: new THREE.Vector2(0.35, 0.35) });
  const pants = mat('#ffffff', 0.85, 0, { map: denimSet.map, normalMap: denimSet.normal });
  const skin = mat('#e2ad8c', 0.5);
  const hair = mat('#3a281b', 0.62);
  const shoe = mat('#ffffff', 0.7, 0, { map: shoeSet.map, normalMap: shoeSet.normal });
  const sole = mat('#f1efe8', 0.55);
  const eyeWhite = mat('#f4f2ee', 0.2);
  const iris = mat('#2b1c12', 0.15);
  const lips = mat('#a8584f', 0.5);
  const cord = mat('#f2f2ee', 0.6);
  const materials = [hoodie, pants, skin, shoe, hair, sole, eyeWhite, iris, lips, cord];
  for (const m of materials) if (m !== hoodie) m.userData.noSkin = true;

  // ---------------------------------------------------------- torso (hoodie)
  const torso = new THREE.Group();
  torso.position.y = -0.02;
  root.add(torso);
  const prof = [
    [0.001, -0.07],
    [0.15, -0.07],
    [0.165, -0.035],
    [0.16, 0.05],
    [0.158, 0.15],
    [0.168, 0.28],
    [0.176, 0.38],
    [0.168, 0.45],
    [0.135, 0.505],
    [0.075, 0.54],
    [0.045, 0.548],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const body = mesh(new THREE.LatheGeometry(prof, 32), hoodie);
  body.scale.z = 0.68;
  torso.add(body);
  const hem = mesh(new THREE.TorusGeometry(0.16, 0.016, 8, 32), hoodie, 0, -0.055, 0);
  hem.rotation.x = Math.PI / 2;
  hem.scale.y = 0.68;
  torso.add(hem);
  const pocket = mesh(rb(0.21, 0.1, 0.03, 0.012), hoodie, 0, 0.06, -0.098);
  pocket.rotation.x = 0.08;
  torso.add(pocket);
  // hood bunched around the neck and lying on the back
  const collar = mesh(new THREE.TorusGeometry(0.075, 0.032, 10, 28), hoodie, 0, 0.53, 0.01);
  collar.rotation.x = Math.PI / 2;
  collar.scale.set(1.1, 0.9, 1);
  torso.add(collar);
  const hood = mesh(new THREE.SphereGeometry(0.1, 20, 14), hoodie, 0, 0.48, 0.1);
  hood.scale.set(1.15, 0.75, 0.55);
  torso.add(hood);
  for (const s of [-1, 1]) {
    const string = mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.13, 6), cord, s * 0.03, 0.44, -0.112);
    string.rotation.z = s * 0.05;
    torso.add(string);
    torso.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 8), mat('#9a9a9a', 0.3, 0.9), s * 0.033, 0.37, -0.114));
  }

  // ---------------------------------------------------------- head
  const headPivot = new THREE.Group();
  headPivot.position.y = 0.54;
  root.add(headPivot);
  headPivot.add(mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.12, 16), skin, 0, 0.04, 0.005));
  const head = mesh(new THREE.SphereGeometry(0.105, 36, 28), skin, 0, 0.16, 0);
  head.scale.set(0.93, 1.08, 1.0);
  headPivot.add(head);
  const jaw = mesh(new THREE.SphereGeometry(0.072, 24, 16), skin, 0, 0.11, -0.012);
  jaw.scale.set(1, 0.85, 1);
  headPivot.add(jaw);
  for (const s of [-1, 1]) {
    const ear = mesh(new THREE.SphereGeometry(0.028, 14, 10), skin, s * 0.097, 0.155, 0.008);
    ear.scale.set(0.45, 1, 0.75);
    headPivot.add(ear);
  }
  const nose = mesh(new THREE.SphereGeometry(0.017, 14, 10), skin, 0, 0.14, -0.104);
  nose.scale.set(0.8, 1.1, 1.0);
  headPivot.add(nose);
  const eyes: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(s * 0.037, 0.168, -0.099);
    const white = mesh(new THREE.SphereGeometry(0.018, 16, 12), eyeWhite);
    white.scale.set(1, 0.9, 0.6);
    eye.add(white);
    eye.add(mesh(new THREE.SphereGeometry(0.0095, 12, 10), iris, 0, -0.001, -0.009));
    eyes.push(eye);
    headPivot.add(eye);
    const brow = mesh(rb(0.036, 0.009, 0.012, 0.004), hair, s * 0.04, 0.2, -0.1);
    brow.rotation.z = s * -0.12;
    headPivot.add(brow);
  }
  const mouth = mesh(new THREE.TorusGeometry(0.018, 0.0035, 6, 16, Math.PI * 0.8), lips, 0, 0.112, -0.103);
  mouth.rotation.z = Math.PI + Math.PI * 0.1;
  headPivot.add(mouth);
  // hair with volume: a cap plus tufts
  const cap = mesh(new THREE.SphereGeometry(0.115, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.54), hair, 0, 0.17, 0.012);
  cap.rotation.x = 0.45;
  cap.scale.set(1.0, 1.05, 1.08);
  headPivot.add(cap);
  const tuftG = new THREE.SphereGeometry(0.045, 14, 10);
  for (const [x, y, z, sx, rz] of [
    [-0.045, 0.245, -0.06, 1.2, 0.4],
    [0.0, 0.255, -0.07, 1.3, -0.1],
    [0.05, 0.245, -0.055, 1.1, -0.5],
    [-0.02, 0.27, 0.0, 1.4, 0.2],
    [0.04, 0.265, 0.03, 1.3, -0.3],
    [0.0, 0.24, 0.07, 1.4, 0],
  ] as const) {
    const t = mesh(tuftG, hair, x, y, z);
    t.scale.set(sx, 0.55, 1);
    t.rotation.z = rz;
    headPivot.add(t);
  }
  for (const s of [-1, 1]) {
    const side = mesh(new THREE.SphereGeometry(0.04, 12, 8), hair, s * 0.088, 0.19, 0.03);
    side.scale.set(0.5, 1, 1.2);
    headPivot.add(side);
  }

  // ---------------------------------------------------------- arms
  const shoulders: THREE.Group[] = [];
  const elbows: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(s * 0.175, 0.43, 0);
    sh.add(mesh(new THREE.SphereGeometry(0.05, 16, 12), hoodie, -0.006 * s, -0.012, 0));
    sh.add(mesh(new THREE.CapsuleGeometry(0.047, 0.17, 6, 14), hoodie, 0, -0.12, 0));
    const el = new THREE.Group();
    el.position.y = -0.25;
    el.add(mesh(new THREE.CapsuleGeometry(0.041, 0.14, 6, 14), hoodie, 0, -0.1, 0));
    const cuff = mesh(new THREE.TorusGeometry(0.04, 0.013, 8, 20), hoodie, 0, -0.195, 0);
    cuff.rotation.x = Math.PI / 2;
    el.add(cuff);
    const hand = new THREE.Group();
    hand.position.y = -0.225;
    hand.add(mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.03, 12), skin, 0, 0.01, 0));
    hand.add(mesh(rb(0.032, 0.07, 0.066, 0.016), skin, 0, -0.035, 0));
    const fingers = mesh(rb(0.03, 0.055, 0.062, 0.014), skin, 0.002 * s, -0.085, 0.004);
    fingers.rotation.x = -0.25;
    hand.add(fingers);
    const thumb = mesh(new THREE.CapsuleGeometry(0.011, 0.03, 4, 8), skin, -s * 0.008, -0.04, -0.036);
    thumb.rotation.set(-0.5, 0, s * 0.3);
    hand.add(thumb);
    el.add(hand);
    sh.add(el);
    sh.rotation.z = s * 0.1;
    root.add(sh);
    shoulders.push(sh);
    elbows.push(el);
  }

  // ---------------------------------------------------------- legs + sneakers
  const hips: THREE.Group[] = [];
  const knees: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.085, -0.04, 0);
    hip.add(mesh(new THREE.CapsuleGeometry(0.07, 0.16, 6, 14), pants, 0, -0.13, 0));
    const knee = new THREE.Group();
    knee.position.y = -0.27;
    knee.add(mesh(new THREE.SphereGeometry(0.062, 14, 10), pants));
    knee.add(mesh(new THREE.CapsuleGeometry(0.058, 0.16, 6, 14), pants, 0, -0.12, 0));
    const foot = new THREE.Group();
    foot.position.y = -0.26;
    foot.add(mesh(rb(0.098, 0.026, 0.25, 0.012), sole, 0, -0.067, -0.035));
    const upper = mesh(rb(0.09, 0.07, 0.21, 0.032), shoe, 0, -0.03, -0.03);
    foot.add(upper);
    const toe = mesh(new THREE.SphereGeometry(0.046, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), shoe, 0, -0.054, -0.11);
    toe.scale.set(1, 0.8, 1.2);
    foot.add(toe);
    for (let i = 0; i < 3; i++) {
      const lace = mesh(new THREE.BoxGeometry(0.05, 0.006, 0.01), cord, 0, 0.002 - i * 0.012, -0.065 - i * 0.025);
      lace.rotation.x = 0.5;
      foot.add(lace);
    }
    foot.add(mesh(new THREE.CylinderGeometry(0.052, 0.05, 0.04, 14), sole, 0, 0.01, 0.01));
    knee.add(foot);
    hip.add(knee);
    root.add(hip);
    hips.push(hip);
    knees.push(knee);
  }

  return { root, torso, headPivot, eyes, hips, knees, shoulders, elbows, materials };
}
