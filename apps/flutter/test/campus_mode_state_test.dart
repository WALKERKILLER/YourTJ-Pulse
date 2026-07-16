import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yourtj_pulse_flutter/features/map/campus_map_state.dart';
import 'package:yourtj_pulse_flutter/features/map/contracts/contracts.dart';

void main() {
  test('switching modes preserves the shared campus context', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final controller = container.read(campusMapControllerProvider.notifier);
    const place = CampusPlace(
      id: 'jiading-library',
      name: '嘉定图书馆',
      longitude: 121.214,
      latitude: 31.285,
      entranceNodeIds: ['entrance-1'],
    );

    controller.setIdentity(userId: 'user-1', roomId: 'room-1');
    controller.setDestination(place, null);
    controller.selectPlace(place);
    controller.setCenter(
        const CampusCoordinate(longitude: 121.214, latitude: 31.285));
    controller.setMode(CampusMode.pulseTown);
    controller.setMode(CampusMode.map);

    final state = container.read(campusMapControllerProvider);
    expect(state.mode, CampusMode.map);
    expect(state.currentUserId, 'user-1');
    expect(state.roomId, 'room-1');
    expect(state.destination?.id, place.id);
    expect(state.selectedPlace?.id, place.id);
    expect(state.center.longitude, place.longitude);
  });

  test('location sharing is opt-in and GPS updates recenter both modes', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final controller = container.read(campusMapControllerProvider.notifier);

    expect(container.read(campusMapControllerProvider).locationSharingEnabled,
        isFalse);
    controller.setLocation(const LocationUpdate(
        seq: 1, longitude: 121.5, latitude: 31.28, accuracy: 16));

    final state = container.read(campusMapControllerProvider);
    expect(state.locationSharingEnabled, isFalse);
    expect(state.center.longitude, 121.5);
    expect(state.currentLocation?.kind, 'gps');
  });

  test('server timestamps calibrate the shared Twin clock', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final controller = container.read(campusMapControllerProvider.notifier);
    final receivedAt = DateTime.now();

    controller.synchronizeClock(
      receivedAt.millisecondsSinceEpoch + 5000,
      receivedAt: receivedAt,
    );

    final delta = container
        .read(campusMapControllerProvider)
        .now
        .difference(DateTime.now())
        .inMilliseconds;
    expect(delta, inInclusiveRange(4800, 5000));
  });
}
