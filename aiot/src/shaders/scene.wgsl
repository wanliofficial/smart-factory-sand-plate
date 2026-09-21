struct Camera {
  viewProj: mat4x4f,
};

struct Object {
  model: mat4x4f,
  tint: vec4f,
  glow: f32,
  lineWidth: f32,
  pad0: f32,
  pad1: f32,
};

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> object: Object;

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
  @location(1) glow: f32,
};

@vertex
fn vs_main(@location(0) position: vec3f, @location(1) color: vec4f) -> VSOut {
  var out: VSOut;
  out.position = camera.viewProj * object.model * vec4f(position,1.0);
  out.color = color * object.tint;
  out.glow = object.glow;
  return out;
}

@fragment
fn fs_main(in:VSOut)->@location(0) vec4f {
  let edge = 0.78 + 0.22 * in.glow;
  return vec4f(in.color.rgb * edge, in.color.a);
}
