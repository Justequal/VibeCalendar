# 参与贡献

感谢参与 Vibe Calendar。项目采用适合小团队的主干开发模式：`main` 是唯一长期分支，
始终保持可测试、可打包；日常开发使用短期分支，通过 Pull Request 合并。

## 开发流程

1. 从最新 `main` 创建短期分支：`feat/<name>`、`fix/<name>`、`docs/<name>` 或 `chore/<name>`。
2. 完成尽量小且聚焦的改动，并为逻辑变更补测试。
3. 本地运行 `npm run verify`。
4. 推送分支并向 `main` 提交 Pull Request。
5. CI 通过并完成检查后合并，随后删除短期分支。

项目不维护长期 `develop` 分支。对当前规模而言，额外的长期分支会增加同步、回合并和
版本来源判断的成本，而不会带来足够收益。如果未来同时维护多个版本线，再按需要增加
`release/*` 或维护分支。

## Commit 约定

建议使用 Conventional Commits 的简化形式：

- `feat:` 新功能
- `fix:` 缺陷修复
- `docs:` 文档
- `test:` 测试
- `refactor:` 不改变外部行为的重构
- `chore:` 构建、依赖和维护工作

一个 Pull Request 尽量只解决一个问题。提交历史无需为了形式拆得过碎，但标题应能说明
用户或维护者可以感知的结果。

## CI/CD 分层

- Pull Request：只运行语法检查和单元测试，快速反馈，不重复生成大型安装包。
- 合并到 `main`：再次验证并构建 Windows 安装包，产物保留 7 天用于冒烟测试。
- 推送稳定版本标签：验证版本号、构建安装包并创建正式 GitHub Release。

详细发布步骤见 [发布指南](docs/RELEASING.md)。
