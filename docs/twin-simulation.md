# 数字分身模拟协议

本文件由 `packages/contracts/scripts/generate-twin.ts` 生成。

## 隐私边界

- 数字分身默认关闭，只有 Profile 的 `enabled` 与 `simulationEnabled` 同时为真时才生成移动计划。
- D1 只保存起终点、路径节点、出发/到达时间、速度和移动方式，不保存按时间采样的模拟坐标。
- `twin_simulated` 只表示按计划推导的虚拟位置，不代表用户 GPS；实时房间位置通道只接受 `gps`。

## 确定性推导

Web 与 Flutter 使用同一 MovementPlan、导航图版本和当前时间，在本地按路径累计距离线性插值。服务端只在出发、目的地、日程、路线、取消或到达发生变化时重发计划，不连续广播坐标。

权威 JSON Schema 位于 `packages/contracts/generated/twin.schema.json`；Dart 模型及投影算法位于 `packages/contracts/generated/twin_models.dart`；跨端黄金向量位于 `packages/contracts/generated/twin_projection_vectors.json`。
