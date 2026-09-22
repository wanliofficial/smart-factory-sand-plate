/**
 * Background —— 场景背景增强（深色底 + 3D星空 + 发光科技网格 + 近景微尘）
 * 由 SceneManager 在 buildNetwork 后挂载，update 内驱动。
 *
 * 设计约束：
 *   - scene.background 用纯色（不用贴图），避免 UnrealBloomPass 把背景亮星整屏叠加辉光
 *   - 星空用 3D Points 放在远处(radius 300-450)，bloom 只产生局部小圆点不会覆盖前景
 *   - 网格在地图下方(y=-1.6)，depthTest:true 让区县面遮挡
 *   - 近景微尘保留少量(300)，做相机微摆时的视差层次
 */
import * as THREE from 'three';
import { COLORS } from './constants.js';

export class Background {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.center = opts.center || [0, 0];
    this.size = opts.size || 200;
    this.gridY = opts.gridY != null ? opts.gridY : -1.6;
    this._group = new THREE.Group();
    this._buildBackground();
    this._buildStarfield();
    this._buildGrid();
    this._buildDust();
    scene.add(this._group);
    console.log('✅ 背景增强已创建：深色底 + 3D星空 + 发光网格(' + this.gridY.toFixed(1) + ') + 近景微尘');
  }

  // A: 纯色深色背景（不用贴图，避免 bloom 整屏辉光）
  _buildBackground() {
    this.scene.background = new THREE.Color(0x01040a);
  }

  // B: 3D 星空——远景球壳上分布星点，3D Points 保证 bloom 只在局部
  _buildStarfield() {
    const N = 800;
    const innerR = 300, outerR = 450;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const sz = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      // 球面均匀分布（偏上半球，下半球少星）
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() < 0.7
        ? Math.acos(Math.random())            // 上半球 70%
        : Math.acos(-Math.random() * 0.5);    // 下半球 30%（地平线下少量）
      const r = innerR + Math.random() * (outerR - innerR);

      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      // 星色：60% 冷白 / 25% 青蓝 / 15% 暖白
      const tint = Math.random();
      let cr, cg, cb;
      if (tint < 0.6) { cr = 0.85; cg = 0.92; cb = 1.0; }       // 冷白
      else if (tint < 0.85) { cr = 0.55; cg = 0.82; cb = 0.90; } // 青蓝
      else { cr = 1.0; cg = 0.86; cb = 0.70; }                   // 暖白

      // 亮度：80% 微弱 / 15% 中等 / 5% 亮星
      const br = Math.random();
      let brightness;
      if (br < 0.8) brightness = 0.12 + Math.random() * 0.18;
      else if (br < 0.95) brightness = 0.30 + Math.random() * 0.25;
      else brightness = 0.55 + Math.random() * 0.35;

      col[i * 3]     = cr * brightness;
      col[i * 3 + 1] = cg * brightness;
      col[i * 3 + 2] = cb * brightness;

      // 点大小（传给 shader 不用了，PointsMaterial 统一 size）
      sz[i] = brightness;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    const mat = new THREE.PointsMaterial({
      size: 1.8,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      fog: false,
      depthTest: false,     // 远景星空不参与深度测试，永远在最远
      depthWrite: false,
      toneMapped: false,    // 不做 tone mapping，保持星色纯正
    });

    const stars = new THREE.Points(geo, mat);
    stars.renderOrder = -10;  // 最先渲染，所有物体叠在上面
    this._stars = stars;
    this._group.add(stars);
  }

  // C: 发光青色科技网格（远处径向淡出 + 缓慢呼吸）
  _buildGrid() {
    const geo = new THREE.PlaneGeometry(this.size, this.size, 1, 1);
    const mat = new THREE.ShaderMaterial({
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      transparent: true,
      uniforms: {
        uColor: { value: new THREE.Color(COLORS.exchange) },
        uSize: { value: this.size },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        precision mediump float;
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uSize;
        uniform float uTime;
        float gridLine(vec2 p, float div, float w) {
          vec2 f = fract(p * div);
          vec2 d = 0.5 - abs(f - 0.5);
          float dist = min(d.x, d.y);
          return 1.0 - smoothstep(0.0, w, dist);
        }
        void main() {
          vec2 world = (vUv - 0.5) * uSize;
          float fine = gridLine(world, 0.5, 0.06);
          float bold = gridLine(world, 0.1, 0.04);
          float line = max(fine * 0.1, bold * 0.3);
          float r = length(world) / (uSize * 0.5);
          float fade = 1.0 - smoothstep(0.4, 0.85, r);
          float pulse = 0.85 + 0.15 * sin(uTime * 0.6);
          float a = line * fade * pulse;
          if (a < 0.008) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    const grid = new THREE.Mesh(geo, mat);
    grid.rotation.x = -Math.PI / 2;
    grid.position.set(this.center[0], this.gridY, this.center[1]);
    grid.renderOrder = -1;
    this._gridMat = mat;
    this._group.add(grid);
  }

  // D: 近景微尘（少量 3D 粒子，相机微摆时产生视差层次感）
  _buildDust() {
    const N = 300;
    const [cx, cz] = this.center;
    const spanX = 160, spanZ = 110;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3]     = cx + (Math.random() - 0.5) * spanX;
      pos[i * 3 + 1] = Math.random() * 34;
      pos[i * 3 + 2] = cz + (Math.random() - 0.5) * spanZ;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: COLORS.exchange,
      size: 0.3, sizeAttenuation: true,
      transparent: true, opacity: 0.35,
      fog: false, depthWrite: false, toneMapped: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = -4;
    this._particles = pts;
    this._group.add(pts);
  }

  update(delta) {
    if (this._gridMat) this._gridMat.uniforms.uTime.value += delta;
    if (this._stars) {
      this._stars.rotation.y += delta * 0.005;  // 极慢自转，几乎不可察觉
    }
    if (this._particles) {
      this._particles.rotation.y += delta * 0.012;
      this._particles.position.y = Math.sin(performance.now() * 0.0002) * 0.6;
    }
  }

  dispose() {
    this.scene.remove(this._group);
    this._group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
