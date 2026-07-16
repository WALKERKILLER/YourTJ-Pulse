import 'dart:async';

import '../campus_map_state.dart';
import '../contracts/contracts.dart';
import 'realtime_room_repository.dart';

class RoomSessionController {
  RoomSessionController({
    required this.repository,
    required this.stateController,
    List<Pin> initialPins = const [],
  }) : _pins = [...initialPins];

  final RealtimeRoomRepository repository;
  final CampusMapController stateController;
  StreamSubscription<ServerMessage>? _subscription;
  LocationSharingLevel _sharingLevel = LocationSharingLevel.hidden;
  String? _roomId;
  List<RoomMember> _members = const [];
  List<Pin> _pins;

  Future<void> join({required String userId, required String roomId}) async {
    _roomId = roomId;
    stateController.setIdentity(userId: userId, roomId: roomId);
    await _subscription?.cancel();
    _subscription = repository.connect().listen(_accept,
        onError: (_) => stateController.setNetworkAvailable(false));
    repository.join(requestId: 'join-${DateTime.now().microsecondsSinceEpoch}');
  }

  void setLocationSharingLevel(LocationSharingLevel level) {
    _sharingLevel = level;
    stateController.setLocationSharingLevel(level);
    repository.updatePresence(sharingLevel: level);
  }

  void publishLocation(LocationUpdate update) {
    repository.updateLocation(
      update,
      sharingEnabled: _sharingLevel != LocationSharingLevel.hidden,
    );
  }

  void _accept(ServerMessage message) {
    repository.accept(message);
    stateController.synchronizeClock(message.sentAt);
    stateController.setNetworkAvailable(true);
    switch (message.type) {
      case 'room.snapshot':
        final snapshot = RoomSnapshot.fromMessage({
          'sequence': message.sequence,
          'payload': message.payload,
        });
        _roomId = snapshot.roomId;
        _members = snapshot.members;
        _publishMembers(message.sequence);
      case 'member.joined':
        final member = RoomMember.fromJson(
          message.payload['member'] as Map<String, dynamic>,
        );
        _members = [
          ..._members.where((item) => item.userId != member.userId),
          member,
        ];
        _publishMembers(message.sequence);
      case 'member.left':
        final userId = message.payload['userId'] as String;
        _members = _members.where((member) => member.userId != userId).toList();
        _publishMembers(message.sequence);
      case 'member.location':
        final userId = message.payload['userId'] as String;
        final location = RealtimeLocation.fromJson(
          message.payload['location'] as Map<String, dynamic>,
        );
        _members = _members
            .map((member) => member.userId == userId
                ? _copyMember(
                    member,
                    location: location,
                    updatedAt: message.payload['receivedAt'] as int,
                  )
                : member)
            .toList(growable: false);
        _publishMembers(message.sequence);
      case 'member.presence':
        final userId = message.payload['userId'] as String;
        _members = _members
            .map((member) => member.userId == userId
                ? _copyMember(
                    member,
                    presence: PresenceStatus.values
                        .byName(message.payload['presence'] as String),
                    sharingLocation: message.payload['sharingLocation'] as bool,
                    locationSharingLevel: LocationSharingLevel.values.byName(
                      message.payload['locationSharingLevel'] as String,
                    ),
                    updatedAt: message.payload['updatedAt'] as int,
                  )
                : member)
            .toList(growable: false);
        _publishMembers(message.sequence);
      case 'pin.created':
      case 'pin.updated':
        final pin =
            Pin.fromJson(message.payload['pin'] as Map<String, dynamic>);
        _pins = [..._pins.where((item) => item.id != pin.id), pin];
        stateController.setPins(_pins);
      case 'pin.deleted':
        final pinId = message.payload['pinId'] as String;
        _pins = _pins.where((pin) => pin.id != pinId).toList(growable: false);
        stateController.setPins(_pins);
      case 'room.error':
        stateController.setError(message.payload['message'] as String);
    }
  }

  void _publishMembers(int sequence) {
    final roomId = _roomId;
    if (roomId == null) return;
    stateController.setRoomSnapshot(
      RoomSnapshot(roomId: roomId, members: _members, sequence: sequence),
    );
  }

  RoomMember _copyMember(
    RoomMember member, {
    PresenceStatus? presence,
    bool? sharingLocation,
    LocationSharingLevel? locationSharingLevel,
    int? updatedAt,
    RealtimeLocation? location,
  }) =>
      RoomMember(
        userId: member.userId,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
        presence: presence ?? member.presence,
        sharingLocation: sharingLocation ?? member.sharingLocation,
        locationSharingLevel:
            locationSharingLevel ?? member.locationSharingLevel,
        connectionStatus: member.connectionStatus,
        joinedAt: member.joinedAt,
        updatedAt: updatedAt ?? member.updatedAt,
        location: location ?? member.location,
      );

  Future<void> close() async {
    if (_sharingLevel != LocationSharingLevel.hidden) {
      repository.updatePresence(sharingLevel: LocationSharingLevel.hidden);
      _sharingLevel = LocationSharingLevel.hidden;
      stateController.setLocationSharingLevel(LocationSharingLevel.hidden);
    }
    await _subscription?.cancel();
    await repository.close();
  }
}
