import 'package:flame/components.dart';
import 'package:flame/game.dart';

import '../../map/campus_map_state.dart';
import '../../map/contracts/contracts.dart';
import 'avatar/campus_avatar.dart';
import 'navigation/route_projector.dart';
import 'systems/render_budget_system.dart';
import 'weather/weather_system.dart';
import 'world/campus_world.dart';

class PulseTownGame extends FlameGame<CampusWorld> {
  PulseTownGame({required this.lowQuality})
      : super(world: CampusWorld(lowQuality: lowQuality));

  final bool lowQuality;
  late final CampusAvatar localAvatar;
  late final RenderBudgetSystem renderBudget;
  late final WeatherSystem weatherSystem;
  CampusMapState? _sharedState;
  final Map<String, CampusAvatar> _remoteAvatars = {};

  @override
  Future<void> onLoad() async {
    camera.viewfinder.anchor = Anchor.center;
    renderBudget = RenderBudgetSystem(lowQuality: lowQuality);
    weatherSystem = WeatherSystem();
    localAvatar =
        CampusAvatar(label: 'me', position: Vector2(600, 600), local: true);
    await world.addAll([renderBudget, weatherSystem, localAvatar]);
    camera.follow(localAvatar);
    final state = _sharedState;
    if (state != null) applySharedState(state);
  }

  void applySharedState(CampusMapState state) {
    _sharedState = state;
    if (!isLoaded) return;
    final coordinate = _coordinateFor(state);
    final projected = RouteProjector(origin: state.center).project(coordinate);
    localAvatar.position.setValues(600 + projected.x, 600 + projected.y);
    _syncRemoteAvatars(state);
  }

  void _syncRemoteAvatars(CampusMapState state) {
    final members = (state.roomSnapshot?.members ?? const <RoomMember>[])
        .where((member) =>
            member.userId != state.currentUserId &&
            member.sharingLocation &&
            member.location != null)
        .take(renderBudget.maximumVisibleActors)
        .toList(growable: false);
    final activeIds = members.map((member) => member.userId).toSet();
    for (final entry in _remoteAvatars.entries.toList()) {
      if (!activeIds.contains(entry.key)) {
        entry.value.removeFromParent();
        _remoteAvatars.remove(entry.key);
      }
    }

    final projector = RouteProjector(origin: state.center);
    for (final member in members) {
      final location = member.location!;
      final scene = projector.project(CampusCoordinate(
        longitude: location.longitude,
        latitude: location.latitude,
      ));
      final position = Vector2(600 + scene.x, 600 + scene.y);
      final visible = renderBudget.isVisible(
        position,
        localAvatar.position,
        size,
      );
      final existing = _remoteAvatars[member.userId];
      if (!visible) {
        existing?.removeFromParent();
        _remoteAvatars.remove(member.userId);
        continue;
      }
      final avatar = existing ??
          CampusAvatar(label: member.displayName, position: position.clone());
      avatar.position.setFrom(position);
      if (existing == null) {
        _remoteAvatars[member.userId] = avatar;
        world.add(avatar);
      }
    }
  }

  CampusCoordinate _coordinateFor(CampusMapState state) {
    final plan = state.twinPlan;
    final route = state.activeRoute;
    if (plan == null || route == null || route.coordinates.length < 2) {
      return state.currentLocation == null
          ? state.center
          : CampusCoordinate(
              longitude: state.currentLocation!.longitude,
              latitude: state.currentLocation!.latitude);
    }
    final denominator = plan.expectedArrivalAt - plan.startedAt;
    final progress = denominator <= 0
        ? 1.0
        : ((state.now.millisecondsSinceEpoch - plan.startedAt) / denominator)
            .clamp(0.0, 1.0);
    final scaled = progress * (route.coordinates.length - 1);
    final index = scaled.floor().clamp(0, route.coordinates.length - 2);
    final local = scaled - index;
    final start = route.coordinates[index];
    final end = route.coordinates[index + 1];
    return CampusCoordinate(
      longitude: start.longitude + (end.longitude - start.longitude) * local,
      latitude: start.latitude + (end.latitude - start.latitude) * local,
    );
  }

  @override
  void update(double dt) {
    super.update(dt);
    final state = _sharedState;
    if (state != null && renderBudget.shouldUpdateDistantActor(dt)) {
      applySharedState(state);
    }
  }
}
