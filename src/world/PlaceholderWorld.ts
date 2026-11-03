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
import type { Effects } from '../fx/Effects';
import { FIRE, HEAT } from '../fx/Heat';
import { ALBEDO, GLOW, groundAlbedo, signature, type Signature } from '../fx/Light';
import { ThermalMaterial } from '../render/ThermalMaterial';
import type { Collision } from './Collision';
import { DummyTarget } from './DummyTarget';
import { createGroundHeat } from './groundHeat';
import type { Terrain } from './Terrain';

/** A dummy plus the meshes/materials that draw it. */
interface DummyView {
  target: DummyTarget;
  obj: Object3D;
  body: ThermalMaterial;
  engine?: ThermalMaterial;
}

const MAX_WINDOWS = 160;
const MAX_CHIMNEYS = 40;

/**
 * TEMPORARY content so there is something to aim at: a cluster of houses, a farm,
 * tree lines and a few moving "dummy" targets you can shoot (M3). M4 replaces the dummies with
 * real units and M6 replaces the rest with the handcrafted map.
 * Every object has a signature: heat for thermal (`fx/Heat.ts`, PLAN.md §7.5) and near-IR
 * albedo + glow for night vision (`fx/Light.ts`).
 */
export class PlaceholderWorld {
  readonly root = new Group();
  /** Everything the guns can hurt. */
  readonly targets: DummyTarget[] = [];
  private readonly dummies: DummyView[] = [];

  private readonly wallMat = new ThermalMaterial({
    signature: signature(HEAT.wall, ALBEDO.wall),
  });
  private readonly roofMat = new ThermalMaterial({
    signature: signature(HEAT.roof, ALBEDO.roof),
  });
  private readonly windows = new InstancedSignature(
    new BoxGeometry(1.2, 1.1, 0.3),
    MAX_WINDOWS,
    0.4, // windows are small: little surface noise
  );
  private readonly chimneys = new InstancedSignature(
    new BoxGeometry(0.9, 2.2, 0.9),
    MAX_CHIMNEYS,
    0.5,
  );

  constructor(
    private readonly terrain: Terrain,
    private readonly collision: Collision,
  ) {
    const rng = createRng(2024);

    const geo = terrain.buildGeometry();
    const groundHeat = createGroundHeat(4242);
    const pos = geo.getAttribute('position');
    const sig = new Float32Array(pos.count * 3); // (heat, albedo, glow) per vertex
    for (let k = 0; k < pos.count; k++) {
      const heat = groundHeat(pos.getX(k), pos.getZ(k));
      sig[k * 3] = heat;
      sig[k * 3 + 1] = groundAlbedo(heat);
    }
    geo.setAttribute('signature', new BufferAttribute(sig, 3));
    this.root.add(new Mesh(geo, new ThermalMaterial({ source: 'vertex' })));

    this.addHouses(rng, 0, 0, 25, 130); // village
    this.addHouses(rng, -450, -250, 3, 40); // farm
    this.addHouses(rng, 380, -80, 3, 30); // crossroads
    this.root.add(this.windows.finish(), this.chimneys.finish());
    this.addTrees(rng);
    this.addDummies(rng);
  }

  update(dt: number, effects: Effects): void {
    for (const d of this.dummies) {
      const t = d.target;
      t.update(dt);
      d.obj.position.copy(t.position);
      d.obj.rotation.set(0, t.heading, 0);
      if (t.kind === 'infantry') {
        // Death reaction: tumble while flung, then lie flat.
        if (t.state === 'flung') d.obj.rotation.x = t.tumble;
        if (t.state === 'down') d.obj.rotation.x = Math.PI / 2;
        d.body.setHeat(t.heat);
      } else {
        const fire = t.burning ? (t.heat - FIRE.min) / (FIRE.max - FIRE.min) : 0;
        d.body.setSignature(
          t.heat,
          t.alive ? ALBEDO.vehicleBody : 0.08,
          t.burning ? 0.6 * fire : 0,
        );
        d.engine?.setHeat(t.alive ? HEAT.engine : t.heat);
        if (t.burning) effects.fire(t.position, dt);
        else if (t.smoking || !t.alive) effects.smokePuff(t.position, dt, t.alive ? 1 : 0.3);
      }
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

      // Collision box: walls plus most of the roof (shells land on roofs, not inside them).
      const boxH = wallH + roof.scale.y * 0.6;
      this.collision.addBox({
        center: new Vector3(x, y + boxH / 2, z),
        half: new Vector3(w / 2, boxH / 2, d / 2),
        rotY: house.rotation.y,
      });

      // Windows on the long walls; some rooms are dark (unheated).
      const windowY = 1.5 + h * 0.55;
      for (const side of [-1, 1]) {
        const n = Math.floor(range(rng, 1, 3.99));
        for (let i = 0; i < n; i++) {
          const wx = ((i + 0.5) / n - 0.5) * w * 0.7;
          local.makeTranslation(wx, windowY, side * (d / 2 + 0.05));
          const lit = rng() < 0.7;
          const sig = lit
            ? signature(
                HEAT.window + range(rng, -0.05, 0.08),
                ALBEDO.window,
                GLOW.litWindow * range(rng, 0.8, 1),
              )
            : signature(HEAT.wall + 0.06, ALBEDO.window);
          this.windows.add(world.multiplyMatrices(house.matrix, local), sig);
        }
      }

      // Half the houses have a warm chimney.
      if (rng() < 0.5) {
        local.makeTranslation(w * 0.25, wallH + 1.6, 0);
        this.chimneys.add(
          world.multiplyMatrices(house.matrix, local),
          signature(HEAT.chimney, ALBEDO.chimney),
        );
      }
    }
  }

  private addTrees(rng: Rng): void {
    const lines = 14;
    const perLine = 45;
    const trees = new InstancedSignature(
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
        trees.add(
          m.compose(p, q, s),
          signature(HEAT.tree + range(rng, -0.02, 0.02), ALBEDO.tree * range(rng, 0.85, 1.1)),
        );
      }
    }
    this.root.add(trees.finish());
  }

  /** Hot moving targets: stand-ins for soldiers and trucks to practice leading shots. */
  private addDummies(rng: Rng): void {
    const ground = (x: number, z: number) => this.terrain.heightAt(x, z);
    const soldierGeo = new CapsuleGeometry(0.45, 1.2, 3, 6);
    const truckGeo = new BoxGeometry(2.4, 2.4, 6);
    const engineGeo = new BoxGeometry(2.0, 0.6, 1.4);

    for (let k = 0; k < 12; k++) {
      const target = new DummyTarget(
        'infantry',
        {
          cx: range(rng, -120, 120),
          cz: range(rng, -120, 120),
          r: range(rng, 10, 40),
          speed: range(rng, 1.2, 2.5),
          phase: range(rng, 0, Math.PI * 2),
        },
        ground,
        1.1 * 1.3,
      );
      // Each soldier has its own material so it can cool down on its own when killed.
      const body = new ThermalMaterial({
        signature: signature(HEAT.soldier, ALBEDO.soldier),
        noise: 0.3,
      });
      const mesh = new Mesh(soldierGeo, body);
      mesh.scale.setScalar(1.3); // 1.3× size so they read at 105 mm (M1 sign-off)
      this.addDummy({ target, obj: mesh, body });
    }

    for (let k = 0; k < 2; k++) {
      const target = new DummyTarget(
        'vehicle',
        { cx: 0, cz: 0, r: 180 + k * 60, speed: 9, phase: range(rng, 0, Math.PI * 2) },
        ground,
        1.2,
        k + 1,
      );
      const body = new ThermalMaterial({
        signature: signature(HEAT.vehicleBody, ALBEDO.vehicleBody),
      });
      const engine = new ThermalMaterial({
        signature: signature(HEAT.engine, ALBEDO.vehicleBody),
        noise: 0.3,
      });
      const truck = new Group();
      truck.add(new Mesh(truckGeo, body));
      const block = new Mesh(engineGeo, engine); // hot engine block under the hood
      block.position.set(0, 1.25, 2.1);
      truck.add(block);
      this.addDummy({ target, obj: truck, body, engine });
    }
  }

  private addDummy(d: DummyView): void {
    this.dummies.push(d);
    this.targets.push(d.target);
    this.root.add(d.obj);
  }
}

/** An InstancedMesh where every instance carries its own signature (`instanceSignature`). */
class InstancedSignature {
  private readonly mesh: InstancedMesh;
  private readonly sig: Float32Array;
  private readonly capacity: number;
  private n = 0;

  constructor(geometry: BoxGeometry | ConeGeometry, capacity: number, noise: number) {
    this.mesh = new InstancedMesh(
      geometry,
      new ThermalMaterial({ source: 'instance', noise }),
      capacity,
    );
    this.capacity = capacity;
    this.sig = new Float32Array(capacity * 3);
    geometry.setAttribute('instanceSignature', new InstancedBufferAttribute(this.sig, 3));
  }

  add(matrix: Matrix4, s: Signature): void {
    if (this.n >= this.capacity) return;
    this.mesh.setMatrixAt(this.n, matrix);
    this.sig.set([s.heat, s.albedo, s.glow], this.n * 3);
    this.n++;
  }

  finish(): InstancedMesh {
    this.mesh.count = this.n;
    this.mesh.computeBoundingSphere();
    return this.mesh;
  }
}
