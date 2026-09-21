// Bloom pass 1: extract the bright regions of the scene, with a soft knee so the glow ramps
// in instead of popping at the threshold. This is a fullscreen effect, so vgpu supplies the
// vertex stage and the top-origin `uv` varying; only the fragment is authored here.
//
// Sampled at half resolution (the pass target is half size), so the downsample and the bright
// pass happen together.

struct BloomPre {
  threshold: f32,
  knee: f32,
  pad0: f32,
  pad1: f32,
};

@group(0) @binding(0) var<uniform> pre: BloomPre;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(src, samp, uv, 0.0).rgb;
  let l = dot(c, vec3f(0.2126, 0.7152, 0.0722));

  let knee = max(pre.knee, 1e-4);
  var soft = l - pre.threshold + knee;
  soft = clamp(soft, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee);
  let contribution = max(soft, l - pre.threshold) / max(l, 1e-4);

  return vec4f(c * contribution, 1.0);
}
