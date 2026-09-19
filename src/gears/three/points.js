import * as THREE from 'three'

/**
 * 通用点精灵材质：按距离衰减尺寸 + 柔和圆形衰减，支持逐粒子颜色与透明度
 */
export function createPointsMaterial({
  blending = THREE.AdditiveBlending,
  sizeScale = 340,
  softness = 0.45,
} = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uSizeScale: { value: sizeScale },
      uSoftness: { value: softness },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute vec3 aColor;
      attribute float aAlpha;
      uniform float uPixelRatio;
      uniform float uSizeScale;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = aColor;
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uSizeScale * uPixelRatio / max(-mv.z, 0.001);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uSoftness;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 d = gl_PointCoord - vec2(0.5);
        float r = length(d) * 2.0;
        float a = smoothstep(1.0, uSoftness, r);
        a *= a;
        float alpha = a * vAlpha;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending,
  })
}

export function makePoints(count, material) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(count), 1))
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(count), 1))
  const points = new THREE.Points(geo, material)
  points.frustumCulled = false
  return points
}
