import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yourtj_pulse_flutter/features/map/campus_map_state.dart';
import 'package:yourtj_pulse_flutter/features/map/contracts/contracts.dart';
import 'package:yourtj_pulse_flutter/features/map/repositories/realtime_room_repository.dart';
import 'package:yourtj_pulse_flutter/features/map/repositories/room_session_controller.dart';

class FakeRealtimeRoomRepository extends RealtimeRoomRepository {
  FakeRealtimeRoomRepository()
      : super(roomUri: Uri.parse('ws://localhost/room'), sessionToken: '');

  final messages = StreamController<ServerMessage>.broadcast();

  @override
  Stream<ServerMessage> connect() => messages.stream;

  @override
  void join({required String requestId}) {}

  @override
  void accept(ServerMessage message) {}

  @override
  void updatePresence({required bool sharingEnabled}) {}

  @override
  Future<void> close() => messages.close();
}

void main() {
  test('room snapshot and member locations flow into shared state', () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final realtime = FakeRealtimeRoomRepository();
    final session = RoomSessionController(
      repository: realtime,
      stateController: container.read(campusMapControllerProvider.notifier),
    );
    addTearDown(session.close);
    await session.join(userId: 'me', roomId: 'room-1');

    realtime.messages.add(ServerMessage(
      type: 'room.snapshot',
      eventId: 'event-1',
      sequence: 1,
      sentAt: 1000,
      payload: {
        'roomId': 'room-1',
        'members': [
          {
            'userId': 'friend',
            'displayName': 'Friend',
            'presence': 'available',
            'sharingLocation': true,
            'connectionStatus': 'live',
            'joinedAt': 900,
            'updatedAt': 1000,
          },
        ],
      },
    ));
    await Future<void>.delayed(Duration.zero);
    realtime.messages.add(ServerMessage(
      type: 'member.location',
      eventId: 'event-2',
      sequence: 2,
      sentAt: 1100,
      payload: {
        'userId': 'friend',
        'location': {
          'seq': 1,
          'longitude': 121.5,
          'latitude': 31.28,
          'accuracy': 20,
          'kind': 'gps',
        },
        'receivedAt': 1100,
      },
    ));
    await Future<void>.delayed(Duration.zero);

    final state = container.read(campusMapControllerProvider);
    expect(state.roomSnapshot?.sequence, 2);
    expect(state.roomSnapshot?.members.single.location?.longitude, 121.5);
  });
}
