import 'dart:ui';

import 'package:flame/components.dart';

class CampusAvatar extends PositionComponent {
  CampusAvatar(
      {required this.label, required super.position, this.local = false})
      : super(size: Vector2.all(local ? 20 : 14), anchor: Anchor.center);

  final String label;
  final bool local;
  final Paint _bodyPaint = Paint();
  final Paint _outlinePaint = Paint()
    ..style = PaintingStyle.stroke
    ..strokeWidth = 2;

  @override
  void render(Canvas canvas) {
    _bodyPaint.color =
        local ? const Color(0xffe11d48) : const Color(0xff2563eb);
    _outlinePaint.color = const Color(0xffffffff);
    final center = Offset(size.x / 2, size.y / 2);
    canvas.drawCircle(center, size.x / 2, _bodyPaint);
    canvas.drawCircle(center, size.x / 2, _outlinePaint);
  }
}
