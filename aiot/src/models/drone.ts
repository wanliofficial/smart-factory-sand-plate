/**
 * Drone — industrial quadrotor.
 *
 * MODELLED AFTER `drone.jpeg`: a flat rectangular centre hull, four arms in an X, a motor pod at
 * each end carrying dense concentric rotor rings and two long thin blades, twin forward sensor
 * lenses on the nose, and a gimbal with a round lens slung under the body. It flies — there is
 * deliberately no landing gear.
 *
 * The reference is a FRONT view — the twin lenses and the gimbal lens are the focal points — so
 * the nose is authored along +Z (straight at the camera) and `main.ts` yaws the machine slightly
 * so the nose still leads its direction of travel.
 *
 * This device stays translucent: it is drawn without the hidden-line occluder pass, matching the
 * glowing see-through hologram in the reference.
 */

import type { Color, Point } from "../wireframe";
import { Wireframe } from "../wireframe";

const BLUE: Color = [0.36, 0.7, 1, 1];
const HULL: Color = [0.72, 0.88, 1, 1];
const GLOW: Color = [0.16, 0.8, 1, 1];

/**
 * Flight height. Kept low enough that the camera looks DOWN on the machine — the four rotor
 * discs are horizontal, and seen edge-on they collapse into a single line.
 */
const HULL_Y = 1.11;
const HULL_BOTTOM = HULL_Y - 0.13;
/** Motor pod centres, at the four corners of the X. */
const MOTOR_X = 1.32;
const MOTOR_Z = 0.82;
const ROTOR_Y = 1.19;
const GIMBAL_Y = 0.7;

/**
 * @param rotorPhase Blade angle offset in turns. Only the blades move — the swept discs and their
 *   spokes stay put — so a spinning rotor still reads as a rotor rather than a spinning blur.
 */
export function drone(rotorPhase = 0): Wireframe {
  const w = new Wireframe();

  hull(w);
  gimbal(w);

  let motor = 0;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const hub: Point = [sx * MOTOR_X, ROTOR_Y, sz * MOTOR_Z];
      arm(w, sx, sz);
      motorPod(w, hub);
      // Real quadrotors stagger the blade angles and counter-rotate diagonal pairs; the stagger
      // also stops the four props reading as one.
      const stagger = (motor * Math.PI) / 4;
      const direction = sx * sz > 0 ? 1 : -1;
      propeller(w, hub, stagger + direction * rotorPhase * Math.PI * 2);
      motor++;
    }

  return w;
}

function hull(w: Wireframe) {
  // Flat rectangular centre hull, a raised equipment bay, and a base plate.
  w.roundedBox([0, HULL_Y, 0], [0.5, 0.13, 0.36], HULL, { exponent: 6, edge: 0.04, segments: 26, bands: 3 });
  w.roundedBox([0, HULL_Y + 0.16, -0.02], [0.36, 0.05, 0.26], HULL, { exponent: 8, edge: 0.02, segments: 20, bands: 2 });
  w.roundedBox([0, HULL_BOTTOM - 0.03, 0], [0.42, 0.025, 0.3], BLUE, { exponent: 9, edge: 0.012, segments: 18, bands: 2 });

  // Bay seams for density.
  for (const x of [-0.2, 0, 0.2]) w.edge([x, HULL_Y + 0.2, -0.27], [x, HULL_Y + 0.2, 0.24], BLUE);

  // Twin forward sensor lenses on the nose (+Z). The reference has them large and binoc-like,
  // so radius tracks about 1/4 of the hull width and the two lenses are set wide apart.
  for (const x of [-0.22, 0.22]) {
    w.ring([x, HULL_Y + 0.01, 0.378], 0.13, "xy", HULL, 36);
    w.ring([x, HULL_Y + 0.01, 0.388], 0.10, "yz", BLUE, 30);
    w.ring([x, HULL_Y + 0.01, 0.392], 0.058, "yz", GLOW, 24);
    w.ring([x, HULL_Y + 0.01, 0.396], 0.022, "yz", BLUE, 14);
    // A small brow strip above each lens.
    w.edge([x - 0.12, HULL_Y + 0.18, 0.378], [x + 0.12, HULL_Y + 0.18, 0.378], GLOW);
    // Lens housing bezel on the hull face.
    w.edge([x - 0.13, HULL_Y - 0.12, 0.378], [x + 0.13, HULL_Y - 0.12, 0.378], HULL);
  }
  // Brow rail across both lenses.
  w.edge([-0.36, HULL_Y + 0.20, 0.378], [0.36, HULL_Y + 0.20, 0.378], GLOW);

  // Rear vents.
  for (const x of [-0.22, 0, 0.22]) w.edge([x, HULL_Y - 0.06, -0.362], [x, HULL_Y + 0.06, -0.362], BLUE);
}

function arm(w: Wireframe, sx: number, sz: number) {
  const root: Point = [sx * 0.44, HULL_Y - 0.01, sz * 0.3];
  const tip: Point = [sx * MOTOR_X, HULL_Y + 0.01, sz * MOTOR_Z];
  w.tube(root, tip, 0.075, 0.055, BLUE, 2, 10);
  // Shoulder collar where the arm leaves the hull.
  w.ring([root[0], root[1], root[2]], 0.085, "xz", HULL, 16);
}

function motorPod(w: Wireframe, hub: Point) {
  const [mx, my, mz] = hub;

  // Stator: a squat cylinder with a stacked collar.
  w.shell([mx, my - 0.05, mz], [0.115, 0.07, 0.115], 6, 22, HULL, { roundU: 2, roundV: 12 });
  w.ring([mx, my - 0.115, mz], 0.115, "xz", HULL, 26);
  w.ring([mx, my - 0.05, mz], 0.12, "xz", BLUE, 26);
  w.ring([mx, my + 0.005, mz], 0.106, "xz", HULL, 24);

  // Hub cap.
  w.ring([mx, my + 0.015, mz], 0.05, "xz", GLOW, 16);
}

/**
 * Two long thin blades per motor, plus the rotor discs they sweep.
 *
 * The reference shows the swept circle densely lineated rather than as a single ring, so each
 * rotor gets a tip circle, an inner circle and radial spokes underneath its blades.
 */
function propeller(w: Wireframe, hub: Point, phase: number) {
  const [mx, my, mz] = hub;
  const tipRadius = 0.62;

  // Five concentric rings for the dense swept-disc look in the reference.
  w.ring([mx, my, mz], tipRadius, "xz", BLUE, 64);
  w.ring([mx, my, mz], tipRadius * 0.82, "xz", HULL, 48);
  w.ring([mx, my, mz], tipRadius * 0.62, "xz", BLUE, 40);
  w.ring([mx, my, mz], tipRadius * 0.4, "xz", HULL, 32);
  w.ring([mx, my, mz], tipRadius * 0.2, "xz", BLUE, 20);
  // Sixteen radial spokes.
  for (let k = 0; k < 16; k++) {
    const a = (k * Math.PI) / 8;
    w.edge(
      [mx + Math.cos(a) * tipRadius * 0.2, my, mz + Math.sin(a) * tipRadius * 0.2],
      [mx + Math.cos(a) * tipRadius, my, mz + Math.sin(a) * tipRadius],
      BLUE,
    );
  }

  for (const side of [0, 1]) {
    blade(w, [mx, my, mz], phase + side * Math.PI, tipRadius);
  }
}

/** One flat, tapered propeller blade laid out horizontally from `hub`. */
function blade(w: Wireframe, hub: Point, angle: number, length: number, color: Color = HULL) {
  const dirX = Math.cos(angle);
  const dirZ = Math.sin(angle);
  // Perpendicular within the horizontal plane.
  const perpX = -dirZ;
  const perpZ = dirX;

  // Wide enough to stay legible against the dense spoke grid underneath.
  const rootHalf = 0.095;
  const tipHalf = 0.034;
  const rootInset = 0.09;

  const point = (t: number, side: number): Point => {
    const half = rootHalf + (tipHalf - rootHalf) * t;
    return [hub[0] + dirX * (rootInset + (length - rootInset) * t) + perpX * half * side, hub[1], hub[2] + dirZ * (rootInset + (length - rootInset) * t) + perpZ * half * side];
  };

  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    w.edge(point(t0, 1), point(t1, 1), color);
    w.edge(point(t0, -1), point(t1, -1), color);
    w.edge(point(t1, -1), point(t1, 1), color);
  }
  w.edge(point(0, -1), point(0, 1), color);
  w.edge(hub, point(1, 0), color);
}

function gimbal(w: Wireframe) {
  // Yoke dropping from the hull.
  w.tube([0, HULL_BOTTOM - 0.01, -0.12], [0, GIMBAL_Y + 0.11, -0.14], 0.075, 0.05, HULL, 2, 10);

  // Gimbal housing — genuinely spherical, unlike the panels above.
  w.shell([0, GIMBAL_Y, -0.14], [0.17, 0.165, 0.165], 9, 26, HULL);
  // Roll axis bearings.
  for (const sx of [-1, 1]) w.ring([sx * 0.17, GIMBAL_Y, -0.14], 0.062, "yz", BLUE, 16);

  // Lens barrel pointing forward, and the lens itself.
  w.tube([0, GIMBAL_Y, -0.02], [0, GIMBAL_Y, 0.13], 0.118, 0.108, HULL, 3, 24);
  w.ring([0, GIMBAL_Y, 0.135], 0.112, "xy", HULL, 28);
  w.ring([0, GIMBAL_Y, 0.142], 0.082, "xy", GLOW, 24);
  w.ring([0, GIMBAL_Y, 0.148], 0.038, "xy", HULL, 16);
}
