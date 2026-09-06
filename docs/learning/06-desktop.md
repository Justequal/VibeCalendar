# 6 · 理解桌面边界与订阅生命周期

前置：[异步服务](05-async.md)。按[main.js](../../src/main/main.js)创建窗口 → [preload.js](../../src/main/preload.js)暴露接口 → [update-controller.js](../../src/renderer/update-controller.js)使用接口的顺序阅读，再进入[updater.js](../../src/main/updater.js)。

主进程管理系统能力，渲染进程管理网页。Preload只提供需要的操作，不把整个Node或IPC对象交给页面。一次请求使用invoke获得Promise结果，持续下载进度通过事件订阅到达。这两条通道可能乱序，更新控制器需拒绝过期状态，不能只看最后到达的消息。

运行 `npm run learn -- 05`，阅读[订阅实验](../../lessons/05-events.mjs)。Set保存函数引用，取消函数通过闭包记住原监听器。实际Preload还包装了IPC事件对象，取消时必须使用包装后的同一个监听器。实验是同步内存通知，没有实现IPC的隔离与序列化。

练习：增加第二个订阅者，只取消第一个，验证第二个仍收到后续通知。回到生产代码找出创建订阅与释放订阅的位置。

检查理解：为什么页面不应拿到任意系统调用入口？边界既限制权限，也明确模块职责。本课只阅读安装流程；实验不会检查远端版本或启动安装器。
