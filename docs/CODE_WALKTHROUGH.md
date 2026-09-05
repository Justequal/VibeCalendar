# VibeCalendar 代码阅读指南

本文面向具备基础 JavaScript、HTML 和 CSS 知识，但不熟悉 Electron 的读者。目标不是逐行
解释语法，而是说明程序从哪里启动、数据怎样流动、复杂功能为什么这样实现。模块的约束和
测试范围分别见 [架构说明](ARCHITECTURE.md) 与 [开发指南](DEVELOPMENT.md)。

## 1. 先建立整体概念

Electron 应用同时包含两个运行环境：

- **主进程**接近普通 Node.js 程序，能够创建窗口、访问文件和启动安装器。
- **渲染进程**就是窗口里的网页，负责 HTML、CSS 和用户交互，不直接拥有系统权限。
- **Preload** 位于两者之间，只把明确允许的操作提供给网页。

```text
Windows / Electron
        │
        ▼
src/main/main.js ──创建窗口、管理生命周期、注册 IPC
        │
        ├── src/main/updater.js ──检查、下载、安装更新
        │
        ▼
src/main/preload.js ──把受控方法挂到 window.appUpdates
        │
        ▼
src/renderer/index.html + style.css + JavaScript ──用户看到的日历
```

IPC 是 Electron 中两个进程传递消息的机制。渲染页面不能直接调用更新器，只能调用
`window.appUpdates.checkForUpdates()`；Preload 将它转换成 IPC，主进程再执行真正的系统操作。

## 2. 推荐阅读顺序

1. `src/renderer/index.html`：先认识窗口中有哪些区域和元素 ID。
2. `src/renderer/renderer.js`：查看页面状态如何转换为 42 个日期格。
3. `src/renderer/calendar-core.js`：理解日期数据怎样生成。
4. `src/renderer/interaction-core.js`：理解快速滚轮为什么不会丢失幅度。
5. `src/renderer/holidays.js`：理解联网、缓存和离线降级。
6. `src/renderer/update-controller.js`：理解更新按钮的状态变化。
7. `src/main/preload.js`、`main.js`、`updater.js`：最后理解系统权限和自动更新。
8. `test/`：通过输入和预期结果确认每个模块的行为。

## 3. 页面是怎样启动的

`index.html` 按依赖顺序加载脚本。前面的文件先把 API 放到 `window`，后面的文件再使用：

```text
calendar-core → interaction-core → translations → holidays
              → update-controller → renderer
```

`renderer.js` 最后执行四步：

```text
绑定点击、键盘和滚轮事件
→ 启动按整秒校准的时钟
→ 初始化版本与更新按钮
→ 立即绘制日历，再异步刷新节假日
```

脚本没有使用前端框架和构建器，因此运行时看到的文件就是仓库中的源码。新增脚本时必须在
`index.html` 中按依赖顺序加入；只创建文件并不会自动加载。

## 4. 日历渲染的数据流

`renderer.js` 中的 `state` 是页面唯一的可变状态：

| 字段 | 含义 |
| --- | --- |
| `visibleDate` | 当前六周窗口的日期锚点 |
| `startOnMonday` | 是否从周一开始，默认 `true` |
| `language` | `zh-CN` 或 `en` |
| `renderVersion` | 本次异步渲染的序号 |

一次渲染分为两段：

1. 从内存或本地缓存读取已有节假日，立即构造 42 个日期格。
2. 并行刷新画面涉及的年份；请求完成后，只有渲染序号仍是最新值才重绘。

第二步的序号检查解决了常见竞态：用户快速翻到 10 月后，较慢的 9 月网络请求可能才返回。
如果不比较 `renderVersion`，旧请求会错误地把页面重新画成 9 月。

日期格先写进 `DocumentFragment`，再用 `replaceChildren` 一次替换。它的作用类似先在桌面上
排好 42 张卡片，再整体放进展示框，避免每放一张都让浏览器重新计算布局。

## 5. 节日、休假和补班为什么分开

远端数据通常会把春节假期的每一天都命名为“春节”，但真正的春节本日只有农历正月初一。
项目因此使用三个独立语义：

- `holiday`：整段假期属于哪个节假日，用于翻译名称。
- `festival`：当天是否正好是节日本日，用金色显示。
- `isHoliday`：当天休息还是补班，决定玫瑰色或青色状态。

渲染优先级为“今天的强调效果 + 节日本日 + 休假/补班”。普通周末与普通休假共用休息色，
但法定休假额外显示“休/Rest”，所以颜色一致时仍能读出含义。

## 6. 节假日数据怎样保证可用

`HolidayManager` 采用四层策略：

```text
内存缓存
→ localStorage 持久化缓存
→ 两个远端提供方并行请求
→ 过期缓存或固定公历日期兜底
```

关键细节：

- 同一年同时被多个渲染请求需要时，只共享一个 `Promise`，避免重复联网。
- 远端内容在进入缓存前验证年份、真实日期、名称和布尔字段。
- NateScarlet 的两个地址是同一数据集的镜像，不被误算成两个独立证据来源。
- 主、辅来源冲突时保留主来源并记录警告，辅来源只补缺失日期。
- 缓存最多常驻 12 年，使用 `Map` 插入顺序实现轻量 LRU 淘汰。
- 所有远端都失败时优先使用过期缓存；没有缓存才显示元旦、劳动节和国庆节固定兜底。

数据失败只影响节假日标记，基础日期网格始终可以使用。

## 7. 滚轮为什么能按实际幅度移动

浏览器的 `WheelEvent` 可能用像素、文本行或整页表示滚动量。`interaction-core.js` 先把三种
单位换成“日历星期行”，再累计不足一行的小数。

```text
连续输入：0.4 + 0.4 + 0.4 行
前两次：不移动，保留 0.8
第三次：返回 1 行，继续保留 0.2
```

快速滚动一次得到 3 行就直接移动 3 周，不会强行压缩成一周。渲染层再通过
`requestAnimationFrame` 把同一画面帧内的多次事件合并为一次绘制，因此减少重绘但不减少幅度。

## 8. 自动更新状态机

安装版直接由 `electron-updater` 读取 Release 中的 `latest.yml`：

```text
idle
  → checking
  → available
  → downloading（按钮背景表示 0–100%）
  → downloaded（按钮可点击）
  → installing（隐藏旧窗口、静默安装、重新启动）
```

任何未完成阶段都可能进入 `error`，用户可再次点击检查。开发模式没有可替换的安装目录，
所以只查询 GitHub 最新版本并显示结论，不下载安装。

这里存在三条异步路径：检查 Promise、更新器事件、下载 Promise。它们的回调顺序不固定，例如
下载进度可能先于“检查完成”返回。主进程和界面控制器都执行以下保护：

- 同一检查和下载任务只创建一次。
- 下载百分比只增加，不因网络切换的瞬时报告而倒退。
- 已下载状态不会被迟到的 `available` 或 `downloading` 覆盖。
- 已下载后再次检查失败，仍保留“快速重启更新”入口。
- 页面刷新后通过 `getUpdateState()` 恢复主进程保存的最新状态。

界面使用 `stateRevision`（状态序号）处理跨通道乱序：请求开始时记住序号，收到有效事件或
开始新操作就递增。请求返回时若序号不同，连它的错误处理和 `finally` 清理都不能再改界面。
例如“检查 A → 下载失败 → 用户重试 B → A 返回”，A 不能把 B 的按钮重新启用。这比只判断
“当前是否正在下载”更完整，因为失败、安装和页面恢复也会遇到同样的竞态。

安装失败有两个入口：抛出异常、发出 `error` 事件。二者统一交给 `handleUpdateError`，恢复
被安装流程隐藏的窗口并保留下载好的重启入口。`quitAndInstall()` 正常返回并不证明安装成功；
此恢复仅覆盖旧应用尚未退出时的失败，退出后的安装结果仍由 Windows 安装器负责。

“差分更新”指下载时尽量复用本机已有数据、减少网络传输；条件不满足时更新库可回退完整下载。
安装阶段仍使用完整 NSIS 安装器覆盖程序目录，不是直接对运行中的程序文件打补丁。

版本号按钮与在线更新是两条不同路径。版本说明读取安装包内 `CHANGELOG.md` 对应段落，保证
展示的是当前安装版本；在线检查只负责判断和下载更新。

## 9. Windows 安装目录规范化

安装页选择的是父目录，NSIS 脚本中的 `$INSTDIR` 才是最终程序目录。脚本会连续移除尾部历史
品牌目录，再只追加一次 `VibeCalendar`：

```text
用户选择 D:\          → D:\VibeCalendar
选择 D:\Apps          → D:\Apps\VibeCalendar
旧路径 ...\Vibe Calendar\vibe-calendar\VibeCalendar
                       → ...\VibeCalendar
```

更新器把当前安装位置传回 NSIS，因而新版本覆盖原目录，不会每次增加一层文件夹。安装范围为
机器级，所以写入 `Program Files` 时 Windows 仍可能请求管理员授权。

## 10. 主进程的可靠性和安全边界

- 单实例锁阻止重复桌面快捷方式产生多个窗口；第二次启动只恢复并聚焦已有窗口。
- `nodeIntegration` 关闭，`contextIsolation`、`sandbox` 和 `webSecurity` 开启。
- 主窗口拒绝新窗口和页面导航。
- IPC 除了频道白名单，还验证请求是否来自本地 `index.html`。
- Release 内容只作为纯文本显示，外部链接仅接受 GitHub HTTPS 地址。
- 实时预览只在 `--live-preview` 下监听 `src/renderer`，正式安装版不会创建文件监听器。

## 11. 修改功能时去哪里

| 想修改的内容 | 首选文件 |
| --- | --- |
| 日期排列、月份计算、节日本日算法 | `calendar-core.js` |
| 滚轮速度与余量 | `interaction-core.js` |
| 节假日来源、校验、缓存 | `holidays.js` |
| 中英文文字 | `translations.js` |
| 日期格和按钮如何显示 | `renderer.js` / `style.css` |
| 更新按钮状态 | `update-controller.js` |
| 更新下载和安装 | `main/updater.js` |
| 窗口、IPC、实时预览 | `main/main.js` / `main/preload.js` |
| 安装目录 | `build/installer.nsh` |

修改后先运行与模块对应的测试，正式发布前运行 `npm run verify:full`。测试名称使用完整中文行为
描述，可以把它们当作每个模块的可执行说明书。
