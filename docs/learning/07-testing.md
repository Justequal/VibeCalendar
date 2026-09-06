# 7 · 用不同层次验证同一行为

前置：[桌面能力](06-desktop.md)。先阅读[test/calendar-state.test.js](../../test/calendar-state.test.js)，再读[test/holiday-service.test.js](../../test/holiday-service.test.js)，最后阅读[scripts/ui-smoke.js](../../scripts/ui-smoke.js)。

函数测试覆盖输入、输出与边界；服务测试用可控依赖覆盖失败与乱序；真实Electron冒烟检查页面连接、导航和偏好。它们互相补充：函数断言不能证明按钮接对了，截图也不能证明缓存不会重复请求。`npm run verify`包含教学实验，避免示例逐渐失效；`npm run test:ui`单独运行真实桌面检查。

扩展认识迭代协议：运行 `npm run learn -- 06`，阅读[生成器实验](../../lessons/06-iteration.mjs)。`function*`与`yield`按需提供一行，`for…of`消费它，展开语法会立即消费全部结果。输入仍是42格数组，所以这里没有节省输入内存，也没有理由替换生产数组渲染。

练习：用`for…of`只消费第一行后`break`，与展开成全部六行比较。然后为状态转换增加一个有意义的边界案例，例如从年份1向前翻月，避免仅把实现复制进测试。

检查理解：选择技术方法要看它解决什么问题；认识一种方法不等于必须在主程序使用它。下一课把验证通过的代码交付成应用。
