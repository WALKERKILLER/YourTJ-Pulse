import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import '../features/campus_mode/campus_mode_shell.dart';
import '../features/map/campus_map_state.dart';
import '../features/map/contracts/contracts.dart';
import '../features/map/repositories/campus_api_repository.dart';
import '../features/map/repositories/realtime_room_repository.dart';
import '../features/map/repositories/room_session_controller.dart';

class CampusBootstrapConfig {
  const CampusBootstrapConfig({
    required this.apiBaseUri,
    required this.sessionToken,
    required this.userId,
    required this.roomId,
  });

  factory CampusBootstrapConfig.fromEnvironment() => CampusBootstrapConfig(
        apiBaseUri: Uri.parse(const String.fromEnvironment(
          'API_BASE_URL',
          defaultValue: 'http://localhost:8787',
        )),
        sessionToken: const String.fromEnvironment('SESSION_TOKEN'),
        userId: const String.fromEnvironment('USER_ID'),
        roomId: const String.fromEnvironment('ROOM_ID'),
      );

  final Uri apiBaseUri;
  final String sessionToken;
  final String userId;
  final String roomId;
}

class CampusBootstrap extends ConsumerStatefulWidget {
  const CampusBootstrap({super.key, required this.config});

  final CampusBootstrapConfig config;

  @override
  ConsumerState<CampusBootstrap> createState() => _CampusBootstrapState();
}

class _CampusBootstrapState extends ConsumerState<CampusBootstrap> {
  late final http.Client _httpClient;
  late final CampusApiRepository _apiRepository;
  RoomSessionController? _roomSession;
  Timer? _clock;
  Timer? _twinRefresh;

  @override
  void initState() {
    super.initState();
    _httpClient = http.Client();
    _apiRepository = CampusApiRepository(
      baseUri: widget.config.apiBaseUri,
      request: _requestJson,
    );
    _clock = Timer.periodic(
      const Duration(milliseconds: 250),
      (_) =>
          ref.read(campusMapControllerProvider.notifier).tickFromLocalClock(),
    );
    unawaited(_hydrate());
  }

  Future<Object?> _requestJson(String method, Uri uri, {Object? body}) async {
    final headers = <String, String>{'accept': 'application/json'};
    if (widget.config.sessionToken.isNotEmpty) {
      headers['authorization'] = 'Bearer ${widget.config.sessionToken}';
    }
    if (body != null) headers['content-type'] = 'application/json';
    final request = http.Request(method, uri)..headers.addAll(headers);
    if (body != null) request.body = jsonEncode(body);
    final streamed =
        await _httpClient.send(request).timeout(const Duration(seconds: 15));
    final response = await http.Response.fromStream(streamed);
    final payload = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final error = payload['error'] as Map<String, dynamic>?;
      throw StateError(
        error?['message'] as String? ?? 'HTTP ${response.statusCode}',
      );
    }
    return payload;
  }

  Future<void> _hydrate() async {
    final controller = ref.read(campusMapControllerProvider.notifier);
    try {
      final places = await _apiRepository.loadPlaces();
      controller.setPlaces(places);

      var userId = widget.config.userId;
      if (userId.isEmpty) userId = await _apiRepository.currentUserId();
      controller.setIdentity(
        userId: userId,
        roomId: widget.config.roomId.isEmpty ? null : widget.config.roomId,
      );

      if (widget.config.roomId.isNotEmpty) {
        await _apiRepository.joinRoom(widget.config.roomId);
        final pins =
            await _apiRepository.loadPins(roomId: widget.config.roomId);
        controller.setPins(pins);
        final websocketUri = widget.config.apiBaseUri.replace(
          scheme: widget.config.apiBaseUri.scheme == 'https' ? 'wss' : 'ws',
          path: '/api/realtime/rooms/${widget.config.roomId}',
          query: null,
          fragment: null,
        );
        final session = RoomSessionController(
          repository: RealtimeRoomRepository(
            roomUri: websocketUri,
            sessionToken: widget.config.sessionToken,
          ),
          stateController: controller,
          initialPins: pins,
        );
        await session.join(userId: userId, roomId: widget.config.roomId);
        if (mounted) setState(() => _roomSession = session);
      }

      await _refreshTwinPlan(places);
      _twinRefresh ??= Timer.periodic(
        const Duration(seconds: 30),
        (_) => unawaited(_refreshTwinPlan()),
      );
      controller.setError(null);
    } on Object catch (error) {
      controller.setError('移动端数据暂时无法同步：$error');
    }
  }

  Future<void> _refreshTwinPlan([List<CampusPlace>? loadedPlaces]) async {
    final controller = ref.read(campusMapControllerProvider.notifier);
    try {
      final places =
          loadedPlaces ?? ref.read(campusMapControllerProvider).places;
      final plans = await _apiRepository.loadTwinPlans();
      final activePlans =
          plans.where((plan) => plan.status == TwinPlanStatus.active);
      final plan = activePlans.isEmpty ? null : activePlans.first;
      if (plan == null) {
        controller.setTwinPlan(null);
        return;
      }
      final current = ref.read(campusMapControllerProvider).twinPlan;
      if (current?.id == plan.id && current?.updatedAt == plan.updatedAt) {
        return;
      }
      final destination = places
          .where((place) => place.id == plan.destinationPlaceId)
          .firstOrNull;
      final routes = await _apiRepository.findRoutesBetweenPlaces(
        originPlaceId: plan.originPlaceId,
        destinationPlaceId: plan.destinationPlaceId,
      );
      controller.setTwinPlan(plan);
      controller.setDestination(destination, routes.firstOrNull);
    } on Object catch (error) {
      controller.setError('数字分身计划暂时无法同步：$error');
    }
  }

  @override
  void dispose() {
    _clock?.cancel();
    _twinRefresh?.cancel();
    unawaited(_roomSession?.close());
    _httpClient.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => CampusModeShell(
        apiRepository: _apiRepository,
        roomSession: _roomSession,
      );
}
