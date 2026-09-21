/**
 * Robot — bipedal humanoid.
 *
 * MODELLED AFTER `d8.jpeg`: a black glossy ovoid head with no face, a silver chest carrying a
 * bright V chevron, dark mechanical joints throughout, articulated arms ending in long thin
 * fingers, a circular disc at the centre of the pelvis, dark inset panels on the front of each
 * thigh, and short flat boots.
 *
 * Built standing on y = 0 and facing +X, so it walks in the same direction the other machines
 * travel. Height ≈ 1.92, matching the dog's and the car's scale in this scene.
 *
 * The limbs are driven by a `RobotPose` rather than baked in place, so the same builder produces
 * the standing machine and a walking one. Every pose emits the SAME vertex count — only positions
 * move — which is what lets `main.ts` rewrite the geometry buffers each frame.
 */

import type { Color, Point } from "../wireframe";
import { Wireframe, roundedRect } from "../wireframe";
import { rotationZ, transformPoint, translation, multiply } from "../mat4";

const SILVER: Color = [0.78, 0.86, 0.94, 1];
const DARK: Color = [0.22, 0.3, 0.42, 1];
const JOINT: Color = [0.34, 0.46, 0.58, 1];
const GLOW: Color = [0.1, 0.72, 1.0, 1];

const ANKLE_Y = 0.14;
const KNEE_Y = 0.62;
const HIP_Y = 1.06;
const SHOULDER_Y = 1.56;
const ELBOW_Y = 1.22;
const WRIST_Y = 0.94;
const HEAD_Y = 1.83;

/**
 * Rest joints of one leg, before the walk rotates them about the hip.
 *
 * The figure faces +X, so X carries fore/aft and Z carries left/right: the lateral offsets live
 * in the THIRD slot. The caller multiplies that slot by the side sign.
 */
const LEG_REST = {
  hip: [0, HIP_Y, 0.13],
  knee: [0.015, KNEE_Y, 0.145],
  ankle: [0, ANKLE_Y, 0.14],
  /** Boot anchor: directly under the ankle, so the leg lands on the foot instead of beside it. */
  foot: [0, 0.035, 0.14],
} as const;

/** Rest joints of one arm. Same axis convention as the leg. */
const ARM_REST = {
  shoulder: [0, SHOULDER_Y, 0.3],
  elbow: [0.015, ELBOW_Y, 0.345],
  wrist: [0.02, WRIST_Y, 0.365],
  palm: [0.02, WRIST_Y - 0.06, 0.37],
} as const;

export interface LimbPose {
  /** Fore/aft swing about the joint. Positive swings the far end forward (+X). */
  swing: number;
  /** Extra knee/elbow flexion. */
  bend: number;
}

export interface RobotPose {
  /** Vertical offset of the whole upper body. */
  bob: number;
  /** [right, left] */
  legs: readonly LimbPose[];
  /** [right, left] */
  arms: readonly LimbPose[];
}

const STILL: LimbPose = { swing: 0, bend: 0 };

export const ROBOT_STANDING: RobotPose = { bob: 0, legs: [STILL, STILL], arms: [STILL, STILL] };

/**
 * A walk cycle: the legs alternate at half a cycle apart, each arm swings opposite its own leg,
 * and the body rises twice per cycle — the same shape of gait as the dog's trot.
 *
 * `amplitude` scales the whole stride, so 0 reproduces the standing pose exactly and the machine
 * settles without a jump.
 */
export function robotWalk(phase: number, amplitude: number): RobotPose {
  const leg = (p: number): LimbPose => {
    const cycle = p * Math.PI * 2;
    return {
      swing: amplitude * 0.42 * Math.sin(cycle),
      // A human knee folds backwards, and only while the foot is off the ground.
      bend: amplitude * 0.7 * Math.max(0, Math.cos(cycle)),
    };
  };
  const arm = (p: number): LimbPose => ({ swing: amplitude * 0.28 * Math.sin(p * Math.PI * 2), bend: 0 });

  return {
    bob: amplitude * 0.022 * Math.sin(phase * Math.PI * 4),
    legs: [leg(phase), leg(phase + 0.5)],
    // The right arm swings with the left leg, and vice versa.
    arms: [arm(phase + 0.5), arm(phase)],
  };
}

export function robot(pose: RobotPose = ROBOT_STANDING): Wireframe {
  const w = new Wireframe();

  // Torso and head ride the walk's bob; lifting them as a block keeps this independent of how
  // much detail they carry.
  const upper = w.mark();
  torso(w);
  head(w);
  w.transformSince(upper, translation(0, pose.bob, 0));

  for (const side of [0, 1]) {
    // side 0 is the robot's right (+Z), side 1 its left.
    const sz = side === 0 ? 1 : -1;
    leg(w, sz, pose.legs[side] ?? STILL, pose.bob);
    arm(w, sz, pose.arms[side] ?? STILL, pose.bob);
  }

  return w;
}

/** A closed rounded-rectangle torso cross-section in the XZ plane at a given Y. */
function row(y: number, halfX: number, halfZ: number, exponent: number, segments: number): Point[] {
  return roundedRect(halfX, halfZ, exponent, segments).map((p): Point => [p[0], y, p[2]]);
}

function torso(w: Wireframe) {
  // Chest: broad at the shoulders, tapering to the waist, with the bright V of the reference.
  // `row` takes (depth, width) — the figure faces +X, so X is depth and Z is shoulder width.
  const chest = [
    row(1.63, 0.115, 0.215, 3.5, 26),
    row(1.55, 0.13, 0.235, 3.5, 26),
    row(1.45, 0.135, 0.212, 3.5, 26),
    row(1.34, 0.125, 0.178, 3.5, 26),
    row(1.27, 0.112, 0.152, 3.5, 26),
  ];
  w.grid(chest, SILVER, { closed: true });

  // The chevron: two lines converging down the sternum, plus an inner panel line.
  for (const z of [-1, 1]) {
    w.edge([0.122, 1.585, z * 0.185], [0.13, 1.38, 0], GLOW);
    w.edge([0.128, 1.55, z * 0.15], [0.134, 1.44, 0], SILVER);
  }
  w.edge([0.132, 1.375, -0.06], [0.132, 1.375, 0.06], JOINT);
  // Collar seam across the top of the chest.
  w.edge([0, 1.6, -0.2], [0, 1.6, 0.2], JOINT);

  // Shoulder caps.
  for (const sz of [1, -1]) {
    w.shell([0, SHOULDER_Y, sz * 0.3], [0.08, 0.075, 0.08], 6, 18, SILVER);
    w.ring([0, SHOULDER_Y, sz * 0.3], 0.06, "yz", GLOW, 16);
  }

  // Waist: a short dark link between the chest and the pelvis.
  w.tube([0, 1.3, 0], [0, 1.19, 0], 0.115, 0.13, DARK, 2, 20);

  // Pelvis.
  const pelvis = [
    row(1.21, 0.105, 0.145, 3, 22),
    row(1.14, 0.118, 0.168, 3, 22),
    row(1.05, 0.108, 0.15, 3, 22),
  ];
  w.grid(pelvis, DARK, { closed: true });

  // Circular disc at the centre of the pelvis — the hub in the reference.
  w.ring([0.118, 1.14, 0], 0.072, "yz", JOINT, 26);
  w.ring([0.126, 1.14, 0], 0.05, "yz", GLOW, 20);
  w.ring([0.13, 1.14, 0], 0.02, "yz", SILVER, 12);

  // Hip yokes.
  for (const sz of [1, -1]) {
    w.shell([0, HIP_Y - 0.02, sz * 0.13], [0.075, 0.07, 0.075], 6, 16, DARK);
  }
}

function head(w: Wireframe) {
  // Neck.
  w.tube([0, 1.6, 0], [0, 1.7, 0.004], 0.052, 0.058, DARK, 2, 16);
  w.ring([0, 1.62, 0], 0.062, "xz", JOINT, 18);

  // Glossy ovoid head, built about the origin and placed with a slight forward tilt.
  const cap = w.mark();
  w.shell([0, 0, 0], [0.108, 0.128, 0.118], 10, 26, DARK);
  // A single seam around the crown keeps the shell from reading as a plain ball.
  w.ring([0, 0.052, 0], 0.088, "xz", JOINT, 22);
  w.polyline(
    [
      [0.1, 0.06, 0],
      [0.06, 0.125, 0],
      [-0.02, 0.135, 0],
      [-0.09, 0.085, 0],
    ],
    JOINT,
  );
  // Face plate: the smooth front, brighter than the shell behind it.
  w.ring([0.104, 0.005, 0], 0.072, "yz", SILVER, 22);
  w.ring([0.11, 0.005, 0], 0.045, "yz", JOINT, 16);
  w.transformSince(cap, multiply(translation(0, HEAD_Y, 0.006), rotationZ(-0.12)));
}

function leg(w: Wireframe, sz: number, pose: LimbPose, bob: number) {
  const hip: Point = [LEG_REST.hip[0], LEG_REST.hip[1] + bob, sz * LEG_REST.hip[2]];
  const kneeRest: Point = [LEG_REST.knee[0], LEG_REST.knee[1], sz * LEG_REST.knee[2]];
  const ankleRest: Point = [LEG_REST.ankle[0], LEG_REST.ankle[1], sz * LEG_REST.ankle[2]];
  const footRest: Point = [LEG_REST.foot[0], LEG_REST.foot[1], sz * LEG_REST.foot[2]];

  // Articulate about the hip by rotating the authored joint offsets, so the rest silhouette is
  // reproduced exactly whenever the walk is at rest.
  const femur = offsetOf(kneeRest, hip);
  const tibia = offsetOf(ankleRest, kneeRest);
  const heel = offsetOf(footRest, ankleRest);

  const thighRot = rotationZ(pose.swing);
  const shinRot = rotationZ(pose.swing - pose.bend);

  const knee = advance(hip, transformPoint(thighRot, femur));
  const ankle = advance(knee, transformPoint(shinRot, tibia));
  const foot = advance(ankle, transformPoint(shinRot, heel));

  w.tube(hip, knee, 0.078, 0.064, SILVER, 4, 16);
  w.tube(knee, ankle, 0.062, 0.046, SILVER, 4, 14);

  // Dark inset panel on the front of the thigh.
  const mid: Point = [(hip[0] + knee[0]) / 2, (hip[1] + knee[1]) / 2, (hip[2] + knee[2]) / 2];
  w.shell([mid[0] + 0.042, mid[1] + 0.02, mid[2]], [0.036, 0.085, 0.048], 6, 18, DARK);

  // Mechanical knee and ankle.
  w.shell(knee, [0.066, 0.062, 0.066], 6, 18, DARK);
  w.ring(knee, 0.044, "yz", GLOW, 14);
  w.shell(ankle, [0.05, 0.05, 0.05], 5, 16, DARK);
  // Ankle link, carrying the shin down onto the boot. Without it the boot floats clear of the leg.
  w.tube(ankle, foot, 0.046, 0.052, DARK, 1, 12);

  // Boot: short and flat, centred under the ankle so it reads as a foot rather than a plate
  // stuck on the front of the shin.
  w.roundedBox(foot, [0.15, 0.035, 0.08], SILVER, {
    exponent: 5,
    edge: 0.018,
    segments: 20,
    bands: 2,
  });
  // Toe accent at the front of the boot.
  w.edge([foot[0] + 0.125, foot[1] - 0.03, foot[2] - 0.062], [foot[0] + 0.125, foot[1] - 0.03, foot[2] + 0.062], GLOW);
}

function arm(w: Wireframe, sz: number, pose: LimbPose, bob: number) {
  const shoulder: Point = [ARM_REST.shoulder[0], ARM_REST.shoulder[1] + bob, sz * ARM_REST.shoulder[2]];
  const elbowRest: Point = [ARM_REST.elbow[0], ARM_REST.elbow[1], sz * ARM_REST.elbow[2]];
  const wristRest: Point = [ARM_REST.wrist[0], ARM_REST.wrist[1], sz * ARM_REST.wrist[2]];
  const palmRest: Point = [ARM_REST.palm[0], ARM_REST.palm[1], sz * ARM_REST.palm[2]];

  const upper = offsetOf(elbowRest, shoulder);
  const fore = offsetOf(wristRest, elbowRest);
  const hand = offsetOf(palmRest, wristRest);

  const upperRot = rotationZ(pose.swing);
  const foreRot = rotationZ(pose.swing - pose.bend);

  const elbow = advance(shoulder, transformPoint(upperRot, upper));
  const wrist = advance(elbow, transformPoint(foreRot, fore));
  const palm = advance(wrist, transformPoint(foreRot, hand));

  w.tube(shoulder, elbow, 0.056, 0.048, SILVER, 4, 14);
  w.tube(elbow, wrist, 0.048, 0.038, SILVER, 4, 14);

  // Elbow and wrist hardware.
  w.shell(elbow, [0.055, 0.05, 0.055], 6, 16, DARK);
  w.ring(elbow, 0.036, "yz", GLOW, 12);
  w.ring(wrist, 0.038, "yz", DARK, 14);

  // Hand: a short palm with four long fingers and a thumb.
  w.roundedBox(palm, [0.03, 0.042, 0.036], DARK, { exponent: 4, edge: 0.014, segments: 14, bands: 2 });
  for (let k = 0; k < 4; k++) {
    const zOff = (k - 1.5) * 0.019;
    const tipLen = k === 0 || k === 3 ? 0.095 : 0.11;
    const root: Point = [palm[0] + 0.004, palm[1] - 0.04, palm[2] + zOff];
    w.tube(root, [root[0] + 0.01, root[1] - tipLen, root[2] + zOff * 0.25], 0.012, 0.008, SILVER, 2, 8);
  }
  // Thumb, angled across the palm.
  const thumbRoot: Point = [palm[0] - 0.01, palm[1] - 0.02, palm[2] - sz * 0.03];
  w.tube(thumbRoot, [thumbRoot[0] + 0.02, thumbRoot[1] - 0.07, thumbRoot[2] + sz * 0.012], 0.013, 0.009, SILVER, 2, 8);
}

function offsetOf(to: Point, from: Point): Point {
  return [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
}

function advance(from: Point, offset: Point): Point {
  return [from[0] + offset[0], from[1] + offset[1], from[2] + offset[2]];
}
