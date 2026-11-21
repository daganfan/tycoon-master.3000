import * as THREE from 'three';
import { mat, rbox, shadowed } from '../room';
import { signTex } from './textures';

/** How a garage eBuy item shows up in the world. */
export interface GaragePropSpec {
  build: () => THREE.Group;
  /** Floor spot (y = bottom) per unit owned; wall props use their exact position. */
  spots: [number, number, number][];
  /** Dynamic props get a box collider with these half extents (centre at half.y above the spot). */
  half?: [number, number, number];
  /** Static wall-mounted prop rotation (y). */
  ry?: number;
}

const steel = () => mat('#868e96', 0.4, 0.7);

export const GARAGE_PROPS: Record<string, GaragePropSpec> = {
  g_power_strip: {
    spots: [[-3.05, 0.93, 4.95]],
    half: [0.05, 0.025, 0.2],
    build: () => {
      const g = new THREE.Group();
      const b = rbox(0.1, 0.05, 0.4, 0.01, mat('#f1f3f5', 0.5));
      b.position.y = 0.025;
      g.add(b);
      for (let i = 0; i < 6; i++) {
        const o = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.03), mat('#212529', 0.6));
        o.position.set(0, 0.052, -0.15 + i * 0.06);
        g.add(o);
      }
      const sw = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.01, 0.02), mat('#fa5252', 0.4, 0, { emissive: '#fa5252', emissiveIntensity: 1.5 }));
      sw.position.set(0, 0.055, 0.18);
      g.add(sw);
      return g;
    },
  },
  g_shop_vac: {
    spots: [[-3.05, 0, 6.3], [-3.05, 0, 5.75]],
    half: [0.2, 0.3, 0.2],
    build: () => {
      const g = new THREE.Group();
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.17, 0.45, 20), mat('#f2c200', 0.45, 0.1));
      drum.position.y = 0.27;
      g.add(drum);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 20), mat('#212529', 0.5));
      lid.position.y = 0.55;
      g.add(lid);
      const hose = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 8, 20, Math.PI * 1.4), mat('#343a40', 0.6));
      hose.position.set(0.12, 0.45, 0);
      hose.rotation.y = Math.PI / 2;
      g.add(hose);
      const magnet = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 8, 16, Math.PI), mat('#e03131', 0.4, 0.3));
      magnet.position.set(0.2, 0.15, 0.12);
      magnet.rotation.z = Math.PI;
      g.add(magnet);
      return g;
    },
  },
  g_heater: {
    spots: [[4.95, 0, 2.92], [5.45, 0, 2.92]],
    half: [0.15, 0.22, 0.1],
    build: () => {
      const g = new THREE.Group();
      const body = rbox(0.3, 0.42, 0.18, 0.03, mat('#343a40', 0.5, 0.4));
      body.position.y = 0.23;
      g.add(body);
      const grill = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.28), mat('#ff6b00', 0.6, 0, { emissive: '#ff4400', emissiveIntensity: 2.2 }));
      grill.position.set(0, 0.25, 0.092);
      g.add(grill);
      return g;
    },
  },
  g_neon: {
    spots: [[6.58, 2.15, 5.9]],
    ry: -Math.PI / 2,
    build: () => {
      const g = new THREE.Group();
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 0.45),
        new THREE.MeshBasicMaterial({ map: signTex([{ text: 'OPEN 24/7', size: 110, color: '#ff4fd8' }], 'rgba(10,0,20,0.6)', '#3bf0ff', 640), transparent: true, toneMapped: false }),
      );
      g.add(sign);
      return g;
    },
  },
  g_tool_chest: {
    spots: [[-2.95, 0, 8.45], [-2.95, 0, 9.25]],
    half: [0.25, 0.4, 0.33],
    build: () => {
      const g = new THREE.Group();
      const red = mat('#c92a2a', 0.35, 0.4);
      const body = rbox(0.5, 0.74, 0.66, 0.02, red);
      body.position.y = 0.45;
      g.add(body);
      for (let i = 0; i < 5; i++) {
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.015, 0.4), steel());
        handle.position.set(0.26, 0.22 + i * 0.13, 0);
        g.add(handle);
      }
      for (const [dx, dz] of [[-0.2, -0.28], [0.2, -0.28], [-0.2, 0.28], [0.2, 0.28]] as const) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), mat('#212529', 0.7));
        w.rotation.x = Math.PI / 2;
        w.position.set(dx, 0.04, dz);
        g.add(w);
      }
      return g;
    },
  },
  g_grease: {
    spots: [[-2.6, 0, 10.2], [-3.05, 0, 9.85], [-2.55, 0, 9.65]],
    half: [0.17, 0.27, 0.17],
    build: () => {
      const g = new THREE.Group();
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.54, 20), mat('#1971c2', 0.45, 0.5));
      drum.position.y = 0.27;
      g.add(drum);
      for (const y of [0.12, 0.42]) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(0.172, 0.01, 6, 20), steel());
        rib.rotation.x = Math.PI / 2;
        rib.position.y = y;
        g.add(rib);
      }
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.14), new THREE.MeshBasicMaterial({ map: signTex([{ text: 'GREASE', size: 80, color: '#fff' }], '#1864ab', '#fff', 320) }));
      label.position.set(0, 0.28, 0.172);
      g.add(label);
      return g;
    },
  },
  g_soda_fridge: {
    spots: [[6.28, 0, 8.3]],
    half: [0.27, 0.45, 0.24],
    build: () => {
      const g = new THREE.Group();
      const body = rbox(0.54, 0.9, 0.48, 0.03, mat('#e9ecef', 0.3, 0.2));
      body.position.y = 0.45;
      g.add(body);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.72), mat('#a5d8ff', 0.1, 0, { transparent: true, opacity: 0.7, emissive: '#74c0fc', emissiveIntensity: 0.4 }));
      door.position.set(-0.271, 0.46, 0);
      door.rotation.y = -Math.PI / 2;
      g.add(door);
      for (let i = 0; i < 3; i++)
        for (let k = 0; k < 4; k++) {
          const can = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.11, 10), mat(['#e03131', '#2f9e44', '#f08c00'][i]!, 0.3, 0.6));
          can.position.set(-0.15, 0.2 + i * 0.22, -0.15 + k * 0.1);
          g.add(can);
        }
      return g;
    },
  },
  g_camera: {
    spots: [[6.45, 2.7, 2.85]],
    ry: -Math.PI * 0.75,
    build: () => {
      const g = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.2), mat('#dee2e6', 0.5));
      arm.position.z = -0.1;
      g.add(arm);
      const cam = rbox(0.12, 0.1, 0.24, 0.02, mat('#f8f9fa', 0.4));
      cam.position.set(0, -0.04, 0.05);
      cam.rotation.x = 0.4;
      g.add(cam);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff0000', toneMapped: false }));
      led.position.set(0.03, -0.01, 0.17);
      led.name = 'rec';
      g.add(led);
      return g;
    },
  },
  g_dehumidifier: {
    spots: [[5.0, 0, 10.3], [4.45, 0, 10.35]],
    half: [0.18, 0.3, 0.14],
    build: () => {
      const g = new THREE.Group();
      const body = rbox(0.36, 0.6, 0.28, 0.05, mat('#f8f9fa', 0.4));
      body.position.y = 0.3;
      g.add(body);
      const vent = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.12), mat('#495057', 0.7));
      vent.position.set(0, 0.5, -0.141);
      vent.rotation.y = Math.PI;
      g.add(vent);
      const tank = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.02), mat('#74c0fc', 0.1, 0, { transparent: true, opacity: 0.8 }));
      tank.position.set(0, 0.14, -0.141);
      g.add(tank);
      return g;
    },
  },
  g_robo_battery: {
    spots: [[6.4, 0, 6.2]],
    half: [0.1, 0.13, 0.08],
    build: () => {
      const g = new THREE.Group();
      const body = rbox(0.2, 0.26, 0.16, 0.02, mat('#2b8a3e', 0.4, 0.3));
      body.position.y = 0.13;
      g.add(body);
      const term = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 8), steel());
      term.position.set(0.05, 0.28, 0);
      g.add(term);
      const bolt = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), new THREE.MeshBasicMaterial({ map: signTex([{ text: '⚡', size: 160, color: '#ffd43b' }], 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 256), transparent: true }));
      bolt.position.set(0, 0.14, -0.081);
      bolt.rotation.y = Math.PI;
      g.add(bolt);
      return g;
    },
  },
  g_disco_lamp: {
    spots: [[1.6, 2.97, 5.2]],
    build: () => {
      const g = new THREE.Group();
      const panel = rbox(1.6, 0.04, 0.6, 0.01, mat('#ffffff', 0.3, 0, { emissive: '#f8fbff', emissiveIntensity: 2.5 }));
      panel.name = 'noshadow';
      g.add(panel);
      return g;
    },
  },
};

export function buildGarageProp(id: string): THREE.Group | null {
  const spec = GARAGE_PROPS[id];
  if (!spec) return null;
  const g = shadowed(spec.build());
  g.traverse((o) => o.name === 'noshadow' && (o.castShadow = false));
  return g;
}
