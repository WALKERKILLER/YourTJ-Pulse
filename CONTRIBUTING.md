# 参与 YourTJ Pulse

感谢参与 YourTJ Pulse。提交改动前，请先检索现有 Issue，并让每个 PR 只解决一个明确问题。

## 本地开发

1. 安装 Node.js 20+ 并通过 Corepack 使用仓库锁定的 pnpm。
2. 运行 `pnpm install`。
3. 运行 `pnpm dev` 启动本地应用。
4. 提交前运行 `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm data:validate`。

## 提交与 PR

- 分支名使用 `feat/`、`fix/`、`docs/`、`refactor/` 等前缀。
- Commit 和 PR 标题使用英文 Conventional Commits，例如 `feat(worker): secure review routes`。
- Issue 和 PR 正文使用中文，写明范围、风险和验证命令。
- 不提交 `.env`、`.dev.vars`、Token、Cookie、定位轨迹或其他敏感数据。
- 数据与 API 变更必须同步更新 Schema、测试和文档。

## 地图数据

地图基础数据来自 OpenStreetMap。修改生成数据前请保留来源标识，并先运行 `pnpm data:validate`。正式地图修订与临时协作点位必须保持分离。
