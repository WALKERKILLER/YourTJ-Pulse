# PulseTown Web 渲染

M8 只渲染西南一楼到教学北楼附近的原型区。建筑和道路来自 `data/generated/campus-scene.json`，草地与景观水体为程序化几何；人物纹理由 Canvas 像素绘制，不包含第三方游戏资产。

## 渲染边界

- High/Medium：动态加载 Three.js Custom Layer，共用 MapLibre Canvas 与 WebGL context；位置使用场景米制坐标和世界原点变换。
- Low、关闭 HD-2D 或 Three/WebGL 不可用：不加载 Three.js，保留 MapLibre Fill Extrusion，并以轻量 Symbol 表示分身。
- Custom Layer 在移除时释放 geometry、material、texture 和 renderer，并监听 WebGL context 丢失/恢复。
- 数字分身仍默认关闭；渲染层只接收本地 `TwinMovementPlan` 投影，不读取 GPS，也不向房间广播。

## 性能预算

`pnpm performance:check` 在构建后验证主应用、MapLibre 引擎和动态 Three.js 分包的原始体积。CI 会在预算超限或 Three.js 不再独立分包时失败。
