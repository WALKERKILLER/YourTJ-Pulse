import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'bootstrap/campus_bootstrap.dart';
import 'observability/client_telemetry.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final previousFlutterError = FlutterError.onError;
  FlutterError.onError = (details) {
    ClientTelemetry.reportFlutterError(details);
    (previousFlutterError ?? FlutterError.presentError)(details);
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    ClientTelemetry.report('flutter.error');
    return false;
  };
  WidgetsBinding.instance.addTimingsCallback(ClientTelemetry.reportFrameTimings);
  runApp(const ProviderScope(child: YourTJPulseApp()));
}

class YourTJPulseApp extends StatelessWidget {
  const YourTJPulseApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'YourTJ Pulse',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
          colorSchemeSeed: const Color(0xff9f1239),
          brightness: Brightness.light),
      darkTheme: ThemeData(
          colorSchemeSeed: const Color(0xfffda4af),
          brightness: Brightness.dark),
      home: CampusBootstrap(config: CampusBootstrapConfig.fromEnvironment()),
    );
  }
}
