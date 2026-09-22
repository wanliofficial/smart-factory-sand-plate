/**
 * 邯郸市供热管网数据
 * - 站点节点：首站 / 中继泵站 / 隔压站（经纬度）
 * - 管道数据：运行时从 data/topology_line.json 加载（Web Mercator 坐标）
 * - 告警：Mock
 */

import { lngLatToScene } from './map.js';

// 站点经纬度 → 场景坐标投影
const S1_POS = lngLatToScene(114.155332, 36.470269); // 首站
const P1_POS = lngLatToScene(114.335407, 36.582998); // 中继泵站
const P2_POS = lngLatToScene(114.409245, 36.611224); // 隔压站

export const networkData = {
  nodes: [
    {
      id: 'S1',
      name: '首站',
      type: 'source',
      coord: [114.155332, 36.470269],
      pos: [S1_POS[0], 0, S1_POS[1]],
      status: 'normal',
      metrics: {
        power: 128.5,
        temp: 95,
        pressure: 1.6,
        flow: 4800,
        efficiency: 94.2
      }
    },
    {
      id: 'P1',
      name: '中继泵站',
      type: 'exchange',
      coord: [114.335407, 36.582998],
      pos: [P1_POS[0], 0, P1_POS[1]],
      status: 'normal',
      metrics: { temp: 90, pressure: 1.3, flow: 4200, load: 76 }
    },
    {
      id: 'P2',
      name: '隔压站',
      type: 'exchange',
      coord: [114.409245, 36.611224],
      pos: [P2_POS[0], 0, P2_POS[1]],
      status: 'warning',
      metrics: { temp: 85, pressure: 1.1, flow: 3800, load: 88 }
    },
  ],

  // 管道段由 buildNetwork() 运行时从 topology_line.json 加载
  // 这里只保留告警数据
  alarms: [
    { time: '11:05:22', level: 'warning', node: 'P2', nodeName: '隔压站', desc: '隔压站负载偏高 (88%)' },
    { time: '10:58:14', level: 'info', node: 'S1', nodeName: '首站', desc: '首站运行正常，供热能力 128.5 MW' },
    { time: '10:42:33', level: 'warning', node: 'P-P1-P2', nodeName: '中继泵站→隔压站', desc: '管道压力略偏低 (1.3 MPa)' },
    { time: '10:15:07', level: 'info', node: 'P1', nodeName: '中继泵站', desc: '中继泵站切换至B泵运行' },
  ],
};

// 生成24小时温度趋势数据
export function generateTempHistory() {
  const hours = [];
  const supplyData = [];
  const returnData = [];

  for (let i = 23; i >= 0; i--) {
    const h = String(23 - i).padStart(2, '0');
    hours.push(`${h}:00`);

    const dayFactor = Math.sin((23 - i) / 24 * Math.PI) * 0.5 + 0.5;
    const supply = 92 + dayFactor * 4 + (Math.random() - 0.5) * 2;
    supplyData.push(Number(supply.toFixed(1)));

    const ret = supply - 25 + (Math.random() - 0.5) * 3;
    returnData.push(Number(ret.toFixed(1)));
  }

  return { hours, supplyData, returnData };
}
