import { type BufferGeometry, InstancedBufferAttribute, InstancedMesh, type Matrix4 } from 'three';
import type { Signature } from '../fx/Light';
import { ThermalMaterial } from '../render/ThermalMaterial';

/**
 * A static InstancedMesh where every instance carries its own signature (`instanceSignature`):
 * one draw call for every wall, roof, window or tree of a kind across the whole map.
 */
export class InstancedSignature {
  private readonly mesh: InstancedMesh;
  private readonly sig: Float32Array;
  private n = 0;

  constructor(
    geometry: BufferGeometry,
    private readonly capacity: number,
    /** Surface noise of the material (foliage is noisy, glass is smooth). */
    noise: number,
  ) {
    this.mesh = new InstancedMesh(
      geometry,
      new ThermalMaterial({ source: 'instance', noise }),
      capacity,
    );
    this.sig = new Float32Array(capacity * 3);
    geometry.setAttribute('instanceSignature', new InstancedBufferAttribute(this.sig, 3));
  }

  get count(): number {
    return this.n;
  }

  /** Adds one instance; returns false (and draws nothing) once the capacity is used up. */
  add(matrix: Matrix4, s: Signature): boolean {
    if (this.n >= this.capacity) return false;
    this.mesh.setMatrixAt(this.n, matrix);
    this.sig[this.n * 3] = s.heat;
    this.sig[this.n * 3 + 1] = s.albedo;
    this.sig[this.n * 3 + 2] = s.glow;
    this.n++;
    return true;
  }

  finish(): InstancedMesh {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
    return this.mesh;
  }
}
