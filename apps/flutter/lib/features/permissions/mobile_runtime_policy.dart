import 'dart:async';

import 'package:battery_plus/battery_plus.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/widgets.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';

enum LocationPrecision { precise, approximate, unavailable }

class ForegroundLocationDecision {
  const ForegroundLocationDecision(
      {required this.usable,
      required this.precision,
      required this.message,
      this.permanentlyDenied = false});

  final bool usable;
  final LocationPrecision precision;
  final String message;
  final bool permanentlyDenied;
}

class RuntimeConditions {
  const RuntimeConditions(
      {required this.online, required this.lowPower, required this.lifecycle});
  final bool online;
  final bool lowPower;
  final AppLifecycleState lifecycle;
}

class MobileRuntimePolicy with WidgetsBindingObserver {
  MobileRuntimePolicy() {
    WidgetsBinding.instance.addObserver(this);
    unawaited(_refreshConditions());
    _connectivitySubscription =
        Connectivity().onConnectivityChanged.listen(_updateConnectivity);
  }

  final Battery _battery = Battery();
  final StreamController<RuntimeConditions> _conditions =
      StreamController.broadcast();
  late final StreamSubscription<List<ConnectivityResult>>
      _connectivitySubscription;
  RuntimeConditions _current = const RuntimeConditions(
      online: true, lowPower: false, lifecycle: AppLifecycleState.resumed);

  Stream<RuntimeConditions> get conditions => _conditions.stream;
  RuntimeConditions get currentConditions => _current;

  Future<ForegroundLocationDecision> requestForegroundLocation() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      return const ForegroundLocationDecision(
          usable: false,
          precision: LocationPrecision.unavailable,
          message: '请先开启系统定位服务');
    }
    final status = await Permission.locationWhenInUse.request();
    if (status.isPermanentlyDenied) {
      return const ForegroundLocationDecision(
          usable: false,
          precision: LocationPrecision.unavailable,
          permanentlyDenied: true,
          message: '定位权限已永久拒绝，请到系统设置中开启“使用 App 时”定位');
    }
    if (!status.isGranted && !status.isLimited) {
      return const ForegroundLocationDecision(
          usable: false,
          precision: LocationPrecision.unavailable,
          message: '未获得定位权限，仍可浏览校园地图');
    }
    final accuracy = await Geolocator.getLocationAccuracy();
    final precision = accuracy == LocationAccuracyStatus.precise
        ? LocationPrecision.precise
        : LocationPrecision.approximate;
    return ForegroundLocationDecision(
      usable: true,
      precision: precision,
      message: precision == LocationPrecision.precise
          ? '已使用精确定位'
          : '正在使用模糊定位，导航精度可能降低',
    );
  }

  Future<Position?> currentPosition() async {
    if (_current.lifecycle != AppLifecycleState.resumed) return null;
    try {
      return await Geolocator.getCurrentPosition(
        locationSettings: LocationSettings(
          accuracy:
              _current.lowPower ? LocationAccuracy.low : LocationAccuracy.high,
          timeLimit: const Duration(seconds: 12),
        ),
      );
    } on TimeoutException {
      return null;
    } on PermissionDeniedException {
      return null;
    } on LocationServiceDisabledException {
      return null;
    }
  }

  Future<bool> openApplicationSettings() => openAppSettings();

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _emit(lifecycle: state);
  }

  Future<void> _refreshConditions() async {
    _updateConnectivity(await Connectivity().checkConnectivity());
    final lowPower = await _battery.isInBatterySaveMode;
    _emit(lowPower: lowPower);
  }

  void _updateConnectivity(List<ConnectivityResult> results) {
    _emit(online: results.any((result) => result != ConnectivityResult.none));
  }

  void _emit({bool? online, bool? lowPower, AppLifecycleState? lifecycle}) {
    _current = RuntimeConditions(
      online: online ?? _current.online,
      lowPower: lowPower ?? _current.lowPower,
      lifecycle: lifecycle ?? _current.lifecycle,
    );
    if (!_conditions.isClosed) _conditions.add(_current);
  }

  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_connectivitySubscription.cancel());
    unawaited(_conditions.close());
  }
}
