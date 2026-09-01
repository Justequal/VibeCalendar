# 发布指南

VibeCalendar 使用语义化版本和 GitHub Actions 发布 Windows 安装包。本项目的正式 Release 由**版本标签推送**触发，不由普通分支推送触发。

## 1. 版本选择

版本格式为 `主版本.次版本.修订版本`：

- `patch`：向后兼容的缺陷修复，例如 `1.1.0 → 1.1.1`
- `minor`：向后兼容的新功能，例如 `1.1.1 → 1.2.0`
- `major`：包含不兼容变化，例如 `1.2.0 → 2.0.0`

当前工作流只接受稳定标签 `v数字.数字.数字`，应用也设置为不接收预发布版。不要使用 `v1.2.0-beta.1` 期待当前流程自动发布或更新。

## 2. 发布触发条件

工作流 `.github/workflows/release.yml` 监听：

```yaml
on:
  push:
    tags:
      - 'v*.*.*'
```

触发后还会验证：

1. 标签严格匹配 `v1.2.3` 形式；
2. 标签中的版本与 `package.json` 完全一致；
3. 语法检查和单元测试全部通过。

因此“本地存在标签”不会发布，必须把标签推送到 GitHub；只推送分支也不会发布。

## 3. `git push` 与标签推送的区别

| 命令 | 默认行为 | 是否触发正式 Release |
| --- | --- | --- |
| `git push` | 只推送当前分支到已配置的上游，通常不推送标签 | 否 |
| `git push origin main` | 只更新远端 `main` | 否；会触发普通 CI 和 Windows 冒烟构建 |
| `git push origin v1.2.3` | 只推送指定标签 | 是，若标签与包版本匹配 |
| `git push origin main --follow-tags` | 推送 `main`，并推送其提交历史中尚未推送的附注标签 | 是，推荐与 `npm version` 配合 |
| `git push origin --tags` | 推送所有本地标签 | 可能触发多个发布，不建议作为日常发布命令 |

`npm version` 默认创建版本提交和附注标签，所以推荐使用 `--follow-tags`。普通的 `git push` 即使把版本提交推到了 `main`，只要标签没有到达 GitHub，就只会运行普通 CI，不会创建 Release。

## 4. 标准发布流程

### 4.1 发布前准备

1. 准备发布的功能已经通过 Pull Request 合并到 `main`。
2. `main` 的 CI 成功，Windows 冒烟构建已人工试用。
3. 工作区干净，本地 `main` 与远端同步。
4. 将 `CHANGELOG.md` 的待发布内容整理到目标版本和当天日期。
5. 确认该版本段落是简短、面向用户的更新说明；内容不便展开时至少写“优化了一些功能”。

```bash
git switch main
git pull --ff-only
npm run verify
git status --short
```

### 4.2 更新版本并创建标签

以修订版本为例：

```bash
npm version patch -m "chore(release): v%s"
```

该命令会：

- 同步更新 `package.json` 和 `package-lock.json`；
- 创建版本提交；
- 创建与版本对应的 `v*.*.*` 附注标签。

发布新功能或不兼容版本时，将 `patch` 替换为 `minor` 或 `major`。创建后检查：

```bash
node -p "require('./package.json').version"
git show --stat --oneline HEAD
git tag --points-at HEAD
```

包版本为 `1.2.3` 时，当前提交上应存在 `v1.2.3`。

### 4.3 推送提交和标签

```bash
git push origin main --follow-tags
```

该命令通常会同时触发：

- `main` 的普通 CI：验证并生成短期 Windows 冒烟产物；
- `v1.2.3` 的 Release 工作流：验证、打包并创建正式 GitHub Release。

这两个工作流职责不同，同时运行属于正常情况。

## 5. Release 工作流产物

标签验证通过后，工作流会：

1. 安装锁定依赖并运行 `npm run verify`；
2. 执行 `npm run build -- --publish never`；
3. 从 `dist/latest.yml` 读取真实安装包文件名；
4. 从 `CHANGELOG.md` 提取与标签同版本的维护记录；
5. 创建或更新 GitHub Release，并把提取内容作为公告正文，不生成代码差异说明；
6. 上传以下正式资产：
   - `VibeCalendar-Setup-<version>.exe`
   - `VibeCalendar-Setup-<version>.exe.blockmap`
   - `latest.yml`
7. 额外上传保留 14 天的 Actions 构建产物；
8. 若仓库配置了 `WINGET_TOKEN`，尝试向 `microsoft/winget-pkgs` 提交版本更新。

`CHANGELOG.md` 是版本说明的唯一维护来源。应用内读取安装包中的当前版本段落；GitHub Release 正文由发布工作流从同一版本段落同步生成。为避免下次工作流重跑覆盖，不要只在 GitHub 页面修改公告。

## 6. 发布后验证

- [ ] GitHub Actions 中 Release 工作流成功
- [ ] Release 标签、标题和 `package.json` 版本一致
- [ ] Release 是公开且最新的稳定版本，不是草稿
- [ ] EXE、blockmap 和 `latest.yml` 三类资产都存在
- [ ] `latest.yml` 的 `path` 与上传的 EXE 文件名完全一致
- [ ] 从 Release 页面下载的安装包可以安装和启动
- [ ] 应用底部显示正确版本号
- [ ] 点击版本号能看到当前安装版本对应的维护记录，而不是远端其他版本的说明
- [ ] 在旧的已安装正式版本中，启动检查和手动检查能发现新版本
- [ ] 更新下载完成后，“重启并安装”和“稍后”行为正确
- [ ] 若启用 Winget 自动提交，检查上游清单 Pull Request 状态

自动更新要求新 Release 版本高于已安装版本。直接运行开发模式不能验证下载和安装；应在隔离环境或可恢复的测试设备上安装旧版本，再发布/提供更高版本进行端到端验证。

## 7. 发布失败处理

### 标签与包版本不一致

工作流会在构建前失败。若标签尚未公开且没有 Release，可删除错误的远端标签并按正确版本重新创建；若标签或 Release 已对外公开，不要移动或复用它，修复后发布新的修订版本。

### 构建成功但资产缺失

检查 `latest.yml` 中的 `path`、NSIS `artifactName` 和上传步骤。自动更新需要 EXE、对应 blockmap 与 `latest.yml` 同时存在。

### Release 已创建但后续步骤失败

工作流会复用已有 Release，并以 `--clobber` 重新上传同名资产。确认源码和标签没有改变后，可以从 GitHub Actions 重跑该任务。不要用新内容覆盖一个已经公开、但指向不同提交的标签。

### 用户检查不到更新

按顺序确认：

1. 用户运行的是安装版而非 `npm start` / `npm run dev`；
2. GitHub Release 已公开并标记为 Latest；
3. Release 版本严格高于用户版本；
4. 三类更新资产完整且文件名匹配；
5. 用户网络可访问 GitHub；
6. 应用日志没有签名、权限或下载错误。

## 8. Windows 签名与 SmartScreen

当前流程可以发布未签名安装包，但 Windows SmartScreen 可能显示未知发布者警告。面向更广泛用户分发前，应配置可信代码签名，并把证书材料放入 GitHub Actions Secrets 或外部签名服务；不要把证书、密码或令牌提交到仓库。

签名接入后要重新验证完整自动更新链路，因为 Windows 对已安装版本与更新包的发布者一致性有额外要求。

## 9. Winget

Winget 自动更新的前提是 `Justequal.VibeCalendar` 已完成首次上架，并在仓库中配置具有所需权限的 `WINGET_TOKEN`。

首次上架需要维护者使用 `wingetcreate` 针对一个已发布、可公开下载的安装包生成清单并提交到 `microsoft/winget-pkgs`。此后每个正式版本的 Release 工作流才会尝试提交新版本清单。

Winget 清单 Pull Request 由微软仓库独立审核；GitHub Release 创建成功不代表 Winget 会立即提供新版本。
Winget 提交属于可选的发布后集成，失败会在 Actions 步骤中保留警告，但不再让已经完成构建、Release 和资产上传的工作流整体失败。
