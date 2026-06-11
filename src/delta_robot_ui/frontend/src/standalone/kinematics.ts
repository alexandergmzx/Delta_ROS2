import type { Target } from '../api/types';

// TypeScript port of src/delta_robot_serial/include/inverse_kinematics.h —
// keep the math and the candidate branch order in sync with the C++ source of truth.
export const PROXIMAL_LINK_MM = 50.0;
export const DISTAL_LINK_MM = 93.0;
export const BASE_OFFSET_MM = 28.0;
export const PLATFORM_OFFSET_MM = 20.0;
export const ARM_ALPHAS_DEG: readonly [number, number, number] = [0.0, 120.0, 240.0];

export const MIN_MOTOR_ANGLE_DEG = 0.0;
export const MAX_MOTOR_ANGLE_DEG = 90.0;

const HALF_PI = Math.PI / 2;

export function inverseKinematicsDeg(target: Target, alphaDeg: number): number {
  const alpha = (alphaDeg * Math.PI) / 180.0;
  const xLeg = target.x * Math.cos(alpha) + target.y * Math.sin(alpha);
  const yLeg = target.x * Math.sin(alpha) - target.y * Math.cos(alpha);
  const xOffset = BASE_OFFSET_MM - PLATFORM_OFFSET_MM - xLeg;
  const radius = Math.hypot(xOffset, target.z);
  if (radius === 0) {
    return -1; // Error case - out of workspace
  }

  const cosineArgument =
    (DISTAL_LINK_MM ** 2 - xOffset ** 2 - target.z ** 2 - yLeg ** 2 - PROXIMAL_LINK_MM ** 2) /
    (2.0 * PROXIMAL_LINK_MM * radius);
  if (cosineArgument < -1.0 || cosineArgument > 1.0) {
    return -1; // Error case - out of workspace
  }

  const gamma = Math.atan2(target.z, xOffset);
  const candidateA = gamma + Math.acos(cosineArgument);
  const candidateB = gamma - Math.acos(cosineArgument);
  let phi = candidateA;

  if (candidateB >= 0.0 && candidateB <= HALF_PI) {
    phi = candidateB;
  }
  if (candidateA >= 0.0 && candidateA <= HALF_PI) {
    phi = candidateA;
  }
  if (phi < 0.0 || phi > HALF_PI) {
    return -1;
  }
  return (phi * 180.0) / Math.PI;
}

export function motorAnglesDeg(target: Target): [number, number, number] {
  return [
    inverseKinematicsDeg(target, ARM_ALPHAS_DEG[0]),
    inverseKinematicsDeg(target, ARM_ALPHAS_DEG[1]),
    inverseKinematicsDeg(target, ARM_ALPHAS_DEG[2]),
  ];
}

export function anglesAreCommandable(angles: readonly number[]): boolean {
  return angles.every(
    (angle) => Number.isFinite(angle) && angle >= MIN_MOTOR_ANGLE_DEG && angle <= MAX_MOTOR_ANGLE_DEG,
  );
}
