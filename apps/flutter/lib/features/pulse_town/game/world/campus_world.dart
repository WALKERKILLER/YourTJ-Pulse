import 'dart:ui';

import 'package:flame/components.dart';
import 'package:flame_tiled/flame_tiled.dart';

class CampusWorld extends World {
  CampusWorld({required this.lowQuality});

  final bool lowQuality;

  Future<TiledComponent> loadProductionTileMap(String assetName) =>
      TiledComponent.load(
        assetName,
        Vector2.all(16),
        useAtlas: true,
      );

  @override
  Future<void> onLoad() async {
    await add(_CampusGround(lowQuality: lowQuality));
  }
}

class _CampusGround extends PositionComponent {
  _CampusGround({required this.lowQuality}) : super(size: Vector2.all(2200));
  final bool lowQuality;

  @override
  void render(Canvas canvas) {
    canvas.drawRect(
        size.toRect(),
        Paint()
          ..color =
              lowQuality ? const Color(0xffd9e2cf) : const Color(0xffcbdcc1));
    final pathPaint = Paint()
      ..color = const Color(0xfff4efe6)
      ..strokeWidth = lowQuality ? 12 : 18;
    for (var offset = 120.0; offset < size.x; offset += 240) {
      canvas.drawLine(Offset(offset, 0), Offset(offset, size.y), pathPaint);
      canvas.drawLine(Offset(0, offset), Offset(size.x, offset), pathPaint);
    }
  }
}
