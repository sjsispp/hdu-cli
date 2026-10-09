#!/usr/bin/env bash
# 安装 macOS launchd 定时任务：
#   - 每周一 08:00 推送未来 7 天概览（com.hdu.jobdigest.weekly）
#   - 每天   08:10 推送未来 3 天新增（com.hdu.jobdigest.daily）
#
# 用法:
#   bash scripts/job-digest/install.sh          安装/更新并加载
#   bash scripts/job-digest/install.sh uninstall 卸载
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
AGENTS_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$SCRIPT_DIR/logs"
WEEKLY_LABEL="com.hdu.jobdigest.weekly"
DAILY_LABEL="com.hdu.jobdigest.daily"

unload_one() {
  local label="$1"
  launchctl unload "$AGENTS_DIR/$label.plist" 2>/dev/null || true
  rm -f "$AGENTS_DIR/$label.plist"
}

if [[ "${1:-}" == "uninstall" ]]; then
  unload_one "$WEEKLY_LABEL"
  unload_one "$DAILY_LABEL"
  echo "已卸载 $WEEKLY_LABEL 和 $DAILY_LABEL。"
  exit 0
fi

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "找不到 node，请先安装 Node.js (>=20)。" >&2
  exit 1
fi

# 确保 dist 已构建（脚本直接 import dist/sources/job-site.js）
if [[ ! -f "$REPO_DIR/dist/sources/job-site.js" ]]; then
  echo "构建 dist ..."
  (cd "$REPO_DIR" && npm run build)
fi

if [[ ! -f "$SCRIPT_DIR/config.json" && -z "${HDU_DIGEST_WEBHOOK:-}" ]]; then
  echo "提示：未发现 config.json。请复制 config.example.json 为 config.json 并填入飞书 Webhook，" >&2
  echo "      或先设置 HDU_DIGEST_WEBHOOK 环境变量再运行。" >&2
fi

mkdir -p "$AGENTS_DIR" "$LOG_DIR"

# 采用「轮询」而非固定时刻触发：每 interval 秒唤起一次，由脚本内的守卫决定是否真正发送
# （每天/每周只发一次，且早于发送时间或网络未就绪时安静跳过）。这样无论几点开机、
# 几点连上网（如热点），当天第一次有网时就会发送。
write_plist() {
  local label="$1" profile="$2" interval="$3"
  cat > "$AGENTS_DIR/$label.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$SCRIPT_DIR/digest.mjs</string>
    <string>$profile</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO_DIR</string>
  <key>StartInterval</key><integer>$interval</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$LOG_DIR/$profile.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/$profile.log</string>
</dict>
</plist>
PLIST
  launchctl unload "$AGENTS_DIR/$label.plist" 2>/dev/null || true
  launchctl load "$AGENTS_DIR/$label.plist"
  echo "已加载 $label -> $AGENTS_DIR/$label.plist（每 ${interval}s 轮询）"
}

write_plist "$DAILY_LABEL"  daily  900   # 每 15 分钟检查，当天第一次有网时发送一次
write_plist "$WEEKLY_LABEL" weekly 1800  # 每 30 分钟检查，当周第一次有网时发送一次

echo
echo "完成。建议首次安装后执行一次 seed，避免第一天把历史活动一次性推出："
echo "  node $SCRIPT_DIR/digest.mjs daily --seed"
echo "查看日志： $LOG_DIR/daily.log  /  $LOG_DIR/weekly.log"
