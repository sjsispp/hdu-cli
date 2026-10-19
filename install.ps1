# Install the latest hdu-cli release on Windows:
#   irm https://raw.githubusercontent.com/sjsispp/hdu-cli/main/install.ps1 | iex
# Set $env:HDU_CLI_VERSION = "v0.4.0" to install a specific release.
$ErrorActionPreference = "Stop"

$repo = "sjsispp/hdu-cli"
if ($env:HDU_CLI_VERSION) {
  $url = "https://github.com/$repo/releases/download/$($env:HDU_CLI_VERSION)/hdu-cli.tgz"
} else {
  $url = "https://github.com/$repo/releases/latest/download/hdu-cli.tgz"
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "未找到 Node.js。请先安装 Node.js 20 或更高版本：https://nodejs.org/"
  return
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error "未找到 npm。请重新安装 Node.js（自带 npm）：https://nodejs.org/"
  return
}

$major = [int](node -p "process.versions.node.split('.')[0]")
if ($major -lt 20) {
  Write-Error "当前 Node.js 版本为 $(node -v)，hdu-cli 需要 20 或更高版本。"
  return
}

Write-Host "正在安装 hdu-cli：$url"
npm install -g $url
if ($LASTEXITCODE -ne 0) {
  Write-Error "npm install 失败（退出码 $LASTEXITCODE）。"
  return
}

if (Get-Command hdu -ErrorAction SilentlyContinue) {
  Write-Host "`n安装完成：hdu $(hdu --version)`n运行 hdu setup 开始首次使用引导。"
} else {
  Write-Host "`n安装完成，请重新打开终端后运行 hdu setup。"
}
