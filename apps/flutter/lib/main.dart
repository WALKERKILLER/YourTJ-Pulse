import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'bootstrap/campus_bootstrap.dart';

void main() {
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
