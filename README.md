# hdu-cli

面向人和智能体的杭州电子科技大学公开信息 CLI。目前是主站可行性验证版，只读取公开的 `*.hdu.edu.cn` 页面，不处理登录和写操作。

## 使用

```bash
npm install
npm run dev -- notice list
npm run dev -- event list --json
npm run dev -- search "人工智能" --pages 3 --json
npm run dev -- page get "https://www.hdu.edu.cn/.../page.htm"
npm run dev -- deadline list --limit 5 --json
```

构建并作为本地命令使用：

```bash
npm run build
npm link
hdu notice list
```

`npm link` 会把当前项目注册为本机的 `hdu` 命令。可用下面的命令确认 Codex 所在终端能够找到它：

```bash
command -v hdu
hdu --version
```

本项目同时提供了 `AGENTS.md`，当 Codex 在此仓库中工作时，会获知应优先使用 `hdu ... --json` 查询杭电公开信息。

## 测试

```bash
npm test
npm run test:live
```

普通测试不访问网络；`test:live` 会以低请求量验证杭电主站当前页面结构。

## 当前范围

- 学校主站通知公告
- 学校主站讲座论坛
- 杭电新闻
- 近期栏目内关键词搜索
- 文章正文与附件地址提取
- 基础截止时间识别

后续计划扩展教务处、研究生院、就业网和教师主页，并在数据模型稳定后增加 MCP 入口。
