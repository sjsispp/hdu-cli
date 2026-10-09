# 招聘会 / 宣讲会定时摘要 → 飞书

一个独立的编排脚本，调用 hdu-cli 的就业网能力，把杭电**招聘会**和**宣讲会**的近期信息
定时推送到飞书群自定义机器人。不修改 hdu-cli 本身（保持只读定位）。

## 两个任务

| 任务   | 节律          | 窗口     | 行为                                   |
| ------ | ------------- | -------- | -------------------------------------- |
| weekly | 每周一次       | 未来 7 天 | 本周概览，全量列出（不去重）           |
| daily  | 每天一次       | 未来 3 天 | 只推「新出现」的活动（增量提醒）        |

两个任务共享 `seen.json` 记录：周概览会标记已读，之后每日任务只提醒期间**新发布**的近期活动，不会重复刷屏。

### 调度方式：轮询而非固定时刻

launchd 以**轮询**方式唤起脚本（daily 每 15 分钟、weekly 每 30 分钟），脚本内用守卫决定要不要真正发送：

- 早于 `SEND_AFTER_HOUR`（默认 8 点）/ 当天（当周）已发过 → 立即跳过，不抓网络；
- 到点且未发过 → 尝试抓取；**网络没就绪就安静等下次轮询**；成功后发送并记录到 `state.json`。

这样无论几点开机、几点连上网（例如用手机热点），**当天第一次有网时就会发送，且每天/每周只发一次**。手动强制发送可加 `--force`。

## 准备

1. 在目标飞书群里添加「自定义机器人」，复制其 Webhook 地址。若开启了「签名校验」，同时记下密钥。
2. 配置 Webhook（二选一）：
   - 复制 `config.example.json` 为 `config.json`，填入 `webhook`（和可选 `secret`）；或
   - 设置环境变量 `HDU_DIGEST_WEBHOOK`（和可选 `HDU_DIGEST_SECRET`）。
3. （可选）就业网登录态：`hdu auth login`。招聘会/宣讲会列表本身公开，可不登录。

## 本地验证（不发送）

```bash
npm run build                                   # 生成 dist
node scripts/job-digest/digest.mjs weekly --dry-run   # 打印将要发送的卡片
node scripts/job-digest/digest.mjs daily  --dry-run
```

## 安装定时任务（macOS launchd）

```bash
bash scripts/job-digest/install.sh
# 首次安装后建议 seed 一次，避免第一天把历史活动一次性推出：
node scripts/job-digest/digest.mjs daily --seed
```

卸载：

```bash
bash scripts/job-digest/install.sh uninstall
```

日志在 `scripts/job-digest/logs/`。手动触发一次可用
`launchctl start com.hdu.jobdigest.daily`。

## 卡片内容

每场活动除了标题/时间/地点，还会抓取其详情页补充：

- 🏢 公司画像（行业 · 规模）
- ✉️ 简历投递邮箱
- 💼 该公司在这场活动下挂出的**在招岗位**（标题 + 可点进的岗位链接）

岗位来自每场活动详情页里的 `/job/view` 链接，因此与活动一一对应；不是全站岗位库的无关数据。

## 说明

- `config.json`、`seen.json`、`state.json`、`logs/` 已在 `.gitignore` 中忽略（含 Webhook/密钥，勿提交）。
- 时间窗口、抓取页数等可在 `digest.mjs` 顶部的 `PROFILES` / `MAX_PAGES` 调整；每场活动的在招岗位全部展示，不做数量截断。
- 逐条抓详情会按活动数量产生请求（weekly 覆盖一周可能有数十场），已用并发上限 `ENRICH_CONCURRENCY` 控制压力。
- 会话 Cookie 过期不影响公开列表；需要登录才可见的内容会缺失，重新 `hdu auth login` 即可。
