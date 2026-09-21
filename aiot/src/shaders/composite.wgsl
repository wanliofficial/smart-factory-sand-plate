// Final pass: scene + bloom, then the cinematic vignette and edge falloff.
//
// Fullscreen effect: vgpu supplies the vertex stage and the top-origin `uv` varying.
//
// The vignette and focus radii are measured in half-height units and normalised so 1.0 is the
// screen corner, so they stay circular on a wide canvas instead of stretching into an oval.

struct Post {
  aspect: f32,
  bloom: f32,
  vignette: f32,
  focus: f32,
};

@group(0) @binding(0) var<uniform> post: Post;
@group(0) @binding(1) var scene: texture_2d<f32>;
@group(0) @binding(2) var glow: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let base = textureSampleLevel(scene, samp, uv, 0.0).rgb;
  let bloom = textureSampleLevel(glow, samp, uv, 0.0).rgb;

  // Distance from centre in half-height units, renormalised so the corner is 1.0.
  let p = (uv - vec2f(0.5, 0.5)) * vec2f(post.aspect, 1.0);
  let r = length(p) / length(vec2f(0.5 * post.aspect, 0.5));

  let vig = 1.0 - smoothstep(0.35, 1.0, r) * post.vignette;
  // A gentle edge falloff on top of the vignette: the centre stays crisp, the frame edges recede.
  let focus = 1.0 - smoothstep(0.10, 1.0, r) * 0.12 * post.focus;

  return vec4f((base + bloom * post.bloom) * vig * focus, 1.0);
}
