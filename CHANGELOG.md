# 更新日志

本文件记录 Vibe Calendar 各正式版本中用户可感知的变化。格式参考 Keep a Changelog，
版本号遵循语义化版本。

## [1.1.1] - 2026-08-30

### 新增

- 底部状态栏展示应用当前版本号，点击版本号即可弹出最新版本更新公告模态框
- 底部功能区提供手动「检查更新」按钮与即时状态提示浮层
- 通过 Preload 隔离桥接安全支持主进程版本查询与 GitHub Releases 更新日志拉取

### 修复

- 修复手动检查更新时版本号字段解析的兼容性问题
- 补充所有模块详细中文注释与自动化更新单元测试

## [1.1.0] - 2026-08-30

### 新增

- 默认中文的“氛围日历”界面，以及可持久化的中英文切换
- 鼠标滚轮按实际幅度上下逐行滚动日历
- 节日本日、普通休假、周末与调休补班的独立语义标记和动态颜色图例
- `npm run dev` Electron 实时预览，保存前端文件后自动刷新

### 改进

- 默认以周一作为一周首日，同时保留手动切换和偏好保存
- 重新规划深色主题、日期卡片及状态颜色，提高对比度和可读性
- 英文界面使用完整节日翻译，并以紧凑标签避免日期格文字截断

## [1.0.2] - 2026-08-30

### 修复

- 安装包实际文件名现在与 `latest.yml` 完全一致，确保自动更新下载地址有效

## [1.0.1] - 2026-08-29

### 修复

- 正式版本现在会显式核对并上传安装程序、`latest.yml` 和 blockmap，避免 Release 缺少自动更新文件

### 维护

- CI 分为 Pull Request 快速验证、`main` Windows 冒烟构建和版本标签正式发布三层
- 增加主干开发、贡献、发布与安全说明，以及每周依赖更新检查

## [1.0.0] - 2026-08-29

### 新增

- 桌面月历、相邻月份日期和中国法定节假日/调休展示
- 周首日偏好、月份切换、实时钟和快速回到今天
- Windows NSIS 安装包
- GitHub Actions 持续集成与正式版本自动发布
- 启动时静默检查、后台下载并提示安装新版本

[1.1.1]: https://github.com/Justequal/VibeCalendar/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/Justequal/VibeCalendar/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/Justequal/VibeCalendar/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/Justequal/VibeCalendar/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Justequal/VibeCalendar/releases/tag/v1.0.0
