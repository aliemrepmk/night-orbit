import { Vector3 } from 'three';
import { CONFIG } from '../config';
import type { Rng } from '../core/rng';
import type { RayHit } from '../world/Collision';
import { flightTime, muzzlePosition, offsetAcrossView, sampleDisc } from './ballistics';
import { WEAPONS, type WeaponId } from './weaponDefs';

/** One shell about to be fired: where it leaves, where it lands, and how long it flies. */
export interface Shot {
  readonly from: Vector3;
  readonly to: Vector3;
  readonly duration: number;
  readonly kind: RayHit['kind'];
  readonly box: number;
}

/** What a shot can hit: the world's raycast (roofs before ground). */
export interface Raycaster {
  raycast(origin: Vector3, dir: Vector3): RayHit | null;
}

/**
 * Aims one shell (PLAN.md §7.6), shared by the game and the headless gunner bot (M10) so both
 * fire exactly the same rounds: raycast the sensor's line of sight (roofs before ground),
 * scatter within the weapon's spread across the view, then fly for distance / speed seconds
 * from the muzzle. Null when the line of sight hits nothing. The returned vectors are reused
 * on the next call (no per-shot allocations): copy them to keep them.
 */
export class ShotPlanner {
  private readonly dir = new Vector3();
  private readonly spreadPoint = new Vector3();
  private readonly muzzle = new Vector3();
  private readonly landing = new Vector3();

  constructor(private readonly world: Raycaster) {}

  plan(id: WeaponId, eye: Vector3, orbitCenter: Vector3, aim: Vector3, rng: Rng): Shot | null {
    const w = WEAPONS[id];
    this.dir.subVectors(aim, eye).normalize();
    const aimed = this.world.raycast(eye, this.dir);
    const aimPoint = aimed ? aimed.point : aim;

    const [dx, dy] = sampleDisc(rng, w.spread);
    offsetAcrossView(eye, aimPoint, dx, dy, this.spreadPoint);
    this.dir.subVectors(this.spreadPoint, eye).normalize();
    const hit = this.world.raycast(eye, this.dir) ?? aimed;
    if (!hit) return null;

    const g = CONFIG.gunnery;
    muzzlePosition(eye, orbitCenter, g.muzzleDrop, g.muzzleSide, this.muzzle);
    this.landing.copy(hit.point);
    return {
      from: this.muzzle,
      to: this.landing,
      duration: flightTime(this.muzzle.distanceTo(hit.point), w.shellSpeed),
      kind: hit.kind,
      box: hit.box,
    };
  }
}
