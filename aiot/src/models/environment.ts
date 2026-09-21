/**
 * Environment geometry shared by all three devices: the grid floor the machines stand on.
 *
 * The reference images fade the grid out with distance instead of ending it at a hard edge, so
 * the alpha is baked per vertex from each vertex's radius. That keeps the fade free at runtime
 * and needs no per-fragment work.
 */

import type { Color } from "../wireframe";
import { Wireframe } from "../wireframe";

const GRID_COLOR: Color = [0.05, 0.18, 0.28, 0.65];

/**
 * A square grid on the y = 0 plane, brightest near `fadeStart` and gone by `fadeEnd`.
 *
 * Each grid line is subdivided so the radial fade stays smooth along its length.
 */
export function floorGrid(
  size = 34,
  step = 1,
  fadeStart = 5,
  fadeEnd = 30,
  color: Color = GRID_COLOR,
): Wireframe {
  const w = new Wireframe();
  const segments = Math.max(8, Math.round(size / step));

  const faded = (x: number, z: number): Color => {
    const radius = Math.hypot(x, z);
    const t = Math.min(1, Math.max(0, (radius - fadeStart) / Math.max(fadeEnd - fadeStart, 1e-3)));
    const smooth = t * t * (3 - 2 * t);
    return [color[0], color[1], color[2], color[3] * (1 - smooth)];
  };

  for (let i = -size; i <= size; i += step) {
    // Line running along z at x = i.
    for (let s = 0; s < segments; s++) {
      const z0 = -size + (2 * size * s) / segments;
      const z1 = -size + (2 * size * (s + 1)) / segments;
      w.edge([i, 0, z0], [i, 0, z1], faded(i, (z0 + z1) / 2));
    }
    // Line running along x at z = i.
    for (let s = 0; s < segments; s++) {
      const x0 = -size + (2 * size * s) / segments;
      const x1 = -size + (2 * size * (s + 1)) / segments;
      w.edge([x0, 0, i], [x1, 0, i], faded((x0 + x1) / 2, i));
    }
  }

  return w;
}
