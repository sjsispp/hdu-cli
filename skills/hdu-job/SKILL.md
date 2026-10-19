---
name: hdu-job
version: 0.4.0
description: "杭电就业网（job.hdu.edu.cn）只读查询：招聘公告、宣讲会、招聘会、全职与实习岗位及其详情。当用户问校招、宣讲会、招聘会、实习或某公司来不来杭电时使用。不负责：投递简历、报名或收藏（不支持）、教务信息（走 hdu-jw）、学校通知（走 hdu-campus）。"
metadata:
  requires:
    bins: ["hdu"]
  cliHelp: "hdu job --help"
---

# hdu job — careers site

Read [`../hdu-shared/SKILL.md`](../hdu-shared/SKILL.md) first. Lists are public; logging in (see hdu-shared) adds fields such as salary on positions.

| User asks about | Command |
| --- | --- |
| Recruitment notices | `hdu job notices [--query <关键词>] --json` |
| Company info sessions (宣讲会) | `hdu job talks [--query <公司>] --json` |
| Job fairs (招聘会) | `hdu job fairs --json` |
| Positions | `hdu job positions [--type all\|fulltime\|intern] [--query <岗位或公司>] --json` |
| Details of one item | `hdu job get <job.hdu.edu.cn URL from a list result> --json` |

All list commands take `--page` and `--limit`. `data.authenticated` tells whether logged-in fields are included.

- For "today's / this week's talks", list `job talks` and filter by the date fields yourself; state the dates you used.
- Some detail pages use a protected font, so a few characters of the body text may be unreadable; structured fields (time, place, company, salary) are reliable.
