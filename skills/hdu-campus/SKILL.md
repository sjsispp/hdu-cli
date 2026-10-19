---
name: hdu-campus
version: 0.5.0
description: "杭电主站（www.hdu.edu.cn）公开信息：通知公告、讲座论坛、新闻、站内搜索、网页正文与附件、截止时间提取，以及办公电话、教职工班车、各校区上课作息时间和服务入口。当用户问学校通知、讲座、某部门电话、班车时刻、第几节课几点上时使用。不负责：本人课表成绩（走 hdu-jw）、招聘（走 hdu-job）。"
metadata:
  requires:
    bins: ["hdu"]
  cliHelp: "hdu --help"
---

# hdu campus — main site and services

Read [`../hdu-shared/SKILL.md`](../hdu-shared/SKILL.md) first. These commands are public and need no login.

| User asks about | Command |
| --- | --- |
| Notices / lectures / news | `hdu notice list --json`, `hdu event list --json`, `hdu news list --json` (`--page`, `--limit`) |
| Search recent main-site items | `hdu search <query> [--pages <n>] --json` |
| Read a page and its attachments | `hdu page get <*.hdu.edu.cn URL> --json` |
| Deadlines in recent notices | `hdu deadline list --json` — best effort; verify on the source page |
| Office phone numbers | `hdu service phones --query <部门或岗位> [--category …] --json` |
| Staff shuttle buses | `hdu service buses --campus xiasha\|shaoxing --json` |
| Class period times (第几节几点) | `hdu service class-times --campus xiasha\|shaoxing\|qingshanhu --json` |
| Official service links (library, hospital, …) | `hdu service links --json` |

- Bus results include suspension and adjustment notes (`notes`); always mention them.
- `page get` only accepts `*.hdu.edu.cn` URLs.
