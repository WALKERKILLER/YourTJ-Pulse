import 'dart:async';
import 'dart:convert';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

class ClientTelemetry {
  ClientTelemetry._();

  static final Uri _endpoint = Uri.parse(const String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8787',
  )).resolve('/api/telemetry');
  static DateTime? _lastJankReportAt;

  static void report(String event,
      {String result = 'error', Duration? duration}) {
    final body = <String, Object>{
      'event': event,
      'result': result,
      if (duration != null)
        'durationMs': duration.inMicroseconds / Duration.microsecondsPerMillisecond,
    };
    unawaited(http
        .post(
          _endpoint,
          headers: const {'content-type': 'application/json'},
          body: jsonEncode(body),
        )
        .timeout(const Duration(seconds: 3))
        .onError((_, __) => http.Response('', 599)));
  }

  static void reportFlutterError(FlutterErrorDetails _) {
    report('flutter.error');
  }

  static void reportFrameTimings(List<FrameTiming> timings) {
    for (final timing in timings) {
      if (timing.totalSpan > const Duration(milliseconds: 50)) {
        final now = DateTime.now();
        final previous = _lastJankReportAt;
        if (previous != null &&
            now.difference(previous) < const Duration(seconds: 30)) {
          continue;
        }
        _lastJankReportAt = now;
        report('flutter.jank', result: 'recovered', duration: timing.totalSpan);
      }
    }
  }
}
