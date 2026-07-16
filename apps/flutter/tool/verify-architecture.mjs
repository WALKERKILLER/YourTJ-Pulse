import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const requiredFiles = [
  'pubspec.yaml',
  'lib/main.dart',
  'lib/bootstrap/campus_bootstrap.dart',
  'lib/features/campus_mode/campus_mode_shell.dart',
  'lib/features/map/campus_map_page.dart',
  'lib/features/map/campus_map_state.dart',
  'lib/features/map/contracts/contracts.dart',
  'lib/features/map/contracts/campus_models.dart',
  'lib/features/map/contracts/realtime_models.dart',
  'lib/features/map/contracts/twin_models.dart',
  'lib/features/map/repositories/realtime_room_repository.dart',
  'lib/features/map/repositories/campus_style_repository.dart',
  'lib/features/map/repositories/room_session_controller.dart',
  'lib/features/permissions/mobile_runtime_policy.dart',
  'lib/features/pulse_town/pulse_town_page.dart',
  'lib/features/pulse_town/game/pulse_town_game.dart',
  'lib/features/pulse_town/game/world/campus_world.dart',
  'lib/features/pulse_town/game/avatar/campus_avatar.dart',
  'lib/features/pulse_town/game/navigation/route_projector.dart',
  'lib/features/pulse_town/game/weather/weather_system.dart',
  'lib/features/pulse_town/game/systems/render_budget_system.dart',
  'android/app/src/main/AndroidManifest.xml',
  'ios/Runner/Info.plist',
];

const contents = new Map();
for (const relativePath of requiredFiles) {
  contents.set(relativePath, await readFile(resolve(root, relativePath), 'utf8'));
}

const assertions = [
  ['pubspec.yaml', /maplibre_gl:/, 'MapLibre 依赖'],
  ['pubspec.yaml', /flame_tiled:/, 'Flame Tiled 依赖'],
  ['pubspec.yaml', /flutter_riverpod:/, 'Riverpod 依赖'],
  ['pubspec.yaml', /web_socket_channel:/, 'WebSocket 依赖'],
  ['lib/features/campus_mode/campus_mode_shell.dart', /IndexedStack\(/, '双模式 IndexedStack'],
  ['lib/bootstrap/campus_bootstrap.dart', /loadPlaces\(\)/, '地点 API 接入'],
  ['lib/bootstrap/campus_bootstrap.dart', /RoomSessionController\(/, '房间 WSS 接入'],
  ['lib/bootstrap/campus_bootstrap.dart', /loadTwinPlans\(\)/, 'Twin plan 接入'],
  ['lib/bootstrap/campus_bootstrap.dart', /Timer\.periodic/, '跨模式时钟同步'],
  ['lib/features/map/campus_map_page.dart', /MapLibreMap\(/, 'MapLibre 地图'],
  ['lib/features/map/campus_map_page.dart', /RoomMember/, '好友位置标注'],
  ['lib/features/map/campus_map_page.dart', /state\.pins/, '协作点标注'],
  ['lib/features/map/campus_map_page.dart', /activeRoute/, '路线标注'],
  ['lib/features/map/campus_map_page.dart', /onSymbolTapped/, '地图标注交互'],
  ['lib/features/map/campus_map_page.dart', /findRoutes\(/, '移动端路线请求'],
  ['lib/features/map/repositories/campus_style_repository.dart', /tiles.*tileTemplate/s, 'Native 矢量瓦片模板'],
  ['lib/features/map/repositories/campus_style_repository.dart', /\/tiles\/campus\//, '同源 PMTiles 解包端点'],
  ['lib/features/pulse_town/pulse_town_page.dart', /GameWidget<PulseTownGame>/, 'Flame GameWidget'],
  ['lib/features/pulse_town/game/world/campus_world.dart', /useAtlas: true/, 'Sprite Atlas 策略'],
  ['lib/features/pulse_town/game/systems/render_budget_system.dart', /distantActorUpdateInterval/, '远处角色降频'],
  ['lib/features/pulse_town/game/systems/render_budget_system.dart', /isVisible/, '屏幕外剔除'],
  ['lib/features/map/repositories/realtime_room_repository.dart', /now - _lastLocationSentAt < 1000/, '网络消息限频'],
  ['lib/features/map/repositories/room_session_controller.dart', /synchronizeClock\(message\.sentAt\)/, 'WSS 服务端时钟校准'],
  ['lib/features/permissions/mobile_runtime_policy.dart', /Permission\.locationWhenInUse/, '仅前台定位'],
  ['android/app/src/main/AndroidManifest.xml', /ACCESS_COARSE_LOCATION/, 'Android 模糊定位声明'],
  ['android/app/src/main/AndroidManifest.xml', /ACCESS_FINE_LOCATION/, 'Android 精确定位声明'],
  ['ios/Runner/Info.plist', /NSLocationWhenInUseUsageDescription/, 'iOS 前台定位声明'],
  ['lib/features/map/contracts/realtime_models.dart', /typedef LocationUpdate = RealtimeLocation;/, 'LocationUpdate 合同'],
  ['lib/features/map/contracts/realtime_models.dart', /class RoomSnapshot/, 'RoomSnapshot 合同'],
  ['lib/features/map/contracts/realtime_models.dart', /class RoomMember/, 'RoomMember 合同'],
  ['lib/features/map/contracts/campus_models.dart', /class CampusPlace/, 'CampusPlace 合同'],
  ['lib/features/map/contracts/campus_models.dart', /class NavigationRoute/, 'NavigationRoute 合同'],
  ['lib/features/map/contracts/campus_models.dart', /class Pin/, 'Pin 合同'],
  ['lib/features/map/contracts/twin_models.dart', /class TwinEvent/, 'TwinEvent 合同'],
  ['lib/features/map/contracts/twin_models.dart', /class TwinMovementPlan/, 'TwinMovementPlan 合同'],
];

for (const [file, pattern, label] of assertions) {
  if (!pattern.test(contents.get(file))) throw new Error(`Flutter architecture check failed: ${label} (${file})`);
}

const dartSource = [...contents.entries()].filter(([file]) => file.endsWith('.dart')).map(([, content]) => content).join('\n');
for (const forbidden of ['Permission.locationAlways', 'ForegroundNotificationConfig', 'getPositionStream(', 'enableBackgroundMode']) {
  if (dartSource.includes(forbidden)) throw new Error(`Continuous background location is forbidden in v1: ${forbidden}`);
}

const platformPermissions = `${contents.get('android/app/src/main/AndroidManifest.xml')}\n${contents.get('ios/Runner/Info.plist')}`;
for (const forbidden of ['ACCESS_BACKGROUND_LOCATION', 'NSLocationAlwaysUsageDescription', 'NSLocationAlwaysAndWhenInUseUsageDescription']) {
  if (platformPermissions.includes(forbidden)) throw new Error(`Background location permission is forbidden in v1: ${forbidden}`);
}

process.stdout.write(`Flutter architecture verified: ${requiredFiles.length} files, ${assertions.length} invariants.\n`);
