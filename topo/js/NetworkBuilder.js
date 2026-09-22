/**
 * NetworkBuilder —— 供热管网构建器
 * 负责：站点节点 / 真实管道曲线 / 流动粒子 / 告警与呼吸动画
 * 纯数据驱动的构建 + 每帧动画推进，不碰相机与控制器。
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mercatorToScene } from './map.js';
import { COLORS } from './constants.js';

export class NetworkBuilder {
  constructor(scene, camera, controls) {
    this.scene = scene;
    this.camera = camera;
    this.controls = controls;

    // 构建产物
    this.nodeMeshes = [];
    this.pipeMeshes = [];
    this.particles = [];
    this.alarmObjects = [];
    this.breathingObjects = [];
    this.floatingObjects = [];
  }

  // ===== 构建管网 =====
  async buildNetwork(data) {
    this.data = data;

    // 1. 创建站点节点
    data.nodes.forEach(node => {
      const mesh = this._createNode(node);
      this.scene.add(mesh);
      this.nodeMeshes.push(mesh);
    });

    // 2. 加载真实管道数据
    const response = await fetch('data/topology_line.json');
    const segments = await response.json();

    // 3. 转换坐标
    const supplySegs = [];

    segments.forEach(seg => {
      const [mx1, my1] = seg.latLng[0];
      const [mx2, my2] = seg.latLng[1];
      const [sx1, sz1] = mercatorToScene(mx1, my1);
      const [sx2, sz2] = mercatorToScene(mx2, my2);

      const pipeData = {
        id: seg.tpId,
        tpCode: seg.tpCode,
        tpName: seg.tpName,
        waterType: seg.waterType,
        points: [[sx1, sz1], [sx2, sz2]],
        diameter: seg.inside,
        connId1: seg.connId1,
        connId2: seg.connId2,
      };

      if (seg.waterType === 1) supplySegs.push(pipeData);
    });

    // 4. 供水：链段 → 平滑曲线 → 单一TubeGeometry + 交互代理 + 粒子
    const supplyCurve = this._chainSegments(supplySegs, 0.8);
    if (supplyCurve) {
      this._createMergedPipe(supplyCurve, 'supply', supplySegs);
      this._createPathParticles(supplyCurve, 'supply');
    }

    // 5. 回水：复用供水曲线 → 侧向偏移 + 降低Y → 单一TubeGeometry + 粒子
    //    回水粒子反向流动（t递减），与供水形成对向流
    if (supplyCurve) {
      const returnCurve = this._offsetCurveLateral(supplyCurve, 0.8, 0.3);
      this._createMergedPipe(returnCurve, 'return', null);
      this._createPathParticles(returnCurve, 'return');
    }

    // 6. 相机适配管道范围（设置 controls.target / camera 位姿）
    this._fitCameraToPipes(segments);

    console.log(`管道加载完成: ${segments.length}段 (供水${supplySegs.length}, 回水复用供水曲线)`);
  }

  _createNode(node) {
    let mesh;
    const pos = node.pos;
    const y = this._getNodeY(node.type);

    if (node.type === 'source') {
      // 首站: 圆柱+顶部发光
      const group = new THREE.Group();

      const baseGeo = new THREE.CylinderGeometry(1.2, 1.5, 1.9, 8);
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x1a2a44,
        emissive: COLORS.source,
        emissiveIntensity: 0.3,
        metalness: 0.6,
        roughness: 0.4,
      });
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.y = 0.95;
      group.add(base);

      // 底部脉冲环（独立于group，不随浮动）
      const ringGeo = new THREE.RingGeometry(1.6, 2.0, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: COLORS.source,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pos[0], 0.05, pos[2]);
      this.scene.add(ring);
      this.alarmObjects.push({ mesh: ring, type: 'ring', baseOpacity: 0.6 });

      // 地面投影
      const shadowGeo = new THREE.CircleGeometry(1.8, 32);
      const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false,
      });
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(pos[0], 0.01, pos[2]);
      shadow.renderOrder = 1;
      this.scene.add(shadow);

      // 顶部光柱
      const beamGeo = new THREE.CylinderGeometry(0.1, 0.5, 4.5, 8);
      const beamMat = new THREE.MeshBasicMaterial({
        color: COLORS.source,
        transparent: true,
        opacity: 0.15,
      });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.y = 4.25;
      group.add(beam);

      // 记录呼吸动画对象（正弦波 + smootherstep，2秒周期）
      this.breathingObjects.push(
        { mat: baseMat, baseEmissive: 0.325, amplitude: 0.175, phase: 0 },
        { mat: beamMat, isOpacity: true, baseOpacity: 0.15, amplitude: 0.1, phase: 0 },
      );

      mesh = group;

      // 浮动数据
      this.floatingObjects.push({
        mesh: group, shadow, baseY: 0, phase: 0, floatRange: 0.3,
      });
    } else if (node.type === 'exchange') {
      // 泵站/隔压站: 六棱柱
      const geo = new THREE.CylinderGeometry(0.8, 0.95, 1.4, 6);
      const color = node.status === 'warning' ? COLORS.warning : COLORS.exchange;
      const mat = new THREE.MeshStandardMaterial({
        color: 0x1a2a44,
        emissive: color,
        emissiveIntensity: 0.4,
        metalness: 0.5,
        roughness: 0.5,
      });
      mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 0.7;

      // 顶部发光
      const capGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.1, 6);
      const capMat = new THREE.MeshBasicMaterial({ color });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = 1.5;
      mesh.add(cap);

      // 地面投影
      const shadowGeo = new THREE.CircleGeometry(1.0, 32);
      const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false,
      });
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(pos[0], 0.01, pos[2]);
      shadow.renderOrder = 1;
      this.scene.add(shadow);

      // 浮动数据
      this.floatingObjects.push({
        mesh, shadow, baseY: 0.7, phase: Math.PI * 0.5, floatRange: 0.2,
      });
    } else {
      // 用户端: 小立方体（缩小尺寸）
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const color = node.status === 'error' ? COLORS.error :
                    node.status === 'warning' ? COLORS.warning : COLORS.user;
      const mat = new THREE.MeshStandardMaterial({
        color: 0x1a2a44,
        emissive: color,
        emissiveIntensity: 0.5,
        metalness: 0.4,
        roughness: 0.6,
      });
      mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 0.5;
    }

    mesh.position.x = pos[0];
    mesh.position.z = pos[2];
    mesh.position.y = (mesh.position.y || 0) + y;
    mesh.userData.nodeData = node;

    // 异常节点添加告警效果
    if (node.status === 'error' || node.status === 'warning') {
      this._addAlarmEffect(mesh, node.status, pos[0], y, pos[2]);
    }

    // 创建标签
    this._createLabel(mesh, node, y);

    return mesh;
  }

  _getNodeY(type) {
    if (type === 'source') return 0;
    if (type === 'exchange') return 0;
    return 0;
  }

  _addAlarmEffect(parent, status, x, y, z) {
    const color = status === 'error' ? COLORS.error : COLORS.warning;

    // 脉冲环
    const ringGeo = new THREE.RingGeometry(1.0, 1.3, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.2, z);
    this.scene.add(ring);
    this.alarmObjects.push({ mesh: ring, type: 'ring', baseOpacity: 0.6 });

    // 光柱
    const beamGeo = new THREE.CylinderGeometry(0.08, 0.18, 7, 8);
    const beamMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.2,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(x, 3.5, z);
    this.scene.add(beam);
    this.alarmObjects.push({ mesh: beam, type: 'beam', baseOpacity: 0.2 });
  }

  _createLabel(parent, node, baseY) {
    const div = document.createElement('div');
    div.className = `node-label node-label--${node.type} node-label--${node.status || 'normal'}`;
    div.textContent = node.name;

    const label = new CSS2DObject(div);
    const labelY = node.type === 'source' ? 5 : node.type === 'exchange' ? 2.5 : 1.5;
    label.position.set(0, labelY, 0);
    parent.add(label);
  }

  /**
   * 渲染合并后的平滑管道（双层管方案）
   * 内层：不透明细管(r=0.08) — 管道实体
   * 外层：半透明壳(r=0.3, depthWrite:false) — 光晕效果
   * + 不可见交互代理（每段一个薄管，用于raycaster点击）
   */
  _createMergedPipe(curve, pipeType, segments) {
    const isSupply = pipeType === 'supply';
    const color = isSupply ? COLORS.supply : COLORS.returnPipe;
    const tubularSegments = Math.max(300, (segments?.length || 30) * 10);

    // 1. 内层不透明细管（管道实体）—— transparent通道 + renderOrder 确保渲染在区县之上
    const innerGeo = new THREE.TubeGeometry(curve, tubularSegments, 0.08, 8, false);
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x1a2a44,
      emissive: color,
      emissiveIntensity: isSupply ? 0.5 : 0.35,
      metalness: 0.8,
      roughness: 0.3,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    innerMesh.renderOrder = 5;
    this.scene.add(innerMesh);

    // 2. 外层半透明壳（光晕，不写深度避免遮挡粒子）
    const outerGeo = new THREE.TubeGeometry(curve, tubularSegments, 0.3, 12, false);
    const outerMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    outerMesh.renderOrder = 10;
    this.scene.add(outerMesh);

    // 3. 不可见交互代理（仅供水管道，每段一个略粗的透明管，用于raycaster）
    if (segments) {
      const yOffset = isSupply ? 0.8 : 0.3;
      segments.forEach(seg => {
        const start = new THREE.Vector3(seg.points[0][0], yOffset, seg.points[0][1]);
        const end = new THREE.Vector3(seg.points[1][0], yOffset, seg.points[1][1]);
        const lineCurve = new THREE.LineCurve3(start, end);
        const proxyGeo = new THREE.TubeGeometry(lineCurve, 2, 0.3, 6, false);
        const proxyMat = new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });
        const proxy = new THREE.Mesh(proxyGeo, proxyMat);
        proxy.userData.pipeData = seg;
        this.scene.add(proxy);
        this.pipeMeshes.push(proxy);
      });
    }
  }

  /**
   * 将管道段按 connId 链接为有序路径，返回 CatmullRomCurve3
   */
  _chainSegments(segments, yOffset) {
    if (segments.length === 0) return null;

    // 构建索引：connId → 段列表
    const byConnId1 = {};
    const byConnId2 = {};
    segments.forEach(s => {
      const k1 = s.connId1, k2 = s.connId2;
      if (!byConnId1[k1]) byConnId1[k1] = [];
      byConnId1[k1].push(s);
      if (!byConnId2[k2]) byConnId2[k2] = [];
      byConnId2[k2].push(s);
    });

    // 找起点：connId1 不出现在任何段的 connId2 中
    let start = segments.find(s => !byConnId2[s.connId1]);
    if (!start) start = segments[0];

    const ordered = [start];
    const used = new Set([start.id]);
    let current = start;

    // 正向追踪
    while (true) {
      const candidates = byConnId1[current.connId2] || [];
      const next = candidates.find(s => !used.has(s.id));
      if (!next) break;
      ordered.push(next);
      used.add(next.id);
      current = next;
    }

    // 反向追踪
    current = start;
    while (true) {
      const candidates = byConnId2[current.connId1] || [];
      const prev = candidates.find(s => !used.has(s.id));
      if (!prev) break;
      ordered.unshift(prev);
      used.add(prev.id);
      current = prev;
    }

    // 提取有序点列
    const points = [];
    ordered.forEach((seg, i) => {
      if (i === 0) {
        points.push(new THREE.Vector3(seg.points[0][0], yOffset, seg.points[0][1]));
      }
      points.push(new THREE.Vector3(seg.points[1][0], yOffset, seg.points[1][1]));
    });

    console.log(`  链段完成: ${ordered.length}/${segments.length} 段, ${points.length} 点`);
    return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.3);
  }

  /**
   * 对曲线进行固定方向侧向偏移 + 垂直Y偏移
   * 以首尾连线计算整体走向，取其垂直方向做统一偏移
   * 避免逐点法向量在转弯处跳变导致回水曲线扭曲
   */
  _offsetCurveLateral(curve, lateralOffset, yOffset) {
    const pts = curve.points;
    if (pts.length < 2) return curve;

    const up = new THREE.Vector3(0, 1, 0);
    // 用首尾连线作为整体走向，计算固定偏移方向
    const overallDir = new THREE.Vector3().subVectors(pts[pts.length - 1], pts[0]);
    if (overallDir.lengthSq() < 1e-6) overallDir.set(0, 0, 1);
    overallDir.normalize();
    const fixedNormal = new THREE.Vector3().crossVectors(overallDir, up).normalize();

    // 直接偏移原始控制点，保持曲线形状完全一致
    const offsetPoints = pts.map(p => new THREE.Vector3(
      p.x + fixedNormal.x * lateralOffset,
      yOffset,
      p.z + fixedNormal.z * lateralOffset
    ));

    return new THREE.CatmullRomCurve3(offsetPoints, false, 'catmullrom', 0.3);
  }

  /**
   * 沿完整路径创建粒子（供水正向，回水反向）
   * 粒子位于内管(r=0.08)和外壳(r=0.3)之间，不透明确保正确深度排序
   */
  _createPathParticles(curve, type) {
    const particleGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const count = 25;
    const speed = 0.0012;
    const color = type === 'supply' ? 0xffdd44 : 0x00f0ff;
    const reverse = type === 'return';

    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1.0,
        depthWrite: false,
      });
      const particle = new THREE.Mesh(particleGeo, mat);
      particle.renderOrder = 5;
      particle.userData = {
        curve,
        t: i / count,
        speed,
        pipeType: type,
        reverse,
      };
      this.scene.add(particle);
      this.particles.push(particle);
    }
  }

  /**
   * 根据管道数据范围设置相机与控制器位姿
   * 注：前段 bbox 计算为历史遗留死代码，实际仅采用用户调定的初始视角。
   */
  _fitCameraToPipes(segments) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    segments.forEach(seg => {
      seg.latLng.forEach(([x, y]) => {
        const [sx, sz] = mercatorToScene(x, y);
        if (sx < minX) minX = sx;
        if (sx > maxX) maxX = sx;
        if (sz < minZ) minZ = sz;
        if (sz > maxZ) maxZ = sz;
      });
    });

    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;
    const maxSpan = Math.max(spanX, spanZ);

    this.controls.target.set(cx, 0, cz);
    // 用户调定的初始视角
    this.camera.position.set(-15.62, 37.2, 70);
    this.controls.target.set(-13.12, 0, 0.12);
    this.controls.minDistance = 5;
    this.controls.maxDistance = 480;
    this.controls.update(); // 同步OrbitControls内部状态，防止update()时重置位置
  }

  // ===== 每帧动画推进 =====
  update(delta) {
    // 站点浮动 + 投影缩放
    const floatTime = performance.now() * 0.001; // ~6.3秒周期
    this.floatingObjects.forEach(obj => {
      const offset = Math.sin(floatTime + obj.phase) * obj.floatRange;
      obj.mesh.position.y = obj.baseY + offset;
      // 站点越高，投影越大越淡
      const heightRatio = (offset + obj.floatRange) / (obj.floatRange * 2); // 0~1
      const s = 1 + heightRatio * 0.3;
      obj.shadow.scale.set(s, s, 1);
      obj.shadow.material.opacity = 0.35 - heightRatio * 0.15;
    });

    // 更新粒子位置
    this.particles.forEach(p => {
      if (p.userData.reverse) {
        // 回水：反向流动 (t 递减)
        p.userData.t -= p.userData.speed;
        if (p.userData.t < 0) p.userData.t += 1;
      } else {
        // 供水：正向流动 (t 递增)
        p.userData.t += p.userData.speed;
        if (p.userData.t > 1) p.userData.t -= 1;
      }

      const pos = p.userData.curve.getPointAt(p.userData.t);
      p.position.copy(pos);
    });

    // 更新告警脉冲
    const time = performance.now() * 0.003;
    this.alarmObjects.forEach(obj => {
      if (obj.type === 'ring') {
        const scale = 1 + Math.sin(time) * 0.3;
        obj.mesh.scale.set(scale, scale, 1);
        obj.mesh.material.opacity = obj.baseOpacity * (0.5 + Math.sin(time) * 0.5);
      } else if (obj.type === 'beam') {
        obj.mesh.material.opacity = obj.baseOpacity * (0.5 + Math.sin(time * 1.5) * 0.5);
      }
    });

    // 首站呼吸效果（与脉冲环同频率）
    const breathTime = performance.now() * 0.003;
    this.breathingObjects.forEach(obj => {
      let t = (Math.sin(breathTime + (obj.phase || 0)) + 1) * 0.5; // 0→1→0
      // smootherstep: 零阶/一阶/二阶导数在端点均为0，过渡极其平滑
      t = t * t * t * (t * (t * 6 - 15) + 10);
      if (obj.isOpacity) {
        obj.mat.opacity = obj.baseOpacity + obj.amplitude * t;
      } else {
        obj.mat.emissiveIntensity = obj.baseEmissive + obj.amplitude * t;
      }
    });
  }
}
