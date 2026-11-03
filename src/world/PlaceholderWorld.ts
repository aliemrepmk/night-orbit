import {
  BoxGeometry,
  BufferAttribute,
  CapsuleGeometry,
  ConeGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { createRng, range, type Rng } from '../core/rng';
import { HEAT } from '../fx/Heat';
import { ThermalMaterial } from '../render/ThermalMaterial';
import { createGroundHeat } from './groundHeat';
import type { Terrain } from './Terrain';

const MAX_WINDOWS = 160;
const MAX_CHIMNEYS = 40;

/**
 * TEMPORARY content so there is something to aim at: a cluster of houses, a farm,
 * tree lines and a few moving "dummy" targets. M6 replaces this with the handcrafted map.
 * Every object has a heat value from the table in PLAN.md §7.5 (see `fx/Heat.ts`).
 */
export class PlaceholderWorld {
  readonly root = new Group();
  private readonly walkers: {
    obj: Object3D;
    lift: number;
    cx: number;
    cz: number;
    r: number;
    speed: number;
    phase: number;
  }[] = [];
  private time = 0;

  private readonly wallMat = new ThermalMaterial({ heat: HEAT.wall });
  private readonly roofMat = new ThermalMaterial({ heat: HEAT.roof });
  private readonly windows = new InstancedHeat(
    new BoxGeometry(1.2, 1.1, 0.3),
    MAX_WINDOWS,
    0.4, // windows are small: little surface noise
  );
  private readonly chimneys = new InstancedHeat(new BoxGeometry(0.9, 2.2, 0.9), MAX_CHIMNEYS, 0.5);

  constructor(private readonly terrain: Terrain) {
    const rng = createRng(2024);

    const geo = terrain.buildGeometry();
    const groundHeat = createGroundHeat(4242);
    const pos = geo.getAttribute('position');
    const heat = new Float32Array(pos.count);
    for (let k = 0; k < pos.count; k++) heat[k] = groundHeat(pos.getX(k), pos.getZ(k));
    geo.setAttribute('heat', new BufferAttribute(heat, 1));
    this.root.add(new Mesh(geo, new ThermalMaterial({ source: 'vertex' })));

    this.addHouses(rng, 0, 0, 25, 130); // village
    this.addHouses(rng, -450, -250, 3, 40); // farm
    this.addHouses(rng, 380, -80, 3, 30); // crossroads
    this.root.add(this.windows.finish(), this.chimneys.finish());
    this.addTrees(rng);
    this.addDummies(rng);
  }

  update(dt: number): void {
    this.time += dt;
    for (const w of this.walkers) {
      const a = w.phase + (this.time * w.speed) / w.r;
      const x = w.cx + Math.cos(a) * w.r;
      const z = w.cz + Math.sin(a) * w.r;
      w.obj.position.set(x, this.terrain.heightAt(x, z) + w.lift, z);
      w.obj.rotation.y = -a; // local +z faces the direction of travel
    }
  }

  private addHouses(rng: Rng, cx: number, cz: number, count: number, spread: number): void {
    const local = new Matrix4();
    const world = new Matrix4();
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
      house.updateMatrix();

      const wallH = h + 1.5;
      const walls = new Mesh(new BoxGeometry(w, wallH, d), this.wallMat);
      walls.position.y = wallH / 2;
      house.add(walls);

      // Hip roof: a 4-sided cone rotated 45° and stretched to the footprint.
      const roof = new Mesh(new ConeGeometry(Math.SQRT1_2, 1, 4), this.roofMat);
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(w, range(rng, 2, 3.5), d);
      roof.position.y = wallH + roof.scale.y / 2;
      house.add(roof);
      this.root.add(house);

      // Windows on the long walls; some rooms are dark (unheated).
      const windowY = 1.5 + h * 0.55;
      for (const side of [-1, 1]) {
        const n = Math.floor(range(rng, 1, 3.99));
        for (let i = 0; i < n; i++) {
          const wx = ((i + 0.5) / n - 0.5) * w * 0.7;
          local.makeTranslation(wx, windowY, side * (d / 2 + 0.05));
          const lit = rng() < 0.7;
          const heat = lit ? HEAT.window + range(rng, -0.05, 0.08) : HEAT.wall + 0.06;
          this.windows.add(world.multiplyMatrices(house.matrix, local), heat);
        }
      }

      // Half the houses have a warm chimney.
      if (rng() < 0.5) {
        local.makeTranslation(w * 0.25, wallH + 1.6, 0);
        this.chimneys.add(world.multiplyMatrices(house.matrix, local), HEAT.chimney);
      }
    }
  }

  private addTrees(rng: Rng): void {
    const lines = 14;
    const perLine = 45;
    const trees = new InstancedHeat(
      new ConeGeometry(3, 10, 6).translate(0, 5, 0),
      lines * perLine,
      1.5, // foliage is noisy
    );
    const m = new Matrix4();
    const q = new Quaternion();
    const s = new Vector3();
    const p = new Vector3();
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
        trees.add(m.compose(p, q, s), HEAT.tree + range(rng, -0.02, 0.02));
      }
    }
    this.root.add(trees.finish());
  }

  /** Hot moving shapes: stand-ins for soldiers and vehicles to practice tracking. */
  private addDummies(rng: Rng): void {
    const soldierMat = new ThermalMaterial({ heat: HEAT.soldier, noise: 0.3 });
    const bodyMat = new ThermalMaterial({ heat: HEAT.vehicleBody });
    const engineMat = new ThermalMaterial({ heat: HEAT.engine, noise: 0.3 });
    const soldierGeo = new CapsuleGeometry(0.45, 1.2, 3, 6);
    const truckGeo = new BoxGeometry(2.4, 2.4, 6);
    const engineGeo = new BoxGeometry(2.0, 0.6, 1.4);

    const spawn = (
      obj: Object3D,
      lift: number,
      cx: number,
      cz: number,
      r: number,
      speed: number,
    ) => {
      this.root.add(obj);
      this.walkers.push({ obj, lift, cx, cz, r, speed, phase: range(rng, 0, Math.PI * 2) });
    };
    for (let k = 0; k < 12; k++) {
      const soldier = new Mesh(soldierGeo, soldierMat);
      soldier.scale.setScalar(1.3); // 1.3× size so they read at 105 mm (M1 sign-off)
      spawn(
        soldier,
        1.1 * 1.3,
        range(rng, -120, 120),
        range(rng, -120, 120),
        range(rng, 10, 40),
        range(rng, 1.2, 2.5),
      );
    }
    for (let k = 0; k < 2; k++) {
      const truck = new Group();
      truck.add(new Mesh(truckGeo, bodyMat));
      const engine = new Mesh(engineGeo, engineMat); // hot engine block under the hood
      engine.position.set(0, 1.25, 2.1);
      truck.add(engine);
      spawn(truck, 1.2, 0, 0, 180 + k * 60, 9);
    }
  }
}

/** An InstancedMesh where every instance carries its own heat (`instanceHeat`). */
class InstancedHeat {
  private readonly mesh: InstancedMesh;
  private readonly heat: Float32Array;
  private n = 0;

  constructor(geometry: BoxGeometry | ConeGeometry, capacity: number, noise: number) {
    this.mesh = new InstancedMesh(
      geometry,
      new ThermalMaterial({ source: 'instance', noise }),
      capacity,
    );
    this.heat = new Float32Array(capacity);
    geometry.setAttribute('instanceHeat', new InstancedBufferAttribute(this.heat, 1));
  }

  add(matrix: Matrix4, heat: number): void {
    if (this.n >= this.heat.length) return;
    this.mesh.setMatrixAt(this.n, matrix);
    this.heat[this.n] = heat;
    this.n++;
  }

  finish(): InstancedMesh {
    this.mesh.count = this.n;
    this.mesh.computeBoundingSphere();
    return this.mesh;
  }
}
