// ============================================================
// Connection Shader — instanced arc lines between nodes
// ============================================================

import { connColor } from "./utils.wgsl";

struct Camera {
  ro: vec3f,
  time: f32,
  aspect: f32,
  resolution: vec2f,
  _pad: vec2f,
}

struct Connection {
  fromPos: vec3f,
  connType: u32,
  toPos: vec3f,
  traffic: f32,
  flowOffset: f32,
  flowSpeed: f32,
  _pad0: vec2f,
  _pad1: vec4f,
}

@group(0) @binding(0) var<uniform> cam: Camera;
@group(0) @binding(1) var<storage, read> connections: array<Connection>;

fn pmod(a: f32, b: f32) -> f32 {
  return a - b * floor(a / b);
}

// Quadratic bezier point on arc (lifted off sphere)
fn arcPoint(from_: vec3f, to_: vec3f, t: f32) -> vec3f {
  let mid = normalize((from_ + to_) * 0.5) * 1.18;
  let mt = 1.0 - t;
  let p = from_ * mt * mt + mid * 2.0 * mt * t + to_ * t * t;
  return p;
}

fn projectPoint(p: vec3f) -> vec2f {
  let forward = normalize(-cam.ro);
  let right = normalize(cross(forward, vec3f(0.0, 1.0, 0.0)));
  let up = cross(right, forward);

  let rel = p - cam.ro;
  let depth = dot(rel, forward);
  if (depth <= 0.0) { return vec2f(9999.0, 9999.0); }

  let focal = cam.resolution.y * 0.6;
  let x = dot(rel, right) * focal / depth;
  let y = dot(rel, up) * focal / depth;

  return vec2f(x / cam.resolution.x * 2.0, y / cam.resolution.y * 2.0);
}

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec3f,
  @location(2) traffic: f32,
  @location(3) flow: f32,
  @location(4) dim: f32,
}

// For each connection instance, we draw a ribbon (quad) along the arc
// vertex 0-1: start, vertex 2-3: end
@vertex fn vs_main(
  @builtin(vertex_index) vi: u32,
  @builtin(instance_index) instance: u32,
) -> VSOut {
  var out: VSOut;
  let conn = connections[instance];

  // 6 vertices per quad ribbon. We use two segments for a simple curve.
  // For simplicity, we'll draw a straight line with thickness between two arc samples.
  // To make it look curved, we sample 3 points and create 2 triangles per side.

  // Better approach: sample along arc and compute perpendicular offset.
  // vertex index determines which segment point and which side.

  let segments = 12u;
  let totalVerts = (segments + 1u) * 2u;

  // Map vertex index to segment index and side
  let seg = vi / 2u;
  let side = f32(vi % 2u) * 2.0 - 1.0; // -1 or 1

  let t = f32(seg) / f32(segments);
  let p = arcPoint(conn.fromPos, conn.toPos, t);

  // Next point for tangent
  let tNext = f32(seg + 1u) / f32(segments);
  let pNext = arcPoint(conn.fromPos, conn.toPos, min(tNext, 1.0));
  let tangent = normalize(pNext - p);

  // Project to screen
  let sp = projectPoint(p);
  let spNext = projectPoint(pNext);

  // Perpendicular in screen space
  let dir = normalize(spNext - sp);
  let perp = vec2f(-dir.y, dir.x);

  let thickness = 0.002 + conn.traffic * 0.004;
  let offset = perp * side * thickness;

  out.position = vec4f(sp + offset, 0.0, 1.0);
  out.uv = vec2f(t, side * 0.5 + 0.5);
  out.color = connColor(conn.connType);
  out.traffic = conn.traffic;
  out.flow = fract(cam.time * conn.flowSpeed * 0.3 + conn.flowOffset);

  // 背侧弧段遮挡减淡，避免远侧连线糊在地球盘面上
  var dim = 1.0;
  let fwd = normalize(-cam.ro);
  let rel = p - cam.ro;
  let tAxis = dot(rel, fwd);
  let depthCenter = dot(-cam.ro, fwd);
  if (tAxis > depthCenter) {
    let perp = length(rel - fwd * tAxis);
    dim *= 1.0 - (1.0 - smoothstep(0.85, 1.25, perp)) * 0.85;
  }
  out.dim = dim;

  return out;
}

@fragment fn fs_main(
  @location(0) uv: vec2f,
  @location(1) color: vec3f,
  @location(2) traffic: f32,
  @location(3) flow: f32,
  @location(4) dim: f32,
) -> @location(0) vec4f {
  // Fade edges
  let edge = 1.0 - abs(uv.y - 0.5) * 2.0;
  let edgeSoft = pow(edge, 1.5);

  // Fade ends
  let ends = smoothstep(0.0, 0.1, uv.x) * smoothstep(1.0, 0.9, uv.x);

  // Data pulse: traveling bright spots
  let pulseSpacing = 0.25;
  let pulsePos = pmod(uv.x - flow, pulseSpacing) / pulseSpacing;
  let pulse = exp(-pulsePos * pulsePos * 30.0) * traffic;

  var col = color * (0.12 + traffic * 0.2);
  col += pulse * color * 1.5;
  col += pulse * vec3f(1.0, 1.0, 1.0) * 1.0;
  col *= dim;

  let alpha = edgeSoft * ends * (0.25 + traffic * 0.3 + pulse * 1.0) * dim;

  return vec4f(col, alpha);
}
