# Flutter 集成

`apps/flutter` 是 YourTJ Pulse 的移动端集成边界。它复用 Worker API、WSS 协议、PMTiles、导航数据与数字分身计划，不复用 Web 的 React/Mapcn 组件。

## 结构与状态

- `CampusModeShell` 通过 `IndexedStack` 切换地图和 PulseTown；非活动模式返回空占位，避免 MapLibre 与 Flame 同时复杂渲染。
- `CampusMapState` 是跨模式唯一共享状态，包含当前用户、房间、目的地、分身计划、选择地点、时间与中心区域。
- `RoomSessionController` 负责加入房间和离散消息；位置更新最多每秒一次，游戏帧不触发网络消息。客户端用 WSS `sentAt` 平滑校准本地时钟，Twin plan 每 30 秒检查一次变更。
- `packages/contracts` 生成 `lib/features/map/contracts/`，CI 会拒绝手工漂移。

宿主通过 `--dart-define` 注入 `API_BASE_URL`、`SESSION_TOKEN`、可选的 `USER_ID` 与 `ROOM_ID`。启动协调器会加载地点、当前用户、Pin 和 Twin plan；指定房间时先调用 REST join，再连接同源 WSS。令牌只保留在进程内，不写入日志或仓库。

## 地图与离线

Native MapLibre 使用标准同源模板 `/tiles/campus/{z}/{x}/{y}.pbf`。Worker 对 R2 中的 `tongji.pmtiles` 做按需 Range 读取和 MVT 解包，因此移动端无需注册 Web 专用的 `pmtiles://` protocol。加载失败时保留已有缓存和离线提示，不回退到第三方地图或用户位置服务。

## 移动端权限清单

首版只在用户点击定位按钮后申请前台定位，不持续监听，也不申请后台定位。

- Android Manifest：声明 `ACCESS_COARSE_LOCATION` 与 `ACCESS_FINE_LOCATION`，不要声明 `ACCESS_BACKGROUND_LOCATION`。系统只给模糊定位时仍可浏览与低精度导航。
- iOS Info.plist：只配置 `NSLocationWhenInUseUsageDescription`，不配置 Always 定位。文案需说明定位用于当前点、校园导航和用户主动开启的房间共享。
- 永久拒绝时只提供打开 App 设置的入口；普通拒绝不循环弹窗。
- App 进入后台后不读取 GPS；省电模式降低定位精度和 PulseTown 画质；网络切换由 `MobileRuntimePolicy` 广播。

## 验证边界

仓库 CI 执行 `pnpm contracts:check`、`pnpm flutter:check`、`flutter analyze` 与 `flutter test`，验证生成合同、双渲染器隔离、前台权限、状态同步和性能不变量。M9 不生成 Android/iOS 平台壳、不执行移动端 App 编译；真机权限、平台 Manifest 和帧率矩阵留给 M10 的设备验收。
