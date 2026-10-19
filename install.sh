#!/bin/sh
# Install the latest hdu-cli release:
#   curl -fsSL https://raw.githubusercontent.com/sjsispp/hdu-cli/main/install.sh | sh
# Set HDU_CLI_VERSION=v0.4.0 to install a specific release.
set -eu

REPO="sjsispp/hdu-cli"
if [ -n "${HDU_CLI_VERSION:-}" ]; then
  URL="https://github.com/${REPO}/releases/download/${HDU_CLI_VERSION}/hdu-cli.tgz"
else
  URL="https://github.com/${REPO}/releases/latest/download/hdu-cli.tgz"
fi

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "未找到 Node.js。请先安装 Node.js 20 或更高版本：https://nodejs.org/"
command -v npm >/dev/null 2>&1 || fail "未找到 npm。请重新安装 Node.js（自带 npm）：https://nodejs.org/"

major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$major" -ge 20 ] || fail "当前 Node.js 版本为 $(node -v)，hdu-cli 需要 20 或更高版本。"

printf '正在安装 hdu-cli：%s\n' "$URL"
npm install -g "$URL"

if command -v hdu >/dev/null 2>&1; then
  printf '\n安装完成：hdu %s\n运行 hdu setup 开始首次使用引导。\n' "$(hdu --version)"
else
  printf '\n安装完成，但当前终端找不到 hdu 命令。\n请把 %s 加入 PATH，或重新打开终端后运行 hdu setup。\n' "$(npm prefix -g)/bin"
fi
