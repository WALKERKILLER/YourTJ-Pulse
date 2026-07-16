import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../map/campus_map_page.dart';
import '../map/campus_map_state.dart';
import '../map/repositories/campus_api_repository.dart';
import '../map/repositories/room_session_controller.dart';
import '../permissions/mobile_runtime_policy.dart';
import '../pulse_town/pulse_town_page.dart';

class CampusModeShell extends ConsumerStatefulWidget {
  const CampusModeShell({
    super.key,
    required this.apiRepository,
    this.roomSession,
  });

  final CampusApiRepository apiRepository;
  final RoomSessionController? roomSession;

  @override
  ConsumerState<CampusModeShell> createState() => _CampusModeShellState();
}

class _CampusModeShellState extends ConsumerState<CampusModeShell> {
  final MobileRuntimePolicy _runtimePolicy = MobileRuntimePolicy();
  StreamSubscription<RuntimeConditions>? _conditionsSubscription;

  @override
  void initState() {
    super.initState();
    _conditionsSubscription = _runtimePolicy.conditions.listen((conditions) {
      final controller = ref.read(campusMapControllerProvider.notifier);
      controller.setNetworkAvailable(conditions.online);
      controller.setLowPower(conditions.lowPower);
    });
  }

  @override
  void dispose() {
    unawaited(_conditionsSubscription?.cancel());
    _runtimePolicy.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(campusMapControllerProvider);
    final modeIndex = state.mode.index;
    return Scaffold(
      body: IndexedStack(
        index: modeIndex,
        children: [
          CampusMapPage(
            active: state.mode == CampusMode.map,
            apiRepository: widget.apiRepository,
            roomSession: widget.roomSession,
          ),
          PulseTownPage(
              active: state.mode == CampusMode.pulseTown,
              lowQuality: state.lowPower),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: modeIndex,
        onDestinationSelected: (index) => ref
            .read(campusMapControllerProvider.notifier)
            .setMode(CampusMode.values[index]),
        destinations: const [
          NavigationDestination(
              icon: Icon(Icons.map_outlined),
              selectedIcon: Icon(Icons.map),
              label: '地图'),
          NavigationDestination(
              icon: Icon(Icons.videogame_asset_outlined),
              selectedIcon: Icon(Icons.videogame_asset),
              label: 'PulseTown'),
        ],
      ),
    );
  }
}
