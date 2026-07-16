# YourTJ Pulse Flutter

YourTJ Pulse 的 MapLibre 地图与 Flame PulseTown 双模式移动端。共享合同由仓库根目录的 `pnpm contracts:generate` 生成，请勿手工编辑 `lib/features/map/contracts/`。

## 本地配置

使用 Linux 原生 Flutter SDK：

```bash
/root/dev/flutter/bin/flutter pub get
/root/dev/flutter/bin/flutter analyze
/root/dev/flutter/bin/flutter test
```

宿主运行时通过 `--dart-define` 注入：

- `API_BASE_URL`：Worker 同源地址，开发默认 `http://localhost:8787`；
- `SESSION_TOKEN`：仅驻留进程内的 Bearer Session；
- `USER_ID`：可选，留空时读取 `/api/me`；
- `ROOM_ID`：可选，设置后自动加入房间并连接 WSS。

平台只声明前台精确/模糊定位。首版不声明、申请或运行后台定位。完整边界见 `docs/flutter-integration.md`。
