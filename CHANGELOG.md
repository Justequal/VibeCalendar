# 更新日志

本文件记录 Vibe Calendar 各正式版本中用户可感知的变化。格式参考 Keep a Changelog，
版本号遵循语义化版本。

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

[1.0.2]: https://github.com/Justequal/VibeCalendar/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/Justequal/VibeCalendar/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Justequal/VibeCalendar/releases/tag/v1.0.0
