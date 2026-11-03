import {
  type BufferGeometry,
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { createRng, range, type Rng } from '../core/rng';
import type { Terrain } from './Terrain';

/**
 * TEMPORARY M1 content so there is something to aim at: a cluster of houses, a farm,
 * tree lines and a few moving "dummy" targets. M6 replaces this with the handcrafted map.
 */
export class PlaceholderWorld {
  readonly root = new Group();
  private readonly walkers: {
    mesh: Mesh;
    cx: number;
    cz: number;
    r: number;
    speed: number;
    phase: number;
  }[] = [];
  private time = 0;

  constructor(private readonly terrain: Terrain) {
    const rng = createRng(2024);

    const ground = new Mesh(terrain.buildGeometry(), new MeshLambertMaterial({ color: 0x4a4f4c }));
    this.root.add(ground);

    this.addHouses(rng, 0, 0, 25, 130); // village
    this.addHouses(rng, -450, -250, 3, 40); // farm
    this.addHouses(rng, 380, -80, 3, 30); // crossroads
    this.addTrees(rng);
    this.addDummies(rng);
  }

  update(dt: number): void {
    this.time += dt;
    for (const w of this.walkers) {
      const a = w.phase + (this.time * w.speed) / w.r;
      const x = w.cx + Math.cos(a) * w.r;
      const z = w.cz + Math.sin(a) * w.r;
      w.mesh.position.set(x, this.terrain.heightAt(x, z) + w.mesh.userData.lift, z);
      w.mesh.rotation.y = -a;
    }
  }

  private addHouses(rng: Rng, cx: number, cz: number, count: number, spread: number): void {
    const wallMat = new MeshLambertMaterial({ color: 0x8a8d88 });
    const roofMat = new MeshLambertMaterial({ color: 0x6b6e6a });
    for (let k = 0; k < count; k++) {
      const x = cx + range(rng, -spread, spread);
      const z = cz + range(rng, -spread, spread);
      const w = range(rng, 7, 14);
      const d = range(rng, 6, 10);
      const h = range(rng, 3.5, 6);
      const y = this.terrain.heightAt(x, z) - 1.5; // sink the base so slopes don't show gaps
      const house = new Group();
      house.position.set(x, y, z);
      house.rotation.y = range(rng, 0, Math.PI);

      const walls = new Mesh(new BoxGeometry(w, h + 1.5, d), wallMat);
      walls.position.y = (h + 1.5) / 2;
      house.add(walls);

      // Hip roof: a 4-sided cone rotated 45° and stretched to the footprint.
      const roof = new Mesh(new ConeGeometry(Math.SQRT1_2, 1, 4), roofMat);
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(w, range(rng, 2, 3.5), d);
      roof.position.y = h + 1.5 + roof.scale.y / 2;
      house.add(roof);
      this.root.add(house);
    }
  }

  private addTrees(rng: Rng): void {
    const lines = 14;
    const perLine = 45;
    const trees = new InstancedMesh(
      new ConeGeometry(3, 10, 6).translate(0, 5, 0),
      new MeshLambertMaterial({ color: 0x2c312e }),
      lines * perLine,
    );
    const m = new Matrix4();
    const q = new Quaternion();
    const s = new Vector3();
    const p = new Vector3();
    let n = 0;
    for (let l = 0; l < lines; l++) {
      let x = range(rng, -750, 750);
      let z = range(rng, -750, 750);
      let heading = range(rng, 0, Math.PI * 2);
      for (let t = 0; t < perLine; t++) {
        heading += range(rng, -0.25, 0.25);
        x += Math.cos(heading) * range(rng, 5, 9);
        z += Math.sin(heading) * range(rng, 5, 9);
        const scale = range(rng, 0.7, 1.4);
        p.set(x + range(rng, -2, 2), this.terrain.heightAt(x, z) - 0.5, z + range(rng, -2, 2));
        s.set(scale, scale * range(rng, 0.8, 1.2), scale);
        trees.setMatrixAt(n++, m.compose(p, q, s));
      }
    }
    trees.count = n;
    this.root.add(trees);
  }

  /** Bright moving shapes: stand-ins for soldiers and vehicles to practice tracking. */
  private addDummies(rng: Rng): void {
    const hot = new MeshLambertMaterial({ color: 0xffffff, emissive: 0xbbbbbb });
    const soldierGeo = new CapsuleGeometry(0.45, 1.2, 3, 6);
    const truckGeo = new BoxGeometry(2.4, 2.4, 6);
    const spawn = (
      geo: BufferGeometry,
      lift: number,
      scale: number,
      cx: number,
      cz: number,
      r: number,
      speed: number,
    ) => {
      const mesh = new Mesh(geo, hot);
      mesh.scale.setScalar(scale);
      mesh.userData.lift = lift;
      this.root.add(mesh);
      this.walkers.push({ mesh, cx, cz, r, speed, phase: range(rng, 0, Math.PI * 2) });
    };
    for (let k = 0; k < 12; k++) {
      spawn(
        soldierGeo,
        1.1 * 1.3,
        1.3,
        range(rng, -120, 120),
        range(rng, -120, 120),
        range(rng, 10, 40),
        range(rng, 1.2, 2.5),
      );
    }
    for (let k = 0; k < 2; k++) {
      spawn(truckGeo, 1.2, 1, 0, 0, 180 + k * 60, 9);
    }
  }
}
