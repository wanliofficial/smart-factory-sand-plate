/**
 * ComputeEngine —— 高空实时计算引擎 + 定时扫描特效 + 方案实时切换
 * 编排类：本文件只做调度，具体构造拆到 engines/ 与 scan.js
 *
 * 三要素各有多套方案，按组合预设（按键 1/2/3/4）整体切换：
 *   引擎本体：A 反应堆核心 / C 粒子涡旋 / D 菲涅尔核心 / E 多态核心(立方晶阵·二十面体·八面体·魔方 循环变形)
 *   向下流光：A 实光束短闪 / B 锥形扫描场 / C 蛇形流光束 / D 激光瞄准线
 *   扩散光圈：A 同心余波环 / B 雷达扇形 / C 地面光斑 / D 数据冲击波
 *
 * 预设：
 *   1 稳·现状     → A + A + A
 *   2 干净锐利   → D + D + C
 *   3 数据流动   → C + C + D
 *   4 扫描雷达感 → E + B + B
 *
 * 引擎位于拓扑质心正上方高空，固定世界坐标（与相机微摆无关）。
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { COLORS } from '../constants.js';
import { PRESETS } from './presets.js';
import { buildReactor } from './engines/reactor.js';
import { buildPoints } from './engines/points.js';
import { buildFresnel } from './engines/fresnel.js';
import { buildMorph, setFormAlpha, advanceMorph, tickRubikTwist } from './engines/morph.js';
import { createScanEffect, updateScanEffects, disposeScanEffect } from './scan.js';

export class ComputeEngine {
  constructor(scene, controls) {
    this.scene = scene;
    this.controls = controls;

    this.engineGroup = null;
    this.engineBaseY = 25;        // 引擎基准高度（已调矮；如需再低直接改此值）
    this.engineParts = [];         // 需旋转/公转的部件
    this.engineGuide = null;       // 常驻微弱引导光束
    this.engineLabel = null;       // CSS2D 标签
    this.scanEffects = [];         // 进行中的扫描特效
    this._scanTimer = 0;
    this._scanInterval = 5;       // 扫描间隔(秒)
    this.scheme = PRESETS[1];    // 当前方案（默认组合1）
    this._keyHandlerBound = false;
    this._morphPart = null;        // 多态核心引用（方案 E）
  }

  // ===== 创建 / 方案切换 =====
  create() {
    const cx = this.controls.target.x;
    const cz = this.controls.target.z;
    const cy = this.engineBaseY;

    this._cx = cx; this._cz = cz; this._cy = cy;

    this.engineGroup = new THREE.Group();
    this.engineGroup.position.set(cx, cy, cz);
    this._buildEngine(this.scheme.engine, this.engineGroup);

    // 常驻微弱引导光束（引擎底 → 地面质心）
    const guideLen = cy;
    const guideGeo = new THREE.CylinderGeometry(0.06, 0.06, guideLen, 8, 1, true);
    const guideMat = new THREE.MeshBasicMaterial({
      color: COLORS.exchange, transparent: true, opacity: 0.06, fog: false, toneMapped: false,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const guide = new THREE.Mesh(guideGeo, guideMat);
    guide.position.set(cx, guideLen / 2, cz);
    this.scene.add(guide);
    this.engineGuide = guide;

    // 标签（含当前方案名）
    const div = document.createElement('div');
    div.className = 'engine-label';
    div.textContent = '实时计算引擎';
    const label = new CSS2DObject(div);
    label.position.set(0, 6, 0);
    this.engineGroup.add(label);
    this.engineLabel = label;
    this._refreshLabel();

    this.scene.add(this.engineGroup);

    // 页面底部常驻切换提示
    this._ensureHint();
    // 键盘切换（仅绑定一次）
    if (!this._keyHandlerBound) {
      window.addEventListener('keydown', (e) => {
        if (e.key >= '1' && e.key <= '4') this.setPreset(Number(e.key));
      });
      this._keyHandlerBound = true;
    }

    console.log(`计算引擎已创建 @ (${cx.toFixed(1)}, ${cy}, ${cz.toFixed(1)}) 方案:${this.scheme.name}`);
  }

  /** 切换方案：销毁旧引擎 → 按新方案重建 → 清空进行中扫描 */
  setPreset(n) {
    if (!PRESETS[n]) return;
    this.scheme = PRESETS[n];
    this._disposeEngine();
    this.engineGroup = new THREE.Group();
    this.engineGroup.position.set(this._cx, this._cy, this._cz);
    this._buildEngine(this.scheme.engine, this.engineGroup);
    // 重建标签（_disposeEngine 已移除旧标签）
    const div = document.createElement('div');
    div.className = 'engine-label';
    const label = new CSS2DObject(div);
    label.position.set(0, 6, 0);
    this.engineGroup.add(label);
    this.engineLabel = label;
    this._refreshLabel();
    this.scene.add(this.engineGroup);
    // 清空进行中的扫描特效（避免旧方案的网格/粒子残留）
    this.scanEffects.forEach(e => disposeScanEffect(this.scene, e));
    this.scanEffects = [];
    console.log(`切换到方案 ${n}：${this.scheme.name}（引擎${this.scheme.engine}/流光${this.scheme.beam}/光圈${this.scheme.ring}）`);
  }

  _refreshLabel() {
    if (this.engineLabel) {
      let key = 1;
      for (const k in PRESETS) if (PRESETS[k] === this.scheme) { key = k; break; }
      this.engineLabel.element.textContent = `实时计算引擎 · 方案${key}`;
    }
  }

  /** 销毁当前引擎（网格、材质、引导光束、标签） */
  _disposeEngine() {
    if (this.engineGroup) {
      this.engineGroup.traverse(obj => {
        // CSS2D 标签：从 DOM 移除其元素，避免切换方案时多个标签重叠残留
        if (obj.isCSS2DObject && obj.element && obj.element.parentNode) {
          obj.element.parentNode.removeChild(obj.element);
        }
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
      this.scene.remove(this.engineGroup);
      this.engineGroup = null;
      this.engineLabel = null;
      this._morphPart = null;
    }
    if (this.engineGuide) {
      this.engineGuide.geometry.dispose();
      this.engineGuide.material.dispose();
      this.scene.remove(this.engineGuide);
      this.engineGuide = null;
    }
    this.engineParts = [];
  }

  // ===== 引擎本体各方案（委托给 engines/ 构造器）=====
  _buildEngine(kind, group) {
    let parts = [];
    if (kind === 'C') parts = buildPoints(group);
    else if (kind === 'D') parts = buildFresnel(group);
    else if (kind === 'E') {
      const r = buildMorph(group);
      parts = r.parts;
      this._morphPart = r.morphPart;
    } else parts = buildReactor(group); // A 为默认
    this.engineParts.push(...parts);
  }

  // ===== 触发扫描（委托给 scan.js）=====
  _triggerScan() {
    const e = createScanEffect({
      cx: this._cx, cz: this._cz,
      topY: this.engineGroup.position.y,
      scheme: this.scheme, scene: this.scene,
    });
    this.scanEffects.push(e);
    if (this._morphPart) advanceMorph(this._morphPart); // 每次扫描脉冲 → 多态核心切到下一形态
  }

  /** 每帧更新：浮动 + 各部件差速旋转 + 扫描触发与推进 */
  update(delta) {
    if (!this.engineGroup) return;
    const t = performance.now() * 0.001;

    // 引擎轻微上下浮动
    this.engineGroup.position.y = this.engineBaseY + Math.sin(t * 0.8) * 0.4;

    // 各部件差速旋转 / 公转
    this.engineParts.forEach(p => {
      if (p.type === 'spin') {
        p.mesh.rotation.x += (p.ax || 0.3) * delta;
        p.mesh.rotation.y += (p.ay || 0.5) * delta;
      } else if (p.type === 'ring') {
        p.mesh.rotation[p.axis] += p.speed * delta;
      } else if (p.type === 'fragments') {
        p.mesh.rotation.y += p.speed * delta;
      } else if (p.type === 'points') {
        p.mesh.rotation.y += p.speed * delta;
      } else if (p.type === 'morph') {
        const st = p.state;
        // 整体缓转 + 轻微摆动 + 呼吸
        p.mesh.rotation.y += 0.3 * delta;
        p.mesh.rotation.x = Math.sin(performance.now() * 0.0003) * 0.12;
        p.mesh.scale.setScalar(1 + Math.sin(performance.now() * 0.0012) * 0.04);
        if (st.morphing) {
          st.t += delta;
          const k = Math.min(1, st.t / st.dur);
          const e = k * k * (3 - 2 * k); // smoothstep 缓动
          setFormAlpha(st.forms[st.from], 1 - e);
          setFormAlpha(st.forms[st.to], e);
          if (k >= 1) {
            st.morphing = false;
            st.idx = st.to;
            setFormAlpha(st.forms[st.from], 0);
            setFormAlpha(st.forms[st.idx], 1);
          }
        }
        tickRubikTwist(p, delta); // 魔方形态常驻层旋转(0.5s/次)，不受形态切换影响
      }
    });

    // 扫描定时触发
    this._scanTimer += delta;
    if (this._scanTimer >= this._scanInterval) {
      this._scanTimer = 0;
      this._triggerScan();
    }

    // 推进扫描特效
    updateScanEffects(this.scanEffects, this.scene, delta);
  }

  // ===== 页面底部常驻切换提示 =====
  _ensureHint() {
    if (document.getElementById('scheme-hint')) return;
    const hint = document.createElement('div');
    hint.id = 'scheme-hint';
    hint.textContent = '按 1 / 2 / 3 / 4 切换扫描方案（引擎·流光·光圈）';
    hint.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:48px', 'transform:translateX(-50%)',
      'z-index:50', 'pointer-events:none',
      'font:12px/1 "Microsoft YaHei",sans-serif', 'letter-spacing:1px',
      'color:#9fd8ff', 'background:rgba(6,10,20,0.7)',
      'border:1px solid rgba(0,217,255,0.3)', 'border-radius:4px',
      'padding:6px 14px', 'white-space:nowrap',
      'box-shadow:0 0 12px rgba(0,217,255,0.2)',
    ].join(';') + ';';
    document.body.appendChild(hint);
  }
}
