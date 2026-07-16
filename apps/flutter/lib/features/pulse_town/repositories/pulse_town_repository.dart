import '../../map/campus_map_state.dart';
import '../../map/contracts/contracts.dart';

class PulseTownRepository {
  const PulseTownRepository();

  CampusMapState reduceServerMessage(
      CampusMapState state, ServerMessage message) {
    switch (message.type) {
      case 'room.snapshot':
        return state.copyWith(
            roomSnapshot: RoomSnapshot.fromMessage({
          'sequence': message.sequence,
          'payload': message.payload,
        }));
      case 'member.location':
      case 'member.joined':
      case 'member.left':
      case 'member.presence':
        return state.copyWith(
            now: DateTime.fromMillisecondsSinceEpoch(message.sentAt));
      case 'pin.created':
      case 'pin.updated':
        final pin = Pin.fromJson(message.payload['pin'] as CampusJsonMap);
        return state.copyWith(
            pins: [...state.pins.where((item) => item.id != pin.id), pin]);
      case 'pin.deleted':
        return state.copyWith(
            pins: state.pins
                .where((item) => item.id != message.payload['pinId'])
                .toList(growable: false));
      default:
        return state;
    }
  }
}
