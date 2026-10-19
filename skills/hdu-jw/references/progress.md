# Reading `hdu jw progress`

- `data.gpa` — official GPA from the academic progress page.
- `data.courseCounts` — planned / passed / failed / not taken / in progress course counts.
- `data.categories` — the whole requirement tree (`requiredCredits`, `earnedCredits`, `satisfied`, `parentId`).
- `data.outstanding` — the categories that actually block graduation, each with `missingCredits` and the unfinished `courses` (`status`: `in_progress`, `not_taken`, `other`; `plannedTerm` is when the plan schedules it).

How to answer "还差多少学分 / 还差哪些课":

1. Use `outstanding`, not the top-level total. The top category ("主修") can look nearly complete because surplus credits elsewhere are counted, while specific categories are still short.
2. An unmet category under a satisfied parent is an alternative the student did not choose (e.g. other elective modules) and is already excluded from `outstanding` — do not list it.
3. Separate what will be covered by courses `in_progress` this term from what still needs action.
4. Courses whose `plannedTerm` is already in the past and still `not_taken` (often 课外教育 such as 劳动教育, 讲座, 体质测试) usually need an activity or a credit-recognition application — suggest confirming with the school's academic office or counsellor.
5. End with: results are for reference; the school's graduation review is authoritative.
