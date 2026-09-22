/**
 * Three.js 3D Scene Manager（编排者）
 * 供热管网3D可视化场景
 *
 * 本文件只负责"舞台搭建 + 每帧编排"：
 *   - 场景 / 相机 / 渲染器 / 标签渲染器 / 控制器 / 灯光 / 后处理 / 拾取
 *   - 调度 NetworkBuilder（管网构建与动画）与 ComputeEngine（高空计算引擎与扫描）
 * 具体业务逻辑见同目录 NetworkBuilder.js / ComputeEngine.js / constants.js。
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { MapBuilder, lngLatToScene } from './map.js';
import { COLORS } from './constants.js';
import { NetworkBuilder } from './NetworkBuilder.js';
import { ComputeEngine } from './computeEngine/index.js';
import { Background } from './background.js';

export class SceneManager {
  constructor(container, labelContainer) {
    this.container = container;
    this.labelContainer = labelContainer;
    this.mapBuilder = null;
    this.onNodeClick = null;

    // 相机微摆状态（控制器交互时暂停）
    this._userInteracting = false;
    this._lastSway = null; // 上一帧微摆偏移，用于撤销后重新叠加

    this._initScene();
    this._initCamera();
    this._initRenderer();
    this._initLabelRenderer();
    this._initControls();
    this._initLights();
    this._initPostProcessing();
    this._initRaycaster();

    // 业务模块（按需注入舞台依赖）
    this.network = new NetworkBuilder(this.scene, this.camera, this.controls);
    this.engine = new ComputeEngine(this.scene, this.controls);

    window.addEventListener('resize', () => this._onResize());
  }

  /** 异步初始化（加载GeoJSON地图） */
  async init() {
    await this._initMap();
  }

  // ===== 初始化场景 =====
  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060a14);
    this.scene.fog = new THREE.FogExp2(0x060a14, 0.0028);
  }

  _initCamera() {
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    // 聚焦三站管线质心 (-12, -2)
    this.camera.position.set(-12, 55, 45);
    this.camera.lookAt(-12, 0, -2);
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.appendChild(this.renderer.domElement);
  }

  _initLabelRenderer() {
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    this.labelContainer.appendChild(this.labelRenderer.domElement);
  }

  _initControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    // 俯视为主，可微调倾斜角度
    this.controls.maxPolarAngle = Math.PI / 2.3;
    this.controls.minPolarAngle = 0;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 480;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true;
    this.controls.autoRotate = false;

    // 用户交互检测（相机微摆在交互时暂停）
    let idleTimer = null;
    this.controls.addEventListener('start', () => {
      this._userInteracting = true;
      this._lastSway = null; // 交互开始时清除缓存，避免撤销时污染轨道状态
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    });
    this.controls.addEventListener('end', () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { this._userInteracting = false; }, 2000);
    });

    // 聚焦三站管线质心
    this.controls.target.set(-12, 0, -2);

    // 调试用：拖拽时在控制台输出相机参数（节流500ms）
    let logTimer = null;
    this.controls.addEventListener('change', () => {
      if (logTimer) return;
      logTimer = setTimeout(() => {
        const p = this.camera.position;
        const t = this.controls.target;
        // 计算球坐标（方便理解角度）
        const dx = p.x - t.x, dy = p.y - t.y, dz = p.z - t.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const polar = Math.acos(dy / dist) * 180 / Math.PI; // 极角（从Y轴算）
        const azimuth = Math.atan2(dx, dz) * 180 / Math.PI;  // 方位角
        console.log(
          `%c📷 相机参数`,
          'color:#00d9ff;font-weight:bold',
          `\n  position: (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})` +
          `\n  target:   (${t.x.toFixed(2)}, ${t.y.toFixed(2)}, ${t.z.toFixed(2)})` +
          `\n  距离: ${dist.toFixed(2)}  俯角: ${polar.toFixed(1)}°  方位: ${azimuth.toFixed(1)}°`
        );
        logTimer = null;
      }, 500);
    });
  }

  _initLights() {
    // 环境光
    this.scene.add(new THREE.AmbientLight(0x4a6fa5, 0.4));

    // 方向光
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(50, 80, 50);
    this.scene.add(dirLight);

    // 点光源（首站位置，暖色）
    const [sx, sz] = lngLatToScene(114.155332, 36.470269);
    const sourceLight = new THREE.PointLight(COLORS.supply, 1.2, 50);
    sourceLight.position.set(sx, 5, sz);
    this.scene.add(sourceLight);
  }

  async _initMap() {
    // 加载GeoJSON真实地图
    this.mapBuilder = new MapBuilder(this.scene);
    await this.mapBuilder.load();
  }

  _initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.container.clientWidth, this.container.clientHeight),
      0.6,  // strength
      0.5,  // radius
      0.15  // threshold
    );
    this.composer.addPass(bloomPass);
    this.composer.addPass(new OutputPass());
  }

  _initRaycaster() {
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.renderer.domElement.addEventListener('click', (event) => {
      this.mouse.x = (event.clientX / this.container.clientWidth) * 2 - 1;
      this.mouse.y = -(event.clientY / this.container.clientHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const targets = [...this.network.nodeMeshes, ...this.network.pipeMeshes];
      const intersects = this.raycaster.intersectObjects(targets, true);
      if (intersects.length > 0 && this.onNodeClick) {
        let obj = intersects[0].object;
        while (obj && !obj.userData.nodeData && !obj.userData.pipeData) {
          obj = obj.parent;
        }
        if (obj && (obj.userData.nodeData || obj.userData.pipeData)) {
          this.onNodeClick(obj.userData.nodeData || obj.userData.pipeData);
        }
      }
    });
  }

  _onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  // ===== 构建管网（委派给 NetworkBuilder，引擎随后挂载） =====
  async buildNetwork(data) {
    await this.network.buildNetwork(data);
    this.engine.create();            // 依赖拓扑质心 controls.target
    // 背景增强（渐变底色 + 发光网格 + 漂浮粒子），对齐地图包围盒中心
    this.background = new Background(this.scene, { center: [0, 0], size: 200 /* gridY 用默认 -1.6，在地图区县面与地面之间 */ });
    this._lastSway = null;          // 重置微摆缓存，避免初始帧误撤销
  }

  // ===== 动画更新 =====
  update(delta) {
    // 撤销上一帧微摆偏移，让OrbitControls基于干净位置计算
    if (this._lastSway) {
      this.camera.position.x -= this._lastSway.x;
      this.camera.position.y -= this._lastSway.y;
      this.camera.position.z -= this._lastSway.z;
    }

    // 更新控制器
    this.controls.update();

    // 相机微摆（用户未交互时，呼吸式晃动）
    if (!this._userInteracting) {
      const t = performance.now() * 0.00105; // ~6秒周期
      const sx = Math.sin(t) * 2.0;
      const sy = Math.sin(t * 0.7) * 1.0;
      const sz = Math.cos(t) * 2.0;
      this.camera.position.x += sx;
      this.camera.position.y += sy;
      this.camera.position.z += sz;
      this.camera.lookAt(this.controls.target);
      this._lastSway = { x: sx, y: sy, z: sz };
    } else {
      this._lastSway = null;
    }

    // 业务动画：管网 + 高空计算引擎 + 背景增强
    this.network.update(delta);
    this.engine.update(delta);
    if (this.background) this.background.update(delta);

    // 渲染
    this.composer.render();
    this.labelRenderer.render(this.scene, this.camera);
  }
}
