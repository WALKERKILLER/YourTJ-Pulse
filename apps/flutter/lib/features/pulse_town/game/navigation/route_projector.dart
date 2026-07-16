import '../../../map/contracts/contracts.dart';

class ScenePoint {
  const ScenePoint(this.x, this.y);
  final double x;
  final double y;
}

class RouteProjector {
  const RouteProjector({required this.origin, this.metersPerSceneUnit = 1.5});

  final CampusCoordinate origin;
  final double metersPerSceneUnit;

  ScenePoint project(CampusCoordinate coordinate) {
    const metersPerDegreeLatitude = 111320.0;
    final latitudeRadians = origin.latitude * 3.141592653589793 / 180;
    final metersPerDegreeLongitude =
        metersPerDegreeLatitude * _cos(latitudeRadians);
    return ScenePoint(
      (coordinate.longitude - origin.longitude) *
          metersPerDegreeLongitude /
          metersPerSceneUnit,
      -(coordinate.latitude - origin.latitude) *
          metersPerDegreeLatitude /
          metersPerSceneUnit,
    );
  }

  double _cos(double value) {
    final squared = value * value;
    return 1 -
        squared / 2 +
        squared * squared / 24 -
        squared * squared * squared / 720;
  }
}
