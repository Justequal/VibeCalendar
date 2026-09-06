# 3 · 把动作与界面效果分开

前置：[日期函数](02-functions.md)。阅读[calendar-state.js](../../src/renderer/calendar-state.js)的State与Action注释，再看`transition`。

规则是`transition(旧状态, 动作) → 新状态`，也称reducer。按钮、键盘与滚轮传递动作，控制器负责保存偏好和重绘；reducer本身不订阅事件。展开语法只复制一层，日期变化仍需调用返回新Date的核心函数。`renderVersion`由控制器维护，转换时保留，避免丢失异步先后关系。

运行 `npm run learn -- 02` 并阅读[动作重放](../../lessons/02-state.mjs)。`reduce`把上一步结果作为下一步输入，是数组方法；reducer是函数职责，两者不是同一个概念。回到今天显式传入`now`，便于重放测试，不在纯状态层隐式读取时钟。

练习：追加两次`toggle-week-start`，验证结果恢复原值。再追加一个未知动作，观察它返回同一个对象。项目没有撤销功能，动作日志仅是教学实验，不表示应用会保存用户操作历史。

检查理解：为何状态转换后还要调用渲染？普通JavaScript对象没有自动更新DOM的能力。下一课为界面准备一致的外部数据。
