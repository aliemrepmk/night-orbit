import type { InfantryState } from './Infantry';

export interface PoseInput {
  readonly state: InfantryState;
  readonly heading: number;
  readonly tumble: number;
  readonly walkPhase: number;
  readonly crouched: boolean;
}

export interface PoseConfig {
  readonly bobHeight: number;
  readonly leanRad: number;
  readonly fleeLeanRad: number;
  readonly crouchDrop: number;
  readonly crouchLeanRad: number;
}

/** Body pose for drawing: pitch (radians, about the body's right axis), yaw and vertical bob. */
export interface Pose {
  pitch: number;
  yaw: number;
  bob: number;
}

/**
 * Procedural pose (PLAN.md §7.8): walking soldiers bob twice per stride and lean forward
 * (running ones lean further); soldiers in cover crouch; flung bodies tumble; dead ones lie
 * flat along their facing. Pure, so it can be tested.
 */
export function infantryPose(u: PoseInput, cfg: PoseConfig, out: Pose): Pose {
  out.yaw = u.heading;
  out.bob = 0;
  out.pitch = 0;
  switch (u.state) {
    case 'moving':
    case 'fleeing':
      out.bob = Math.abs(Math.sin(u.walkPhase)) * cfg.bobHeight;
      out.pitch = u.state === 'fleeing' ? cfg.fleeLeanRad : cfg.leanRad;
      break;
    case 'flung':
      out.pitch = u.tumble;
      break;
    case 'dead':
      out.pitch = Math.PI / 2;
      break;
    default:
      if (u.crouched) {
        out.bob = -cfg.crouchDrop;
        out.pitch = cfg.crouchLeanRad;
      }
      break;
  }
  return out;
}
