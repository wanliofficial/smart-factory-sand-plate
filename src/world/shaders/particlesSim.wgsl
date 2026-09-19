// ============================================================
// Particle Simulation Compute Shader
// Updates particle positions and states on the GPU
// ============================================================

const WORKGROUP_SIZE = 128u;
const PI = 3.14159265359;

struct SimParams {
  time: f32,
  dt: f32,
  earthRadius: f32,
  aiCoreY: f32,
}

// Particle layout: 16 f32 (64 bytes), matches JS side
struct Particle {
  position: vec3f,
  _pad0: f32,
  velocity: vec3f,
  _pad1: f32,
  color: vec3f,
  energy: f32,
  size: f32,
  seed: f32,
  pType: f32,
  _pad2: f32,
}

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: SimParams;

// Slerp helper for data flow particles
fn slerp(a: vec3f, b: vec3f, t: f32) -> vec3f {
  let omega = acos(clamp(dot(normalize(a), normalize(b)), -1.0, 1.0));
  if (omega < 0.001) {
    return mix(a, b, t);
  }
  let so = sin(omega);
  return sin((1.0 - t) * omega) / so * a + sin(t * omega) / so * b;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= arrayLength(&particles)) {
    return;
  }

  var p = particles[idx];
  let t = params.time;
  let dt = min(params.dt, 0.033);

  switch (u32(p.pType)) {
    case 0u: { // ATMOSPHERE: orbit around earth with slight drift
      let axis = normalize(vec3f(0.2, 1.0, 0.1));
      let angle = dt * (0.05 + p.seed * 0.1);
      // Rotate around axis using Rodrigues formula
      let v = p.position;
      let cosA = cos(angle);
      let sinA = sin(angle);
      let newPos = v * cosA + cross(axis, v) * sinA + axis * dot(axis, v) * (1.0 - cosA);
      p.position = newPos;

      // Energy flicker
      p.energy = 0.15 + 0.35 * (0.5 + 0.5 * sin(t * (1.0 + p.seed * 2.0) + p.seed * 10.0));
    }
    case 1u: { // DATA_FLOW: orbit along a randomly tilted great circle
      // 旧实现用两个 seed 锚点做 slerp，锚点分布不均导致粒子在少数区域聚簇成白带；
      // 改为每颗粒子一条独立轨道：法线由 seed 决定，相位匀速推进，全球均匀覆盖
      let seed = p.seed;
      var n = normalize(vec3f(
        sin(seed * 127.1) + 0.31,
        cos(seed * 311.7) + 0.17,
        sin(seed * 74.7 + 2.0)
      ));
      var axis = vec3f(1.0, 0.0, 0.0);
      if (abs(n.x) > 0.9) { axis = vec3f(0.0, 1.0, 0.0); }
      let u = normalize(cross(n, axis));
      let v = cross(n, u);

      let theta = t * (0.05 + seed * 0.15) + seed * 628.0;
      // 轨道半径摊薄到 1.03~1.22：壳越厚，掠射方向的线密度越低，盘缘茧环越淡
      let arcR = params.earthRadius * (1.03 + fract(seed * 7.0) * 0.19);
      p.position = arcR * (u * cos(theta) + v * sin(theta));

      let progress = fract(theta / (PI * 2.0));

      // Energy pulses at certain points
      let pulse = 0.6 + 0.4 * sin(progress * PI * 8.0);
      p.energy = 0.3 + pulse * 0.6;

      // Size varies with energy
      p.size = 0.012 + p.energy * 0.02;
    }
    case 2u: { // AI_CORE: orbit around AI core
      let center = vec3f(0.0, params.aiCoreY, 0.0);
      let rel = p.position - center;

      // Orbital rotation
      let axis = normalize(vec3f(sin(p.seed * 10.0), 0.3 + p.seed * 0.4, cos(p.seed * 6.0)));
      let angle = dt * (0.5 + p.seed * 1.0);
      let cosA = cos(angle);
      let sinA = sin(angle);
      let newRel = rel * cosA + cross(axis, rel) * sinA + axis * dot(axis, rel) * (1.0 - cosA);

      // Radial pulsing
      let r = length(rel);
      let pulse = 1.0 + sin(t * (0.8 + p.seed * 1.5) + p.seed * 20.0) * 0.05;
      p.position = center + normalize(newRel) * r * pulse;

      // Energy
      p.energy = 0.3 + 0.6 * (0.5 + 0.5 * sin(t * (1.5 + p.seed * 2.0) + p.seed * 30.0));
      p.size = 0.015 + p.energy * 0.025;
    }
    case 3u: { // BACKGROUND: slow drift of distant stars
      // Very slow rotation
      let axis = vec3f(0.0, 1.0, 0.0);
      let angle = dt * 0.01;
      let v = p.position;
      let cosA = cos(angle);
      let sinA = sin(angle);
      p.position = v * cosA + cross(axis, v) * sinA + axis * dot(axis, v) * (1.0 - cosA);

      // Twinkle
      p.energy = 0.05 + 0.25 * (0.5 + 0.5 * sin(t * (0.5 + p.seed * 1.5) + p.seed * 50.0));
    }
    default: { }
  }

  particles[idx] = p;
}
