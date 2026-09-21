/**
 * Robot dog — articulated quadruped.
 *
 * MODELLED AFTER `R-C.png`: a compact angular quadruped. The body is a short faceted volume whose
 * top surface humps up just behind the head and tapers to the tail, the head is a chunky angular
 * module carrying a dark visor face, each leg leaves the body through a rounded shoulder pod, and
 * the limbs are slim tapered links ending in small dark ball feet.
 *
 * The body runs along X so the machine is seen in profile as it crosses the frame, with the head
 * leading in the direction of travel (+X).
 *
 * The legs are driven by a `DogPose` rather than baked in place, so the same builder produces both
 * the standing machine and a running one. Every pose emits the SAME vertex count — only positions
 * move — which is what lets `main.ts` rewrite the existing geometry buffers each frame instead of
 * rebuilding them.
 */

import type { Color, Point } from "../wireframe";
import { Wireframe, superellipse } from "../wireframe";
import { rotationZ, transformPoint, translation } from "../mat4";

const PANEL: Color = [0.78, 0.86, 0.94, 1];
const JOINT: Color = [0.3, 0.42, 0.54, 1];
const GLOW: Color = [0.1, 0.72, 1.0, 1];
/**
 * The sensor face and feet, which are black in the reference.
 *
 * Held at a dark navy rather than true black: a black LINE is invisible against this background,
 * so the panel only reads if its own wireframe sits clearly darker than the shell around it. The
 * bright rim drawn around the visor is what makes it look inset.
 */
const VISOR: Color = [0.2, 0.34, 0.48, 1];

/**
 * Body loft stations: [x, top, bottom, halfZ]. Dense through the hump just behind the head, then
 * tapering to the tail — a flat slab would lose the wedge silhouette in the reference.
 *
 * The body is deliberately LONG relative to the stance height (roughly length ≈ total height, as
 * in the reference). Shorten it and the machine stops reading as a quadruped in profile.
 */
const BODY_STATIONS: Array<[number, number, number, number]> = [
  [0.95, 1.38, 0.98, 0.16], // front, where the neck leaves
  [0.72, 1.5, 0.98, 0.21],
  [0.34, 1.58, 0.98, 0.235], // hump
  [-0.1, 1.57, 0.98, 0.235],
  [-0.55, 1.49, 0.99, 0.215],
  [-0.95, 1.39, 1.01, 0.165], // tail
];

const BODY_FRONT = 0.95;
const BODY_BACK = -0.95;

/** Head module: a chunky angular box carried off the front, with a dark visor on its face. */
const HEAD: Point = [1.14, 1.34, 0];
const HEAD_HALF: Point = [0.19, 0.16, 0.17];

const HIP_Y = 1.0;

/**
 * Rest joints of one leg, before the gait rotates them about the hip.
 *
 * The knee sits only slightly outboard of the hip: the reference stands on near-vertical legs,
 * and pushing the knee far out splays the stance into a spider.
 */
const LEG_REST = {
  hip: [0.6, HIP_Y, 0.22],
  knee: [0.78, 0.58, 0.25],
  ankle: [0.66, 0.17, 0.26],
  foot: [0.66, 0.1, 0.26],
} as const;

/** The four legs, in the order a pose indexes them: [front+z, front-z, rear+z, rear-z]. */
const LEGS = [
  { front: true, side: 1 },
  { front: true, side: -1 },
  { front: false, side: 1 },
  { front: false, side: -1 },
] as const;

export interface LegPose {
  /** Fore/aft swing about the hip. Positive swings the foot forward (+X). */
  swing: number;
  /** Extra knee flexion, lifting the foot off the ground. */
  bend: number;
}

export interface DogPose {
  /** Vertical offset of the body, head and hips. */
  bob: number;
  legs: readonly LegPose[];
}

export const DOG_STANDING: DogPose = { bob: 0, legs: LEGS.map(() => ({ swing: 0, bend: 0 })) };

/**
 * A trot — the gait that reads most clearly as running from the side, since diagonal pairs move
 * together and the body rises twice per stride.
 *
 * `amplitude` scales the whole stride, so 0 reproduces the standing pose exactly and the machine
 * settles without a jump. That is what lets `main.ts` drive the gait straight off the dog's speed.
 */
export function dogTrot(phase: number, amplitude: number): DogPose {
  const legs = LEGS.map((leg) => {
    const p = (phase + (leg.front === (leg.side > 0) ? 0 : 0.5)) % 1;
    const cycle = p * Math.PI * 2;
    return {
      swing: amplitude * 0.5 * Math.sin(cycle),
      // The knee only flexes while the foot is travelling forward, i.e. off the ground.
      bend: amplitude * 0.75 * Math.max(0, Math.cos(cycle)),
    };
  });
  return { bob: amplitude * 0.028 * Math.sin(phase * Math.PI * 4), legs };
}

export function robotDog(pose: DogPose = DOG_STANDING): Wireframe {
  const w = new Wireframe();

  // The body and head ride the gait's bob; lifting them as a block keeps this independent of how
  // much detail they carry.
  const upper = w.mark();
  body(w);
  head(w);
  w.transformSince(upper, translation(0, pose.bob, 0));

  legs(w, pose);

  return w;
}

/** A closed rounded-rectangle cross-section in the YZ plane at a given X. */
function section(x: number, y0: number, y1: number, halfZ: number, exponent: number, segments: number): Point[] {
  const cy = (y0 + y1) / 2;
  const hy = (y1 - y0) / 2;
  const pts: Point[] = [];
  for (let i = 0; i < segments; i++) {
    const [cz, sy] = superellipse((i / segments) * Math.PI * 2, exponent);
    pts.push([x, cy + sy * hy, cz * halfZ]);
  }
  return pts;
}

/** Alternating diagonals across every panel of a lofted grid, for CAD density. */
function triangulate(w: Wireframe, rows: Point[][], segments: number, color: Color = JOINT) {
  for (let r = 0; r < rows.length - 1; r++) {
    for (let s = 0; s < segments; s++) {
      const a = rows[r][s];
      const b = rows[r][(s + 1) % segments];
      const d = rows[r + 1][s];
      const e = rows[r + 1][(s + 1) % segments];
      if ((r + s) % 2 === 0) w.edge(a, e, color);
      else w.edge(b, d, color);
    }
  }
}

function body(w: Wireframe) {
  const segments = 30;
  const rows = BODY_STATIONS.map(([x, top, bottom, halfZ]) => section(x, bottom, top, halfZ, 5.5, segments));
  w.grid(rows, PANEL, { closed: true });
  triangulate(w, rows, segments);

  // Dorsal spine ridge along the hump.
  const spine: Point[] = [
    [BODY_FRONT - 0.13, 1.44, 0],
    [0.34, 1.605, 0],
    [-0.1, 1.595, 0],
    [BODY_BACK + 0.1, 1.45, 0],
  ];
  w.polyline(spine, JOINT);

  // Panel seams across the flanks and the tail face.
  for (const x of [0.6, 0.15, -0.4]) {
    w.edge([x, 1.56, -0.225], [x, 1.56, 0.225], JOINT);
    w.edge([x, 1.03, -0.16], [x, 1.03, 0.16], JOINT);
  }
  w.ring([BODY_BACK - 0.005, 1.2, 0], 0.17, "yz", JOINT, 22);

  // Status strip along each flank.
  for (const z of [-1, 1]) {
    w.edge([-0.75, 1.3, z * 0.215], [0.5, 1.3, z * 0.23], GLOW);
  }

  // Vent slats on the shoulder line.
  for (const z of [-1, 1]) {
    for (const x of [0.45, 0.58, 0.71]) {
      w.edge([x, 1.5, z * 0.2], [x, 1.22, z * 0.235], JOINT);
    }
  }
}

function head(w: Wireframe) {
  // Neck joint where the head meets the body.
  w.ring([BODY_FRONT + 0.03, HEAD[1], 0], 0.15, "yz", JOINT, 22);
  w.ring([BODY_FRONT + 0.05, HEAD[1], 0], 0.085, "yz", GLOW, 16);

  // Angular head shell, built about the origin and then placed at the front of the body.
  const shell = w.mark();
  w.roundedBox([0, 0, 0], HEAD_HALF, PANEL, { exponent: 4, edge: 0.035, segments: 22, bands: 3 });
  // Chamfer facets across the head's top and sides.
  for (const z of [-1, 1]) {
    w.edge([-0.17, 0.15, z * 0.11], [0.17, 0.15, z * 0.11], JOINT);
    w.edge([-0.17, -0.11, z * 0.15], [0.17, -0.11, z * 0.15], JOINT);
  }
  w.transformSince(shell, translation(HEAD[0], HEAD[1], HEAD[2]));

  // Sensor face: nearly the whole front of the head, so it carries the head's silhouette the way
  // the black panel does in the reference.
  const visorHalf: Point = [0.06, 0.15, 0.165];
  const visorX = HEAD[0] + HEAD_HALF[0] - 0.015;
  const visorFace = visorX + visorHalf[0];

  const visor = w.mark();
  w.roundedBox([0, 0, 0], visorHalf, VISOR, { exponent: 5, edge: 0.02, segments: 20, bands: 2 });
  w.transformSince(visor, translation(visorX, HEAD[1], HEAD[2]));

  // Bright bezel around the panel. A dark panel only reads as inset if something light frames it.
  const bezelY = visorHalf[1] + 0.008;
  const bezelZ = visorHalf[2] + 0.008;
  const bezel = bezelZ * 0.35;
  w.polyline(
    [
      [visorFace + 0.002, HEAD[1] + bezelY, -bezelZ],
      [visorFace + 0.002, HEAD[1] + bezelY, bezelZ],
      [visorFace + 0.002, HEAD[1] + bezelY - bezel, bezelZ],
      [visorFace + 0.002, HEAD[1] - bezelY + bezel, bezelZ],
      [visorFace + 0.002, HEAD[1] - bezelY, bezelZ],
      [visorFace + 0.002, HEAD[1] - bezelY, -bezelZ],
      [visorFace + 0.002, HEAD[1] - bezelY + bezel, -bezelZ],
      [visorFace + 0.002, HEAD[1] + bezelY - bezel, -bezelZ],
    ],
    PANEL,
    true,
  );

  // Two LED lenses on the panel — the small bright accents in the reference.
  for (const z of [-0.075, 0.075]) {
    w.ring([visorFace + 0.003, HEAD[1] + 0.04, z], 0.024, "yz", GLOW, 12);
  }

  // Sensor dots along the side of the head.
  for (const z of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const x = HEAD[0] - 0.09 + k * 0.07;
      w.ring([x, HEAD[1] + 0.08, z * (HEAD_HALF[2] + 0.004)], 0.014, "xy", GLOW, 10);
    }
  }
  // Crown seam across the top of the head.
  w.edge([HEAD[0] - 0.13, HEAD[1] + HEAD_HALF[1] + 0.004, -0.13], [HEAD[0] + 0.13, HEAD[1] + HEAD_HALF[1] + 0.004, -0.13], GLOW);
}

function legs(w: Wireframe, pose: DogPose) {
  for (let i = 0; i < LEGS.length; i++) {
    const leg = LEGS[i];
    const legPose = pose.legs[i] ?? { swing: 0, bend: 0 };
    const sx = leg.front ? 1 : -1;
    const sz = leg.side;

    const hip: Point = [sx * LEG_REST.hip[0], LEG_REST.hip[1] + pose.bob, sz * LEG_REST.hip[2]];
    const kneeRest: Point = [sx * LEG_REST.knee[0], LEG_REST.knee[1], sz * LEG_REST.knee[2]];
    const ankleRest: Point = [sx * LEG_REST.ankle[0], LEG_REST.ankle[1], sz * LEG_REST.ankle[2]];
    const footRest: Point = [sx * LEG_REST.foot[0], LEG_REST.foot[1], sz * LEG_REST.foot[2]];

    // Articulate about the hip. Rotating the authored joint offsets (rather than re-deriving the
    // leg from angles) keeps the rest silhouette exactly as drawn whenever the gait is at rest.
    const femur: Point = [kneeRest[0] - hip[0], kneeRest[1] - hip[1], kneeRest[2] - hip[2]];
    const tibia: Point = [ankleRest[0] - kneeRest[0], ankleRest[1] - kneeRest[1], ankleRest[2] - kneeRest[2]];
    const heel: Point = [footRest[0] - ankleRest[0], footRest[1] - ankleRest[1], footRest[2] - ankleRest[2]];

    // Front knees fold forward and rear knees fold back, so flexion flips sign between them.
    const thighRot = rotationZ(legPose.swing);
    const shinRot = rotationZ(legPose.swing + (leg.front ? -legPose.bend : legPose.bend));

    const knee = advance(hip, transformPoint(thighRot, femur));
    const ankle = advance(knee, transformPoint(shinRot, tibia));
    const foot = advance(ankle, transformPoint(shinRot, heel));

    // Hip actuator: a barrel on the leg's pivot axis (Z). This joint is a machined cylinder —
    // a sphere reads as a ball joint and loses the mechanical look.
    w.tube([hip[0], hip[1], hip[2] - 0.085], [hip[0], hip[1], hip[2] + 0.085], 0.128, 0.128, PANEL, 2, 22);
    w.disc([hip[0], hip[1], hip[2] + 0.085], 0.128, "xy", PANEL, 22);
    w.disc([hip[0], hip[1], hip[2] - 0.085], 0.128, "xy", PANEL, 22);
    w.ring([hip[0], hip[1], hip[2] + 0.086], 0.075, "xy", JOINT, 20);
    w.ring([hip[0], hip[1], hip[2] + 0.089], 0.04, "xy", GLOW, 12);

    // Slim tapered limbs — heavy links read as tubes rather than machinery.
    w.tube(hip, knee, 0.085, 0.062, PANEL, 4, 14);
    w.tube(knee, ankle, 0.062, 0.042, PANEL, 4, 12);
    w.tube(ankle, foot, 0.045, 0.038, JOINT, 2, 10);

    // Knee: the same barrel joint as the hip, smaller. The ankle and toe stay round — at that
    // size a barrel is invisible and the toe pad is genuinely a ball in the reference.
    w.tube([knee[0], knee[1], knee[2] - 0.06], [knee[0], knee[1], knee[2] + 0.06], 0.075, 0.075, JOINT, 1, 16);
    w.disc([knee[0], knee[1], knee[2] + 0.06], 0.075, "xy", JOINT, 16);
    w.disc([knee[0], knee[1], knee[2] - 0.06], 0.075, "xy", JOINT, 16);
    w.ring([knee[0], knee[1], knee[2] + 0.061], 0.042, "xy", GLOW, 14);
    w.shell(ankle, [0.055, 0.055, 0.055], 4, 14, JOINT, { squash: 0.75 });
    w.ring(ankle, 0.032, "xy", GLOW, 12);

    // Small dark ball foot.
    w.shell(foot, [0.062, 0.062, 0.062], 6, 18, VISOR);
    w.ring([foot[0], foot[1], foot[2]], 0.042, "yz", GLOW, 14);
  }
}

function advance(from: Point, offset: Point): Point {
  return [from[0] + offset[0], from[1] + offset[1], from[2] + offset[2]];
}
