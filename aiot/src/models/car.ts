/**
 * Autonomous car — streamlined sports coupe, reference-matched to `car.jpeg`.
 *
 * Built as two lofts. The lower body runs as a wedge: a low nose, fender bulges over the wheels,
 * and a slightly raised ducktail at the rear. The greenhouse is a fastback whose roofline flows
 * down in one continuous arc from the windscreen into the tail rather than stepping down to a
 * boot, which is what reads as aerodynamic. Each station is a rounded-rectangle cross-section in
 * the YZ plane; alternating diagonals on the panels give the dense mesh of the reference.
 *
 * The wheels sit IN the body, not on it: their outer face is flush with the fender line, so they
 * read as inset into the arches.
 *
 * The body is authored nose-at-−X. `main.ts` spins the whole model 180° so it faces its direction
 * of travel, so the lights, the roof sensor and the headlight cone here are all authored for −X.
 */

import type { Color, Point } from "../wireframe";
import { Wireframe, superellipse } from "../wireframe";

const BODY: Color = [0.18, 0.78, 0.88, 1];
const HULL: Color = [0.48, 0.92, 0.96, 1];
const GLOW: Color = [0.1, 0.95, 1, 1];
const RADAR: Color = [1, 0.38, 0.05, 1];
const DIM: Color = [0.1, 0.4, 0.5, 1];

const WHEEL_RADIUS = 0.4;
const WHEEL_Y = 0.42;
/** Wheel centreline. Set so the tyre's outer face finishes flush with the fender line. */
const WHEEL_HALF_Z = 0.79;
/** Tyre thickness along Z (the axle). The wheel reads as a flat disc if this is zero. */
const WHEEL_WIDTH = 0.22;
/** Half-width of the fender bulge, at the wheel stations. */
const FENDER_HALF_Z = 0.88;

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

/** Adds the X-pattern diagonals on every side panel of a lofted grid. */
function triangulate(w: Wireframe, rows: Point[][], segments: number, color: Color = DIM) {
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

/**
 * One wheel: a short cylinder whose disc lies in the XY plane, so its axle runs along Z.
 *
 * Only the outer face carries detail — rim rings and nine spokes. The inner face gets a single
 * tyre ring and a dozen sidewall ribs, purely so the tyre has depth; anything more was invisible
 * once the wheel sat flush inside the fender.
 */
function wheel(w: Wireframe, x: number, z: number) {
  const zOuter = z + (Math.sign(z) * WHEEL_WIDTH) / 2;
  const zInner = z - (Math.sign(z) * WHEEL_WIDTH) / 2;
  const cy = WHEEL_Y;
  const ringAt = (zPos: number, radius: number, color: Color, segs: number) =>
    w.ring([x, cy, zPos], radius, "xy", color, segs);

  // Outer face — tyre, rim bands, glowing hub.
  ringAt(zOuter, WHEEL_RADIUS, HULL, 40);
  ringAt(zOuter, WHEEL_RADIUS * 0.66, BODY, 30);
  ringAt(zOuter, WHEEL_RADIUS * 0.5, HULL, 26);
  ringAt(zOuter, WHEEL_RADIUS * 0.16, GLOW, 18);
  for (let k = 0; k < 9; k++) {
    const a = (k * Math.PI * 2) / 9;
    w.edge(
      [x + Math.cos(a) * WHEEL_RADIUS * 0.16, cy + Math.sin(a) * WHEEL_RADIUS * 0.16, zOuter],
      [x + Math.cos(a) * WHEEL_RADIUS * 0.5, cy + Math.sin(a) * WHEEL_RADIUS * 0.5, zOuter],
      BODY,
    );
  }

  // Inner rim and sidewall ribs, for depth only.
  ringAt(zInner, WHEEL_RADIUS, HULL, 40);
  const sideSegs = 12;
  for (let k = 0; k < sideSegs; k++) {
    const a = (k / sideSegs) * Math.PI * 2;
    w.edge(
      [x + Math.cos(a) * WHEEL_RADIUS, cy + Math.sin(a) * WHEEL_RADIUS, zOuter],
      [x + Math.cos(a) * WHEEL_RADIUS, cy + Math.sin(a) * WHEEL_RADIUS, zInner],
      BODY,
    );
  }
}

/**
 * Half-circle wheel-arch, drawn as a fender lip over each wheel.
 *
 * The arch has to lie in the plane of the car's flank — constant Z, sweeping over the wheel in
 * X and Y. A half-circle at constant X is a cross-section THROUGH the arch, which renders as a
 * hoop sticking straight out of the side of the car rather than a fender wrapping the tyre.
 *
 * It is drawn at the fender line, not out at the tyre, so it reads as the arch opening rather
 * than a ring floating beside the wheel.
 */
function wheelArch(w: Wireframe, x: number, z: number) {
  const archR = 0.46;
  const archSegs = 18;
  const pts: Point[] = [];
  for (let i = 0; i <= archSegs; i++) {
    const theta = (i / archSegs) * Math.PI;
    pts.push([x + Math.cos(theta) * archR, WHEEL_Y + Math.sin(theta) * archR, z]);
  }
  w.polyline(pts, HULL);
}

/** The car itself: lower body, fastback greenhouse, wheels, lights and ground effects. */
export function car(): Wireframe {
  const w = new Wireframe();

  // ─── Lower body — low nose, fender bulges, raised ducktail ─────────────────────────
  const lower: Array<[number, number, number, number]> = [
    // x,      top,  bottom, halfZ
    [2.2, 0.76, 0.3, 0.6], // ducktail
    [2.0, 0.82, 0.24, 0.74],
    [1.7, 0.85, 0.2, 0.86],
    [1.4, 0.86, 0.19, FENDER_HALF_Z], // rear fender
    [1.0, 0.86, 0.19, 0.82],
    [0.4, 0.86, 0.19, 0.79],
    [-0.4, 0.86, 0.19, 0.79],
    [-1.0, 0.85, 0.19, 0.82],
    [-1.4, 0.82, 0.19, FENDER_HALF_Z], // front fender
    [-1.7, 0.76, 0.2, 0.86],
    [-2.0, 0.66, 0.24, 0.72],
    [-2.2, 0.56, 0.3, 0.58], // low nose
  ];
  const lowerRows = lower.map(([x, top, bottom, halfZ]) => section(x, bottom, top, halfZ, 5.5, 32));
  w.grid(lowerRows, BODY, { closed: true });
  triangulate(w, lowerRows, 32, DIM);

  // ─── Fastback greenhouse — one continuous arc from windscreen to tail ──────────────
  const cabin: Array<[number, number, number]> = [
    // x,    roof, halfZ
    [-1.55, 0.88, 0.5], // base of the windscreen
    [-1.3, 0.99, 0.58],
    [-0.95, 1.07, 0.64],
    [-0.5, 1.1, 0.67], // roof peak — low, as a coupe should be
    [-0.05, 1.09, 0.67],
    [0.45, 1.02, 0.65],
    [0.95, 0.93, 0.62],
    [1.35, 0.88, 0.58],
    [1.7, 0.86, 0.52], // the roofline meets the ducktail, so there is no boot step
  ];
  const cabinRows = cabin.map(([x, roof, halfZ]) => section(x, 0.84, roof, halfZ, 6, 28));
  w.grid(cabinRows, HULL, { closed: true });
  triangulate(w, cabinRows, 28, DIM);

  // ─── Pillars, belt line, rocker, door cuts ──────────────────────────────────────────
  for (const z of [-1, 1]) {
    // A-pillar: windscreen base → roof front (heavily raked).
    w.edge([-1.55, 0.88, z * 0.5], [-0.5, 1.1, z * 0.67], HULL);
    // Roof rail, then the fastback C-pillar running down to the tail.
    w.edge([-0.5, 1.1, z * 0.67], [0.45, 1.02, z * 0.65], HULL);
    w.edge([0.45, 1.02, z * 0.65], [1.7, 0.86, z * 0.52], HULL);
    // B-pillar.
    w.edge([-0.55, 0.87, z * 0.67], [-0.55, 1.1, z * 0.67], HULL);
    // Belt line along the flanks.
    w.edge([-1.6, 0.86, z * 0.8], [1.6, 0.86, z * 0.8], HULL);
    // Rocker / side skirt, tucked in under the doors.
    w.edge([-1.5, 0.24, z * 0.82], [1.5, 0.24, z * 0.82], GLOW);
    // Door cut.
    w.edge([-0.8, 0.26, z * 0.81], [-0.8, 0.86, z * 0.62], DIM);
    // Side mirror on a short stalk.
    w.shell([-1.25, 0.98, z * 0.72], [0.03, 0.05, 0.09], 3, 12, GLOW);
  }

  // ─── Hood vents — slats let hot air out, and break up the long nose ────────────────
  for (const z of [-1, 1]) {
    for (const x of [-1.95, -1.82, -1.69]) {
      w.edge([x, 0.7, z * 0.2], [x, 0.7, z * 0.46], DIM);
    }
  }

  // ─── Front splitter and rear diffuser ──────────────────────────────────────────────
  w.polyline(
    [
      [-2.24, 0.3, -0.6],
      [-2.24, 0.24, -0.42],
      [-2.24, 0.24, 0.42],
      [-2.24, 0.3, 0.6],
    ],
    GLOW,
  );
  for (const z of [-1, 1]) w.edge([2.2, 0.3, z * 0.5], [2.2, 0.22, z * 0.34], DIM);

  // ─── Laser scanner: a low puck on the FRONT OF THE ROOF, above the windscreen.
  //     In the reference it reads as part of the roofline, not as a pod on the bonnet. ────
  const podCx = -0.95;
  const podCy = 1.1;
  w.roundedBox([podCx, podCy, 0], [0.17, 0.05, 0.2], HULL, { exponent: 6, edge: 0.018, segments: 20, bands: 2 });
  // Forward-facing lens (looks down the road, −X).
  w.ring([podCx - 0.175, podCy, 0], 0.052, "yz", BODY, 26);
  w.ring([podCx - 0.18, podCy, 0], 0.038, "yz", GLOW, 22);
  w.ring([podCx - 0.185, podCy, 0], 0.019, "yz", DIM, 14);
  // Cyan scan seam around the puck's shoulder.
  for (const z of [-1, 1]) w.edge([podCx - 0.16, podCy + 0.05, z * 0.2], [podCx + 0.16, podCy + 0.05, z * 0.2], GLOW);
  w.edge([podCx - 0.17, podCy, -0.2], [podCx + 0.17, podCy, -0.2], DIM);
  w.edge([podCx - 0.17, podCy, 0.2], [podCx + 0.17, podCy, 0.2], DIM);

  // ─── Wheel arches (static) — the wheels themselves come from `carWheels()` so they can be
  //     spun in place each frame while the car is approaching or driving away. ─────────────
  for (const x of [-1.4, 1.4])
    for (const z of [-1, 1]) {
      wheelArch(w, x, z * FENDER_HALF_Z);
    }

  // ─── Front headlight strip — low and wide across the leading face ─────────────────
  const lightSegs = 18;
  const headlightTop: Point[] = [];
  const headlightBot: Point[] = [];
  for (let i = 0; i <= lightSegs; i++) {
    const t = i / lightSegs;
    const z = -0.5 + t * 1.0;
    const y = 0.52 - Math.abs(t - 0.5) * 0.03;
    headlightTop.push([-2.2, y, z]);
    headlightBot.push([-2.2, 0.44, z]);
  }
  w.polyline(headlightTop, GLOW);
  w.polyline(headlightBot, GLOW);

  // ─── Tail-light strip — across the trailing face ───────────────────────────────────
  const tailTop: Point[] = [];
  const tailBot: Point[] = [];
  for (let i = 0; i <= lightSegs; i++) {
    const t = i / lightSegs;
    const z = -0.42 + t * 0.84;
    const y = 0.7 - Math.abs(t - 0.5) * 0.03;
    tailTop.push([2.2, y, z]);
    tailBot.push([2.2, 0.62, z]);
  }
  w.polyline(tailTop, GLOW);
  w.polyline(tailBot, GLOW);

  return w;
}

/**
 * One wheel, with its axle position and the y-coordinate the wheel centre sits at. Built as a
 * standalone `Wireframe` so the rotation animation can rewrite its vertex buffer in place each
 * frame without touching the body geometry.
 */
export interface CarWheel {
  readonly x: number;
  readonly z: number;
  readonly centerY: number;
  readonly mesh: Wireframe;
}

/** Builds the four wheels as independent meshes, in the order (frontL, frontR, rearL, rearR). */
export function carWheels(): CarWheel[] {
  const out: CarWheel[] = [];
  for (const x of [-1.4, 1.4])
    for (const z of [-1, 1]) {
      const w = new Wireframe();
      wheel(w, x, z * WHEEL_HALF_Z);
      out.push({ x, z: z * WHEEL_HALF_Z, centerY: WHEEL_Y, mesh: w });
    }
  return out;
}

/**
 * Ground effects: the concentric radar sweep the car projects around itself, plus the cone its
 * headlights cast. Drawn additively on top of the scene so the glow accumulates.
 *
 * Additive blending weights rgb by one and ignores alpha, so every colour here is
 * premultiplied by the intensity it is meant to contribute — a fade left in alpha alone would
 * do nothing and the whole layer would blow out.
 */
export function carGroundEffects(): Wireframe {
  const w = new Wireframe();

  // Concentric radar rings, fading outward.
  for (let i = 0; i < 5; i++) {
    const r = 2.5 + i * 0.44;
    const k = Math.max(0.05, 0.34 - i * 0.06);
    w.ring([0, 0.02, 0], r, "xz", [RADAR[0] * k, RADAR[1] * k, RADAR[2] * k, k], 84);
  }

  // Radial sweep lines, as data spokes.
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI * 2) / 12;
    const r0 = 2.5;
    const r1 = 4.26;
    const w0 = 0.07;
    w.edge(
      [Math.cos(a) * r0, 0.02, Math.sin(a) * r0],
      [Math.cos(a) * r1, 0.02, Math.sin(a) * r1],
      [1 * w0, 0.45 * w0, 0.12 * w0, w0],
    );
  }

  // Headlight cone: a wedge from the leading face fanning out across the ground.
  //
  // The car is authored nose-at-−X and `main.ts` spins the whole model 180° so it faces its
  // direction of travel, so the cone lives on the −X side here alongside the headlights. Placing
  // it at +X would shoot the beam out of the boot.
  const y0 = 0.52;
  const zHalf0 = 0.5;
  const x0 = -2.05;
  const x1 = -6.6;
  const y1 = 0.02;
  const zHalf1 = 2.0;
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const fade = (1 - t0) * (1 - t0) * 0.11;
    const p = (t: number, side: number): Point => [
      x0 + (x1 - x0) * t,
      y0 + (y1 - y0) * t,
      side * (zHalf0 + (zHalf1 - zHalf0) * t),
    ];
    w.quad(p(t0, -1), p(t0, 1), p(t1, 1), p(t1, -1), [0.35 * fade, 0.8 * fade, 1 * fade, fade], false);
    w.edge(p(t0, -1), p(t0, 1), [0.4 * fade * 2, 0.85 * fade * 2, 1 * fade * 2, fade * 2]);
  }

  return w;
}
