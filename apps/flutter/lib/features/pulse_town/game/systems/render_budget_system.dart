import 'package:flame/components.dart';

class RenderBudgetSystem extends Component {
  RenderBudgetSystem({required this.lowQuality});

  final bool lowQuality;
  double _elapsed = 0;

  double get distantActorUpdateInterval => lowQuality ? 0.5 : 0.2;
  int get maximumVisibleActors => lowQuality ? 24 : 64;

  bool shouldUpdateDistantActor(double dt) {
    _elapsed += dt;
    if (_elapsed < distantActorUpdateInterval) return false;
    _elapsed = 0;
    return true;
  }

  bool isVisible(Vector2 position, Vector2 cameraCenter, Vector2 viewport) {
    final margin = lowQuality ? 48.0 : 96.0;
    return (position.x - cameraCenter.x).abs() <= viewport.x / 2 + margin &&
        (position.y - cameraCenter.y).abs() <= viewport.y / 2 + margin;
  }
}
