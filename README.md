# Vibe Calendar

[![Build](https://github.com/Justequal/VibeCalendar/actions/workflows/build.yml/badge.svg)](https://github.com/Justequal/VibeCalendar/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Vibe Calendar 是一个轻量的桌面日历，使用 Electron 和原生 Web 技术构建。它专注于快速查看日期、中国法定节假日与调休信息，并提供深色无边框的桌面挂件体验。

## 功能

- 固定 6 × 7 月历网格，稳定展示相邻月份日期
- 中国法定节假日、休息日与调休补班标记
- 周日或周一作为一周首日，偏好会在本机保存
- 按钮、鼠标滚轮及键盘切换月份
- 实时时钟与快速回到今天
- 无边框深色窗口和本机字体，支持离线首屏
- Windows NSIS 安装包与可选 GitHub 自动更新

键盘快捷键：

| 按键 | 功能 |
| --- | --- |
| `←` / `→` | 上一个月 / 下一个月 |
| `T` | 回到今天 |

## 开发环境

- Node.js 20 或更高版本
- Windows、macOS 或 Linux

```bash
npm install
npm start
```

应用启动后会立即使用内存或本地缓存渲染日历，节假日数据在后台刷新。网络不可用不会阻止基础日历显示。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm start` | 启动开发版 Electron 应用 |
| `npm run preview:web` | 在 Windows 浏览器中预览静态页面（不含完整 Electron 行为） |
| `npm test` | 运行日期领域层单元测试 |
| `npm run check:syntax` | 检查主要 JavaScript 文件语法 |
| `npm run verify` | 依次执行语法检查和测试 |
| `npm run pack` | 生成未安装的应用目录 |
| `npm run build` | 在 `dist/` 生成平台安装包 |

CI 使用 `npm ci`、执行验证后再构建 Windows 安装包。

## 目录结构

```text
VibeCalendar/
├── .github/workflows/build.yml   # Windows 验证与打包
├── docs/ARCHITECTURE.md          # 架构、数据流和扩展约定
├── src/
│   ├── main/
│   │   ├── main.js               # Electron 窗口与生命周期
│   │   └── updater.js            # 可选的 GitHub 自动更新
│   ├── assets/
│   │   ├── icon.png              # 高清透明图标源文件
│   │   └── icon.ico              # Windows 多尺寸应用图标
│   └── renderer/
│       ├── calendar-core.js      # 无副作用的日期计算
│       ├── holidays.js           # 节假日数据、缓存与降级
│       ├── renderer.js           # 页面状态、渲染与事件
│       ├── index.html            # 页面结构与安全策略
│       └── style.css             # 视觉样式
├── test/calendar-core.test.js    # 日期计算单元测试
└── package.json
```

详细设计参见 [架构说明](docs/ARCHITECTURE.md)。

## 节假日数据

当前使用两个独立提供方：

1. `NateScarlet/holiday-cn`：jsDelivr 和 GitHub Raw 是同一份数据的镜像，只作为一个提供方。
2. `timor.tech`：用于补充主数据中缺失的特殊日期。

请求超时为 5 秒，成功数据在 `localStorage` 缓存 30 天。同一年并发请求会复用一个 Promise。两个远程提供方都不可用时，依次使用过期缓存和固定日期兜底；兜底数据不会猜测农历节日或调休。

## 安全边界

- 渲染进程关闭 Node.js 集成
- 开启上下文隔离、渲染进程沙箱和 Web 安全策略
- CSP 只允许本地脚本/样式，以及指定节假日 API 的 HTTPS 请求
- 禁止页面导航和创建新窗口
- 不加载远程字体或远程脚本
- 当前 Windows 方案关闭 GPU 硬件加速，以规避部分显卡环境中的启动崩溃

如果以后需要系统能力，应通过最小化的 preload API 和 `contextBridge` 暴露，不要重新开启完整 Node.js 集成。

## 自动更新

安装版应用每次启动都会静默检查 GitHub Releases。发现新版本后会自动在后台下载，
下载期间日历可以继续使用；安装包准备完成后，应用才会提醒用户选择“重启并安装”
或“稍后”。选择“稍后”时，更新会在应用下次正常退出时安装。

自动更新只在安装后的打包版本中启用，开发模式不会访问更新服务。更新来源是当前
公开 GitHub 仓库中最新的正式 Release；预发布版本不会推送给稳定版用户。

发布正式版本前还应配置 Windows 代码签名。未签名安装包可能触发 SmartScreen 警告。

## 发布新版本

发布由 [GitHub Actions](.github/workflows/release.yml) 自动完成。版本号遵循语义化版本，
Git 标签必须与 `package.json` 中的版本完全一致。例如发布补丁版本：

```bash
npm version patch
git push origin main --follow-tags
```

推送 `v*.*.*` 标签后，Actions 会先验证和测试源码，再构建 Windows NSIS 安装包，
并创建公开 GitHub Release。Release 中的安装包、`latest.yml` 和 blockmap 文件共同
支持应用内的自动检查与后台差分下载。普通分支和 Pull Request 只执行验证与构建，
不会发布 Release。

## 打包

```bash
npm run verify
npm run build
```

安装包输出到 `dist/`。CI 构建显式使用 `--publish never`，因此普通分支和 Pull Request 不会意外发布 Release。

## 开源许可

项目使用 [MIT License](LICENSE)。欢迎提交 Issue 和 Pull Request。

## 维护原则

- 日期计算保持为纯函数，并为边界条件补测试。
- 网络失败不得阻塞基础日历。
- 主进程只管理系统能力，渲染层只管理页面。
- 注释解释设计原因和边界条件，不重复代码本身。
- 新增外部域名时同步审查 `index.html` 中的 CSP。
