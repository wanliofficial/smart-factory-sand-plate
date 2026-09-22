import * as THREE from 'three';
import { COLORS } from '../../constants.js';

// D 菲涅尔核心：实心球 + 背面菲涅尔壳 + 细环
export function buildFresnel(group) {
  const cyan = COLORS.exchange;
  const parts = [];

  // 核心实心球
  const coreGeo = new THREE.SphereGeometry(2.0, 32, 32);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0x9ff0ff, transparent: true, opacity: 0.85, fog: false, toneMapped: false,
  });
  group.add(new THREE.Mesh(coreGeo, coreMat));

  // 菲涅尔壳（背面渲染 + 低透明度，模拟边缘辉光）
  const shellGeo = new THREE.SphereGeometry(2.7, 32, 32);
  const shellMat = new THREE.MeshBasicMaterial({
    color: cyan, transparent: true, opacity: 0.13, side: THREE.BackSide,
    fog: false, toneMapped: false, depthWrite: false,
  });
  group.add(new THREE.Mesh(shellGeo, shellMat));

  // 细环
  const ringGeo = new THREE.TorusGeometry(3.4, 0.08, 12, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: cyan, transparent: true, opacity: 0.8, fog: false, toneMapped: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  group.add(ring);
  parts.push({ mesh: ring, type: 'ring', speed: 0.5, axis: 'x' });

  return parts;
}
