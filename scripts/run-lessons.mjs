/** 原生ES模块入口：URL相对当前文件解析，因此不依赖调用者的工作目录。 */
const lessons = ['01-functions', '02-state', '03-data', '04-async', '05-events', '06-iteration'];
const selected = process.argv[2];
const matches = selected ? lessons.filter(name => name === selected || name.startsWith(`${selected}-`)) : lessons;

if (process.argv.length > 3 || matches.length === 0) {
  console.error('用法：npm run learn [-- 01至06]');
  process.exitCode = 1;
} else {
  for (const name of matches) {
    // 动态import只加载选中的实验；顶层await按顺序展示结果，便于逐课阅读。
    const { run } = await import(new URL(`../lessons/${name}.mjs`, import.meta.url));
    console.log(`${name}:`, await run());
  }
}
