import 'package:flame/game.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../map/campus_map_state.dart';
import 'game/pulse_town_game.dart';
import 'widgets/pulse_town_hud.dart';

class PulseTownPage extends ConsumerStatefulWidget {
  const PulseTownPage(
      {super.key, required this.active, required this.lowQuality});

  final bool active;
  final bool lowQuality;

  @override
  ConsumerState<PulseTownPage> createState() => _PulseTownPageState();
}

class _PulseTownPageState extends ConsumerState<PulseTownPage> {
  late PulseTownGame _game;

  @override
  void initState() {
    super.initState();
    _game = PulseTownGame(lowQuality: widget.lowQuality);
  }

  @override
  void didUpdateWidget(PulseTownPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.lowQuality != widget.lowQuality) {
      _game.pauseEngine();
      _game = PulseTownGame(lowQuality: widget.lowQuality);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(campusMapControllerProvider);
    ref.listen(
        campusMapControllerProvider, (_, next) => _game.applySharedState(next));
    if (!widget.active) return const ColoredBox(color: Colors.transparent);
    _game.applySharedState(state);
    return GameWidget<PulseTownGame>(
      key: ValueKey(widget.lowQuality),
      game: _game,
      initialActiveOverlays: const ['hud'],
      overlayBuilderMap: {
        'hud': (context, game) => PulseTownHud(state: state),
        'placeDetail': (context, game) {
          final place = state.selectedPlace;
          return place == null
              ? const SizedBox.shrink()
              : Align(
                  alignment: Alignment.bottomCenter,
                  child: Card(
                      child: ListTile(
                          title: Text(place.name),
                          subtitle: Text(place.description ?? '校园地点'))));
        },
      },
      errorBuilder: (context, error) =>
          Center(child: Text('PulseTown 暂时无法加载：$error')),
      loadingBuilder: (context) =>
          const Center(child: CircularProgressIndicator()),
    );
  }
}
