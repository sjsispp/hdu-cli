---
name: hdu-jw
version: 0.4.0
description: "杭电本科教务系统（正方 newjw）只读查询：本人课表（学期/教学周/今天）、成绩与绩点、考试安排与未排考课程、学业进度与毕业学分差额、选课结果、毕业设计课题与答辩，以及全校空闲教室和开课查询。当用户问“今天/这周有什么课”“第几周”“成绩/GPA”“考试”“还差多少学分毕业”“哪里有空教室”“某课谁教/在哪上”时使用。不负责：招聘/宣讲会（走 hdu-job）、学校通知/班车/电话（走 hdu-campus）、选课退课等写操作（不支持）。"
metadata:
  requires:
    bins: ["hdu"]
  cliHelp: "hdu jw --help"
---

# hdu jw — academic system

Read [`../hdu-shared/SKILL.md`](../hdu-shared/SKILL.md) first (install, login, output contract, rules). Every command here needs a login; on `auth_required` follow hdu-shared.

## Commands

| User asks about | Command |
| --- | --- |
| Classes today / on a date | `hdu jw today [--date 2026-10-21] --json` |
| Which teaching week it is, this/next week's classes | `hdu jw week [--week <n>] --json` |
| Whole-term timetable | `hdu jw timetable --json` |
| Grades | `hdu jw grades [--year <y> --term <t>] --json` |
| GPA, credits still needed to graduate | `hdu jw progress --json` |
| Exam schedule, exams not yet scheduled | `hdu jw exams --json` |
| Courses I selected this term | `hdu jw selections --json` |
| Graduation project topic, advisor, defenses | `hdu jw thesis --json` |
| Empty classrooms | `hdu jw rooms --periods 3-4 [--campus xiasha] [--date …] [--building …] [--min-seats …] --json` |
| Who teaches a course / where and when it meets | `hdu jw courses --query <课程名或代码> \| --teacher <教师> \| --location <地点> --json` |
| Student profile (academic fields only) | `hdu jw profile --json` |

`--year <start-year> --term 1|2|3` selects a term (`--year 2025 --term 2` = 2025-2026 second term; term 3 is summer). Without them, commands use the current term (Aug–Jan = term 1, Feb–Jul = term 2); `grades` defaults to all terms.

## Answering well

- **Teaching weeks:** never compute the week yourself — `jw today` / `jw week` read it from the school calendar and include rescheduled classes. `week` in the result gives the date range.
- **GPA:** use `data.gpa` from `jw progress` (official). A credit-weighted average computed from `jw grades` is only an estimate; label it so.
- **Graduation credits:** read [`references/progress.md`](references/progress.md) before answering from `jw progress`.
- **Empty rooms:** `--periods` is required; the default campus is 下沙 (`xiasha`), others are `qingshanhu`, `shaoxing` or the Chinese name. Class period times come from `hdu service class-times` (hdu-campus).
- **Course search** needs at least one of `--query`, `--teacher`, `--location`.
