// ============================================================
// Node Shader — instanced node rendering
// ============================================================

import { nodeColor } from "./utils.wgsl";

struct Camera {
  ro: vec3f,
  time: f32,
  aspect: f32,
  resolution: vec2f,
  _pad: vec2f,
}

struct NodeData {
  position: vec3f,
  nodeType: u32,
  size: f32,
  status: f32,
  pulsePhase: f32,
  pulseSpeed: f32,
  selected: f32,
  hover: f32,
  _pad0: vec2f,
  _pad1: vec4f,
}

@group(0) @binding(0) var<uniform> cam: Camera;
@group(0) @binding(1) var<storage, read> nodes: array<NodeData>;

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

fn getDepth(p: vec3f) -> f32 {
  let forward = normalize(-cam.ro);
  return dot(p - cam.ro, forward);
}

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) color: vec3f,
  @location(2) size: f32,
  @location(3) status: f32,
  @location(4) pulse: f32,
  @location(5) nodeType: f32,
  @location(6) selected: f32,
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
  let node = nodes[instance];
  let screenPos = projectPoint(node.position);

  // Size based on node size and depth
  let forward = normalize(-cam.ro);
  let depth = dot(node.position - cam.ro, forward);
  let focal = cam.resolution.y * 0.6;
  let pxSize = node.size * 0.04 * focal / max(depth, 0.1);
  let screenSize = pxSize / cam.resolution.y * 2.0;

  out.position = vec4f(screenPos + corner * screenSize * 3.0, 0.0, 1.0);
  out.local = corner;
  out.color = nodeColor(node.nodeType);
  out.size = node.size;
  out.status = node.status;
  out.pulse = 0.5 + 0.5 * sin(cam.time * node.pulseSpeed + node.pulsePhase);
  out.nodeType = f32(node.nodeType);
  out.selected = node.selected;

  return out;
}

@fragment fn fs_main(
  @location(0) local: vec2f,
  @location(1) color: vec3f,
  @location(2) size: f32,
  @location(3) status: f32,
  @location(4) pulse: f32,
  @location(5) nodeType: f32,
  @location(6) selected: f32,
) -> @location(0) vec4f {
  let dist = length(local);
  if (dist > 1.0) { discard; }

  var col = color;
  var alpha = 0.0;

  // Outer glow
  let outerGlow = pow(1.0 - dist, 2.0) * 0.4;
  alpha += outerGlow * (0.5 + pulse * 0.5);
  col *= 0.5 + pulse * 0.5;

  // Core
  let coreDist = smoothstep(0.4, 0.1, dist);
  alpha += coreDist * 0.9;
  col = mix(col, vec3f(1.0, 1.0, 1.0), coreDist * 0.5);

  // Pulse ring
  let ringRadius = 0.5 + pulse * 0.4;
  let ring = smoothstep(0.05, 0.0, abs(dist - ringRadius)) * 0.6;
  alpha += ring * pulse;
  col += ring * color * 2.0;

  // Status tint
  if (status < 0.3) {
    // Offline — dim red
    col = mix(col, vec3f(0.8, 0.2, 0.2), 0.7);
    alpha *= 0.5;
  } else if (status < 0.7) {
    // Warning — amber pulse
    col = mix(col, vec3f(1.0, 0.6, 0.1), 0.4);
  }

  // Selected state
  if (selected > 0.5) {
    let selRing = smoothstep(0.1, 0.0, abs(dist - 0.85)) * 1.5;
    alpha += selRing;
    col += selRing * vec3f(1.0, 1.0, 1.0);
    alpha *= 1.3;
  }

  return vec4f(col * alpha, alpha);
}
