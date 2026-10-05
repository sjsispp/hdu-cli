# HDU CLI agent instructions

Use the `hdu` command when the user asks for public information from Hangzhou Dianzi University websites.

- Prefer `--json` so results are structured and URLs remain available for citation.
- Use `hdu search <query> --json` for general discovery.
- Use `hdu notice list --json`, `hdu event list --json`, or `hdu news list --json` for recent lists.
- Use `hdu page get <hdu-url> --json` only for URLs under `*.hdu.edu.cn`.
- Use `hdu deadline list --json` as a best-effort helper; verify important deadlines against the source page.
- Use `hdu job notices --json`, `hdu job talks --json`, `hdu job fairs --json`, and `hdu job positions --json` for employment information.
- Use `hdu job get <job.hdu.edu.cn-url> --json` for employment details.
- Run `hdu auth status --json` before requesting authenticated employment fields. If login is needed, ask the user to complete `hdu auth login` interactively; never request their password or verification code.
- Use `hdu service links --json` for official service entry URLs.
- Use `hdu service phones --query <keyword> --json` for office phone numbers.
- Use `hdu service buses --campus xiasha|shaoxing --json` for staff shuttle schedules, and verify temporary suspension notices in the result.
- Use `hdu service class-times --campus xiasha|shaoxing|qingshanhu --json` for class periods.
- This version is read-only. Authentication only supplies a read session. Do not submit applications, register for events, collect jobs, select courses, or perform other state-changing actions.
- If `hdu` is unavailable, run `npm run build` followed by `npm link` from this repository, or use `npm run dev -- <arguments>`.

When changing the project, keep commits small and focused, run `npm run typecheck`, `npm test`, `npm run test:live`, and `npm run build`, and preserve the existing read-only and HDU-domain restrictions.
