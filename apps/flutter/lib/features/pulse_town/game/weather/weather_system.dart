import 'dart:ui';

import 'package:flame/components.dart';

enum CampusWeather { clear, rain, fog }

class WeatherSystem extends Component {
  CampusWeather weather = CampusWeather.clear;
  double intensity = 0;

  void apply(CampusWeather next, {double nextIntensity = 0.5}) {
    weather = next;
    intensity = next == CampusWeather.clear ? 0 : nextIntensity.clamp(0, 1);
  }

  Color get ambientTint => switch (weather) {
        CampusWeather.clear => const Color(0x00000000),
        CampusWeather.rain =>
          Color.fromRGBO(40, 70, 110, 0.08 + intensity * 0.12),
        CampusWeather.fog =>
          Color.fromRGBO(220, 225, 225, 0.12 + intensity * 0.18),
      };
}
