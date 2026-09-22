/**
 * Main Entry Point
 * 邯郸市供热管网3D大屏 - 主程序
 */

import { SceneManager } from './three-scene.js';
import { OverlayManager } from './overlay.js';
import { networkData } from './data.js';

// ===== 初始化 =====
const container = document.getElementById('canvas-container');
const labelContainer = document.getElementById('label-container');

const scene = new SceneManager(container, labelContainer);
const overlay = new OverlayManager();

// 异步加载地图 → 构建管网（含真实管道数据加载）
scene.init().then(async () => {
  await scene.buildNetwork(networkData);
});

// 节点点击 → 显示详情
scene.onNodeClick = (nodeData) => {
  overlay.showDetail(nodeData);
};

// 点击空白处关闭弹窗
container.addEventListener('click', (e) => {
  if (e.target === container || e.target === scene.renderer.domElement) {
    // 仅在非节点点击时关闭（raycaster已处理节点点击）
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') overlay.hideDetail();
});

// ===== 动画循环 =====
let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const delta = (now - lastTime) / 1000;
  lastTime = now;
  scene.update(delta);
}

animate();

// ===== 窗口大小适配 =====
window.addEventListener('resize', () => {
  // SceneManager内部已处理resize
});
