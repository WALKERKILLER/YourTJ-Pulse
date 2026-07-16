import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

import '../permissions/mobile_runtime_policy.dart';
import 'campus_map_state.dart';
import 'contracts/contracts.dart';
import 'repositories/campus_api_repository.dart';
import 'repositories/campus_style_repository.dart';
import 'repositories/room_session_controller.dart';

class CampusMapPage extends ConsumerStatefulWidget {
  const CampusMapPage({
    super.key,
    required this.active,
    required this.apiRepository,
    this.roomSession,
  });

  final bool active;
  final CampusApiRepository apiRepository;
  final RoomSessionController? roomSession;

  @override
  ConsumerState<CampusMapPage> createState() => _CampusMapPageState();
}

class _CampusMapPageState extends ConsumerState<CampusMapPage> {
  late final CampusStyleRepository _styleRepository;
  final _runtimePolicy = MobileRuntimePolicy();
  MapLibreMapController? _mapController;
  bool _locationEnabled = false;
  List<Symbol> _symbols = const [];
  List<Line> _lines = const [];
  Map<String, CampusPlace> _placeBySymbolId = const {};
  Map<String, String> _detailBySymbolId = const {};

  @override
  void initState() {
    super.initState();
    _styleRepository =
        CampusStyleRepository(apiBaseUri: widget.apiRepository.baseUri);
  }

  @override
  void dispose() {
    _runtimePolicy.dispose();
    super.dispose();
  }

  Future<void> _enableLocation() async {
    final decision = await _runtimePolicy.requestForegroundLocation();
    if (!mounted) return;
    if (!decision.usable) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(decision.message),
        action: decision.permanentlyDenied
            ? SnackBarAction(
                label: '设置',
                onPressed: _runtimePolicy.openApplicationSettings,
              )
            : null,
      ));
      return;
    }
    setState(() => _locationEnabled = true);
    final position = await _runtimePolicy.currentPosition();
    if (position == null) return;
    final update = LocationUpdate(
      seq: DateTime.now().millisecondsSinceEpoch,
      longitude: position.longitude,
      latitude: position.latitude,
      accuracy: position.accuracy,
    );
    ref.read(campusMapControllerProvider.notifier).setLocation(update);
    widget.roomSession?.publishLocation(update);
  }

  Future<void> _navigateTo(CampusPlace place) async {
    final state = ref.read(campusMapControllerProvider);
    try {
      final routes = await widget.apiRepository.findRoutes(
        origin: state.currentLocation == null
            ? state.center
            : CampusCoordinate(
                longitude: state.currentLocation!.longitude,
                latitude: state.currentLocation!.latitude,
              ),
        destination: place,
      );
      ref
          .read(campusMapControllerProvider.notifier)
          .setDestination(place, routes.firstOrNull);
    } on Object catch (error) {
      ref.read(campusMapControllerProvider.notifier).setError('路线暂时不可用：$error');
    }
  }

  void _onMapCreated(MapLibreMapController controller) {
    _mapController = controller;
    controller.onSymbolTapped.add((symbol) {
      final place = _placeBySymbolId[symbol.id];
      if (place != null) {
        ref.read(campusMapControllerProvider.notifier).selectPlace(place);
        return;
      }
      final detail = _detailBySymbolId[symbol.id];
      if (detail != null && mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(detail)));
      }
    });
  }

  Future<void> _syncAnnotations(CampusMapState state) async {
    final controller = _mapController;
    if (controller == null || !widget.active) return;
    if (_symbols.isNotEmpty) await controller.removeSymbols(_symbols);
    if (_lines.isNotEmpty) await controller.removeLines(_lines);

    final visiblePlaces = state.places.take(80).toList(growable: false);
    final sharedMembers = (state.roomSnapshot?.members ?? const <RoomMember>[])
        .where((member) => member.sharingLocation && member.location != null)
        .toList(growable: false);
    final symbols = <SymbolOptions>[
      for (final place in visiblePlaces)
        SymbolOptions(
            geometry: LatLng(place.latitude, place.longitude),
            textField: place.name,
            textSize: 11,
            textOffset: const Offset(0, 1.2)),
      for (final member in sharedMembers)
        SymbolOptions(
            geometry:
                LatLng(member.location!.latitude, member.location!.longitude),
            textField: '● ${member.displayName}',
            textColor: '#2563eb'),
      for (final pin in state.pins)
        SymbolOptions(
            geometry: LatLng(pin.latitude, pin.longitude),
            textField: '◆ ${pin.title}',
            textColor: '#be123c'),
    ];
    _symbols =
        symbols.isEmpty ? const [] : await controller.addSymbols(symbols);
    _placeBySymbolId = {
      for (var index = 0; index < visiblePlaces.length; index++)
        _symbols[index].id: visiblePlaces[index],
    };
    _detailBySymbolId = {
      for (var index = 0; index < sharedMembers.length; index++)
        _symbols[visiblePlaces.length + index].id:
            '${sharedMembers[index].displayName} · ${sharedMembers[index].connectionStatus.name}',
      for (var index = 0; index < state.pins.length; index++)
        _symbols[visiblePlaces.length + sharedMembers.length + index].id:
            '${state.pins[index].title} · ${state.pins[index].status}',
    };
    final route = state.activeRoute;
    _lines = route == null
        ? const []
        : await controller.addLines([
            LineOptions(
              geometry: [
                for (final point in route.coordinates)
                  LatLng(point.latitude, point.longitude)
              ],
              lineColor: '#e11d48',
              lineWidth: 5,
              lineOpacity: 0.9,
            ),
          ]);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(campusMapControllerProvider);
    ref.listen(campusMapControllerProvider,
        (_, next) => unawaited(_syncAnnotations(next)));
    if (!widget.active) return const ColoredBox(color: Colors.transparent);
    return TickerMode(
      enabled: widget.active,
      child: Stack(
        children: [
          MapLibreMap(
            key: ValueKey(state.isDark),
            styleString: _styleRepository.style(dark: state.isDark),
            initialCameraPosition: CameraPosition(
                target: LatLng(state.center.latitude, state.center.longitude),
                zoom: 15.5),
            myLocationEnabled: _locationEnabled,
            myLocationTrackingMode: _locationEnabled
                ? MyLocationTrackingMode.tracking
                : MyLocationTrackingMode.none,
            compassEnabled: true,
            rotateGesturesEnabled: widget.active,
            scrollGesturesEnabled: widget.active,
            zoomGesturesEnabled: widget.active,
            onMapCreated: _onMapCreated,
            onStyleLoadedCallback: () => unawaited(_syncAnnotations(state)),
            onCameraMove: (position) =>
                ref.read(campusMapControllerProvider.notifier).setCenter(
                      CampusCoordinate(
                          longitude: position.target.longitude,
                          latitude: position.target.latitude),
                    ),
          ),
          if (state.places.isNotEmpty)
            Positioned(
              top: 12,
              left: 12,
              right: 12,
              child: SizedBox(
                height: 42,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: state.places.take(8).length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (context, index) {
                    final place = state.places[index];
                    return ActionChip(
                      label: Text(place.name),
                      onPressed: () => ref
                          .read(campusMapControllerProvider.notifier)
                          .selectPlace(place),
                    );
                  },
                ),
              ),
            ),
          if (!state.isOnline)
            const Positioned(
                top: 12,
                left: 12,
                right: 12,
                child: MaterialBanner(
                    content: Text('当前离线：显示已缓存地图，协作数据将在联网后恢复。'),
                    actions: [SizedBox.shrink()])),
          if (state.errorMessage case final message?)
            Positioned(
              top: state.isOnline ? 60 : 104,
              left: 12,
              right: 12,
              child: MaterialBanner(
                content: Text(message),
                actions: [
                  TextButton(
                    onPressed: () => ref
                        .read(campusMapControllerProvider.notifier)
                        .setError(null),
                    child: const Text('关闭'),
                  ),
                ],
              ),
            ),
          Positioned(
            right: 16,
            bottom: 24,
            child: Column(
              children: [
                FloatingActionButton.small(
                    heroTag: 'theme',
                    onPressed: () => ref
                        .read(campusMapControllerProvider.notifier)
                        .setTheme(!state.isDark),
                    child: Icon(
                        state.isDark ? Icons.light_mode : Icons.dark_mode)),
                const SizedBox(height: 10),
                FloatingActionButton.small(
                    heroTag: 'location',
                    onPressed: _enableLocation,
                    child: const Icon(Icons.my_location)),
                if (widget.roomSession != null) ...[
                  const SizedBox(height: 10),
                  FloatingActionButton.small(
                    heroTag: 'share-location',
                    onPressed: () {
                      final enabled = !state.locationSharingEnabled;
                      widget.roomSession!.setLocationSharing(enabled);
                    },
                    child: Icon(state.locationSharingEnabled
                        ? Icons.location_off
                        : Icons.share_location),
                  ),
                ],
              ],
            ),
          ),
          if (state.selectedPlace case final place?)
            Positioned(
              left: 16,
              right: 72,
              bottom: 16,
              child: Card(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ListTile(
                      title: Text(place.name),
                      subtitle:
                          Text(place.description ?? place.category ?? '校园地点'),
                      trailing: IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => ref
                            .read(campusMapControllerProvider.notifier)
                            .selectPlace(null),
                      ),
                    ),
                    OverflowBar(children: [
                      FilledButton.icon(
                        onPressed: () => _navigateTo(place),
                        icon: const Icon(Icons.directions),
                        label: const Text('导航'),
                      ),
                    ]),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
