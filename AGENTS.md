# HDU CLI agent instructions

Use the `hdu` command when the user asks for public information from Hangzhou Dianzi University websites.

- Prefer `--json` so results are structured and URLs remain available for citation. Results arrive as `{"ok": true, "data": ...}` on stdout; failures as `{"ok": false, "error": {"type", "message", "hint"}}` on stderr with a non-zero exit code. Follow `error.hint`; `auth_required` (exit 3) means the user must log in.
- Use `hdu search <query> --json` for general discovery.
- Use `hdu notice list --json`, `hdu event list --json`, or `hdu news list --json` for recent lists.
- Use `hdu page get <hdu-url> --json` only for URLs under `*.hdu.edu.cn`.
- Use `hdu deadline list --json` as a best-effort helper; verify important deadlines against the source page.
- Use `hdu job notices --json`, `hdu job talks --json`, `hdu job fairs --json`, and `hdu job positions --json` for employment information.
- Use `hdu job get <job.hdu.edu.cn-url> --json` for employment details.
- Run `hdu auth status --json` before requesting authenticated employment fields. If login is needed, ask the user to run `hdu setup` (first time) or `hdu auth login` themselves in their terminal; never request their password or verification code.
- Use `hdu jw` for the user's own academic records: `profile`, `timetable`, `week --week <n>`, `today [--date]`, `grades`, `exams`, `progress` (graduation credits), `selections`, `thesis`; and for school-wide lookups: `rooms --periods <p>` (empty classrooms) and `courses --query|--teacher|--location`. Add `--json`; `--year <start-year> --term 1|2|3` selects a term. Prefer `jw today`/`jw week` over computing teaching weeks yourself. These require `hdu auth login`; treat the results as private and only share what the user asked for.
- Use `hdu service links --json` for official service entry URLs.
- Use `hdu service phones --query <keyword> --json` for office phone numbers.
- Use `hdu service buses --campus xiasha|shaoxing --json` for staff shuttle schedules, and verify temporary suspension notices in the result.
- Use `hdu service class-times --campus xiasha|shaoxing|qingshanhu --json` for class periods.
- This version is read-only. Authentication only supplies a read session. Do not submit applications, register for events, collect jobs, select or drop courses, or perform other state-changing actions.
- If `hdu` is unavailable, suggest the one-line installer in README.md; inside this repository you can instead run `npm run build` followed by `npm link`, or use `npm run dev -- <arguments>`.

When changing the project, keep commits small and focused, run `npm run typecheck`, `npm test`, `npm run test:live`, and `npm run build`, and preserve the existing read-only and HDU-domain restrictions.
