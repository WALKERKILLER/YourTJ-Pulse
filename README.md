# YourTJ Pulse

![YourTJ Pulse 仓库 Logo](repo-logo.png)

YourTJ Pulse 是面向同济大学的实时协作地图与数字校园分身平台。项目从原 YTJ-Map 演进而来：基础地图继续使用 OpenStreetMap、MapLibre 与 PMTiles，应用层逐步扩展地点搜索、校园导航、多人房间和 PulseTown 数字校园模式。

当前处于工程与安全基线阶段。旧地图、编辑器和审核页仍保留，React Web、校园世界编译器与 Flutter 示例将按 `map-plan.md` 分阶段接入。

## 产品模式

- 地图模式：校园建筑与道路、POI、导航、实时位置共享和协作点位。
- PulseTown：与真实校园空间共享地点和路网数据的游戏化数字校园；模拟分身位置必须与 GPS 明确区分。

## 当前技术栈

- Worker：Cloudflare Workers、Hono、TypeScript、R2。
- 契约：Zod、共享 TypeScript Schema、统一 API 响应。
- 旧版地图：MapLibre GL、PMTiles、原生 HTML/CSS/JavaScript。
- 工程：pnpm Workspace、Vitest、ESLint、GitHub Actions。

## 项目结构

```text
apps/worker/                # 模块化 Cloudflare Worker
  src/auth/                 # Bearer 身份认证与角色授权
  src/routes/               # Tiles、地点和审核路由
  src/repositories/         # R2 数据访问
packages/contracts/         # API、GeoJSON 与实时协议 Schema
packages/data-pipeline/     # 数据校验和后续世界编译入口
public/                     # 迁移期保留的旧地图、编辑器和管理页
data/                       # OSM/GeoJSON 数据与旧构建脚本
.github/                    # CI、Issue 与 PR 模板
```

## 本地开发

要求：Node.js 22、pnpm 10.33、Wrangler 4、osmium、tippecanoe。仓库提供 `.mise.toml`，首次使用时请自行检查内容后运行 `mise trust`。

```bash
corepack enable
pnpm install
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
pnpm dev
```

`.dev.vars` 中的 Token 必须替换为本地随机值，且不得提交。管理页会在打开时请求 Access Token，并只保存在当前页面内存中。

提交前执行完整本地门禁：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm data:validate
```

## 数据构建

`pnpm data:validate` 会检查当前全量 GeoJSON 和旧地图主数据的结构、坐标范围与重复 ID。`pnpm data:build` 目前执行同一基线校验；后续 TASK-200～206 会在该入口加入稳定地点 ID、导航图、场景、碰撞数据、PMTiles、manifest 与 checksum。

地图与游戏世界必须使用同一地点 ID。正式地图 Feature、临时协作 Pin 与模拟分身位置不得混用。

## API 端点

| 路径 | 方法 | 说明 |
|------|------|------|
| `/tiles/*` | GET | R2 代理 — PMTiles 瓦片请求 |
| `/api/custom-data` | GET | 获取主库 GeoJSON |
| `/api/submit` | POST | 提交编辑（feature → 待审核） |
| `/api/admin/submissions` | GET | 列出待审核提交（moderator/admin） |
| `/api/admin/submissions/:id` | GET | 获取提交详情（moderator/admin） |
| `/api/admin/submissions/:id/apply` | POST | 应用提交（moderator/admin） |
| `/api/admin/submissions/:id/reject` | POST | 拒绝提交（moderator/admin） |

所有 API 错误使用 `{ "error": { "code", "message", "details" } }`。新管理 API 的成功响应使用 `{ "data": ... }`；旧 `/api/submit` 与 `/api/submissions*` 在迁移期保留原成功响应形状，但审核路径同样要求 Bearer Token 和角色授权。

## 编辑与审核流程

1. 用户在旧编辑器中提交经过共享 Schema 校验的 GeoJSON Feature。
2. Worker 将提交写入 R2 审核队列；非法坐标、超量要素和超大请求会在写入前拒绝。
3. 审核员使用 Bearer Token 访问管理 API；未登录返回 401，角色不足返回 403。
4. 应用或拒绝结果会记录审核者、审核时间和可选说明。

## 安全与隐私

- 仓库不含默认管理员密钥，不接受 URL Query Token 或明文 Cookie Token。
- 跨域只允许同源或 `CORS_ORIGINS` 明确列出的来源。
- 不提交 `.env`、`.dev.vars`、Cookie、Access Token 或真实位置数据。
- 第一版默认不共享位置、不保存永久 GPS 轨迹，并始终区分 GPS 与模拟分身。

贡献方式见 `CONTRIBUTING.md`，漏洞报告方式见 `SECURITY.md`，完整实施顺序见 `map-plan.md`（规划文件当前位于仓库工作目录上层）。
