# AIoT World — VGPU / TypeScript / Vite

本版本把用户提供的三张参考图作为设备造型验收基准：

- 机器狗：高密度曲面线框 + 机械关节 + 头部传感器
- 无人机：四旋翼多层圆环/径向线框 + 中央机身 + 云台镜头
- 无人车：三角化车身网格 + 轮毂细节 + 顶部 LiDAR + 青蓝灯带 + 橙色 Radar/LiDAR 扫描弧

参考标准详见 `REFERENCE_VISUAL_SPEC.md`。

## 视觉目标

深蓝/黑色空间、冷色数字孪生线框、局部高亮发光、数据流粒子，以及电影级景深/Bloom/镜头运动。

### 重要实现原则

1. 设备不能再是简单 Box 低模。
2. 机器狗和无人车必须在靠近镜头时仍保持 CAD/数字孪生线框密度。
3. 无人机的四个旋翼圆环必须成为明显的视觉识别元素。
4. 无人车增加橙色雷达扫描弧，与青蓝车体形成冷暖对比。
5. Bloom 只增强高亮线条和粒子，不允许把主体线框冲成一团白。
6. 设备动画继续使用状态机，避免大量时间阈值 if/else。

## VGPU

当前 VGPU 公共 API 使用显式 `init / surface / geometry / draw / frame / frameLoop / target / effect` 模式。项目中的后处理设计保留为多 Pass 扩展点。

建议开发环境：

```bash
npm install
npm run check:wgsl
npm run doctor
npm run dev
```

如果你的本地 `vgpu` 版本处于 API 迁移窗口，请以该版本的 `npx vgpu docs` 为准。
