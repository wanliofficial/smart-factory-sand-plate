/**
 * Procedural wireframe builder.
 *
 * A device is built once and emitted twice: as `lines` (the visible edges) and as `surface`
 * (the same shells filled with triangles). The surface is drawn into the depth buffer with
 * colour writes off, so the edges behind a shell get occluded — that hidden-line pass is what
 * separates a CAD wireframe from a see-through tangle of lines.
 *
 * Both arrays use one interleaved vertex layout, 7 floats per vertex:
 *   position (3) + colour (4), stride 28.
 */

import type { Mat4 } from "./mat4";
import { transformPoint } from "./mat4";

export type Color = readonly [number, number, number, number];
export type Point = readonly [number, number, number];
export type Axis = "xy" | "xz" | "yz";

export const LINE_DEFAULT: Color = [0.78, 0.88, 1, 1];

const VERTEX_FLOATS = 7;

/** Point on a circle of radius `r` around `c`, in the named plane. */
export function axisPoint(c: Point, axis: Axis, angle: number, r: number): Point {
  const cos = Math.cos(angle) * r;
  const sin = Math.sin(angle) * r;
  if (axis === "xy") return [c[0] + cos, c[1] + sin, c[2]];
  if (axis === "xz") return [c[0] + cos, c[1], c[2] + sin];
  return [c[0], c[1] + cos, c[2] + sin];
}

/**
 * Superellipse coordinates for angle `t`.
 *
 * `exponent = 2` is a circle; raising it flattens the sides until the shape is a rectangle with
 * rounded corners. This one parameter is the difference between a shell that reads as a machined
 * box panel and one that reads as a ball, which is why every body panel is built through it.
 */
export function superellipse(t: number, exponent: number): [number, number] {
  const c = Math.cos(t);
  const s = Math.sin(t);
  const e = 2 / exponent;
  return [Math.sign(c) * Math.abs(c) ** e, Math.sign(s) * Math.abs(s) ** e];
}

/** Half-extents of a rounded rectangle, as a function of angle. `exponent` ~6..10 reads as a box. */
export function roundedRect(halfX: number, halfZ: number, exponent: number, segments: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < segments; i++) {
    const [cu, su] = superellipse((i / segments) * Math.PI * 2, exponent);
    pts.push([cu * halfX, 0, su * halfZ]);
  }
  return pts;
}

export class Wireframe {
  /** Two vertices per segment, so the count is always even. */
  readonly lines: number[] = [];
  /** Three vertices per triangle. */
  readonly surface: number[] = [];

  // ---- raw emission -------------------------------------------------------------------

  private push(target: number[], p: Point, c: Color) {
    target.push(p[0], p[1], p[2], c[0], c[1], c[2], c[3]);
  }

  /** One edge segment. */
  edge(a: Point, b: Point, c: Color = LINE_DEFAULT) {
    this.push(this.lines, a, c);
    this.push(this.lines, b, c);
  }

  /** One triangle into the occluder surface (no visible edges). */
  tri(a: Point, b: Point, c: Point, col: Color = LINE_DEFAULT) {
    this.push(this.surface, a, col);
    this.push(this.surface, b, col);
    this.push(this.surface, c, col);
  }

  /**
   * A quad, as two triangles. `edges` also draws its four sides, which is what a shell wants —
   * the surface is only there to occlude, so the visible outline comes from the edges.
   */
  quad(a: Point, b: Point, c: Point, d: Point, col: Color = LINE_DEFAULT, edges = true) {
    this.tri(a, b, c, col);
    this.tri(a, c, d, col);
    if (edges) {
      this.edge(a, b, col);
      this.edge(b, c, col);
      this.edge(c, d, col);
      this.edge(d, a, col);
    }
  }

  /** Consecutive segments through `points`. */
  polyline(points: readonly Point[], c: Color = LINE_DEFAULT, closed = false) {
    for (let i = 0; i + 1 < points.length; i++) this.edge(points[i], points[i + 1], c);
    if (closed && points.length > 2) this.edge(points[points.length - 1], points[0], c);
  }

  // ---- primitives ---------------------------------------------------------------------

  /** A closed circle of edges. */
  ring(center: Point, radius: number, axis: Axis = "xz", c: Color = LINE_DEFAULT, segments = 32) {
    const pts: Point[] = [];
    for (let i = 0; i < segments; i++) pts.push(axisPoint(center, axis, (i / segments) * Math.PI * 2, radius));
    this.polyline(pts, c, true);
  }

  /** An open arc of edges from `a0` to `a1` radians. */
  arc(center: Point, radius: number, a0: number, a1: number, axis: Axis = "xz", c: Color = LINE_DEFAULT, segments = 24) {
    const pts: Point[] = [];
    for (let i = 0; i <= segments; i++) pts.push(axisPoint(center, axis, a0 + ((a1 - a0) * i) / segments, radius));
    this.polyline(pts, c);
  }

  /** A filled disc, as a triangle fan, with its rim drawn. */
  disc(center: Point, radius: number, axis: Axis = "xz", c: Color = LINE_DEFAULT, segments = 32) {
    const rim: Point[] = [];
    for (let i = 0; i < segments; i++) rim.push(axisPoint(center, axis, (i / segments) * Math.PI * 2, radius));
    for (let i = 0; i < segments; i++) this.tri(center, rim[i], rim[(i + 1) % segments], c);
    this.polyline(rim, c, true);
  }

  /** Twelve edges of an axis-aligned box. */
  box(center: Point, size: Point, c: Color = LINE_DEFAULT) {
    const hx = size[0] / 2;
    const hy = size[1] / 2;
    const hz = size[2] / 2;
    const [cx, cy, cz] = center;
    const p: Point[] = [
      [cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz],
      [cx + hx, cy + hy, cz - hz], [cx - hx, cy + hy, cz - hz],
      [cx - hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz + hz],
      [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz],
    ];
    for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]])
      this.edge(p[i], p[j], c);
  }

  /**
   * A latitude/longitude shell around `center` — the primitive for genuinely rounded parts
   * (motor housings, gimbals, domes).
   *
   * `roundU` shapes the horizontal cross-section and `roundV` the vertical profile; both default
   * to 2 (a true ellipsoid). Raise them for a rounded box, or use `roundedBox` for a slab with
   * flat faces and chamfered rims.
   */
  shell(
    center: Point,
    radii: Point,
    rings: number,
    segments: number,
    c: Color = LINE_DEFAULT,
    opts: { surface?: boolean; squash?: number; roundU?: number; roundV?: number } = {},
  ) {
    const { surface = true, squash = 1, roundU = 2, roundV = 2 } = opts;
    const [cx, cy, cz] = center;
    const [rx, ry, rz] = radii;
    const rows: Point[][] = [];
    for (let r = 0; r <= rings; r++) {
      const v = -Math.PI / 2 + (Math.PI * r) / rings;
      const [scale, sv] = superellipse(v, roundV);
      const y = cy + sv * ry;
      const row: Point[] = [];
      for (let s = 0; s < segments; s++) {
        const [cu, su] = superellipse((s / segments) * Math.PI * 2, roundU);
        row.push([cx + cu * scale * rx, y, cz + su * scale * rz * squash]);
      }
      rows.push(row);
    }
    this.grid(rows, c, { surface, closed: true });
  }

  /**
   * A rounded rectangular box, lofted from rounded-rectangle sections.
   *
   * This is the primitive for slabs, housings and body panels — six flat faces, corners rounded
   * in the horizontal plane by `exponent`, and top/bottom rims chamfered by `edge`. `bands`
   * subdivides the straight side so the panels carry their own topology.
   */
  roundedBox(
    center: Point,
    half: Point,
    c: Color = LINE_DEFAULT,
    opts: { exponent?: number; edge?: number; segments?: number; bands?: number } = {},
  ) {
    const { exponent = 8, edge = 0.05, segments = 24, bands = 3 } = opts;
    const [cx, cy, cz] = center;
    const [hx, hy, hz] = half;
    const e = Math.min(edge, hy * 0.9);
    const inset = { kx: Math.max(hx - e, hx * 0.04), kz: Math.max(hz - e, hz * 0.04) };

    const levels: { y: number; kx: number; kz: number }[] = [
      { y: cy + hy, ...inset },
      { y: cy + hy - e, kx: hx, kz: hz },
    ];
    for (let i = 1; i < bands; i++) {
      const t = i / bands;
      levels.push({ y: cy + hy - e - 2 * (hy - e) * t, kx: hx, kz: hz });
    }
    levels.push({ y: cy - hy + e, kx: hx, kz: hz });
    levels.push({ y: cy - hy, ...inset });

    const rows = levels.map((lv) =>
      roundedRect(lv.kx, lv.kz, exponent, segments).map((p): Point => [cx + p[0], lv.y, cz + p[2]]),
    );
    this.grid(rows, c, { surface: true, closed: true });
  }

  /**
   * A tapered tube from `a` to `b`. Used for limbs, arms and struts; `rings` controls how
   * many cross-sections the tube is divided into.
   */
  tube(
    a: Point,
    b: Point,
    radiusA: number,
    radiusB: number,
    c: Color = LINE_DEFAULT,
    rings = 3,
    segments = 10,
    opts: { surface?: boolean; endCaps?: boolean } = {},
  ) {
    const { surface = true, endCaps = false } = opts;
    const d: Point = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(...d) || 1;
    const u: Point = [d[0] / len, d[1] / len, d[2] / len];
    const ref: Point = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const vRaw: Point = [u[1] * ref[2] - u[2] * ref[1], u[2] * ref[0] - u[0] * ref[2], u[0] * ref[1] - u[1] * ref[0]];
    const vl = Math.hypot(...vRaw) || 1;
    const V: Point = [vRaw[0] / vl, vRaw[1] / vl, vRaw[2] / vl];
    const W: Point = [u[1] * V[2] - u[2] * V[1], u[2] * V[0] - u[0] * V[2], u[0] * V[1] - u[1] * V[0]];

    const rows: Point[][] = [];
    for (let r = 0; r <= rings; r++) {
      const t = r / rings;
      const radius = radiusA + (radiusB - radiusA) * t;
      const center: Point = [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];
      const row: Point[] = [];
      for (let s = 0; s < segments; s++) {
        const q = (s / segments) * Math.PI * 2;
        const cc = Math.cos(q) * radius;
        const ss = Math.sin(q) * radius;
        row.push([center[0] + V[0] * cc + W[0] * ss, center[1] + V[1] * cc + W[1] * ss, center[2] + V[2] * cc + W[2] * ss]);
      }
      rows.push(row);
    }
    this.grid(rows, c, { surface, closed: true });
    if (endCaps) {
      this.disc(a, radiusA, "xz", c, segments);
      this.disc(b, radiusB, "xz", c, segments);
    }
  }

  /**
   * A grid of quads through `rows`. Every row must have the same number of points. This is the
   * general surface builder: `shell` and `tube` are both expressed through it, and the car body
   * and hull panels are authored directly as rows so the silhouette can be shaped by hand.
   */
  grid(rows: readonly Point[][], c: Color = LINE_DEFAULT, opts: { surface?: boolean; closed?: boolean } = {}) {
    const { surface = true, closed = false } = opts;
    const cols = rows[0]?.length ?? 0;
    if (cols < 2) return;
    const lastCol = closed ? cols : cols - 1;

    for (let r = 0; r < rows.length; r++) {
      for (let s = 0; s < lastCol; s++) {
        const s1 = (s + 1) % cols;
        const a = rows[r][s];
        const b = rows[r][s1];
        if (r + 1 < rows.length) {
          const d = rows[r + 1][s];
          const e = rows[r + 1][s1];
          if (surface) {
            this.tri(a, b, e, c);
            this.tri(a, e, d, c);
          }
          this.edge(a, d, c);
        }
        this.edge(a, b, c);
      }
    }
  }

  // ---- part placement -----------------------------------------------------------------

  /** Snapshot of the current write offsets, to be handed to `transformSince`. */
  mark(): { lines: number; surface: number } {
    return { lines: this.lines.length, surface: this.surface.length };
  }

  /**
   * Applies `m` to every vertex appended since `mark`. Lets a part be authored once at the
   * origin and placed at each corner of the machine.
   */
  transformSince(mark: { lines: number; surface: number }, m: Mat4) {
    applyToVertices(this.lines, mark.lines, m);
    applyToVertices(this.surface, mark.surface, m);
  }
}

/** Transforms the positions of the vertices from `from` onwards, leaving colours alone. */
function applyToVertices(data: number[], from: number, m: Mat4) {
  for (let i = from; i < data.length; i += VERTEX_FLOATS) {
    const p = transformPoint(m, [data[i], data[i + 1], data[i + 2]]);
    data[i] = p[0];
    data[i + 1] = p[1];
    data[i + 2] = p[2];
  }
}
