# 参与贡献

感谢参与 VibeCalendar。项目采用轻量主干开发：`main` 是唯一长期分支，功能、修复和重构通过短期分支与 Pull Request 合并。

开始前请阅读 [架构说明](docs/ARCHITECTURE.md) 和 [开发指南](docs/DEVELOPMENT.md)。本项目重视清晰的职责边界、离线可用性、可访问性与可重复验证；优化不应改变既有的简约桌面日历定位。

## 开发流程

1. 从最新 `main` 创建短期分支：`feat/<name>`、`fix/<name>`、`refactor/<name>`、`docs/<name>` 或 `chore/<name>`。
2. 保持改动聚焦；不要在同一 Pull Request 中夹带无关格式化或功能。
3. 逻辑变化同步增加测试，用户可见变化同步更新文档和 CHANGELOG。
4. 使用 `npm run dev` 完成交互验证。
5. 提交前运行 `npm run verify` 和 `git diff --check`。
6. 推送分支并向 `main` 创建 Pull Request；CI 和评审通过后再合并。

```bash
git switch main
git pull --ff-only
git switch -c feat/short-description

npm ci
npm run dev
npm run verify
git diff --check
```

项目当前不维护长期 `develop` 分支。若未来需要并行维护多个正式版本，再按实际需要增加 `release/*` 或维护分支。

## 架构约束

- 日期计算属于 `calendar-core.js`，保持无 DOM、网络和存储副作用。
- 滚轮单位换算与余量累计属于 `interaction-core.js`，不要重新散落到 DOM 事件中。
- 节假日的请求、校验、标准化、缓存与降级属于 `holidays.js`。
- 用户可见的中英文文案集中在 `translations.js`，不要散落在事件处理器中。
- 日历交互由 `renderer.js` 管理；更新按钮和公告弹层由 `update-controller.js` 管理。
- Electron 与操作系统能力放在主进程，通过 Preload 的单一用途 API 提供给页面。
- 不开启 `nodeIntegration`，不暴露原始 `ipcRenderer`，不为方便而放宽 CSP。
- 远程内容必须先校验，并以纯文本或明确安全的结构渲染。

新增文件或改变脚本依赖顺序时，记得同步 `index.html`、`package.json` 的语法检查脚本和架构文档。

## 代码可读性

- 函数只承担一个明确职责，名称应表达行为而非实现细节。
- 对跨层接口、缓存结构和结构化返回值使用简短 JSDoc。
- 注释重点说明设计原因、边界条件、降级路径和竞态处理，不逐行翻译代码。
- 复用稳定的数据结构，避免在调用链中反复转换同一数据。
- 优先提前返回和小型辅助函数，避免深层条件嵌套。
- 当前渲染层采用原生脚本和显式全局入口；不要只为语法偏好引入构建链。

## 性能与可靠性

性能改动应附带可复现的场景或明确依据。优先关注：

- 网络和持久化读取是否可以缓存或复用；
- 快速滚动、翻月时是否产生重复请求或重复渲染；
- 异步响应是否可能覆盖更新的界面状态；
- 超时或异常后，在途锁和按钮状态是否总能释放；
- 离线、缓存损坏或数据源异常时，基础日历是否仍可使用。

不要通过移除输入校验、安全隔离、无障碍文本或失败降级来换取微小性能收益。

## 测试要求

- 修复缺陷时，尽可能先增加能复现问题的测试。
- 日期边界至少考虑月底、闰年、跨年和不同周首日。
- 节假日服务测试使用模拟网络、存储和时钟，不依赖真实 API。
- 更新服务测试模拟 Electron 和 GitHub 响应，不触发真实下载或安装。
- DOM、焦点和更新按钮优先用 `npm run test:ui` 验证；安装替换等无法安全自动化的行为在 Pull Request 中记录人工步骤。

最低验证命令：

```bash
npm run verify
npm run test:ui
git diff --check
```

## 国际化与界面改动

- 新文案必须同时提供中文和英文。
- 有限空间中的英文可以使用短标签，但完整含义必须出现在图例、提示或 `aria-label` 中。
- 保持节日本日、普通休假/周末和调休补班的语义区分。
- 颜色变化要检查普通状态、今天、相邻月份、悬停和高对比环境。
- 弹层要支持键盘关闭、合理的初始焦点和关闭后的焦点返回。
- 不自动翻译维护者编写的版本说明；只翻译弹层标题、按钮和状态文案。

## 文档与变更记录

行为或结构变化时按影响范围更新：

- `README.md`：面向使用者的功能、安装和快速开始
- `docs/ARCHITECTURE.md`：模块边界、数据流和扩展约定
- `docs/DEVELOPMENT.md`：命令、验证和排错
- `docs/RELEASING.md`：版本、标签、产物和发布条件
- `CHANGELOG.md`：每个正式版本的用户更新记录，也是 GitHub Release 和应用内公告的唯一内容来源；内容不便展开时至少写“优化了一些功能”

文档只能描述当前已实现的行为。未来设想应进入 Issue，不要作为现有功能写入 README 或架构图。

## Commit 约定

建议使用 Conventional Commits 的简化形式：

- `feat:` 新功能
- `fix:` 缺陷修复
- `refactor:` 不改变外部行为的结构调整
- `perf:` 性能优化
- `test:` 测试
- `docs:` 文档
- `chore:` 构建、依赖和维护工作

标题应说明用户或维护者可以感知的结果。无需为了形式把一个完整改动拆成大量微小提交，但每个提交应能独立理解。

## Pull Request 清单

- [ ] 改动范围聚焦，未覆盖无关的现有修改
- [ ] 代码位于正确的架构层，没有扩大渲染进程权限
- [ ] 新增或变化的逻辑已有测试
- [ ] `npm run verify` 和 `git diff --check` 通过
- [ ] 已完成与风险相称的实时预览或安装包人工验证
- [ ] 中文、英文、键盘操作和错误状态已检查
- [ ] README、专题文档和 CHANGELOG 已按需更新
- [ ] 未提交 `node_modules/`、`dist/`、凭据、令牌或个人数据

## CI/CD 分层

- Pull Request：语法检查与单元测试。
- `main`：再次验证并构建短期 Windows 冒烟产物。
- `v*.*.*` 标签：验证版本、构建正式资产并创建 GitHub Release。

推送分支不会发布正式版本。发布者应按 [发布指南](docs/RELEASING.md) 创建并推送与包版本一致的标签。
