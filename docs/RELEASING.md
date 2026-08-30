# 发布指南

Vibe Calendar 使用语义化版本：`主版本.次版本.修订版本`。

- `patch`：向后兼容的缺陷修复，例如 `1.0.0 → 1.0.1`
- `minor`：向后兼容的新功能，例如 `1.0.1 → 1.1.0`
- `major`：包含不兼容变化，例如 `1.1.0 → 2.0.0`

## 发布前

1. 确认准备发布的功能已经通过 Pull Request 合并到 `main`。
2. 确认 `main` 的 CI 成功，并手动试用其 Windows 构建产物。
3. 在干净且最新的 `main` 上更新版本号，并同步 `CHANGELOG.md`。

以补丁版本为例：

```bash
git switch main
git pull --ff-only
npm version patch -m "chore(release): v%s"
git push origin main --follow-tags
```

`npm version` 会同时更新 `package.json`、`package-lock.json`，创建版本提交和 `v*.*.*`
标签。标签推送后，[Release Windows App](../.github/workflows/release.yml) 会自动：

1. 检查标签是否为稳定语义化版本，并与应用版本一致；
2. 运行语法检查和单元测试；
3. 构建 Windows NSIS 安装包；
4. 创建正式 GitHub Release，上传安装包、`latest.yml` 和 blockmap；
5. 让已安装的旧版本在下次启动时发现并后台下载更新。

发布 `minor` 或 `major` 时，将示例中的 `patch` 分别换为 `minor` 或 `major`。

## 发布失败

不要复用或移动已经公开发布的版本标签。修复问题后增加修订版本并重新发布，例如
`1.0.1` 失败时发布 `1.0.2`。如果工作流在创建 Release 前失败，可以在修复工作流后
从 GitHub Actions 页面重新运行同一次任务。

## Windows 签名与安全提示

当前自动化支持未签名安装包，Windows SmartScreen 可能显示未识别发布者警告。面向更多用户分发前，
可申请开源免费代码签名证书（如 SignPath.io）或购买商业证书，把证书和密码放入 GitHub Actions Secrets；
不要把证书或密码明文提交到仓库。

## Windows 官方源（Winget）持续更新

本项目已集成对微软官方包管理器（Windows Package Manager / Winget）的自动更新支持。

### 1. 首次上架（只需做一次）
1. 在 Windows 终端安装微软官方工具：`winget install Microsoft.WingetCreate`
2. 运行命令生成并提交首次安装包清单：
   ```powershell
   wingetcreate new https://github.com/Justequal/VibeCalendar/releases/download/v1.1.1/Vibe-Calendar-Setup-1.1.1.exe
   ```
3. 包标识符（PackageIdentifier）填写：`Justequal.VibeCalendar`。按照交互提示输入 GitHub Token 提交 PR 给 `microsoft/winget-pkgs` 仓库。

### 2. 配置 CI/CD 持续自动更新
1. 在 GitHub 创建个人访问令牌（Personal Access Token，勾选 `public_repo` 权限）。
2. 在仓库 **Settings $\to$ Secrets and variables $\to$ Actions** 中添加 Secret，名称为 `WINGET_TOKEN`。
3. 以后每次推送正式版本标签发布 Release 时，GitHub Actions 会自动提取版本号并向 `microsoft/winget-pkgs` 提交更新清单 PR，无需手动干预。

