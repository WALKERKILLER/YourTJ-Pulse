# 实时房间协议

本文件由 `packages/contracts/scripts/generate-realtime.ts` 生成。传输使用同源 WSS 与 JSON；单条消息最大 64 KiB。客户端必须忽略未知字段前先通过共享 JSON Schema 校验。

## 鉴权与连接

- 地址：`/api/realtime/rooms/:roomId`。
- 子协议：`yourtj.realtime.v1`；浏览器 Bearer Session 以仅握手使用的 `yourtj.auth.<base64url>` 子协议携带，服务端只回显版本子协议。
- 房间必须存在、未过期，用户必须先成为成员。位置只保存在活跃 WebSocket attachment 中，不写入 D1/R2。
- 关闭码：`4001` 会话过期，`4004` 房间过期，`4400` 协议错误。

## 客户端 → 服务端

| type | 用途 | 重试/去重 |
| --- | --- | --- |
| `room.join` | 加入或恢复会话，并请求完整 Snapshot | 按 `requestId` ACK |
| `location.update` | 在显式开启共享后发送带单调 `seq` 的当前位置 | 未授权或旧 seq 不广播 |
| `presence.update` | 显式开启、暂停位置共享或更新在线状态 | 按 `requestId` ACK |
| `pin.create` | 在当前房间创建协作点 | D1 写入后广播，按 `requestId` 去重 |
| `pin.update` | 以 `expectedVersion` 编辑当前房间的协作点 | 成功后广播；版本冲突返回 `PIN_VERSION_CONFLICT`，不覆盖新版本 |
| `pin.delete` | 以 `expectedVersion` 软删除当前房间的协作点 | 成功后向所有成员广播 `pin.deleted` |
| `ping` | 保活并确认最后收到的服务端 sequence | 按 `requestId` ACK |

## 服务端 → 客户端

| type | 用途 |
| --- | --- |
| `room.snapshot` | 当前在线成员与其最近位置 |
| `member.joined` / `member.left` | 成员连接状态变化 |
| `member.location` | 已通过精度与 seq 校验的位置 |
| `member.presence` | Presence 或共享开关变化 |
| `pin.created` / `pin.updated` / `pin.deleted` | 协作点创建、版本更新或软删除事件 |
| `room.ack` | 请求确认、重复或忽略状态 |
| `room.error` | 可重试性明确的协议/房间错误 |

权威结构位于 `packages/contracts/generated/realtime.schema.json`；Dart 模型位于 `packages/contracts/generated/realtime_models.dart`。
