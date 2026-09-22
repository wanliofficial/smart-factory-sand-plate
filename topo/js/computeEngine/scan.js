import * as THREE from 'three';
import { COLORS } from '../constants.js';

// 按当前方案的 流光 / 光圈 构建一次扫描特效
// ctx = { cx, cz, topY, scheme, scene }
export function createScanEffect(ctx) {
  const { cx, cz, topY: top, scheme, scene } = ctx;
  const len = top;
  const cyan = COLORS.exchange;

  const e = {
    beamType: scheme.beam,
    ringType: scheme.ring,
    beam: null, pulse: null, stream: null, rings: null,
    sweep: null, sweepGroup: null, cone: null,
    cx, cz, topY: top, age: 0,
    pulseDur: 0.5, beamDur: 0.6, ringDur: 1.8, ringMax: 16,
  };

  // ---- 流光 ----
  if (e.beamType === 'D') {
    // 激光瞄准线 + 落点爆点
    const geo = new THREE.CylinderGeometry(0.04, 0.04, len, 8, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.0, fog: false, toneMapped: false,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const beam = new THREE.Mesh(geo, mat);
    beam.position.set(cx, len / 2, cz);
    beam.renderOrder = 6;
    scene.add(beam);
    e.beam = beam;

    const dotGeo = new THREE.SphereGeometry(0.6, 16, 16);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.0, fog: false, toneMapped: false,
    });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(cx, 0.4, cz);
    dot.renderOrder = 7;
    scene.add(dot);
    e.pulse = dot;
  } else if (e.beamType === 'B') {
    // 锥形扫描场（顶点在引擎，底面在地面展开）
    const geo = new THREE.ConeGeometry(4.0, len, 32, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: cyan, transparent: true, opacity: 0.0, fog: false, toneMapped: false,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const cone = new THREE.Mesh(geo, mat);
    cone.position.set(cx, len / 2, cz);
    cone.renderOrder = 6;
    scene.add(cone);
    e.cone = cone;
  } else if (e.beamType === 'C') {
    // 蛇形流光束：烟花倒放——沿蜿蜒轨迹自上而下（多枚小球串成光蛇）
    const N = 14;
    const stream = [];
    for (let i = 0; i < N; i++) {
      const isHead = i === 0;
      const g = new THREE.SphereGeometry(isHead ? 0.3 : 0.17, 12, 12);
      const m = new THREE.MeshBasicMaterial({
        color: 0x9ff4ff, transparent: true, opacity: 0.0, fog: false, toneMapped: false,
        depthWrite: false,
      });
      const s = new THREE.Mesh(g, m);
      s.renderOrder = 7;
      scene.add(s);
      stream.push({ mesh: s });
    }
    e.stream = stream;
    e.snake = { amp: 1.6, turns: 1.2, dur: 0.9, step: 0.05 };
  } else {
    // A 实光束 + 下行脉冲（默认）
    const bGeo = new THREE.CylinderGeometry(0.14, 0.14, len, 10, 1, true);
    const bMat = new THREE.MeshBasicMaterial({
      color: 0x9ff4ff, transparent: true, opacity: 0.0, fog: false, toneMapped: false,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const beam = new THREE.Mesh(bGeo, bMat);
    beam.position.set(cx, len / 2, cz);
    beam.renderOrder = 6;
    scene.add(beam);
    e.beam = beam;

    const pGeo = new THREE.SphereGeometry(0.5, 16, 16);
    const pMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.95, fog: false, toneMapped: false,
    });
    const pulse = new THREE.Mesh(pGeo, pMat);
    pulse.position.set(cx, top, cz);
    pulse.renderOrder = 7;
    scene.add(pulse);
    e.pulse = pulse;
  }

  // ---- 光圈 ----
  if (e.ringType === 'B') {
    // 雷达扇形（在地面组里旋转）
    const sweepGroup = new THREE.Group();
    sweepGroup.position.set(cx, 0.06, cz);
    const sweepGeo = new THREE.CircleGeometry(15, 48, 0, Math.PI / 3);
    const sweepMat = new THREE.MeshBasicMaterial({
      color: cyan, transparent: true, opacity: 0.0, side: THREE.DoubleSide,
      fog: false, toneMapped: false, depthWrite: false,
    });
    const sweep = new THREE.Mesh(sweepGeo, sweepMat);
    sweep.rotation.x = -Math.PI / 2;
    sweepGroup.add(sweep);
    scene.add(sweepGroup);
    e.sweep = sweep; e.sweepGroup = sweepGroup;
    // 微弱基线环
    const rg = new THREE.RingGeometry(0.82, 1.0, 64);
    const rm = new THREE.MeshBasicMaterial({
      color: cyan, transparent: true, opacity: 0.0, side: THREE.DoubleSide,
      fog: false, toneMapped: false, depthWrite: false,
    });
    const ring = new THREE.Mesh(rg, rm);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, 0.06, cz);
    ring.renderOrder = 6;
    scene.add(ring);
    e.rings = [ring];
  } else if (e.ringType === 'C') {
    // 地面光斑（填充椭圆爆起）+ 薄环外缘
    const poolGeo = new THREE.CircleGeometry(8, 48);
    const poolMat = new THREE.MeshBasicMaterial({
      color: cyan, transparent: true, opacity: 0.0, side: THREE.DoubleSide,
      fog: false, toneMapped: false, depthWrite: false,
    });
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(cx, 0.05, cz);
    pool.renderOrder = 6;
    scene.add(pool);
    e.rings = [pool];
    const rg = new THREE.RingGeometry(7.5, 8.0, 64);
    const rm = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.0, side: THREE.DoubleSide,
      fog: false, toneMapped: false, depthWrite: false,
    });
    const ring = new THREE.Mesh(rg, rm);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, 0.06, cz);
    ring.renderOrder = 6;
    scene.add(ring);
    e.rings.push(ring);
  } else if (e.ringType === 'D') {
    // 数据冲击波：填充辉光圆盘 + 明亮外缘环，向外绽放
    const diskGeo = new THREE.CircleGeometry(1, 48);
    const diskMat = new THREE.MeshBasicMaterial({
      color: cyan, transparent: true, opacity: 0.0, side: THREE.DoubleSide,
      fog: false, toneMapped: false, depthWrite: false,
    });
    const disk = new THREE.Mesh(diskGeo, diskMat);
    disk.rotation.x = -Math.PI / 2;
    disk.position.set(cx, 0.05, cz);
    disk.renderOrder = 6;
    scene.add(disk);
    const rg = new THREE.RingGeometry(0.92, 1.0, 64);
    const rm = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.0, side: THREE.DoubleSide,
      fog: false, toneMapped: false, depthWrite: false,
    });
    const ring = new THREE.Mesh(rg, rm);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, 0.06, cz);
    ring.renderOrder = 7;
    scene.add(ring);
    e.rings = [disk, ring];
  } else {
    // A 同心余波环（默认）
    const rings = [];
    for (let i = 0; i < 2; i++) {
      const rg = new THREE.RingGeometry(0.82, 1.0, 64);
      const rm = new THREE.MeshBasicMaterial({
        color: cyan, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
        fog: false, toneMapped: false, depthWrite: false,
      });
      const ring = new THREE.Mesh(rg, rm);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(cx, 0.06, cz);
      ring.renderOrder = 6;
      scene.add(ring);
      rings.push(ring);
    }
    e.rings = rings;
  }

  return e;
}

// 推进所有进行中的扫描特效，结束即回收资源
export function updateScanEffects(scanEffects, scene, delta) {
  for (let i = scanEffects.length - 1; i >= 0; i--) {
    const e = scanEffects[i];
    e.age += delta;
    const cyan = COLORS.exchange;

    // ---------- 流光 ----------
    if (e.beamType === 'D') {
      // 激光：极细高亮瞬闪 + 落点爆点
      const bk = e.age / e.beamDur;
      if (bk <= 1) {
        e.beam.material.opacity = Math.sin(bk * Math.PI) * 0.9;
        e.beam.visible = true;
      } else e.beam.visible = false;
      const pk = Math.max(0, Math.min(1, (e.age - e.pulseDur * 0.6) / 0.25));
      if (e.age >= e.pulseDur * 0.6) {
        e.pulse.material.opacity = (1 - pk) * 0.95;
        e.pulse.visible = pk < 1;
      } else e.pulse.visible = false;
    } else if (e.beamType === 'B') {
      // 锥形场：扫描时整体提亮
      const bk = e.age / e.beamDur;
      if (bk <= 1) {
        e.cone.material.opacity = Math.sin(bk * Math.PI) * 0.22;
        e.cone.visible = true;
      } else e.cone.visible = false;
    } else if (e.beamType === 'C') {
      // 蛇形流光束：每枚小球沿蜿蜒轨迹自上而下
      const sd = e.snake;
      e.stream.forEach((s, idx) => {
        const k = (e.age - idx * sd.step) / sd.dur;
        if (k >= 0 && k <= 1) {
          const a = k * Math.PI * 2 * sd.turns;
          const amp = sd.amp * (0.5 + 0.5 * k);
          const x = e.cx + Math.sin(a) * amp;
          const z = e.cz + Math.cos(a) * amp * 0.7;
          const y = e.topY * (1 - k);
          s.mesh.position.set(x, y, z);
          s.mesh.material.opacity = Math.sin(k * Math.PI) * 0.95;
          s.mesh.visible = true;
        } else s.mesh.visible = false;
      });
    } else {
      // A 实光束 + 脉冲
      const bk = e.age / e.beamDur;
      if (bk <= 1) {
        e.beam.material.opacity = Math.sin(bk * Math.PI) * 0.55;
        e.beam.visible = true;
      } else e.beam.visible = false;
      if (e.age <= e.pulseDur) {
        const k = e.age / e.pulseDur;
        e.pulse.position.y = e.topY * (1 - k);
        e.pulse.material.opacity = 0.95 * (1 - k * 0.3);
        e.pulse.visible = true;
      } else e.pulse.visible = false;
    }

    // ---------- 光圈 ----------
    if (e.ringType === 'B') {
      // 雷达扇形：旋转 + 淡入淡出
      const rk = e.age / e.ringDur;
      if (rk <= 1) {
        e.sweepGroup.rotation.y += delta * 3.0;
        e.sweep.material.opacity = Math.sin(rk * Math.PI) * 0.4;
        e.sweep.visible = true;
        if (e.rings) { e.rings[0].material.opacity = Math.sin(rk * Math.PI) * 0.5; e.rings[0].visible = true; }
      } else {
        e.sweep.visible = false;
        if (e.rings) e.rings[0].visible = false;
      }
    } else if (e.ringType === 'C') {
      // 光斑：爆起后淡出 + 外缘薄环扩散
      const rk = e.age / e.ringDur;
      if (rk <= 1) {
        const s = 0.4 + Math.sin(rk * Math.PI) * 0.6; // 先涨后落
        e.rings[0].scale.set(s, s, 1);
        e.rings[0].material.opacity = Math.sin(rk * Math.PI) * 0.4;
        e.rings[0].visible = true;
        // 外缘环：从 8 扩到 ringMax
        const k2 = Math.max(0, Math.min(1, rk * 1.2));
        const rs = 1 + k2 * ((e.ringMax / 8) - 1);
        e.rings[1].scale.set(rs, rs, 1);
        e.rings[1].material.opacity = 0.9 * (1 - k2);
        e.rings[1].visible = true;
      } else {
        e.rings.forEach(r => r.visible = false);
      }
    } else if (e.ringType === 'D') {
      // 数据冲击波：圆盘 + 外缘环同步向外绽放并淡出
      const rk = e.age / e.ringDur;
      if (rk <= 1) {
        const s = 0.5 + rk * (e.ringMax - 0.5);
        e.rings[0].scale.set(s, s, 1);
        e.rings[0].material.opacity = Math.sin(rk * Math.PI) * 0.35;
        e.rings[0].visible = true;
        e.rings[1].scale.set(s, s, 1);
        e.rings[1].material.opacity = Math.sin(rk * Math.PI) * 0.9;
        e.rings[1].visible = true;
      } else {
        e.rings.forEach(r => r.visible = false);
      }
    } else {
      // A 同心余波环
      const rk = (e.age - e.pulseDur) / e.ringDur;
      if (rk > 0 && rk <= 1) {
        e.rings.forEach((ring, idx) => {
          const delay = idx * 0.18;
          const k = Math.max(0, Math.min(1, (rk - delay) / (1 - delay)));
          const s = 0.5 + k * (e.ringMax - 0.5);
          ring.scale.set(s, s, 1);
          ring.material.opacity = 0.9 * (1 - k);
          ring.visible = true;
        });
      } else if (rk > 1) {
        e.rings.forEach(ring => ring.visible = false);
      }
    }

    // ---------- 结束回收 ----------
    // 蛇形流光束(C)的存活时间由首尾小球窗口决定，需与光圈时长取最大
    const beamLife = e.beamType === 'C'
      ? e.stream.length * e.snake.step + e.snake.dur
      : Math.max(e.pulseDur, e.beamDur);
    const life = Math.max(beamLife, e.ringDur) + 0.2;
    if (e.age >= life) {
      disposeScanEffect(scene, e);
      scanEffects.splice(i, 1);
    }
  }
}

// 回收单个扫描特效的全部网格/材质
export function disposeScanEffect(scene, e) {
  const rm = (m) => {
    if (!m) return;
    scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  };
  rm(e.beam); rm(e.pulse); rm(e.cone);
  if (e.stream) e.stream.forEach(s => rm(s.mesh));
  if (e.rings) e.rings.forEach(r => rm(r));
  if (e.sweepGroup) {
    scene.remove(e.sweepGroup);
    if (e.sweep) {
      if (e.sweep.geometry) e.sweep.geometry.dispose();
      if (e.sweep.material) e.sweep.material.dispose();
    }
  }
}
