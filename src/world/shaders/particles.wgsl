// ============================================================
// Particle Shader — instanced particle rendering
// Each particle is a billboarded quad facing the camera
// ============================================================

struct Camera {
  ro: vec3f,
  time: f32,
  aspect: f32,
  resolution: vec2f,
  _pad: vec2f,
}

// Layout matches JS: 16 f32 per particle (64 bytes, 16-byte aligned)
// 0-3: position.xyz + pad
// 4-7: velocity.xyz + pad
// 8-11: color.rgb + energy
// 12-15: size, seed, type, pad
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

@group(0) @binding(0) var<uniform> cam: Camera;
@group(0) @binding(1) var<storage, read> particles: array<Particle>;

// Simple orthographic-ish projection for billboards
fn projectPoint(p: vec3f) -> vec2f {
  // View direction
  let forward = normalize(-cam.ro);
  let right = normalize(cross(forward, vec3f(0.0, 1.0, 0.0)));
  let up = cross(right, forward);

  let rel = p - cam.ro;
  let depth = dot(rel, forward);
  if (depth <= 0.0) { return vec2f(9999.0, 9999.0); }

  let focal = cam.resolution.y * 0.6; // FOV-like
  let x = dot(rel, right) * focal / depth;
  let y = dot(rel, up) * focal / depth;

  return vec2f(x / cam.resolution.x * 2.0, y / cam.resolution.y * 2.0);
}

fn getParticleScreenSize(p: Particle) -> f32 {
  let forward = normalize(-cam.ro);
  let rel = p.position - cam.ro;
  let depth = dot(rel, forward);
  if (depth <= 0.0) { return 0.0; }

  let focal = cam.resolution.y * 0.6;
  let pxSize = p.size * focal / depth;
  return pxSize / cam.resolution.y * 2.0;
}

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) color: vec3f,
  @location(2) energy: f32,
}

@vertex fn vs_main(
  @builtin(vertex_index) vi: u32,
  @builtin(instance_index) instance: u32,
) -> VSOut {
  var out: VSOut;

  var quad = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0),
    vec2f( 1.0, -1.0),
    vec2f( 1.0,  1.0),
  );

  let corner = quad[vi];
  let p = particles[instance];

  let screenPos = projectPoint(p.position);
  let size = getParticleScreenSize(p);

  out.position = vec4f(screenPos + corner * size, 0.0, 1.0);
  out.local = corner;
  out.color = p.color;
  out.energy = p.energy;

  // Twinkle
  let twinkle = 0.7 + 0.3 * sin(cam.time * (2.0 + p.seed * 3.0) + p.seed * 100.0);
  out.energy *= twinkle;

  return out;
}

@fragment fn fs_main(
  @location(0) local: vec2f,
  @location(1) color: vec3f,
  @location(2) energy: f32,
) -> @location(0) vec4f {
  let dist = length(local);
  if (dist > 1.0) { discard; }

  // Soft glow falloff
  let falloff = pow(1.0 - dist, 2.5);
  let core = smoothstep(1.0, 0.2, dist);

  var col = color * (falloff * 0.6 + core * energy * 1.5);

  // Hot core goes white
  let whiteCore = smoothstep(0.4, 0.0, dist) * energy;
  col = mix(col, vec3f(1.0, 1.0, 1.0), whiteCore * 0.5);

  let alpha = falloff * (0.5 + energy * 0.8);

  return vec4f(col, alpha);
}
