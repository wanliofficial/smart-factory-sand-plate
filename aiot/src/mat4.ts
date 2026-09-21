/**
 * Column-major 4x4 matrix helpers, plus the small amount of vector maths the models need.
 *
 * Everything here matches WGSL's `mat4x4f` memory order, so a matrix produced here can go
 * straight into a uniform buffer and be used as `m * vec4f(p, 1.0)`.
 */

export type Vec3 = [number, number, number];
export type Mat4 = Float32Array;

export function identity(): Mat4 {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

/** `a * b`, so `multiply(viewProjection, model)` applies `model` first. */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      o[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}

export function translation(x: number, y: number, z: number): Mat4 {
  const m = identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

export function scale(sx: number, sy: number, sz: number): Mat4 {
  const m = identity();
  m[0] = sx;
  m[5] = sy;
  m[10] = sz;
  return m;
}

export function rotationX(a: number): Mat4 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const m = identity();
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
}

export function rotationY(a: number): Mat4 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const m = identity();
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

export function rotationZ(a: number): Mat4 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const m = identity();
  m[0] = c;
  m[1] = s;
  m[4] = -s;
  m[5] = c;
  return m;
}

/** Mirrors across the y = `plane` plane. Used for the ground reflection. */
export function mirrorY(plane = 0): Mat4 {
  return multiply(translation(0, plane, 0), multiply(scale(1, -1, 1), translation(0, -plane, 0)));
}

/** Right-handed perspective with a 0..1 depth range, `fov` in degrees. */
export function perspective(fov: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan((fov * Math.PI) / 360);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

export function lookAt(eye: Vec3, center: Vec3, up: Vec3): Mat4 {
  const z: Vec3 = [eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]];
  const zl = Math.hypot(...z);
  z[0] /= zl;
  z[1] /= zl;
  z[2] /= zl;
  const x: Vec3 = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]];
  const xl = Math.hypot(...x);
  x[0] /= xl;
  x[1] /= xl;
  x[2] /= xl;
  const y: Vec3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
    1,
  ]);
}

/** Transforms one point, treating `m` as a column-major affine matrix. */
export function transformPoint(m: Mat4, p: readonly [number, number, number]): Vec3 {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}
