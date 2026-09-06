# 2 · 用可预测的函数计算日期

前置：[页面入口](01-page.md)。阅读[calendar-core.js](../../src/renderer/calendar-core.js)中的`createDate`、`addMonths`和`buildWeekWindowCells`，暂时跳过节日表。

纯函数不读取DOM、不发请求，给定输入得到可预测输出。Date对象本身可变，`const`只限制变量重新赋值，不会禁止`setMonth`。因此导航函数返回新Date，避免修改旧状态。年份1—99有构造器兼容行为，项目通过`setFullYear`显式设置；月份仍从0开始。自然日运算不能简单等同于固定毫秒数跨越夏令时边界。

运行 `npm run learn -- 01`，阅读[实验源码](../../lessons/01-functions.mjs)。它验证12月跨年，同时验证旧输入仍为12月。输出中月份使用日期键表示，避免终端时区显示造成误读。

练习：将偏移改成-1，先写出期望年月，再调整断言。之后阅读[test/calendar-core.test.js](../../test/calendar-core.test.js)中的极端年份案例，理解正常路径之外的边界。

检查理解：网格函数为什么返回普通记录而不是HTML？记录能被渲染器、测试和迭代实验共同使用。下一课把这些函数组合成用户动作。
