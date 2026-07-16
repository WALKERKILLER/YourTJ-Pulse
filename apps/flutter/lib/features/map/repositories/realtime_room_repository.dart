import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';

import '../contracts/contracts.dart';

class RealtimeRoomRepository {
  RealtimeRoomRepository({required this.roomUri, required this.sessionToken});

  final Uri roomUri;
  final String sessionToken;
  WebSocketChannel? _channel;
  int _sequence = 0;
  int _lastLocationSentAt = 0;

  Stream<ServerMessage> connect() {
    final token =
        base64Url.encode(utf8.encode(sessionToken)).replaceAll('=', '');
    final protocols = <String>['yourtj.realtime.v1'];
    if (sessionToken.isNotEmpty) protocols.add('yourtj.auth.$token');
    final channel = WebSocketChannel.connect(
      roomUri,
      protocols: protocols,
    );
    _channel = channel;
    return channel.stream.map((event) => ServerMessage.fromJson(
        jsonDecode(event as String) as Map<String, dynamic>));
  }

  void join({required String requestId}) => _send(ClientMessage(
        type: 'room.join',
        requestId: requestId,
        sentAt: DateTime.now().millisecondsSinceEpoch,
        payload: {'lastSequence': _sequence, 'presence': 'available'},
      ));

  void updateLocation(LocationUpdate location, {required bool sharingEnabled}) {
    final now = DateTime.now().millisecondsSinceEpoch;
    if (!sharingEnabled ||
        location.kind != 'gps' ||
        now - _lastLocationSentAt < 1000) {
      return;
    }
    _lastLocationSentAt = now;
    _send(ClientMessage(
        type: 'location.update',
        requestId: 'location-${location.seq}',
        sentAt: now,
        payload: location.toJson()));
  }

  void updatePresence({required bool sharingEnabled}) => _send(ClientMessage(
        type: 'presence.update',
        requestId: 'presence-${DateTime.now().microsecondsSinceEpoch}',
        sentAt: DateTime.now().millisecondsSinceEpoch,
        payload: {'status': 'available', 'sharingLocation': sharingEnabled},
      ));

  void accept(ServerMessage message) {
    if (message.sequence > _sequence) _sequence = message.sequence;
  }

  void _send(ClientMessage message) =>
      _channel?.sink.add(jsonEncode(message.toJson()));

  Future<void> close() async {
    await _channel?.sink.close();
    _channel = null;
  }
}
