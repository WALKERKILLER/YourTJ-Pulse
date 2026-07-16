import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toJSONSchema } from 'zod';

import { createTwinEventSchema, generateTwinMovementPlanSchema, twinEventSchema, twinMovementPlanSchema, twinProfileSchema, updateTwinProfileSchema } from '../src/twin';

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
  title: 'YourTJ Pulse twin simulation contract',
  $defs: {
    UpdateTwinProfile: withoutSchema(toJSONSchema(updateTwinProfileSchema, { target: 'draft-2020-12' })),
    TwinProfile: withoutSchema(toJSONSchema(twinProfileSchema, { target: 'draft-2020-12' })),
    CreateTwinEvent: withoutSchema(toJSONSchema(createTwinEventSchema, { target: 'draft-2020-12' })),
    TwinEvent: withoutSchema(toJSONSchema(twinEventSchema, { target: 'draft-2020-12' })),
    GenerateTwinMovementPlan: withoutSchema(toJSONSchema(generateTwinMovementPlanSchema, { target: 'draft-2020-12' })),
    TwinMovementPlan: withoutSchema(toJSONSchema(twinMovementPlanSchema, { target: 'draft-2020-12' })),
  },
}, null, 2)}\n`;

const projectionVectors = `${JSON.stringify({
  version: 1,
  nodes: [
    { id: 'a', longitude: 121.5, latitude: 31.28, x: 0, y: 0 },
    { id: 'b', longitude: 121.501, latitude: 31.28, x: 100, y: 0 },
  ],
  plan: {
    id: 'golden-plan', userId: 'golden-user', eventId: 'golden-event',
    originPlaceId: 'origin', destinationPlaceId: 'destination', pathNodeIds: ['a', 'b'],
    startedAt: 1_000, expectedArrivalAt: 3_000, speedMetersPerSecond: 1.35,
    movementType: 'walk', routeVersion: 1,
  },
  cases: [
    { timestamp: 1_000, longitude: 121.5, latitude: 31.28, x: 0, y: 0, progress: 0 },
    { timestamp: 2_000, longitude: 121.5005, latitude: 31.28, x: 50, y: 0, progress: 0.5 },
    { timestamp: 3_000, longitude: 121.501, latitude: 31.28, x: 100, y: 0, progress: 1 },
  ],
}, null, 2)}\n`;

const dartModels = `// GENERATED FILE. Run: pnpm --filter @yourtj/contracts protocol:generate
import 'dart:math' as math;

typedef JsonMap = Map<String, dynamic>;

enum TwinMovementType { walk, run, bike }
enum TwinPlanStatus { active, arrived, cancelled }

class TwinProfile {
  const TwinProfile({required this.userId, required this.enabled, required this.simulationEnabled, required this.privacyMode, this.homePlaceId, this.avatarId, this.updatedAt});
  final String userId;
  final bool enabled;
  final bool simulationEnabled;
  final String? homePlaceId;
  final String? avatarId;
  final String privacyMode;
  final DateTime? updatedAt;

  factory TwinProfile.fromJson(JsonMap json) => TwinProfile(
    userId: json['userId'] as String, enabled: json['enabled'] as bool, simulationEnabled: json['simulationEnabled'] as bool,
    homePlaceId: json['homePlaceId'] as String?, avatarId: json['avatarId'] as String?, privacyMode: json['privacyMode'] as String,
    updatedAt: json['updatedAt'] == null ? null : DateTime.parse(json['updatedAt'] as String),
  );
}

class TwinEvent {
  const TwinEvent({required this.id, required this.type, required this.startAt, required this.destinationPlaceId, required this.source, required this.createdAt, this.endAt, this.originPlaceId, this.schedule});
  final String id;
  final String type;
  final DateTime startAt;
  final DateTime? endAt;
  final String? originPlaceId;
  final String destinationPlaceId;
  final String source;
  final JsonMap? schedule;
  final DateTime createdAt;

  factory TwinEvent.fromJson(JsonMap json) => TwinEvent(
    id: json['id'] as String, type: json['type'] as String, startAt: DateTime.parse(json['startAt'] as String),
    endAt: json['endAt'] == null ? null : DateTime.parse(json['endAt'] as String), originPlaceId: json['originPlaceId'] as String?,
    destinationPlaceId: json['destinationPlaceId'] as String, source: json['source'] as String,
    schedule: json['schedule'] as JsonMap?, createdAt: DateTime.parse(json['createdAt'] as String),
  );
}

class TwinPathNode {
  const TwinPathNode({required this.id, required this.longitude, required this.latitude, required this.x, required this.y});
  final String id;
  final double longitude;
  final double latitude;
  final double x;
  final double y;
}

class TwinMovementPlan {
  const TwinMovementPlan({required this.id, required this.userId, required this.eventId, required this.originPlaceId, required this.destinationPlaceId, required this.pathNodeIds, required this.startedAt, required this.expectedArrivalAt, required this.speedMetersPerSecond, required this.movementType, required this.routeVersion, required this.status, required this.createdAt, required this.updatedAt});
  final String id;
  final String userId;
  final String eventId;
  final String originPlaceId;
  final String destinationPlaceId;
  final List<String> pathNodeIds;
  final int startedAt;
  final int expectedArrivalAt;
  final double speedMetersPerSecond;
  final TwinMovementType movementType;
  final int routeVersion;
  final TwinPlanStatus status;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory TwinMovementPlan.fromJson(JsonMap json) => TwinMovementPlan(
    id: json['id'] as String, userId: json['userId'] as String, eventId: json['eventId'] as String,
    originPlaceId: json['originPlaceId'] as String, destinationPlaceId: json['destinationPlaceId'] as String,
    pathNodeIds: (json['pathNodeIds'] as List<dynamic>).cast<String>(), startedAt: json['startedAt'] as int,
    expectedArrivalAt: json['expectedArrivalAt'] as int, speedMetersPerSecond: (json['speedMetersPerSecond'] as num).toDouble(),
    movementType: TwinMovementType.values.byName(json['movementType'] as String), routeVersion: json['routeVersion'] as int,
    status: TwinPlanStatus.values.byName(json['status'] as String), createdAt: DateTime.parse(json['createdAt'] as String),
    updatedAt: DateTime.parse(json['updatedAt'] as String),
  );
}

class TwinProjection {
  const TwinProjection({required this.longitude, required this.latitude, required this.x, required this.y, required this.headingDegrees, required this.progress});
  final double longitude;
  final double latitude;
  final double x;
  final double y;
  final double headingDegrees;
  final double progress;
  String get kind => 'twin_simulated';
}

double _distance(TwinPathNode left, TwinPathNode right) {
  final latitudeRadians = (left.latitude + right.latitude) * math.pi / 360;
  final east = (right.longitude - left.longitude) * math.pi / 180 * 6378137 * math.cos(latitudeRadians);
  final north = (right.latitude - left.latitude) * math.pi / 180 * 6378137;
  return math.sqrt(east * east + north * north);
}

TwinProjection projectTwinMovement(TwinMovementPlan plan, List<TwinPathNode> path, int timestamp) {
  if (path.length < 2) throw ArgumentError('INVALID_TWIN_PLAN_PATH');
  final progress = ((timestamp - plan.startedAt) / (plan.expectedArrivalAt - plan.startedAt)).clamp(0.0, 1.0).toDouble();
  final distances = <double>[for (var index = 1; index < path.length; index++) _distance(path[index - 1], path[index])];
  var remaining = distances.fold<double>(0, (sum, value) => sum + value) * progress;
  var segment = 0;
  while (segment < distances.length - 1 && remaining > distances[segment]) { remaining -= distances[segment]; segment++; }
  final start = path[segment];
  final end = path[math.min(segment + 1, path.length - 1)];
  final local = distances[segment] > 0 ? (remaining / distances[segment]).clamp(0.0, 1.0).toDouble() : 0.0;
  double lerp(double left, double right) => left + (right - left) * local;
  final heading = (math.atan2(end.x - start.x, end.y - start.y) * 180 / math.pi + 360) % 360;
  return TwinProjection(longitude: lerp(start.longitude, end.longitude), latitude: lerp(start.latitude, end.latitude), x: lerp(start.x, end.x), y: lerp(start.y, end.y), headingDegrees: heading, progress: progress);
}
`;

const documentation = `# 数字分身模拟协议

本文件由 \`packages/contracts/scripts/generate-twin.ts\` 生成。

## 隐私边界

- 数字分身默认关闭，只有 Profile 的 \`enabled\` 与 \`simulationEnabled\` 同时为真时才生成移动计划。
- D1 只保存起终点、路径节点、出发/到达时间、速度和移动方式，不保存按时间采样的模拟坐标。
- \`twin_simulated\` 只表示按计划推导的虚拟位置，不代表用户 GPS；实时房间位置通道只接受 \`gps\`。

## 确定性推导

Web 与 Flutter 使用同一 MovementPlan、导航图版本和当前时间，在本地按路径累计距离线性插值。服务端只在出发、目的地、日程、路线、取消或到达发生变化时重发计划，不连续广播坐标。

权威 JSON Schema 位于 \`packages/contracts/generated/twin.schema.json\`；Dart 模型及投影算法位于 \`packages/contracts/generated/twin_models.dart\`；跨端黄金向量位于 \`packages/contracts/generated/twin_projection_vectors.json\`。
`;

const outputs = new Map<string, string>([
  [resolve(contractRoot, 'generated', 'twin.schema.json'), jsonSchema],
  [resolve(contractRoot, 'generated', 'twin_models.dart'), dartModels],
  [resolve(contractRoot, 'generated', 'twin_projection_vectors.json'), projectionVectors],
  [resolve(repositoryRoot, 'docs', 'twin-simulation.md'), documentation],
]);

for (const [path, content] of outputs) {
  if (checkOnly) {
    const existing = await readFile(path, 'utf8').catch(() => '');
    if (existing !== content) throw new Error(`Generated twin contract is stale: ${path}`);
    continue;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}
