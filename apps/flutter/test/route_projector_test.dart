import 'package:flutter_test/flutter_test.dart';
import 'package:yourtj_pulse_flutter/features/map/contracts/contracts.dart';
import 'package:yourtj_pulse_flutter/features/pulse_town/game/navigation/route_projector.dart';

void main() {
  test('projects east and north consistently into scene coordinates', () {
    const origin = CampusCoordinate(longitude: 121.5, latitude: 31.28);
    const projector = RouteProjector(origin: origin, metersPerSceneUnit: 1);

    final east = projector
        .project(const CampusCoordinate(longitude: 121.501, latitude: 31.28));
    final north = projector
        .project(const CampusCoordinate(longitude: 121.5, latitude: 31.281));

    expect(east.x, greaterThan(90));
    expect(east.y.abs(), lessThan(0.01));
    expect(north.x.abs(), lessThan(0.01));
    expect(north.y, lessThan(-110));
  });
}
