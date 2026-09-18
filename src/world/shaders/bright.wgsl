// ============================================================
// Bright Pass — extract bright pixels for bloom
// ============================================================

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

struct BrightParams {
  threshold: f32,
  softKnee: f32,
  _pad: vec2f,
}

@group(0) @binding(2) var<uniform> params: BrightParams;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let color = textureSampleLevel(src, samp, uv, 0.0).rgb;
  let l = dot(color, vec3f(0.2126, 0.7152, 0.0722));

  let knee = params.threshold * params.softKnee;
  let soft = clamp((l - params.threshold + knee) / (2.0 * max(knee, 0.001)), 0.0, 1.0);
  let contribution = max(soft * soft * knee, l - params.threshold);
  let weight = contribution / max(l, 0.001);

  return vec4f(color * weight, 1.0);
}
