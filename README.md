# hdu-cli

面向人和智能体的杭州电子科技大学信息 CLI。目前支持学校主站与杭电就业网，保持只读，并可通过浏览器完成学校统一身份认证。

## 使用

```bash
npm install
npm run dev -- notice list
npm run dev -- event list --json
npm run dev -- search "人工智能" --pages 3 --json
npm run dev -- page get "https://www.hdu.edu.cn/.../page.htm"
npm run dev -- deadline list --limit 5 --json
npm run dev -- job notices --limit 10 --json
npm run dev -- job talks --query "人工智能" --json
npm run dev -- job fairs --json
npm run dev -- job positions --type intern --query "算法" --json
npm run dev -- job get "https://job.hdu.edu.cn/job/view?id=..." --json
npm run dev -- service phones --query "教务处" --json
npm run dev -- service buses --campus xiasha --json
npm run dev -- service class-times --campus qingshanhu --json
```

构建并作为本地命令使用：

```bash
npm run build
npm link
hdu notice list
```

### 杭电就业网

```bash
# 招聘公告、宣讲会、招聘会
hdu job notices --page 1 --limit 20 --json
hdu job talks --query "宇树" --json
hdu job fairs --json

# all / fulltime / intern
hdu job positions --type fulltime --query "Java" --json

# 岗位、宣讲会、招聘会等详情
hdu job get "https://job.hdu.edu.cn/job/view?id=..." --json
```

就业网列表页使用服务端压缩内容，CLI 会自动解码。部分详情正文使用网站自定义字体保护，个别页面的正文字符可能无法完整还原；标题、时间、地点、公司、薪资、学历和详情链接等结构化字段不受影响。

### 统一身份认证

```bash
hdu auth login                    # 默认：终端显示二维码，用钉钉扫码
hdu auth login --method browser   # 打开浏览器登录
hdu auth status --json
hdu auth logout
```

`auth login` 默认在终端中显示杭电统一身份认证的钉钉登录二维码，用手机钉钉扫码确认即可；二维码过期后会自动刷新，不需要本机浏览器。也可以用 `--method browser` 打开本机 Chrome、Edge 或 Chromium，在学校统一身份认证页面中自行完成密码、验证码或短信验证。两种方式下 CLI 都不读取和保存密码，只把登录成功后的 `job.hdu.edu.cn` 会话 Cookie 保存到 macOS 钥匙串。登录后，就业网读取命令会自动使用该会话。

认证不会开放写操作；当前 CLI 不会投递简历、收藏岗位或报名活动。非 macOS 环境可以临时通过 `HDU_JOB_COOKIE` 提供会话。

### 主站服务信息

```bash
# 图书馆、档案馆、校医院、后勤、安全保卫等入口
hdu service links --json

# 办公电话；可按机构、岗位或号码检索
hdu service phones --query "教务处" --json
hdu service phones --category academic --json

# 工作班车：xiasha / shaoxing
hdu service buses --campus xiasha --json

# 上课时间：xiasha / shaoxing / qingshanhu
hdu service class-times --campus qingshanhu --json
```

办公电话的分类参数包括 `all`、`administration`、`academic`、`support`、`affiliated` 和 `research`。班车结果保留主站发布的运行日期、停运提示、发车时间、车型和完整线路；遇到临时调整时应以学校最新通知为准。

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
- 就业网招聘公告、宣讲会、招聘会
- 全职与实习岗位搜索
- 就业网详情与附件提取
- 浏览器辅助统一身份认证与 macOS 钥匙串会话存储
- 主站服务入口、办公电话、工作班车和三个校区上课时间

后续计划扩展教务处、研究生院和教师主页，并在数据模型稳定后增加 MCP 入口。
