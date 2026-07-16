import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toJSONSchema } from 'zod';

import { clientMessageSchema, serverMessageSchema } from '../src/realtime';

const contractRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(contractRoot, '..', '..');
const checkOnly = process.argv.includes('--check');

function withoutSchema(value: unknown): Record<string, unknown> {
  const schema = { ...value as Record<string, unknown> };
  delete schema.$schema;
  return schema;
}

const jsonSchema = `${JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'YourTJ Pulse realtime protocol',
  $defs: {
    ClientMessage: withoutSchema(toJSONSchema(clientMessageSchema, { target: 'draft-2020-12' })),
    ServerMessage: withoutSchema(toJSONSchema(serverMessageSchema, { target: 'draft-2020-12' })),
  },
  oneOf: [
    { $ref: '#/$defs/ClientMessage' },
    { $ref: '#/$defs/ServerMessage' },
  ],
}, null, 2)}\n`;

const dartModels = `// GENERATED FILE. Run: pnpm --filter @yourtj/contracts protocol:generate
// ignore_for_file: avoid_dynamic_calls

typedef JsonMap = Map<String, dynamic>;

enum PresenceStatus { available, busy, away }
enum MemberConnectionStatus { live, delayed, stale, offline }
enum LocationSharingLevel { precise, approximate, hidden }

class RealtimeLocation {
  const RealtimeLocation({required this.seq, required this.longitude, required this.latitude, required this.accuracy, this.altitude, this.heading, this.speed, this.kind = 'gps'});

  final int seq;
  final double longitude;
  final double latitude;
  final double accuracy;
  final double? altitude;
  final double? heading;
  final double? speed;
  final String kind;

  factory RealtimeLocation.fromJson(JsonMap json) => RealtimeLocation(
    seq: json['seq'] as int,
    longitude: (json['longitude'] as num).toDouble(),
    latitude: (json['latitude'] as num).toDouble(),
    accuracy: (json['accuracy'] as num).toDouble(),
    altitude: (json['altitude'] as num?)?.toDouble(),
    heading: (json['heading'] as num?)?.toDouble(),
    speed: (json['speed'] as num?)?.toDouble(),
    kind: json['kind'] as String? ?? 'gps',
  );

  JsonMap toJson() => {
    'seq': seq, 'longitude': longitude, 'latitude': latitude, 'accuracy': accuracy,
    if (altitude != null) 'altitude': altitude,
    if (heading != null) 'heading': heading,
    if (speed != null) 'speed': speed,
    'kind': kind,
  };
}

typedef LocationUpdate = RealtimeLocation;

class RoomMember {
  const RoomMember({required this.userId, required this.displayName, required this.presence, required this.sharingLocation, required this.locationSharingLevel, required this.connectionStatus, required this.joinedAt, required this.updatedAt, this.avatarUrl, this.location});

  final String userId;
  final String displayName;
  final String? avatarUrl;
  final PresenceStatus presence;
  final bool sharingLocation;
  final LocationSharingLevel locationSharingLevel;
  final MemberConnectionStatus connectionStatus;
  final int joinedAt;
  final int updatedAt;
  final RealtimeLocation? location;

  factory RoomMember.fromJson(JsonMap json) => RoomMember(
    userId: json['userId'] as String,
    displayName: json['displayName'] as String,
    avatarUrl: json['avatarUrl'] as String?,
    presence: PresenceStatus.values.byName(json['presence'] as String),
    sharingLocation: json['sharingLocation'] as bool,
    locationSharingLevel: LocationSharingLevel.values.byName(json['locationSharingLevel'] as String),
    connectionStatus: MemberConnectionStatus.values.byName(json['connectionStatus'] as String),
    joinedAt: json['joinedAt'] as int,
    updatedAt: json['updatedAt'] as int,
    location: json['location'] == null ? null : RealtimeLocation.fromJson(json['location'] as JsonMap),
  );
}

class RoomSnapshot {
  const RoomSnapshot({required this.roomId, required this.members, required this.sequence});
  final String roomId;
  final List<RoomMember> members;
  final int sequence;

  factory RoomSnapshot.fromMessage(JsonMap json) {
    final payload = json['payload'] as JsonMap;
    return RoomSnapshot(
      roomId: payload['roomId'] as String,
      members: (payload['members'] as List<dynamic>).map((item) => RoomMember.fromJson(item as JsonMap)).toList(growable: false),
      sequence: json['sequence'] as int,
    );
  }
}

class ClientMessage {
  const ClientMessage({required this.type, required this.requestId, required this.sentAt, required this.payload});
  final String type;
  final String requestId;
  final int sentAt;
  final JsonMap payload;
  JsonMap toJson() => {'type': type, 'requestId': requestId, 'sentAt': sentAt, 'payload': payload};
}

class ServerMessage {
  const ServerMessage({required this.type, required this.eventId, required this.sequence, required this.sentAt, required this.payload, this.requestId});
  final String type;
  final String eventId;
  final int sequence;
  final int sentAt;
  final String? requestId;
  final JsonMap payload;

  factory ServerMessage.fromJson(JsonMap json) => ServerMessage(
    type: json['type'] as String,
    eventId: json['eventId'] as String,
    sequence: json['sequence'] as int,
    sentAt: json['sentAt'] as int,
    requestId: json['requestId'] as String?,
    payload: json['payload'] as JsonMap,
  );
}
`;

const apiDocumentation = `# 实时房间协议

本文件由 \`packages/contracts/scripts/generate-realtime.ts\` 生成。传输使用同源 WSS 与 JSON；单条消息最大 64 KiB。客户端必须忽略未知字段前先通过共享 JSON Schema 校验。

## 鉴权与连接

- 地址：\`/api/realtime/rooms/:roomId\`。
- 子协议：\`yourtj.realtime.v1\`；浏览器 Bearer Session 以仅握手使用的 \`yourtj.auth.<base64url>\` 子协议携带，服务端只回显版本子协议。
- 房间必须存在、未过期，用户必须先成为成员。共享默认关闭；位置只保存在活跃 WebSocket attachment 中，不写入 D1/R2。
- \`locationSharingLevel\` 为 \`hidden\`、\`approximate\` 或 \`precise\`。近似位置先由服务端转换到约 80 米稳定网格并移除运动字段，再写入连接内存和广播。
- 关闭码：\`4001\` 会话过期，\`4004\` 房间过期，\`4400\` 协议错误。

## 客户端 → 服务端

| type | 用途 | 重试/去重 |
| --- | --- | --- |
| \`room.join\` | 加入或恢复会话，并请求完整 Snapshot | 按 \`requestId\` ACK |
| \`location.update\` | 在显式开启共享后发送带单调 \`seq\` 的当前位置 | 未授权或旧 seq 不广播 |
| \`presence.update\` | 显式选择共享等级、暂停位置共享或更新在线状态 | 按 \`requestId\` ACK；旧客户端省略等级时按模糊共享兼容 |
| \`pin.create\` | 在当前房间创建协作点 | D1 写入后广播，按 \`requestId\` 去重 |
| \`pin.update\` | 以 \`expectedVersion\` 编辑当前房间的协作点 | 成功后广播；版本冲突返回 \`PIN_VERSION_CONFLICT\`，不覆盖新版本 |
| \`pin.delete\` | 以 \`expectedVersion\` 软删除当前房间的协作点 | 成功后向所有成员广播 \`pin.deleted\` |
| \`ping\` | 保活并确认最后收到的服务端 sequence | 按 \`requestId\` ACK |

## 服务端 → 客户端

| type | 用途 |
| --- | --- |
| \`room.snapshot\` | 当前在线成员与其最近位置 |
| \`member.joined\` / \`member.left\` | 成员连接状态变化 |
| \`member.location\` | 已通过精度、seq 与共享等级转换的位置 |
| \`member.presence\` | Presence、共享开关或共享等级变化 |
| \`pin.created\` / \`pin.updated\` / \`pin.deleted\` | 协作点创建、版本更新或软删除事件 |
| \`room.ack\` | 请求确认、重复或忽略状态 |
| \`room.error\` | 可重试性明确的协议/房间错误 |

权威结构位于 \`packages/contracts/generated/realtime.schema.json\`；Dart 模型位于 \`packages/contracts/generated/realtime_models.dart\`。
`;

const outputs = new Map<string, string>([
  [resolve(contractRoot, 'generated', 'realtime.schema.json'), jsonSchema],
  [resolve(contractRoot, 'generated', 'realtime_models.dart'), dartModels],
  [resolve(repositoryRoot, 'docs', 'realtime-protocol.md'), apiDocumentation],
]);

for (const [path, content] of outputs) {
  if (checkOnly) {
    const existing = await readFile(path, 'utf8').catch(() => '');
    if (existing !== content) throw new Error(`Generated realtime contract is stale: ${path}`);
    continue;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}
