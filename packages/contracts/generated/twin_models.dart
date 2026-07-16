// GENERATED FILE. Run: pnpm --filter @yourtj/contracts protocol:generate
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
