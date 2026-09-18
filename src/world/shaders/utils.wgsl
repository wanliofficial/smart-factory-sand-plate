// ============================================================
// Utility functions shared across shaders
// ============================================================

const PI = 3.14159265359;
const TAU = 6.28318530718;
const EARTH_RADIUS = 1.0;

// Hash functions
fn hash11(n: f32) -> f32 {
  return fract(sin(n) * 43758.5453123);
}

fn hash21(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123);
}

fn hash31(p: vec3f) -> f32 {
  return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453123);
}

fn hash33(p: vec3f) -> vec3f {
  return vec3f(
    hash31(p + vec3f(1.0, 2.0, 3.0)),
    hash31(p + vec3f(4.0, 5.0, 6.0)),
    hash31(p + vec3f(7.0, 8.0, 9.0))
  );
}

// Noise
fn noise31(p: vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(hash31(i + vec3f(0,0,0)), hash31(i + vec3f(1,0,0)), u.x),
      mix(hash31(i + vec3f(0,1,0)), hash31(i + vec3f(1,1,0)), u.x),
      u.y
    ),
    mix(
      mix(hash31(i + vec3f(0,0,1)), hash31(i + vec3f(1,0,1)), u.x),
      mix(hash31(i + vec3f(0,1,1)), hash31(i + vec3f(1,1,1)), u.x),
      u.y
    ),
    u.z
  );
}

fn noise21(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), u.x),
    mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), u.x),
    u.y
  );
}

fn fbm3(p: vec3f) -> f32 {
  var value = 0.0;
  var amplitude = 0.5;
  var pos = p;
  for (var i = 0u; i < 5u; i++) {
    value += amplitude * noise31(pos);
    pos *= 2.02;
    amplitude *= 0.5;
  }
  return value;
}

// Rotations
fn rotateY(p: vec3f, a: f32) -> vec3f {
  let c = cos(a);
  let s = sin(a);
  return vec3f(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

fn rotateX(p: vec3f, a: f32) -> vec3f {
  let c = cos(a);
  let s = sin(a);
  return vec3f(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
}

fn rotateZ(p: vec3f, a: f32) -> vec3f {
  let c = cos(a);
  let s = sin(a);
  return vec3f(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
}

// SDF
fn sdSphere(p: vec3f, r: f32) -> f32 {
  return length(p) - r;
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Tone mapping
fn acesFilm(x: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

// Get color for node type
export fn nodeColor(t: u32) -> vec3f {
  switch (t) {
    case 0u:  { return vec3f(0.3, 0.7, 1.0); }   // SMART_CITY
    case 1u:  { return vec3f(1.0, 0.55, 0.2); }  // SMART_FACTORY
    case 2u:  { return vec3f(0.95, 0.5, 0.1); }  // INDUSTRIAL_PARK
    case 3u:  { return vec3f(0.6, 0.4, 1.0); }   // DATA_CENTER
    case 4u:  { return vec3f(0.2, 0.9, 0.6); }   // WIND_FARM
    case 5u:  { return vec3f(1.0, 0.85, 0.25); } // SOLAR_FARM
    case 6u:  { return vec3f(0.4, 0.7, 1.0); }   // LOGISTICS_CENTER
    case 7u:  { return vec3f(0.0, 1.0, 0.95); }  // AI_CORE
    case 8u:  { return vec3f(0.5, 0.8, 1.0); }   // IOT_GATEWAY
    case 9u:  { return vec3f(0.3, 0.9, 0.7); }   // SENSOR
    case 10u: { return vec3f(1.0, 0.9, 0.3); }   // ENERGY_GRID
    case 11u: { return vec3f(0.8, 0.5, 1.0); }   // VEHICLE
    default:  { return vec3f(0.5, 0.7, 1.0); }
  }
}

export fn connColor(t: u32) -> vec3f {
  switch (t) {
    case 0u:  { return vec3f(0.3, 0.7, 1.0); }   // data
    case 1u:  { return vec3f(1.0, 0.6, 0.2); }   // industrial
    case 2u:  { return vec3f(0.6, 0.4, 1.0); }   // backbone
    case 3u:  { return vec3f(1.0, 0.9, 0.3); }   // energy
    case 4u:  { return vec3f(0.4, 0.8, 1.0); }   // logistics
    default:  { return vec3f(0.5, 0.8, 1.0); }
  }
}
