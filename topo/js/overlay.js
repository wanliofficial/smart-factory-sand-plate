/**
 * Overlay Manager
 * 浮层数据面板与ECharts图表
 */

import { networkData, generateTempHistory } from './data.js';

export class OverlayManager {
  constructor() {
    this.tempChart = null;
    this.statusChart = null;
    this._initClock();
    this._renderMetrics();
    this._renderAlarms();
    this._initCharts();
    this._initDetailPopup();
  }

  // ===== 时钟 =====
  _initClock() {
    const timeEl = document.getElementById('current-time');
    const dateEl = document.getElementById('current-date');

    const update = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      timeEl.textContent = `${h}:${m}:${s}`;

      const y = now.getFullYear();
      const mo = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
      dateEl.textContent = `${y}/${mo}/${d} 周${week}`;
    };

    update();
    setInterval(update, 1000);
  }

  // ===== 总览指标 =====
  _renderMetrics() {
    const container = document.getElementById('overview-metrics');
    const sourceNode = networkData.nodes.find(n => n.type === 'source');
    const allNodes = networkData.nodes;

    const errorCount = allNodes.filter(n => n.status === 'error').length;
    const warningCount = allNodes.filter(n => n.status === 'warning').length;

    const metrics = [
      { label: '供热能力', value: sourceNode.metrics.power, unit: 'MW', cls: '' },
      { label: '供水温度', value: sourceNode.metrics.temp, unit: '°C', cls: '' },
      { label: '主管流量', value: sourceNode.metrics.flow, unit: 'm³/h', cls: '' },
      { label: '管网压力', value: sourceNode.metrics.pressure, unit: 'MPa', cls: '' },
      { label: '运行效率', value: sourceNode.metrics.efficiency, unit: '%', cls: '' },
      { label: '告警/故障', value: `${errorCount}/${warningCount}`, unit: '', cls: warningCount > 0 ? 'metric-card--warning' : '' },
    ];

    container.innerHTML = metrics.map(m => `
      <div class="metric-card ${m.cls}">
        <span class="metric-card__label">${m.label}</span>
        <div>
          <span class="metric-card__value">${m.value}</span>
          <span class="metric-card__unit">${m.unit}</span>
        </div>
      </div>
    `).join('');
  }

  // ===== 告警列表 =====
  _renderAlarms() {
    const container = document.getElementById('alarm-list');
    const countEl = document.getElementById('alarm-count');

    const count = networkData.alarms.filter(a => a.level !== 'info').length;
    countEl.textContent = count;

    container.innerHTML = networkData.alarms.map(a => `
      <div class="alarm-item">
        <span class="alarm-item__level alarm-item__level--${a.level}"></span>
        <div class="alarm-item__content">
          <div class="alarm-item__desc">${a.desc}</div>
          <div class="alarm-item__meta">
            <span class="alarm-item__node">${a.nodeName}</span> · ${a.time}
          </div>
        </div>
      </div>
    `).join('');
  }

  // ===== ECharts 图表 =====
  _initCharts() {
    this._initTempChart();
    this._initStatusChart();
    window.addEventListener('resize', () => {
      this.tempChart?.resize();
      this.statusChart?.resize();
    });
  }

  _initTempChart() {
    const dom = document.getElementById('temp-chart');
    this.tempChart = echarts.init(dom);

    const data = generateTempHistory();

    const option = {
      backgroundColor: 'transparent',
      grid: { top: 30, right: 15, bottom: 25, left: 40 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(8, 16, 32, 0.9)',
        borderColor: 'rgba(0, 217, 255, 0.3)',
        textStyle: { color: '#e0e6ed', fontSize: 12 },
      },
      legend: {
        data: ['供水温度', '回水温度'],
        textStyle: { color: '#8fa3b8', fontSize: 11 },
        top: 5,
        right: 10,
        itemWidth: 12,
        itemHeight: 8,
      },
      xAxis: {
        type: 'category',
        data: data.hours,
        axisLine: { lineStyle: { color: '#1a3050' } },
        axisLabel: { color: '#6b7a8f', fontSize: 10, interval: 3 },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#1a3050' } },
        axisLabel: { color: '#6b7a8f', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(26, 48, 80, 0.4)' } },
        min: 40,
        max: 100,
      },
      series: [
        {
          name: '供水温度',
          type: 'line',
          data: data.supplyData,
          smooth: true,
          symbol: 'none',
          lineStyle: { color: '#ff6b35', width: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(255, 107, 53, 0.3)' },
              { offset: 1, color: 'rgba(255, 107, 53, 0)' },
            ]),
          },
        },
        {
          name: '回水温度',
          type: 'line',
          data: data.returnData,
          smooth: true,
          symbol: 'none',
          lineStyle: { color: '#4a9eff', width: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(74, 158, 255, 0.3)' },
              { offset: 1, color: 'rgba(74, 158, 255, 0)' },
            ]),
          },
        },
      ],
    };

    this.tempChart.setOption(option);
  }

  _initStatusChart() {
    const dom = document.getElementById('status-chart');
    this.statusChart = echarts.init(dom);

    const nodes = networkData.nodes;
    const stationNames = nodes.map(n => n.name);
    const flowData = nodes.map(n => ({
      value: n.metrics.flow,
      itemStyle: {
        color: n.status === 'error' ? '#ff3d3d' :
               n.status === 'warning' ? '#ffab00' : '#00d9ff',
      },
    }));
    const tempData = nodes.map(n => n.metrics.temp);

    const option = {
      backgroundColor: 'transparent',
      grid: { top: 35, right: 50, bottom: 25, left: 45 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(8, 16, 32, 0.9)',
        borderColor: 'rgba(0, 217, 255, 0.3)',
        textStyle: { color: '#e0e6ed', fontSize: 12 },
      },
      legend: {
        data: ['流量', '温度'],
        textStyle: { color: '#8fa3b8', fontSize: 11 },
        top: 0,
        right: 5,
        itemWidth: 10,
        itemHeight: 8,
      },
      xAxis: {
        type: 'category',
        data: stationNames,
        axisLine: { lineStyle: { color: '#1a3050' } },
        axisLabel: { color: '#8fa3b8', fontSize: 11 },
      },
      yAxis: [
        {
          type: 'value',
          name: 'm³/h',
          nameTextStyle: { color: '#6b7a8f', fontSize: 10 },
          axisLine: { lineStyle: { color: '#1a3050' } },
          axisLabel: { color: '#6b7a8f', fontSize: 10 },
          splitLine: { lineStyle: { color: 'rgba(26, 48, 80, 0.4)' } },
        },
        {
          type: 'value',
          name: '°C',
          nameTextStyle: { color: '#6b7a8f', fontSize: 10 },
          axisLine: { lineStyle: { color: '#1a3050' } },
          axisLabel: { color: '#6b7a8f', fontSize: 10 },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '流量',
          type: 'bar',
          data: flowData,
          barWidth: 28,
          label: { show: true, position: 'top', color: '#8fa3b8', fontSize: 10 },
        },
        {
          name: '温度',
          type: 'line',
          yAxisIndex: 1,
          data: tempData,
          smooth: true,
          symbol: 'circle',
          symbolSize: 8,
          lineStyle: { color: '#ff6b35', width: 2 },
          itemStyle: { color: '#ff6b35' },
          label: { show: true, position: 'top', color: '#ff6b35', fontSize: 10 },
        },
      ],
    };

    this.statusChart.setOption(option);
  }

  // ===== 节点详情弹窗 =====
  _initDetailPopup() {
    this.popup = document.getElementById('detail-popup');
    this.popupTitle = document.getElementById('detail-title');
    this.popupBody = document.getElementById('detail-body');

    document.getElementById('detail-close').addEventListener('click', () => {
      this.hideDetail();
    });
  }

  showDetail(node) {
    // 管道段点击
    if (node.waterType !== undefined) {
      const typeText = node.waterType === 1 ? '供水管道' : '回水管道';
      this.popupTitle.textContent = `${node.tpCode || node.id} · ${typeText}`;
      const items = [
        { label: '管道编号', value: node.tpCode || '-', unit: '' },
        { label: '管道类型', value: typeText, unit: '' },
        { label: '管径', value: node.diameter, unit: 'mm' },
        { label: '端点A', value: node.connId1 ? node.connId1.slice(0, 8) : '-', unit: '' },
        { label: '端点B', value: node.connId2 ? node.connId2.slice(0, 8) : '-', unit: '' },
      ];
      this.popupBody.innerHTML = items.map(item => `
        <div class="detail-item">
          <span class="detail-item__label">${item.label}</span>
          <div>
            <span class="detail-item__value">${item.value}</span>
            <span class="detail-item__unit">${item.unit}</span>
          </div>
        </div>
      `).join('');
      this.popup.classList.add('detail-popup--visible');
      return;
    }

    const typeMap = {
      source: '首站',
      exchange: '泵站',
      user: '用户端',
    };
    const statusMap = {
      normal: { text: '正常', cls: 'detail-item__value--highlight' },
      warning: { text: '预警', cls: 'detail-item__value--warning' },
      error: { text: '故障', cls: 'detail-item__value--error' },
    };

    this.popupTitle.textContent = `${node.name} · ${typeMap[node.type]}`;

    const m = node.metrics;
    let items = [];

    if (node.type === 'source') {
      items = [
        { label: '供热能力', value: m.power, unit: 'MW' },
        { label: '供水温度', value: m.temp, unit: '°C' },
        { label: '管网压力', value: m.pressure, unit: 'MPa' },
        { label: '总流量', value: m.flow, unit: 'm³/h' },
        { label: '运行效率', value: m.efficiency, unit: '%' },
        { label: '运行状态', value: statusMap[node.status || 'normal'].text, cls: statusMap[node.status || 'normal'].cls },
      ];
    } else if (node.type === 'exchange') {
      items = [
        { label: '供水温度', value: m.temp, unit: '°C' },
        { label: '管网压力', value: m.pressure, unit: 'MPa' },
        { label: '流量', value: m.flow, unit: 'm³/h' },
        { label: '负载率', value: m.load, unit: '%' },
        { label: '运行状态', value: statusMap[node.status || 'normal'].text, cls: statusMap[node.status || 'normal'].cls },
        { label: '节点编号', value: node.id, unit: '' },
      ];
    } else {
      items = [
        { label: '供水温度', value: m.temp, unit: '°C' },
        { label: '流量', value: m.flow, unit: 'm³/h' },
        { label: '供热面积', value: m.area, unit: 'm²' },
        { label: '运行状态', value: statusMap[node.status || 'normal'].text, cls: statusMap[node.status || 'normal'].cls },
        { label: '节点编号', value: node.id, unit: '' },
      ];
    }

    this.popupBody.innerHTML = items.map(item => `
      <div class="detail-item">
        <span class="detail-item__label">${item.label}</span>
        <div>
          <span class="detail-item__value ${item.cls || ''}">${item.value}</span>
          <span class="detail-item__unit">${item.unit}</span>
        </div>
      </div>
    `).join('');

    this.popup.classList.add('detail-popup--visible');
  }

  hideDetail() {
    this.popup.classList.remove('detail-popup--visible');
  }

}
