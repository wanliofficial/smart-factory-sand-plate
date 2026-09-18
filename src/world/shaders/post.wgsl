// ============================================================
// Post Processing — final composite: bloom, tone mapping, vignette
// ============================================================

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var bloom: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

struct PostParams {
  time: f32,
  aspect: f32,
  bloomIntensity: f32,
  _pad: f32,
}

@group(0) @binding(3) var<uniform> params: PostParams;

fn acesFilm(x: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

fn hash21(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123);
}

@fragment fn fs_main(
  @builtin(position) frag: vec4f,
  @location(0) uv: vec2f,
) -> @location(0) vec4f {
  var col = textureSampleLevel(src, samp, uv, 0.0).rgb;
  let bloomCol = textureSampleLevel(bloom, samp, uv, 0.0).rgb;

  // Add bloom
  col += bloomCol * params.bloomIntensity;

  // Tone mapping
  col = acesFilm(col);

  // Gamma
  col = pow(col, vec3f(1.0 / 2.2));

  // Vignette
  let centered = uv - vec2f(0.5);
  let vign = 1.0 - smoothstep(0.5, 1.1, length(centered * vec2f(params.aspect, 1.0)) * 1.5);
  col *= mix(0.6, 1.0, vign);

  // Subtle film grain
  let grain = hash21(frag.xy + vec2f(params.time * 30.0)) * 0.02 - 0.01;
  col += grain;

  // Subtle blue tint in shadows
  let luma = dot(col, vec3f(0.2126, 0.7152, 0.0722));
  col = mix(col, col * vec3f(0.92, 0.96, 1.04), 1.0 - smoothstep(0.0, 0.5, luma));

  return vec4f(col, 1.0);
}
