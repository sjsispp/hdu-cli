# hdu-cli

面向人和智能体的杭州电子科技大学信息 CLI。目前支持学校主站、杭电就业网和本科教务系统，保持只读，可通过钉钉扫码或浏览器完成学校统一身份认证。

## 安装

需要 Node.js 20 或更高版本。

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/sjsispp/hdu-cli/main/install.sh | sh
```

```powershell
# Windows PowerShell
irm https://raw.githubusercontent.com/sjsispp/hdu-cli/main/install.ps1 | iex
```

也可以直接用 npm 安装最新发布版：

```bash
npm install -g https://github.com/sjsispp/hdu-cli/releases/latest/download/hdu-cli.tgz
```

安装后运行 `hdu setup` 完成首次使用引导。升级时重新执行安装命令即可；卸载使用 `npm uninstall -g hdu-cli`。安装脚本可以通过 `HDU_CLI_VERSION=v0.4.0` 指定版本。

请不要使用 `npm install -g github:sjsispp/hdu-cli`：新版 npm 默认不运行依赖的构建脚本，这种方式装出来的包缺少编译产物。

## 开发

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

从源码构建并作为本地命令使用：

```bash
npm run build
npm link      # 把 hdu 注册为全局命令，之后在任意目录可用
hdu setup     # 首次使用引导：检查环境并登录
```

`npm link` 链接的是本项目的 `dist/` 目录：修改代码后需要重新 `npm run build`。使用 nvm 时，每个 Node 版本的全局命令相互独立，切换版本后需要重新 `npm link`。

`hdu setup` 会依次检查会话存储和 `hdu` 命令是否在 PATH 中，然后引导你选择钉钉扫码或浏览器登录统一身份认证，最后显示各网站的登录状态和常用命令。已登录时可以选择跳过。引导需要在交互式终端中运行；脚本或智能体请使用 `hdu auth login`。

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

`auth login` 默认在终端中显示杭电统一身份认证的钉钉登录二维码，用手机钉钉扫码确认即可；二维码过期后会自动刷新，不需要本机浏览器。也可以用 `--method browser` 打开本机 Chrome、Edge 或 Chromium，在学校统一身份认证页面中自行完成密码、验证码或短信验证。两种方式下 CLI 都不读取和保存密码。

登录成功后，CLI 保存统一身份认证（`sso.hdu.edu.cn`）的会话，并用它换取各网站的会话。某个网站的会话过期时，CLI 会自动用统一身份认证会话重新换取，无需再次扫码；只有统一身份认证会话本身过期后才需要重新登录。`hdu auth status` 会分别显示统一身份认证和各网站的状态。

会话加密保存在本机：macOS 使用钥匙串，Windows 使用当前账户的 DPAPI 加密后存放在 `%LOCALAPPDATA%\hdu-cli`，只有同一台电脑上的同一个 Windows 账户能解密。统一身份认证会话在有效期内相当于你的登录凭证，请不要把它导出或分享。

认证不会开放写操作；当前 CLI 不会投递简历、收藏岗位或报名活动。其他系统（如 Linux）可以临时通过 `HDU_JOB_COOKIE` 提供会话。

### 本科教务系统

需要先运行 `hdu auth login`。教务系统会话由统一身份认证会话自动换取和续期。

```bash
# 学籍信息：只输出学号、姓名、学院、专业、班级、年级、学制、学籍状态等学业字段
hdu jw profile --json

# 课表：整学期、某一教学周（含调课）、某一天
hdu jw timetable --json
hdu jw week --week 8 --json
hdu jw today --json
hdu jw today --date 2026-10-21 --json

# 成绩（默认全部学期）、考试安排与尚未排考的课程（默认当前学期）
hdu jw grades --year 2025 --term 2 --json
hdu jw exams --year 2025 --term 2 --json

# 学业进度：官方 GPA、各类别学分要求、尚未修满的类别及其中未完成的课程
hdu jw progress --json

# 本人选课结果、毕业设计课题与答辩环节
hdu jw selections --json
hdu jw thesis --json

# 空闲教室（默认本周、今天）与全校开课查询
hdu jw rooms --periods 3-4 --campus xiasha --building 第6教研楼 --min-seats 100 --json
hdu jw courses --query 高等数学 --json
hdu jw courses --teacher 陈洁 --json
```

`--year` 是学年的起始年份（2026 表示 2026-2027 学年），`--term` 为 1、2 或 3（第三学期即夏季小学期）。8 月至次年 1 月视为第一学期，2 月至 7 月视为第二学期。教学周次来自教务系统的校历，`jw today` 和 `jw rooms` 会据此推算当天是第几周。

`jw progress` 只列出真正影响毕业的类别：如果某个类别的上级已经满足（例如已修满一个专业方向模块），其他未选的同级模块不会被列为欠缺。结果仅供参考，以学院毕业审核为准。

个人信息页面上的证件号码、户口所在地、出生日期、民族、政治面貌、考生号等敏感字段不会被输出；选课名单接口同样返回证件号码和手机号，CLI 只保留课程字段。教务系统仅提供查询命令，CLI 不会选课、退课、报名或提交任何申请。

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

## JSON 输出约定

加 `--json` 时，成功结果写到 stdout，退出码为 0：

```json
{ "ok": true, "data": { ... } }
```

失败时（包括参数错误）写到 stderr，退出码非 0：

```json
{ "ok": false, "error": { "type": "auth_required", "message": "教务系统未登录或会话已过期。", "hint": "请用户在自己的终端运行 hdu setup（首次）或 hdu auth login 完成扫码登录，然后重试。" } }
```

判断成败请看 `ok` 或退出码。`hint` 给出下一步该怎么做。

| `error.type` | 退出码 | 含义 |
| --- | --- | --- |
| `internal` | 1 | 未预期的内部错误 |
| `invalid_argument` | 2 | 参数或用法错误 |
| `auth_required` | 3 | 需要登录或会话已过期 |
| `network` | 4 | 网络不可达或超时 |
| `upstream` | 5 | 学校网站返回错误或暂时不可用 |
| `parse` | 6 | 页面结构变化，无法解析 |
| `unsupported` | 7 | 当前环境或目标不受支持（如非杭电域名） |

## 发布

1. 修改 `package.json` 中的 `version`，提交后推送到 `main`。
2. 打上同名标签并推送，例如 `git tag v0.4.0 && git push origin v0.4.0`。
3. GitHub Actions 会在 Ubuntu、macOS 和 Windows 上运行类型检查与测试，然后创建 Release 并附上 `hdu-cli.tgz`，安装脚本会自动使用最新版本。

## 测试

```bash
npm test
npm run test:live
```

普通测试不访问网络；`test:live` 会以低请求量验证杭电主站当前页面结构。已登录时可以用 `HDU_LIVE_AUTH=1 npm run test:live` 一并验证教务系统，这类测试只检查数据结构，不输出个人信息。

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
- 钉钉扫码或浏览器完成统一身份认证，会话加密保存在 macOS 钥匙串或 Windows DPAPI
- 主站服务入口、办公电话、工作班车和三个校区上课时间
- 本科教务系统：学籍信息、学期/周/日课表、成绩、考试与未排考课程、学业进度、选课结果、毕业设计、空闲教室、全校开课查询

后续计划扩展研究生院和教师主页，并在数据模型稳定后增加 MCP 入口。
