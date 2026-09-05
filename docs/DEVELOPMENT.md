# VibeCalendar 开发指南

本文覆盖本地环境、实时预览、代码职责、验证方法和常见排错。架构边界见 [ARCHITECTURE.md](ARCHITECTURE.md)，正式版本流程见 [RELEASING.md](RELEASING.md)。

不熟悉 Electron、异步渲染或本项目术语时，先按 [代码阅读指南](CODE_WALKTHROUGH.md) 的顺序
阅读。代码内注释解释特殊边界，本文只维护开发操作和验证方法，避免同一内容重复失真。

## 1. 环境准备

- Node.js 20 或更高版本
- npm 与 Git
- Windows（生成和完整验证 NSIS 安装包时需要）

```bash
git clone https://github.com/Justequal/VibeCalendar.git
cd VibeCalendar
npm ci
```

`npm ci` 严格使用 `package-lock.json`，适合首次安装、CI 和发布构建。只有明确新增或升级依赖时才使用 `npm install`，并同时提交更新后的锁文件。

## 2. 运行方式

| 命令 | 运行环境 | 自动刷新 | 更新功能 |
| --- | --- | --- | --- |
| `npm start` | Electron 开发模式 | 否 | 可查看公告、手动比较版本；不下载安装 |
| `npm run dev` | Electron 开发模式 | 是，仅 `src/renderer` | 可查看公告、手动比较版本；不下载安装 |
| `npm run preview:web` | Windows 默认浏览器 | 浏览器自身行为 | 版本号和更新入口隐藏 |

推荐日常使用：

```bash
npm run dev
```

保存 `src/renderer` 下的 HTML、CSS、JavaScript 或 JSON 后，Electron 窗口会自动刷新。连续保存事件会被合并，避免一次编辑触发多次重载。

以下修改需要停止并重新运行命令：

- `src/main/main.js`、`preload.js` 或 `updater.js`
- `package.json` 或依赖
- 启动参数、窗口配置和 IPC 通道

静态网页预览只适合快速检查布局和普通日历交互。它不能代表 Electron 的窗口样式、沙箱、Preload、IPC 或安装更新行为。

## 3. 代码职责速查

| 文件 | 职责 | 不应包含 |
| --- | --- | --- |
| `src/main/main.js` | 窗口、生命周期、IPC、实时预览 | 日期规则、DOM |
| `src/main/preload.js` | 最小化的更新能力桥接 | 通用 Node.js 或原始 IPC 暴露 |
| `src/main/updater.js` | Release 查询、版本比较、自动更新 | DOM 和界面状态 |
| `src/renderer/calendar-core.js` | 纯日期计算、节日本日判定 | 网络、DOM、存储 |
| `src/renderer/interaction-core.js` | 滚轮单位换算与行数累计 | DOM 渲染与页面状态 |
| `src/renderer/holidays.js` | 数据校验、请求、缓存、合并和降级 | 视觉样式 |
| `src/renderer/translations.js` | 中英文界面文案 | 业务状态和事件 |
| `src/renderer/update-controller.js` | 版本、检查更新、公告弹层 | 日历网格渲染 |
| `src/renderer/renderer.js` | 日历状态、DOM、偏好和输入 | Electron 原生调用 |
| `src/renderer/style.css` | 色彩、布局、组件状态 | 业务判断 |
| `test/` | 可重复的领域与服务测试 | 真实用户数据、外部服务依赖 |

开始修改前先确定归属层。若一个功能同时涉及系统能力和界面，应让主进程返回窄而稳定的数据结构，再由对应渲染控制器展示。

## 4. 推荐开发流程

1. 从最新 `main` 创建短期分支。
2. 先写清楚行为变化和边界条件。
3. 把纯计算或服务逻辑放在可测试模块中，再连接界面。
4. 使用 `npm run dev` 进行交互验证。
5. 为逻辑变化增加或更新测试。
6. 同步修改 README、专题文档和 CHANGELOG（如适用）。
7. 执行完整本地验证后再提交。

```bash
git switch main
git pull --ff-only
git switch -c feat/short-description

npm run verify
git diff --check
```

`npm audit` 需要访问 npm 服务，适合作为依赖变更或发布前的补充检查，不替代 `npm run verify`。

## 5. 自动化验证

```bash
npm run check:syntax
npm test
npm run verify
npm run test:ui
npm run test:update-network
npm run verify:full
```

- `check:syntax` 使用 Node.js 解析项目 JavaScript，适合快速发现语法错误。
- `npm test` 使用 Node.js 内置测试运行器，不启动 Electron 窗口。
- `verify` 顺序执行上述两项，是提交和 Pull Request 前的最低要求。
- `test:ui` 启动隐藏的真实 Electron 窗口，验证关键 DOM、Preload 和交互链路，不访问真实更新服务。
- `test:update-network` 使用真实 GitHub Releases API 验证最新版本与手动检查，适合发布前联网执行，不放入离线 CI 的最低检查。
- `verify:full` 串行执行单元、Electron 界面和真实更新网络检查，适合发布前在 Windows 上执行。

当前测试重点：

| 测试区域 | 需要覆盖的边界 |
| --- | --- |
| 日期计算 | 月底、闰年、跨年、周一/周日首日、42 格连续性、逐周窗口 |
| 滚轮输入 | 像素/行/页面模式、余量累计、快速多行与反向滚动 |
| 节假日 | 输入校验、缓存命中与过期、并发复用、来源冲突、离线降级、失败后重试 |
| 更新 | 开发版与安装版差异、重复手动检查、版本比较、超时/失败、Release 解析 |
| 主进程 | 安全窗口配置、启动自动检查、IPC 来源校验、实时预览文件筛选与刷新合并 |
| Electron 界面 | 版本号、公告、焦点、语言、周首日、导航、快速滚轮与手动更新状态 |

`npm test` 与 `test:ui` 不得依赖真实 GitHub 或节假日 API 的实时响应。网络、存储、时钟和 Electron 对象应使用注入或模拟，以保持离线和 CI 结果稳定；只有显式的 `test:update-network` 执行真实联网检查。

## 6. 人工验证清单

### 日历与滚动

- [ ] 首次启动默认中文、周一为首日
- [ ] 切换语言和周首日后，重新启动仍保留偏好
- [ ] 左右按钮与方向键按月切换
- [ ] 慢速滚轮逐行移动，快速滚轮按幅度移动多行
- [ ] 快速跨月、跨年后标题、弱化日期和节假日仍对应正确
- [ ] `T` 和“回到今天”恢复当前日期窗口

### 节假日与视觉

- [ ] 真正节日本日与假期内普通休息日显示不同语义
- [ ] 普通周末和普通休假使用同一休息色
- [ ] 调休补班、今天、相邻月份日期对比清晰
- [ ] 中文/英文图例、悬停提示和无障碍文本同步切换
- [ ] 离线启动仍显示基础日历；缓存或兜底数据不会被误称为完整调休表

### 版本与更新

- [ ] 底部版本号等于 `package.json` / `app.getVersion()`
- [ ] 点击版本号可打开公告，`Esc`、关闭按钮和遮罩可关闭
- [ ] 公告打开后焦点进入弹层，关闭后返回版本按钮
- [ ] 中英文切换会更新弹层界面文案，但不改写维护者填写的版本说明
- [ ] 手动检查期间按钮不可重复触发，结束后恢复
- [ ] 发现新版后自动差分下载，按钮背景能显示百分比、完成和失败状态
- [ ] 下载完成后按钮变为“快速重启更新”，点击后旧窗口立即收起并在静默更新后自动打开新版
- [ ] 网络失败显示错误提示，日历本身继续可用

开发模式只能验证 GitHub 最新版本查询和状态文案，不能证明安装包下载、差分更新或重启安装可用。完整更新链路必须使用已安装的旧正式版本，对一个更高版本的公开 Release 做隔离测试。

## 7. 开发更新功能

更新相关的三条调用路径不要混淆：

1. **启动检查**：正式安装版调用 `electron-updater`；开发版直接跳过。
2. **点击版本号**：读取安装包内 `CHANGELOG.md` 的当前版本段落，不访问网络。
3. **手动检查**：所有 Electron 模式都先读取最新正式 Release 并比较版本，只返回“有新版 / 已是最新版 / 检查失败”；正式安装版确认有新版后立即返回结果，再让 `electron-updater` 自动下载并通过 `updates:status` 推送进度。

GitHub API 不可用、请求超时或达到匿名访问限制时，手动检查可以失败，这是可恢复状态；当前版本说明仍可离线读取。不要在渲染层直接增加 GitHub 域名或关闭 CSP；远端请求应继续由主进程完成。

最新版本查询默认设置 10 秒超时，并对成功结果缓存 5 分钟；并发查询共享同一个请求。手动检查会绕过缓存并重新请求，以获得适合版本判断的最新结果。远端字段有长度上限，链接只接受 GitHub HTTPS 地址。调整这些规则时要补充超时、缓存复用、强制刷新和恶意字段测试。

GitHub Release 正文由 `scripts/extract-release-notes.js` 从 `CHANGELOG.md` 的同版本段落提取。不要恢复 `--generate-notes`，否则应用内公告会重新混入代码提交差异链接。

`CHANGELOG.md` 也必须保留在 `package.json` 的 `build.files` 中，否则安装版无法离线读取当前版本说明。更新 IPC 时使用 `getCurrentRelease`，不要把版本按钮重新接到 `releases/latest`。

修改 IPC 时需要同步检查四处：

- `main.js` 中的 `ipcMain.handle`
- `preload.js` 中公开的方法
- `update-controller.js` 中的调用方
- `updates:status` 事件的进度与失败状态
- `test/updater.test.js` 中的服务行为

同时保留 IPC 的本地页面调用者校验，不能只依赖窗口导航限制。

## 8. 开发节假日功能

外部记录进入缓存前必须先标准化和校验，页面只消费统一的日期索引。增加提供方时：

1. 为新格式编写标准化函数和无效输入测试；
2. 明确它是独立数据源还是现有源的镜像；
3. 定义冲突优先级，不用不透明的“多数投票”；
4. 保证全部远端失败时仍能返回缓存或最小兜底；
5. 如果请求来自渲染进程，同步收紧地更新 `index.html` 的 `connect-src`。

缓存结构变化时升级缓存版本前缀。读取失败、JSON 损坏或写入空间不足都应被视为缓存未命中，不能让渲染中断。

## 9. 国际化与可访问性

- 新增用户可见文案时，在 `translations.js` 的中文和英文对象中同时补齐键。
- 界面语言使用 `zh-CN` 和 `en`；偏好保存在带命名空间的 `localStorage` 键中。
- 日期格中的短标签服务于有限空间，完整语义应保留在图例、`title` 或 `aria-label`。
- 模态弹层应管理初始焦点、关闭方式和焦点返回。
- 远程内容使用 `textContent`；不要用 `innerHTML` 渲染 Release 或节假日文本。

## 10. CI 与本地打包

`npm test` 通过 `scripts/run-tests.js` 为每个测试文件创建独立 Node 进程，保留原生断言和
TAP 文本报告，任一失败立即返回非零退出码。这样避免测试运行器的二进制结果汇总异常，
不以取消隔离或跳过测试来换取通过。只检查更新模块时可运行：

```bash
node scripts/run-tests.js test/updater.test.js test/renderer-modules.test.js
```

CI 配置位于 `.github/workflows/`：

- Pull Request 在 Ubuntu 上安装依赖并运行 `npm run verify`。
- `main` 分支推送通过验证后，在 Windows 上执行 `npm run build -- --publish never`，上传保留 7 天的冒烟产物。
- 版本标签由独立 Release 工作流处理，普通 CI 不创建 GitHub Release。

本地打包：

```bash
npm run pack
npm run build
```

`dist/` 中常见文件：

```text
VibeCalendar-Setup-<version>.exe
VibeCalendar-Setup-<version>.exe.blockmap
latest.yml
```

`latest.yml` 和 blockmap 是自动更新元数据，不是用户单独运行的文件。构建输出、`node_modules/` 和密钥不得提交到仓库。

## 11. 常见问题

### 保存文件后没有刷新

确认运行的是 `npm run dev`，并且修改位于 `src/renderer`。主进程、Preload、依赖或配置变化需要重启开发命令。

### 浏览器预览看不到版本号和更新按钮

这是预期行为。静态网页没有 Electron Preload 提供的 `window.appUpdates`，更新控制器会隐藏相关入口。请使用 `npm run dev` 测试它们。

### 手动检查显示最新，但没有下载

开发模式只做版本比较，不执行安装流程。需要在正式安装版中测试下载。

### 日历能显示，但节假日不完整

检查网络请求日志和缓存来源。远端失败时应用会使用过期缓存或最小固定日期兜底，后者不包含农历节日与调休安排。

### 当前版本说明没有随界面变成英文或中文

这是预期行为。说明正文直接来自维护者填写的 `CHANGELOG.md`，应用只翻译弹层自身的按钮、标题和状态文案。
