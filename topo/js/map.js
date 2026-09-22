/**
 * GeoJSON Map Builder
 * 基于邯郸市真实行政区划数据的3D地图
 */

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ===== 投影参数 =====
const CENTER_LNG = 114.4745;
const CENTER_LAT = 36.5318;
const SCALE = 85;
const COS_LAT = Math.cos(CENTER_LAT * Math.PI / 180);

/**
 * 经纬度 → 场景坐标
 * @returns {[number, number]} [x, z]
 */
export function lngLatToScene(lng, lat) {
  const x = (lng - CENTER_LNG) * COS_LAT * SCALE;
  const z = -(lat - CENTER_LAT) * SCALE;
  return [x, z];
}

/**
 * Web Mercator (EPSG:3857, 单位:米) → 场景坐标
 * 先转经纬度再走 lngLatToScene，保证投影一致
 * @param {number} x Mercator X (meters)
 * @param {number} y Mercator Y (meters)
 * @returns {[number, number]} [sceneX, sceneZ]
 */
export function mercatorToScene(x, y) {
  const lng = x / (20037508.34 / 180);
  const lat = Math.atan(Math.sinh(y / 6378137.0)) * 180 / Math.PI;
  return lngLatToScene(lng, lat);
}

// 区县配色方案（循环使用）
const DISTRICT_PALETTES = [
  { fill: 0x0a1e35, edge: 0x00a8cc },
  { fill: 0x0a2240, edge: 0x00b8d4 },
  { fill: 0x0a1a30, edge: 0x0098b8 },
  { fill: 0x0a2444, edge: 0x00c8dc },
  { fill: 0x0a1c38, edge: 0x00a0c8 },
  { fill: 0x0a2040, edge: 0x00b0d0 },
];

// 地图整体下沉量（避免挤出高度遮住管道和站点底部）
const MAP_Y_OFFSET = -1.5;

export class MapBuilder {
  constructor(scene) {
    this.scene = scene;
    this.districtGroup = new THREE.Group();
    this.boundaryGroup = new THREE.Group();
    this.labelGroup = new THREE.Group();
    this.districtGroup.position.y = MAP_Y_OFFSET;
    this.boundaryGroup.position.y = MAP_Y_OFFSET;
    this.labelGroup.position.y = MAP_Y_OFFSET;
    this.scene.add(this.districtGroup);
    this.scene.add(this.boundaryGroup);
    this.scene.add(this.labelGroup);

    this.districts = [];
    this.loaded = false;
  }

  /** 异步加载GeoJSON并构建3D地图 */
  async load(url = 'data/handan_geo.json') {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`GeoJSON加载失败: ${resp.status}`);
    const geoData = await resp.json();

    // 地面已移除——网格(background.js)在 y=-1.6 提供地面纹理，区县面本身半透明可见
    this._buildDistricts(geoData);
    this._buildDecorations();
    this.loaded = true;
  }

  // 地面已移除——网格由 background.js 提供，区县面半透明可见下方网格

  // ===== 区县多边形 =====
  _buildDistricts(geoData) {
    geoData.features.forEach((feature, index) => {
      const { name, center } = feature.properties;
      const geometry = feature.geometry;
      const palette = DISTRICT_PALETTES[index % DISTRICT_PALETTES.length];

      // 挤出高度：基于区县名hash，产生0.3~1.0的微小高差
      const height = 0.3 + (this._hashString(name) % 30) / 50;

      // 投影中心坐标
      const [cx, cz] = lngLatToScene(center[0], center[1]);
      this.districts.push({ name, center: [cx, cz], index });

      if (geometry.type === 'MultiPolygon') {
        geometry.coordinates.forEach(polygon => {
          this._createPolygon(polygon, palette, height, name);
        });
      } else if (geometry.type === 'Polygon') {
        this._createPolygon(geometry.coordinates, palette, height, name);
      }

      // 区县名标签
      this._createDistrictLabel(name, cx, cz, height);
    });
  }

  _createPolygon(polygon, palette, height, name) {
    // polygon = [outerRing, hole1, hole2, ...]
    const outerRing = polygon[0];
    const holes = polygon.slice(1);

    // 构建 Shape（在XY平面创建，y用-z替代以保持方向正确）
    const shape = new THREE.Shape();
    outerRing.forEach(([lng, lat], i) => {
      const [x, z] = lngLatToScene(lng, lat);
      if (i === 0) shape.moveTo(x, -z);
      else shape.lineTo(x, -z);
    });

    // 孔洞
    holes.forEach(hole => {
      const path = new THREE.Path();
      hole.forEach(([lng, lat], i) => {
        const [x, z] = lngLatToScene(lng, lat);
        if (i === 0) path.moveTo(x, -z);
        else path.lineTo(x, -z);
      });
      shape.holes.push(path);
    });

    // 挤出几何体
    const extrudeSettings = {
      depth: height,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 1,
    };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.rotateX(-Math.PI / 2); // 从XY平面旋转到XZ平面

    // 填充面
    const fillMat = new THREE.MeshStandardMaterial({
      color: palette.fill,
      roughness: 0.7,
      metalness: 0.3,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, fillMat);
    mesh.userData.districtName = name;
    this.districtGroup.add(mesh);

    // 边界发光线
    this._createBoundaryLine(outerRing, palette.edge, height);
    holes.forEach(hole => {
      this._createBoundaryLine(hole, palette.edge, height);
    });
  }

  _createBoundaryLine(ring, color, height) {
    const points = ring.map(([lng, lat]) => {
      const [x, z] = lngLatToScene(lng, lat);
      return new THREE.Vector3(x, height + 0.03, z);
    });

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.5,
    });
    const line = new THREE.Line(geo, mat);
    this.boundaryGroup.add(line);
  }

  _createDistrictLabel(name, x, z, height) {
    const div = document.createElement('div');
    div.className = 'district-label';
    div.textContent = name;

    const label = new CSS2DObject(div);
    label.position.set(x, height + 0.5, z);
    this.labelGroup.add(label);
  }

  // ===== 装饰 =====
  _buildDecorations() {
    // 四角标记
    const corners = [
      [70, 40], [-70, 40], [70, -40], [-70, -40],
    ];
    corners.forEach(([x, z]) => {
      const geo = new THREE.RingGeometry(1.5, 2.5, 4, 1, Math.PI / 4);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x00d9ff,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
      });
      const corner = new THREE.Mesh(geo, mat);
      corner.rotation.x = -Math.PI / 2;
      corner.position.set(x, MAP_Y_OFFSET + 0.02, z);
      this.scene.add(corner);
    });
  }

  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  /** 获取地图中心点（用于相机target） */
  getCenter() {
    if (this.districts.length === 0) return [0, 0];
    let sx = 0, sz = 0;
    this.districts.forEach(d => { sx += d.center[0]; sz += d.center[1]; });
    return [sx / this.districts.length, sz / this.districts.length];
  }
}
