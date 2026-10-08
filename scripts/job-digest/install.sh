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

write_plist() {
  local label="$1" profile="$2" hour="$3" minute="$4" weekday="$5"
  local weekday_entry=""
  if [[ -n "$weekday" ]]; then
    weekday_entry="    <key>Weekday</key><integer>$weekday</integer>"
  fi
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
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>$hour</integer>
    <key>Minute</key><integer>$minute</integer>
$weekday_entry
  </dict>
  <key>StandardOutPath</key><string>$LOG_DIR/$profile.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/$profile.log</string>
</dict>
</plist>
PLIST
  launchctl unload "$AGENTS_DIR/$label.plist" 2>/dev/null || true
  launchctl load "$AGENTS_DIR/$label.plist"
  echo "已加载 $label -> $AGENTS_DIR/$label.plist"
}

# 周一先跑（08:00）记录活动，每日任务稍后（08:10）基于已读记录做增量
write_plist "$WEEKLY_LABEL" weekly 8 0 1
write_plist "$DAILY_LABEL"  daily  8 10 ""

echo
echo "完成。建议首次安装后执行一次 seed，避免第一天把历史活动一次性推出："
echo "  node $SCRIPT_DIR/digest.mjs daily --seed"
echo "查看日志： $LOG_DIR/daily.log  /  $LOG_DIR/weekly.log"
