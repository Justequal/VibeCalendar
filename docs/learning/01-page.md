# 1 · 看见页面，再追踪一个动作

前置：能读HTML标签和JavaScript函数。先运行应用，点击下一月，观察标题与网格一起改变。

从[index.html](../../src/renderer/index.html)找`next-month`，再到[renderer.js](../../src/renderer/renderer.js)找`elements.nextMonth`及`moveMonth`。阅读链路是：按钮事件 → 状态转换 → `renderCalendar` → `renderCalendarGrid` → `replaceChildren`。不要第一遍就进入节假日请求队列。

HTML提供结构，CSS提供样式，控制器连接事件和DOM。`elements`集中保存节点引用；业务`state`保存日期、语言和周起点；渲染快照用于判断是否需要更新，两者职责不同。`DocumentFragment`让网格集中提交，不保证浏览器每插入一个节点就重新布局。

动手：在开发副本里给`moveMonth`加一条日志，分别点击按钮、按方向键，观察它们是否到达同一个入口，然后移除日志。先只追踪数据，不增加第二套日期计算。

检查理解：为什么输入事件不直接修改42个格子？因为集中渲染能让不同输入共享相同行为。下一课先研究渲染所需的数据怎样生成。
