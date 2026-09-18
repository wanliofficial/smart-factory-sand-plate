// ============================================================
// Main World Shader — fullscreen raymarch of digital earth
// ============================================================

const PI = 3.14159265359;
const TAU = 6.28318530718;
const EARTH_RADIUS = 1.0;

struct Camera {
  ro: vec3f,
  time: f32,
  aspect: f32,
  resolution: vec2f,
  _pad: vec2f,
}

@group(0) @binding(0) var<uniform> cam: Camera;

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
fn smin(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
fn acesFilm(x: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

// Starfield background
fn starfield(rd: vec3f, t: f32) -> vec3f {
  var col = vec3f(0.0);

  // Layer 1: distant stars
  let uv = vec2f(atan2(rd.z, rd.x) / PI, asin(rd.y) / (PI * 0.5));
  let g1 = floor(uv * 400.0);
  let s1 = step(0.996, hash21(g1));
  let b1 = hash21(g1 + vec2f(13.7, 73.1));
  col += s1 * b1 * vec3f(0.8, 0.9, 1.0) * 0.8;

  // Layer 2: brighter stars
  let g2 = floor(uv * 150.0);
  let s2 = step(0.9985, hash21(g2 + vec2f(42.0, 17.0)));
  let b2 = hash21(g2 + vec2f(91.3, 27.9));
  col += s2 * b2 * vec3f(0.9, 0.95, 1.0) * 1.5;

  // Twinkle
  let twinkle = 0.7 + 0.3 * sin(t * 2.0 + hash21(g1) * 100.0);
  col *= twinkle;

  // Nebula
  let neb = fbm3(rd * 1.5 + vec3f(t * 0.002, 0.0, 0.0));
  let nebula = pow(neb, 4.0) * 0.04;
  col += nebula * vec3f(0.15, 0.25, 0.6);

  let neb2 = fbm3(rd * 2.5 + vec3f(100.0, 50.0, t * 0.001));
  col += pow(neb2, 5.0) * 0.02 * vec3f(0.4, 0.2, 0.7);

  return col;
}

// Digital Earth SDF with procedural continents
fn earthSDF(p: vec3f, t: f32) -> f32 {
  let d = length(p) - EARTH_RADIUS;

  // Continent-like elevation from noise
  let n = normalize(p);
  let continents = fbm3(n * 2.8 + vec3f(0.0, 0.0, t * 0.005));
  let elev = smoothstep(0.4, 0.6, continents) * 0.02;

  // Grid indentation (creates wireframe look)
  let lat = abs(n.y);
  let lon = atan2(n.z, n.x) / PI;
  let latLine = pow(sin(lat * PI * 18.0), 200.0);
  let lonLine = pow(sin(lon * 18.0), 200.0);
  let grid = max(latLine, lonLine) * 0.002;

  return d - elev + grid;
}

// Digital Earth surface color
fn earthSurface(n: vec3f, t: f32) -> vec3f {
  var col = vec3f(0.015, 0.03, 0.08); // deep ocean

  // Continents
  let continentNoise = fbm3(n * 2.8 + vec3f(0.0, 0.0, t * 0.005));
  let isLand = smoothstep(0.42, 0.55, continentNoise);
  col = mix(col, vec3f(0.04, 0.1, 0.2), isLand * 0.7);
  col = mix(col, vec3f(0.06, 0.14, 0.25), isLand * smoothstep(0.55, 0.7, continentNoise) * 0.5);

  // Grid lines
  let lat = abs(n.y);
  let lon = atan2(n.z, n.x) / PI;
  let latGrid = pow(sin(lat * PI * 18.0), 80.0);
  let lonGrid = pow(sin(lon * 18.0), 80.0);
  let grid = max(latGrid, lonGrid) * (0.3 + isLand * 0.5);
  col += grid * vec3f(0.0, 0.5, 1.0) * 0.6;

  // City lights (clustered bright spots on land)
  let lightNoise = fbm3(n * 25.0 + vec3f(t * 0.003));
  let lights = smoothstep(0.55, 0.72, lightNoise) * isLand;
  col += lights * vec3f(1.0, 0.85, 0.5) * 0.9;

  // Data flow patterns
  let flow = fbm3(n * 6.0 + vec3f(0.0, t * 0.04, t * 0.025));
  let flowLines = pow(flow, 4.0) * 0.25;
  col += flowLines * vec3f(0.0, 0.7, 1.0);

  // Equator highlight
  let equator = exp(-abs(n.y) * 30.0) * 0.15;
  col += equator * vec3f(0.0, 0.8, 1.0);

  // Pole highlights
  let poles = exp(-(1.0 - abs(n.y)) * 20.0) * 0.1;
  col += poles * vec3f(0.3, 0.6, 1.0);

  return col;
}

// Atmospheric glow (when ray doesn't hit earth)
fn atmosphereGlow(ro: vec3f, rd: vec3f, t: f32) -> vec3f {
  var glow = vec3f(0.0);

  let center = vec3f(0.0);
  let oc = ro - center;
  let b = dot(oc, rd);
  let c = dot(oc, oc);
  let h = b * b - c + 1.1 * 1.1;

  if (h < 0.0) { return glow; }

  let t0 = -b - sqrt(h);
  if (t0 < 0.0) { return glow; }

  let entry = ro + rd * t0;
  let n = normalize(entry);

  // Fresnel-like rim
  let rim = pow(1.0 - abs(dot(n, -rd)), 3.5);
  glow += rim * vec3f(0.0, 0.45, 1.0) * 0.5;

  // Data streams in atmosphere
  let streams = fbm3(n * 5.0 + vec3f(t * 0.015, t * 0.01, 0.0));
  let streamMask = pow(streams, 5.0) * rim * 0.4;
  glow += streamMask * vec3f(0.0, 0.9, 1.0);

  // Subtle inner glow
  let inner = exp(-abs(length(entry) - 1.05) * 15.0) * 0.2;
  glow += inner * vec3f(0.1, 0.3, 0.7);

  return glow;
}

// AI Core — neural structure floating above earth
fn aiCoreSDF(p: vec3f, t: f32) -> f32 {
  let center = vec3f(0.0, 2.2, 0.0);
  let q = p - center;

  let pulse = 1.0 + sin(t * 0.8) * 0.05;
  let coreSize = 0.32 * pulse;

  // Core sphere
  let core = length(q) - coreSize;

  // Rotating rings at different angles
  let qy = rotateY(q, t * 0.25);
  let ring1 = max(abs(qy.y) - 0.008, abs(length(qy.xz) - coreSize * 1.7) - 0.006);

  let qx = rotateX(q, t * 0.3);
  let ring2 = max(abs(qx.z) - 0.006, abs(length(qx.xy) - coreSize * 2.1) - 0.005);

  let qz = rotateZ(q, t * 0.2);
  let ring3 = max(abs(qz.y) - 0.005, abs(length(qz.xz) - coreSize * 2.6) - 0.004);

  // Inner structure
  let inner = abs(length(q) - coreSize * 0.6) - 0.008;

  var d = smin(core, ring1, 0.015);
  d = smin(d, ring2, 0.012);
  d = smin(d, ring3, 0.01);
  d = smin(d, inner, 0.01);

  return d;
}

fn aiCoreColor(p: vec3f, t: f32) -> vec3f {
  let center = vec3f(0.0, 2.2, 0.0);
  let q = p - center;
  let dist = length(q);

  let base = vec3f(0.0, 0.85, 1.0);
  let intensity = smoothstep(0.35, 0.0, dist) * 1.5;

  // Pulsing energy
  let pulse = 0.5 + 0.5 * sin(t * 2.0 + dist * 8.0);
  var col = base * (0.5 + intensity + pulse * 0.3);

  // Core white hot center
  let core = smoothstep(0.15, 0.0, dist);
  col = mix(col, vec3f(1.0, 1.0, 1.0), core * 0.7);

  return col;
}

// AI Core volumetric glow
fn aiCoreVolumetric(ro: vec3f, rd: vec3f, t: f32) -> vec3f {
  let center = vec3f(0.0, 2.2, 0.0);
  let oc = ro - center;

  let b = dot(oc, rd);
  let c = dot(oc, oc) - 1.8 * 1.8;
  let h = b * b - c;
  if (h < 0.0) { return vec3f(0.0); }

  let entry = -b - sqrt(h);
  if (entry < 0.0) { return vec3f(0.0); }
  let exit = -b + sqrt(h);
  let thickness = exit - entry;

  var total = vec3f(0.0);
  let steps = 8.0;
  for (var i = 0.0; i < steps; i += 1.0) {
    let p = ro + rd * (entry + thickness * (i / steps));
    let d = length(p - center);
    let density = exp(-d * 2.2) * 0.12;
    var col = vec3f(0.0, 0.8, 1.0);
    // Inner core is brighter and whiter
    col = mix(col, vec3f(0.8, 1.0, 1.0), exp(-d * 5.0) * 0.8);
    total += density * col;
  }

  // Flicker
  total *= 0.85 + 0.15 * sin(t * 2.5 + t * 4.1);

  return total;
}

// Network connections — arc lines between nodes
// Returns distance to nearest connection arc
fn networkDistance(p: vec3f, fromPos: vec3f, toPos: vec3f, t: f32) -> f32 {
  // Great circle arc approximated with midpoint lift
  let mid = normalize((fromPos + toPos) * 0.5) * 1.15;
  let a = fromPos;
  let b = mid;
  let c = toPos;

  // Distance to two line segments
  let ab = b - a;
  let ap = p - a;
  let t1 = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0);
  let d1 = length(ap - ab * t1);

  let bc = c - b;
  let bp = p - b;
  let t2 = clamp(dot(bp, bc) / dot(bc, bc), 0.0, 1.0);
  let d2 = length(bp - bc * t2);

  return min(d1, d2);
}

// Raymarch main scene
fn raymarch(ro: vec3f, rd: vec3f, t: f32) -> vec4f {
  var col = vec3f(0.0);

  // Background stars
  col += starfield(rd, t);

  // AI Core volumetric (behind earth)
  col += aiCoreVolumetric(ro, rd, t);

  // Earth raymarch
  var dist = 0.0;
  var hitEarth = false;
  var hitNormal = vec3f(0.0);
  var hitPos = vec3f(0.0);

  for (var i = 0u; i < 80u; i++) {
    let p = ro + rd * dist;
    let d = earthSDF(p, t);
    if (d < 0.001) {
      hitEarth = true;
      hitPos = p;
      // Compute normal
      let e = 0.001;
      hitNormal = normalize(vec3f(
        earthSDF(p + vec3f(e, 0, 0), t) - earthSDF(p - vec3f(e, 0, 0), t),
        earthSDF(p + vec3f(0, e, 0), t) - earthSDF(p - vec3f(0, e, 0), t),
        earthSDF(p + vec3f(0, 0, e), t) - earthSDF(p - vec3f(0, 0, e), t),
      ));
      break;
    }
    if (dist > 20.0) { break; }
    dist += d * 0.8;
  }

  if (hitEarth) {
    var surfCol = earthSurface(normalize(hitPos), t);

    // Lighting
    let lightDir = normalize(vec3f(0.6, 0.8, 0.4));
    let diff = max(0.0, dot(hitNormal, lightDir));
    surfCol *= 0.25 + diff * 0.75;

    // Rim light
    let rim = pow(1.0 - max(0.0, dot(hitNormal, -rd)), 3.0);
    surfCol += rim * vec3f(0.0, 0.5, 1.0) * 0.4;

    col = surfCol;
  } else {
    // Atmosphere glow
    col += atmosphereGlow(ro, rd, t);
  }

  // AI Core raymarch (draw on top if closer than earth or no earth hit)
  var aiDist = 0.0;
  var aiHit = false;
  var aiHitPos = vec3f(0.0);
  var aiTotalDist = 0.0;

  for (var i = 0u; i < 40u; i++) {
    let p = ro + rd * aiTotalDist;
    let d = aiCoreSDF(p, t);
    if (d < 0.001) {
      aiHit = true;
      aiHitPos = p;
      break;
    }
    if (aiTotalDist > 20.0) { break; }
    if (hitEarth && aiTotalDist > dist) { break; }
    aiTotalDist += max(d * 0.7, 0.002);
  }

  if (aiHit && (!hitEarth || aiTotalDist < dist)) {
    let aiCol = aiCoreColor(aiHitPos, t);
    col = mix(col, aiCol, 1.0);
  }

  return vec4f(col, 1.0);
}

// ============================================================
// Fullscreen effect entry point
// ============================================================

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // uv is 0..1 from vgpu effect vertex stage
  let centered = (uv - vec2f(0.5)) * 2.0;
  var coord = centered;
  coord.x *= cam.aspect;

  let fov = 1.2;
  let rd = normalize(vec3f(coord * fov, -1.0));
  let ro = cam.ro;

  let col = raymarch(ro, rd, cam.time);
  return vec4f(col.rgb, 1.0);
}
