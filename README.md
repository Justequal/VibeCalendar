# VibeCalendar

[![Build](https://github.com/Justequal/VibeCalendar/actions/workflows/build.yml/badge.svg)](https://github.com/Justequal/VibeCalendar/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

VibeCalendar 是一款轻量的桌面月历，使用 Electron 与原生 HTML、CSS、JavaScript 构建。它专注于快速查看日期、中国法定节假日和调休安排，并以简约、清晰的深色桌面挂件形式呈现。

## 主要功能

- 固定 6 × 7 日期网格，连续展示相邻月份日期
- 区分节日本日、普通休假、周末和调休补班；普通周末与法定休假使用一致的休息色
- 默认以周一为一周首日，可手动切换为周日并保存本机偏好
- 默认中文界面，可切换中英文；星期、月份、节日、图例和操作文案会同步切换
- 鼠标滚轮按实际滚动幅度逐行（逐星期）移动，快速滚动不会只移动一行
- 月份按钮、方向键、实时钟和“回到今天”快捷操作
- 底部显示当前应用版本；点击版本号可离线查看当前安装版本的维护说明
- 提供手动检查更新；安装版还会在启动时静默检查并在后台下载新版本
- 无边框固定尺寸窗口、离线可用的基础日历和节假日缓存降级

键盘快捷键：

| 按键 | 功能 |
| --- | --- |
| `←` / `→` | 上一个月 / 下一个月 |
| `T` | 回到今天 |
| `Esc` | 关闭更新公告 |

## 快速开始

需要 Node.js 20 或更高版本。

```bash
npm ci
npm run dev
```

`npm run dev` 会打开完整的 Electron 实时预览窗口。保持命令运行，保存 `src/renderer`
中的 HTML、CSS、JavaScript 或 JSON 文件后，窗口会自动刷新；修改 `src/main` 下的主进程或
Preload 文件后，需要停止并重新启动开发命令。

应用会先用内存或本地缓存同步绘制日历，再在后台刷新可见年份的节假日数据。因此网络不可用时，基础日历仍可立即使用。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm start` | 启动开发版 Electron 应用，不监听文件变化 |
| `npm run dev` | 启动 Electron 实时预览，保存前端文件后自动刷新 |
| `npm run preview:web` | 在 Windows 默认浏览器中打开静态页面；不包含 Electron 更新能力 |
| `npm test` | 运行 Node.js 单元测试 |
| `npm run test:ui` | 在隐藏的真实 Electron 窗口中运行关键交互冒烟测试 |
| `npm run test:update-network` | 联网验证 GitHub 最新版本与开发版手动检查更新 |
| `npm run check:syntax` | 检查项目 JavaScript 语法 |
| `npm run verify` | 依次执行语法检查和全部测试 |
| `npm run verify:full` | 在 `verify` 后追加真实 Electron 与联网更新冒烟测试 |
| `npm run pack` | 生成未安装的应用目录 |
| `npm run build` | 在 `dist/` 生成 Windows NSIS 安装包和更新元数据 |

完整开发、验证和排错流程见 [开发指南](docs/DEVELOPMENT.md)。

## 项目结构

```text
VibeCalendar/
├── .github/workflows/           # 持续集成与正式发布
├── docs/                        # 架构、开发和发布文档
├── src/
│   ├── main/
│   │   ├── main.js              # Electron 生命周期、窗口、IPC 与实时预览
│   │   ├── preload.js           # 受控的版本和更新能力桥接
│   │   ├── release-notes.js     # 当前版本维护记录解析
│   │   └── updater.js           # Release 查询与自动更新服务
│   ├── renderer/
│   │   ├── calendar-core.js     # 无副作用的日期领域计算
│   │   ├── interaction-core.js  # 滚轮单位换算与行数累计
│   │   ├── holidays.js          # 节假日请求、校验、缓存与降级
│   │   ├── translations.js      # 中英文用户界面文案
│   │   ├── update-controller.js # 版本、检查更新和公告弹层交互
│   │   ├── renderer.js          # 日历状态、DOM 渲染与输入事件
│   │   ├── index.html           # 页面结构与内容安全策略
│   │   └── style.css            # 深色视觉系统与组件样式
│   └── assets/                  # 应用和安装器图标
├── scripts/
│   ├── extract-release-notes.js # 从版本维护记录生成 Release 公告
│   ├── ui-smoke.js              # 真实 Electron 界面冒烟测试
│   └── update-network-smoke.js  # GitHub 更新服务联网冒烟测试
├── test/
│   ├── calendar-core.test.js    # 日期与节日本日计算
│   ├── holiday-service.test.js  # 数据校验、缓存、并发与降级
│   ├── interaction-core.test.js # 慢速/快速滚轮幅度换算
│   ├── main-process.test.js      # 启动检查、IPC 与实时预览
│   ├── release-notes.test.js    # Release 公告提取规则
│   ├── renderer-modules.test.js # 翻译词典与更新界面控制器
│   └── updater.test.js          # 版本比较、Release 与更新服务
├── CHANGELOG.md                 # 用户可感知的版本变化
└── package.json
```

模块职责、数据流和扩展边界见 [架构说明](docs/ARCHITECTURE.md)。

## 节假日数据

应用使用两个独立提供方：

1. `NateScarlet/holiday-cn`：jsDelivr 与 GitHub Raw 是同一数据集的镜像，只计作一个提供方。
2. `timor.tech`：补充主数据集中缺失的特殊日期。

远程请求设有超时。成功数据写入 `localStorage` 并缓存 30 天；同一年份的并发请求会复用同一个任务。远程提供方均不可用时，应用优先使用过期缓存，最后退回到固定公历日期的最小数据集。兜底数据不会猜测农历节日或调休安排。

## 版本与更新

| 场景 | 启动检查 | 点击版本号 | 手动“检查更新” |
| --- | --- | --- | --- |
| 开发模式 | 不访问更新服务 | 读取安装包内当前版本说明 | 比较 GitHub 最新正式版本，只显示有新版、已是最新版或检查失败 |
| 已安装的正式版本 | 静默检查并在有新版本时后台下载 | 读取安装包内当前版本说明 | 先比较 GitHub 最新正式版本并立即反馈；有新版时在后台继续下载 |
| 静态网页预览 | 不支持 | 入口隐藏 | 入口隐藏 |

后台下载完成后，应用会提示“重启并安装”或“稍后”。选择“稍后”时，更新将在应用正常退出时安装。手动检查不会把下载器状态表述成“当前版本不能更新”；版本结论只根据 GitHub 最新正式 Release 判断。

版本说明由维护者在 `CHANGELOG.md` 中按版本记录，并随应用打包；点击版本号始终读取当前安装版本的段落。发布流程也会提取同一段落写入 GitHub Release，不使用自动生成的代码差异说明。说明保留维护者编写时的语言，界面本身仍会随中英文设置切换。

自动更新依赖公开 Release 中完整的安装程序、`latest.yml` 和 blockmap 文件。网络错误或更新服务故障只会影响更新相关操作，不会阻止日历使用。

## 安装与下载

如果 `Justequal.VibeCalendar` 已在当前 Winget 源中上架，可以使用：

```powershell
winget install Justequal.VibeCalendar
```

若 Winget 尚未检索到该包，请前往 [GitHub Releases](https://github.com/Justequal/VibeCalendar/releases) 下载最新的 `VibeCalendar-Setup-*.exe`。

> [!NOTE]
> 当前安装包可能未进行商业代码签名。Windows SmartScreen 显示“未知发布者”时，请先确认下载地址和 Release 来源可信，再决定是否运行。

## 持续集成与发布

- Pull Request：执行语法检查和单元测试。
- 推送到 `main`：再次验证，并生成保留 7 天的 Windows 冒烟构建产物。
- 推送与 `package.json` 版本一致的 `v*.*.*` 标签：构建正式安装包并创建 GitHub Release。

普通的 `git push` 不会自动发布正式版本；只有向远端推送符合规则的版本标签才会触发 Release 工作流。完整操作和失败处理见 [发布指南](docs/RELEASING.md)。

## 安全边界

- 渲染进程关闭 Node.js 集成，开启上下文隔离、沙箱和 Web 安全策略
- Preload 只公开获取版本、读取当前版本说明和检查更新三个单一用途接口
- CSP 只允许本地脚本和样式，以及明确列出的节假日数据 HTTPS 地址
- 主窗口禁止页面导航和创建新窗口
- 当前版本说明使用纯文本呈现，不作为 HTML 执行
- 当前 Windows 方案关闭 GPU 硬件加速，以规避部分显卡环境中的启动崩溃

## 参与贡献

项目采用轻量主干开发：`main` 是唯一长期分支，功能和修复通过短期分支与 Pull Request 合并。提交前请运行 `npm run verify`，并在行为变化时同步更新测试和文档。详细约定见 [贡献指南](CONTRIBUTING.md)，版本变化见 [CHANGELOG](CHANGELOG.md)。

项目使用 [MIT License](LICENSE)。
