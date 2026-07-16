import 'package:flutter/material.dart';

import '../../map/campus_map_state.dart';

class PulseTownHud extends StatelessWidget {
  const PulseTownHud({super.key, required this.state});

  final CampusMapState state;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Align(
        alignment: Alignment.topLeft,
        child: Card(
          margin: const EdgeInsets.all(12),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Text(
                '${state.roomId == null ? '未加入房间' : '房间 ${state.roomId}'} · ${state.lowPower ? '省电画质' : '标准画质'}'),
          ),
        ),
      ),
    );
  }
}
