import * as THREE from 'three';
import { COLORS } from '../../constants.js';

// A 反应堆核心：多面体 + 多层差速旋转环 + 公转碎片
// 返回需注册到 engineParts 的部件数组
export function buildReactor(group) {
  const cyan = COLORS.exchange;
  const parts = [];

  // 核心多面体
  const coreGeo = new THREE.IcosahedronGeometry(2.2, 1);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x081a2e, emissive: cyan, emissiveIntensity: 0.9,
    metalness: 0.4, roughness: 0.3, transparent: true, opacity: 0.92, fog: false,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  group.add(core);
  parts.push({ mesh: core, type: 'spin', ax: 0.3, ay: 0.5 });

  // 内核亮球
  const innerGeo = new THREE.SphereGeometry(1.1, 24, 24);
  const innerMat = new THREE.MeshBasicMaterial({
    color: 0xbff6ff, transparent: true, opacity: 0.9, fog: false, toneMapped: false,
  });
  group.add(new THREE.Mesh(innerGeo, innerMat));

  // 多层差速旋转环
  const ringDefs = [
    { r: 3.4, tube: 0.12, axis: 'x', speed: 0.6, color: cyan },
    { r: 3.9, tube: 0.10, axis: 'z', speed: -0.9, color: COLORS.returnPipe },
    { r: 4.4, tube: 0.08, axis: 'y', speed: 0.4, color: cyan },
  ];
  ringDefs.forEach(def => {
    const geo = new THREE.TorusGeometry(def.r, def.tube, 12, 64);
    const mat = new THREE.MeshBasicMaterial({
      color: def.color, transparent: true, opacity: 0.85, fog: false, toneMapped: false,
    });
    const ring = new THREE.Mesh(geo, mat);
    const holder = new THREE.Group();
    holder.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    holder.add(ring);
    group.add(holder);
    parts.push({ mesh: ring, type: 'ring', speed: def.speed, axis: def.axis });
  });

  // 公转卫星碎片
  const fragGroup = new THREE.Group();
  const fragGeo = new THREE.TetrahedronGeometry(0.42);
  const fragMat = new THREE.MeshStandardMaterial({
    color: 0x0a1a2e, emissive: 0x00f0ff, emissiveIntensity: 1.0,
    metalness: 0.5, roughness: 0.3, fog: false,
  });
  const fragCount = 5;
  for (let i = 0; i < fragCount; i++) {
    const f = new THREE.Mesh(fragGeo, fragMat);
    const a = (i / fragCount) * Math.PI * 2;
    f.position.set(Math.cos(a) * 5.2, 0, Math.sin(a) * 5.2);
    f.rotation.set(a, a * 1.3, 0);
    fragGroup.add(f);
  }
  group.add(fragGroup);
  parts.push({ mesh: fragGroup, type: 'fragments', speed: 0.25 });

  return parts;
}
