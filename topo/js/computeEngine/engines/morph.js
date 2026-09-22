import * as THREE from 'three';
import { COLORS } from '../../constants.js';

// 青色发光线材质（toneMapped:false 进 bloom）
function _glowLine(opacity) {
  return new THREE.LineBasicMaterial({
    color: COLORS.exchange, transparent: true, opacity,
    fog: false, toneMapped: false, depthWrite: false,
  });
}

// 设置某个形态的整体透明度（交叉淡化用）
export function setFormAlpha(form, alpha) {
  form.visible = alpha > 0.01;
  const s = Math.max(0.001, 0.3 + 0.7 * alpha);
  form.scale.setScalar(s);
  form.traverse(o => {
    if (o.material && o.material.userData.baseOpacity !== undefined) {
      o.material.opacity = o.material.userData.baseOpacity * alpha;
    }
  });
}

// 推进多态核心到下一形态（每次扫描脉冲调用一次）
export function advanceMorph(part) {
  if (!part) return;
  const st = part.state;
  if (st.morphing) return;
  st.from = st.idx;
  st.to = (st.idx + 1) % st.forms.length;
  st.morphing = true;
  st.t = 0;
}

// 魔方形态常驻层旋转：每 twistInterval 秒随机选一层拧 90°（不随形态切换暂停）
// 采用 pivot + Object3D.attach 烘焙世界变换，拼回 rubik 后旋转被固化到各立方块局部变换
export function tickRubikTwist(part, delta) {
  if (!part) return;
  const st = part.state;
  const rubik = st.rubik;
  if (!rubik) return;

  // 进行中的拧动：平滑转到 ±90° 后把 9 个立方块烘焙回 rubik
  if (st.twist) {
    const tw = st.twist;
    tw.t += delta;
    const k = Math.min(1, tw.t / tw.dur);
    const e = k * k * (3 - 2 * k); // smoothstep 缓动
    tw.pivot.rotation[tw.axis] = tw.dir * (Math.PI / 2) * e;
    if (k >= 1) {
      tw.cubes.forEach(c => rubik.attach(c)); // 保留世界变换地重新挂回
      rubik.remove(tw.pivot);
      st.twist = null;
    }
    return;
  }

  // 触发下一次拧动
  st.twistTimer += delta;
  if (st.twistTimer >= st.twistInterval) {
    st.twistTimer = 0;
    const axis = ['x', 'y', 'z'][Math.floor(Math.random() * 3)];
    const layer = Math.floor(Math.random() * 3); // 0/1/2
    const cubes = rubik.children.filter(
      c => c.isMesh && Math.round(c.position[axis] / 1.5) + 1 === layer
    );
    if (cubes.length === 0) return;
    const pivot = new THREE.Group();
    rubik.add(pivot);
    cubes.forEach(c => pivot.attach(c));
    st.twist = {
      pivot, axis, dir: Math.random() < 0.5 ? 1 : -1,
      cubes, t: 0, dur: 0.4,
    };
  }
}

// E 多态核心：立方晶阵 / 二十面体 / 八面体 / 魔方 四形态循环变形
// 返回 { parts, morphPart }，morphPart 需挂到 engine._morphPart
export function buildMorph(group) {
  const cyan = COLORS.exchange;
  const morph = new THREE.Group();
  const forms = [];

  // 形态1：立方体晶阵（线框外壳 + 内部点阵）
  const cube = new THREE.Group();
  const shellGeo = new THREE.BoxGeometry(4.0, 4.0, 4.0);
  cube.add(new THREE.LineSegments(new THREE.EdgesGeometry(shellGeo), _glowLine(0.7)));
  const N = 64, pos = new Float32Array(N * 3);
  let pi = 0;
  for (let x = -1; x <= 1 && pi < N; x++)
    for (let y = -1; y <= 1 && pi < N; y++)
      for (let z = -1; z <= 1 && pi < N; z++) {
        pos[pi * 3]     = x * 1.3 + (Math.random() - 0.5) * 0.5;
        pos[pi * 3 + 1] = y * 1.3 + (Math.random() - 0.5) * 0.5;
        pos[pi * 3 + 2] = z * 1.3 + (Math.random() - 0.5) * 0.5;
        pi++;
      }
  const ptsGeo = new THREE.BufferGeometry();
  ptsGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  cube.add(new THREE.Points(ptsGeo, new THREE.PointsMaterial({
    color: cyan, size: 0.18, sizeAttenuation: true,
    transparent: true, opacity: 0.9, fog: false, toneMapped: false, depthWrite: false,
  })));
  forms.push(cube);

  // 形态2：二十面体（多面发光核 + 棱线 + 内核）
  const ico = new THREE.Group();
  const icoGeo = new THREE.IcosahedronGeometry(2.4, 1);
  ico.add(new THREE.Mesh(icoGeo, new THREE.MeshStandardMaterial({
    color: 0x081a2e, emissive: cyan, emissiveIntensity: 0.9,
    metalness: 0.4, roughness: 0.3, transparent: true, opacity: 0.92, fog: false,
  })));
  ico.add(new THREE.LineSegments(new THREE.EdgesGeometry(icoGeo), _glowLine(0.9)));
  ico.add(new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xbff6ff, transparent: true, opacity: 0.9, fog: false, toneMapped: false })));
  forms.push(ico);

  // 形态3：八面体（棱线晶格）
  const octa = new THREE.Group();
  const octaGeo = new THREE.OctahedronGeometry(2.8, 0);
  octa.add(new THREE.Mesh(octaGeo, new THREE.MeshStandardMaterial({
    color: 0x081a2e, emissive: cyan, emissiveIntensity: 0.8,
    metalness: 0.4, roughness: 0.3, transparent: true, opacity: 0.9, fog: false,
  })));
  octa.add(new THREE.LineSegments(new THREE.EdgesGeometry(octaGeo), _glowLine(0.85)));
  forms.push(octa);

  // 形态4：魔方（3×3×3 静态晶格，作为形态之一）
  const rubik = new THREE.Group();
  const cubeGeo = new THREE.BoxGeometry(1.3, 1.3, 1.3);
  const edgeGeo = new THREE.EdgesGeometry(cubeGeo);
  const palette = [0x0a2a3a, 0x063b4a, 0x0a1a2e, 0x093a3a];
  for (let x = 0; x < 3; x++)
    for (let y = 0; y < 3; y++)
      for (let z = 0; z < 3; z++) {
        const m = new THREE.Mesh(cubeGeo, new THREE.MeshStandardMaterial({
          color: palette[(x + y + z) % palette.length],
          emissive: cyan, emissiveIntensity: 0.22,
          metalness: 0.3, roughness: 0.5, transparent: true, opacity: 1.0, fog: false,
        }));
        m.position.set((x - 1) * 1.5, (y - 1) * 1.5, (z - 1) * 1.5);
        m.add(new THREE.LineSegments(edgeGeo, _glowLine(0.6)));
        rubik.add(m);
      }
  forms.push(rubik);

  // 初始化：仅 forms[0] 可见，其余 alpha=0
  forms.forEach((f, i) => {
    f.traverse(o => {
      if (o.material) {
        o.material.transparent = true;
        o.material.userData.baseOpacity = (o.material.opacity != null) ? o.material.opacity : 1;
      }
    });
    morph.add(f);
    setFormAlpha(f, i === 0 ? 1 : 0);
  });
  group.add(morph);

  const morphPart = {
    mesh: morph, type: 'morph',
    state: {
      forms, idx: 0, morphing: false, t: 0, dur: 0.8, from: 0, to: 0,
      rubik, twistTimer: 0, twistInterval: 0.5, twist: null,
    },
  };
  return { parts: [morphPart], morphPart };
}
