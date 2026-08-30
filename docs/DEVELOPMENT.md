# Vibe Calendar 开发与发布流程

本文记录从获取代码、日常开发、测试、CI、打包到正式发布和自动更新的完整流程。命令和目录以当前仓库为准。

## 1. 环境准备

- Node.js 20 或更高版本
- npm 与 Git
- Windows（本地生成 NSIS 安装包时需要）

```bash
git clone https://github.com/Justequal/VibeCalendar.git
cd VibeCalendar
npm ci
```

`npm ci` 严格使用 `package-lock.json`，适合首次安装、CI 和发布构建。只有新增或升级依赖时才使用 `npm install`。

## 2. 本地开发

启动完整 Electron 应用：

```bash
npm run dev
```

该命令会启动 Electron 实时预览。保持终端命令运行，保存 `src/renderer` 下的
HTML、CSS、JavaScript 或 JSON 文件后，窗口会自动刷新。修改 `src/main` 中的主进程
代码后需要停止并重新运行命令。

静态页面预览（仅 Windows）：

```bash
npm run preview:web
```

静态预览只适合检查 HTML/CSS，不代表完整的 Electron 窗口、沙箱和自动更新行为。

### 代码职责

| 文件 | 职责 |
| --- | --- |
| `src/main/main.js` | Electron 窗口、生命周期和安全边界 |
| `src/main/updater.js` | 安装版自动更新 |
| `src/renderer/calendar-core.js` | 无副作用的日期计算 |
| `src/renderer/holidays.js` | 节假日请求、缓存、合并和降级 |
| `src/renderer/renderer.js` | 页面状态、DOM 渲染和交互 |
| `src/renderer/style.css` | 视觉样式 |
| `src/assets/` | PNG 源图标和 Windows ICO |
| `test/` | Node.js 内置测试 |

扩展前先阅读 [架构说明](ARCHITECTURE.md)。日期算法应保持为纯函数，系统能力不要直接暴露给渲染进程。

## 3. 修改后的验证

```bash
npm run verify
npm audit
git diff --check
```

`npm run verify` 会检查主要 JavaScript 文件语法并运行全部单元测试。日期边界、跨年、节假日合并和缓存降级属于高风险逻辑，修改时应同步增加测试。

## 4. 分支与 Pull Request

`main` 是长期分支，功能或修复使用短期分支：

```bash
git switch main
git pull --ff-only
git switch -c feat/short-description
```

完成修改后：

```bash
npm run verify
git add <changed-files>
git commit -m "feat: describe the change"
git push -u origin feat/short-description
```

Pull Request 应说明修改内容、验证命令和潜在影响。不要提交 `node_modules/`、`dist/` 或密钥。

## 5. CI 流程

配置文件是 [.github/workflows/build.yml](../.github/workflows/build.yml)。Pull Request 会在 Ubuntu 上执行 `npm ci --ignore-scripts` 和 `npm run verify`；合并到 `main` 后，Windows 任务会构建并上传 EXE、blockmap 和 `latest.yml` 作为短期构建产物。

CI 构建不会创建正式 GitHub Release，也不会更新用户设备。

## 6. 本地打包

```bash
npm run pack    # 生成未安装的应用目录
npm run build   # 生成 Windows NSIS 安装包
```

默认输出到 `dist/`：

```text
Vibe-Calendar-Setup-1.0.2.exe
Vibe-Calendar-Setup-1.0.2.exe.blockmap
latest.yml
```

`.blockmap` 和 `latest.yml` 是自动更新元数据，不是用户单独运行的文件。

## 7. 正式发布

发布由 [.github/workflows/release.yml](../.github/workflows/release.yml) 负责。推荐使用 `npm version`，它会同步更新两个 package 文件、创建提交和版本标签：

```bash
git switch main
git pull --ff-only
npm version patch -m "chore(release): v%s"
git push origin main --follow-tags
```

发布新功能或不兼容版本时，把 `patch` 换成 `minor` 或 `major`。Tag 必须和版本号一致，例如 `package.json` 为 `1.1.0` 时，Tag 必须是 `v1.1.0`。

推送 `v*.*.*` 标签后，Release 工作流会验证版本、运行测试、构建安装包、创建 GitHub Release，并上传 EXE、`.blockmap` 和 `latest.yml`。公开标签不要复用；失败后增加修订版本重新发布。

## 8. 自动更新

已安装的正式版本启动后会读取 GitHub Release 的 `latest.yml`，发现更高版本后后台下载，准备完成时提示重启安装。用户不需要手动下载 `.blockmap`。

自动更新需要使用安装版、Release 文件完整、版本号更高且仓库配置正确。开发模式会跳过更新检查。正式分发前还应配置 Windows 代码签名，避免 SmartScreen 警告。

## 9. 图标替换

- `src/assets/icon.png`：窗口和任务栏使用的高清源图
- `src/assets/icon.ico`：Windows EXE、安装器和卸载器使用的多尺寸图标

替换后执行：

```bash
npm run verify
npm run build
```

## 10. 发布前检查

- [ ] `npm run verify` 通过
- [ ] 手动检查当月、跨月、跨年和周一首日排列
- [ ] 检查节假日和调休标记
- [ ] 检查图标在小尺寸下仍清晰
- [ ] 版本号、Tag 和 Release 名称一致
- [ ] Release 包含 EXE、`.blockmap` 和 `latest.yml`
- [ ] 已确认自动更新只在正式安装版启用
- [ ] 面向真实用户发布时已配置代码签名

架构边界和扩展约定见 [ARCHITECTURE.md](ARCHITECTURE.md)，版本发布细节见 [RELEASING.md](RELEASING.md)。
