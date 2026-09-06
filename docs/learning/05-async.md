# 5 · 让异步工作可控制、可测试

前置：[外部数据](04-data.md)。按`fetchHolidays → drainRequests → fetchAndCache`阅读[holidays.js](../../src/renderer/holidays.js)，随后回看构造器注入项。

`getHolidays`同步提供当前快照，`fetchHolidays`异步刷新。有效缓存直接返回；同一年正在请求时共享工作；其余任务进入有上限的队列。队列限制的是年份任务，一个年份内部仍会请求多个地址。超时不仅覆盖响应头，也覆盖响应体读取，并尝试取消底层请求。

认识三个组合：`Promise.any`适合多个镜像中先取得一个成功结果，全部失败才失败；`Promise.allSettled`等待全部成功或失败结果，适合整理两个提供方状态；`Promise.all`遇到一个失败就拒绝，但不会自动取消其他请求。不要把“先拒绝”当成“已取消”。

运行 `npm run learn -- 04`，阅读[依赖注入实验](../../lessons/04-async.mjs)。真实服务接收假fetch、固定时钟和禁用存储选项，因此可离线验证请求去重和缓存命中。两次同年调用共享工作与结果，不保证包装Promise的引用相等。

练习：让假fetch抛错，观察服务如何提供本地降级数据，再参考[服务测试](../../test/holiday-service.test.js)补上相应预期。渲染器另外使用递增序号，只有最新调用可要求重绘；服务缓存仍可接收旧调用获取的有效数据。

检查理解：缓存解决重复工作，渲染序号解决谁有权更新界面，它们处理的问题不同。下一课看跨进程消息。

## 扩展：异步不等于多线程

Promise与await允许等待期间处理其他事件，但不会自动把JSON解析移出当前线程。阅读[后台代理](../../src/renderer/holiday-background.js)与[Worker入口](../../src/renderer/holiday-worker.js)：两边通过postMessage交换可复制数据，Worker没有DOM和localStorage。

本项目在60秒后才创建线程，避免线程启动也抢占首屏资源。用单调时钟限制延迟，用任务编号配对响应，用超时释放未完成的请求。结构化克隆不保留Object.freeze，所以主线程接收后恢复只读约束。学习时先理解两条消息，再阅读缓存与失败恢复；Electron安装API依然留在主进程。
