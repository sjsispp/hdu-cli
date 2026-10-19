---
name: hdu-shared
version: 0.4.0
description: "Shared base for every hdu-* skill: installing the hdu CLI, HDU unified-identity login (DingTalk QR), auth status, the --json ok/error envelope and exit codes, and the read-only / privacy rules. Use when hdu is missing, a command returns auth_required or another error, or the user asks about logging in to 杭电统一身份认证. Not for answering domain questions — use hdu-jw, hdu-job or hdu-campus."
metadata:
  requires:
    bins: ["hdu"]
  cliHelp: "hdu --help"
---

# hdu shared rules

`hdu` is a read-only CLI for Hangzhou Dianzi University (杭州电子科技大学 / 杭电 / HDU). Every `hdu-*` skill relies on the rules below.

## Before the first command

1. Run `hdu --version`. If the command is missing, ask the user to install it (it also installs these skills):
   - macOS / Linux: `curl -fsSL https://raw.githubusercontent.com/sjsispp/hdu-cli/main/install.sh | sh`
   - Windows PowerShell: `irm https://raw.githubusercontent.com/sjsispp/hdu-cli/main/install.ps1 | iex`
2. Commands that need a login (`hdu jw …`, logged-in fields of `hdu job …`): check `hdu auth status --json` first if unsure.

## Output contract

Always pass `--json`.

- Success → stdout, exit 0: `{"ok": true, "data": …}`. Answer from `data`; keep `url` fields to cite sources.
- Failure → stderr, non-zero exit: `{"ok": false, "error": {"type", "message", "hint"}}`. Follow `hint`.
- An `_notice` field on success is informational (e.g. skills out of date). Finish the user's task first, then mention it briefly.

| `error.type` | exit | What to do |
| --- | --- | --- |
| `auth_required` | 3 | Login needed → read [`references/login.md`](references/login.md) |
| `invalid_argument` | 2 | Fix the arguments; run `hdu <command> --help` |
| `network` | 4 | Retry once; off campus some systems may need the school VPN |
| `upstream` | 5 | School site unavailable — tell the user, do not loop |
| `parse` | 6 | The site changed — tell the user to upgrade hdu or report it |
| `unsupported` | 7 | Not possible here (non-HDU URL, platform) — explain |
| `internal` | 1 | Unexpected — report the message |

## Rules

1. **Read-only.** Never select or drop courses, register, submit applications, collect jobs or perform any state-changing action, even if asked — explain that hdu cannot.
2. **Stay inside the CLI.** Do not call HDU systems with your own scripts or HTTP requests, and never read saved sessions (macOS Keychain items `hdu-cli.*`, `%LOCALAPPDATA%\hdu-cli`, `HDU_*_COOKIE`). If hdu cannot answer, say which capability is missing.
3. **Never ask for the user's password or verification code.**
4. **Privacy.** Academic records are the user's private data: share only what they asked for and do not copy them elsewhere.

## Must-read references

| When | Read |
| --- | --- |
| `auth_required`, first-time setup, login questions, `hdu auth …` | [`references/login.md`](references/login.md) |
