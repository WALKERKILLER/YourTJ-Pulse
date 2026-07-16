// GENERATED FILE. Run: pnpm --filter @yourtj/contracts protocol:generate
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
