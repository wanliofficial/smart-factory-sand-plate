import * as THREE from 'three';
import { COLORS } from '../../constants.js';

// C 粒子涡旋：中心亮球 + 旋转粒子云
export function buildPoints(group) {
  const cyan = COLORS.exchange;
  const parts = [];

  // 中心亮球
  const innerGeo = new THREE.SphereGeometry(1.6, 24, 24);
  const innerMat = new THREE.MeshBasicMaterial({
    color: 0x9ff0ff, transparent: true, opacity: 0.92, fog: false, toneMapped: false,
  });
  group.add(new THREE.Mesh(innerGeo, innerMat));

  // 粒子云（球内螺旋分布）
  const N = 320;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 2.0 + Math.random() * 2.6;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi) * 0.7;
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: cyan, size: 0.16, sizeAttenuation: true,
    transparent: true, opacity: 0.9, fog: false, toneMapped: false, depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  group.add(points);
  parts.push({ mesh: points, type: 'points', speed: 0.5 });

  // 一圈细环点缀
  const ringGeo = new THREE.TorusGeometry(4.3, 0.06, 10, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: cyan, transparent: true, opacity: 0.6, fog: false, toneMapped: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  parts.push({ mesh: ring, type: 'ring', speed: 0.3, axis: 'y' });

  return parts;
}
