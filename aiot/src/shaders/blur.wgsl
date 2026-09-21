// One axis of a separable gaussian blur. The horizontal and vertical passes need different
// uniform values, and a frame's `set()` writes all land before its command buffer runs, so the
// two passes are two separate effects (`blurH` / `blurV`) rather than one effect re-set twice.
//
// Fullscreen effect: vgpu supplies the vertex stage and the top-origin `uv` varying.

struct Blur {
  // Unit direction of the blur: (1, 0) horizontal, (0, 1) vertical.
  dirX: f32,
  dirY: f32,
  // Texel size of the SOURCE texture, so the tap spacing is one texel.
  texelX: f32,
  texelY: f32,
  // Tap radius in texels and the gaussian sigma, in texels.
  radius: f32,
  sigma: f32,
  pad0: f32,
  pad1: f32,
};

@group(0) @binding(0) var<uniform> blur: Blur;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let step = vec2f(blur.dirX * blur.texelX, blur.dirY * blur.texelY);

  var acc = vec3f(0.0);
  var weightSum = 0.0;
  let radius = i32(max(blur.radius, 1.0));
  for (var i = -radius; i <= radius; i = i + 1) {
    let fi = f32(i);
    let w = exp(-(fi * fi) / (2.0 * blur.sigma * blur.sigma));
    acc = acc + textureSampleLevel(src, samp, uv + step * fi, 0.0).rgb * w;
    weightSum = weightSum + w;
  }

  return vec4f(acc / max(weightSum, 1e-4), 1.0);
}
