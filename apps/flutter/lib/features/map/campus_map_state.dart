import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'contracts/contracts.dart';

enum CampusMode { map, pulseTown }

const _unset = Object();

class CampusMapState {
  const CampusMapState({
    required this.mode,
    required this.now,
    required this.center,
    required this.isDark,
    required this.isOnline,
    required this.lowPower,
    required this.locationSharingEnabled,
    required this.locationSharingLevel,
    this.currentUserId,
    this.roomId,
    this.destination,
    this.twinPlan,
    this.selectedPlace,
    this.currentLocation,
    this.activeRoute,
    this.roomSnapshot,
    this.places = const [],
    this.pins = const [],
    this.errorMessage,
  });

  factory CampusMapState.initial() => CampusMapState(
        mode: CampusMode.map,
        now: DateTime.now(),
        center: const CampusCoordinate(longitude: 121.5012, latitude: 31.2825),
        isDark: false,
        isOnline: true,
        lowPower: false,
        locationSharingEnabled: false,
        locationSharingLevel: LocationSharingLevel.hidden,
      );

  final CampusMode mode;
  final DateTime now;
  final CampusCoordinate center;
  final bool isDark;
  final bool isOnline;
  final bool lowPower;
  final bool locationSharingEnabled;
  final LocationSharingLevel locationSharingLevel;
  final String? currentUserId;
  final String? roomId;
  final CampusPlace? destination;
  final TwinMovementPlan? twinPlan;
  final CampusPlace? selectedPlace;
  final LocationUpdate? currentLocation;
  final NavigationRoute? activeRoute;
  final RoomSnapshot? roomSnapshot;
  final List<CampusPlace> places;
  final List<Pin> pins;
  final String? errorMessage;

  CampusMapState copyWith({
    CampusMode? mode,
    DateTime? now,
    CampusCoordinate? center,
    bool? isDark,
    bool? isOnline,
    bool? lowPower,
    bool? locationSharingEnabled,
    LocationSharingLevel? locationSharingLevel,
    Object? currentUserId = _unset,
    Object? roomId = _unset,
    Object? destination = _unset,
    Object? twinPlan = _unset,
    Object? selectedPlace = _unset,
    Object? currentLocation = _unset,
    Object? activeRoute = _unset,
    Object? roomSnapshot = _unset,
    List<CampusPlace>? places,
    List<Pin>? pins,
    Object? errorMessage = _unset,
  }) =>
      CampusMapState(
        mode: mode ?? this.mode,
        now: now ?? this.now,
        center: center ?? this.center,
        isDark: isDark ?? this.isDark,
        isOnline: isOnline ?? this.isOnline,
        lowPower: lowPower ?? this.lowPower,
        locationSharingEnabled:
            locationSharingEnabled ?? this.locationSharingEnabled,
        locationSharingLevel:
            locationSharingLevel ?? this.locationSharingLevel,
        currentUserId: identical(currentUserId, _unset)
            ? this.currentUserId
            : currentUserId as String?,
        roomId: identical(roomId, _unset) ? this.roomId : roomId as String?,
        destination: identical(destination, _unset)
            ? this.destination
            : destination as CampusPlace?,
        twinPlan: identical(twinPlan, _unset)
            ? this.twinPlan
            : twinPlan as TwinMovementPlan?,
        selectedPlace: identical(selectedPlace, _unset)
            ? this.selectedPlace
            : selectedPlace as CampusPlace?,
        currentLocation: identical(currentLocation, _unset)
            ? this.currentLocation
            : currentLocation as LocationUpdate?,
        activeRoute: identical(activeRoute, _unset)
            ? this.activeRoute
            : activeRoute as NavigationRoute?,
        roomSnapshot: identical(roomSnapshot, _unset)
            ? this.roomSnapshot
            : roomSnapshot as RoomSnapshot?,
        places: places ?? this.places,
        pins: pins ?? this.pins,
        errorMessage: identical(errorMessage, _unset)
            ? this.errorMessage
            : errorMessage as String?,
      );
}

final campusMapControllerProvider =
    NotifierProvider<CampusMapController, CampusMapState>(
        CampusMapController.new);

class CampusMapController extends Notifier<CampusMapState> {
  int _serverClockOffsetMilliseconds = 0;

  @override
  CampusMapState build() => CampusMapState.initial();

  void setMode(CampusMode mode) => state = state.copyWith(mode: mode);
  void setIdentity({required String userId, String? roomId}) =>
      state = state.copyWith(currentUserId: userId, roomId: roomId);
  void setCenter(CampusCoordinate center) =>
      state = state.copyWith(center: center);
  void setDestination(CampusPlace? destination, NavigationRoute? route) =>
      state = state.copyWith(destination: destination, activeRoute: route);
  void selectPlace(CampusPlace? place) =>
      state = state.copyWith(selectedPlace: place);
  void setTwinPlan(TwinMovementPlan? plan) =>
      state = state.copyWith(twinPlan: plan);
  void setRoomSnapshot(RoomSnapshot snapshot) =>
      state = state.copyWith(roomSnapshot: snapshot, roomId: snapshot.roomId);
  void setLocation(LocationUpdate location) => state = state.copyWith(
        currentLocation: location,
        center: CampusCoordinate(
            longitude: location.longitude, latitude: location.latitude),
      );
  void setNetworkAvailable(bool available) => state = state.copyWith(
      isOnline: available, errorMessage: available ? null : '网络不可用，地图保留已加载内容');
  void setLowPower(bool enabled) => state = state.copyWith(lowPower: enabled);
  void setLocationSharingLevel(LocationSharingLevel level) =>
      state = state.copyWith(
        locationSharingEnabled: level != LocationSharingLevel.hidden,
        locationSharingLevel: level,
      );
  void setTheme(bool dark) => state = state.copyWith(isDark: dark);
  void setPlaces(List<CampusPlace> places) =>
      state = state.copyWith(places: places);
  void setPins(List<Pin> pins) => state = state.copyWith(pins: pins);
  void setError(String? message) =>
      state = state.copyWith(errorMessage: message);
  void synchronizeClock(int serverEpochMilliseconds, {DateTime? receivedAt}) {
    final localNow = (receivedAt ?? DateTime.now()).millisecondsSinceEpoch;
    final sample = serverEpochMilliseconds - localNow;
    _serverClockOffsetMilliseconds = _serverClockOffsetMilliseconds == 0
        ? sample
        : ((_serverClockOffsetMilliseconds * 3 + sample) / 4).round();
    tickFromLocalClock();
  }

  void tickFromLocalClock() => state = state.copyWith(
        now: DateTime.fromMillisecondsSinceEpoch(
          DateTime.now().millisecondsSinceEpoch +
              _serverClockOffsetMilliseconds,
        ),
      );
}
