# 可观测性与告警基线

Worker 输出单行结构化 JSON，Schema 版本为 `1`。记录由 `apps/worker/src/observability.ts` 的强类型白名单生成；客户端只可提交严格枚举事件，额外字段会被 API 拒绝。

## 指标来源

| 指标 | 事件/来源 | 建议告警条件 |
|---|---|---|
| Worker 未处理错误率 | `worker.error` / `api.request` | 5 分钟错误率 > 1% 或连续 3 个窗口出现错误 |
| API 延迟 | `api.request.durationMs` | 5 分钟 p95 > 500 ms；p99 > 1.5 s |
| D1 操作错误 | `worker.error` 且路由为业务 API | 5 分钟内 >= 5 次 |
| WebSocket 连接与成员数 | `realtime.connection`、`memberCount` | 单房间成员数接近 100，或连接失败率 > 5% |
| 重连次数 | `realtime.reconnect` | 单版本 10 分钟内高于活跃连接数的 20% |
| 实时消息与位置更新速率 | `realtime.message`、`messageType`、`accuracyBucket` | 拒绝率 > 5%；位置更新超过客户端 1 Hz 约束 |
| PMTiles 失败与延迟 | `pmtiles.request` | 5 分钟失败率 > 1%；p95 > 300 ms |
| Web 崩溃与长任务 | `web.crash`、`web.unhandled-rejection`、`web.long-task` | 任一版本崩溃率 > 0.5%；长任务 p95 > 200 ms |
| Flutter 错误与卡顿 | `flutter.error`、`flutter.jank` | 错误率 > 0.5%；超过 50 ms 的帧持续升高 |
| 构建失败 | GitHub Actions `quality` | 主分支任一失败立即告警并阻止合并 |

## 允许字段

`event`、`result`、`durationMs`、`status`、`route`、`roomId`、`userHash`、`messageType`、`accuracyBucket`、`memberCount`、`schemaVersion`、`timestamp`。`userHash` 使用房间 ID 与用户 ID 共同计算的截断 SHA-256，只用于单房间排障，不能跨房间关联用户。

严禁添加自由文本错误消息或任意 `metadata`/`payload` 字段。需要新增维度时，必须先更新白名单类型、隐私测试和本文档。客户端报告器不读取错误内容、堆栈、页面输入、坐标或身份令牌。

## 排障顺序

1. 先按 `event`、`result` 和时间窗口确认影响范围，再查看 `route` 或 `messageType`。
2. 实时问题只使用房间 ID、用户哈希、成员数和精度区间关联，不能请求或恢复具体位置。
3. PMTiles 故障核对 R2 范围读取、对象校验和与构建清单；不得在日志中输出对象正文。
4. 客户端错误只用于版本级聚合；若需要复现，由测试数据或用户主动提供的脱敏信息完成。
