# HDU CLI agent instructions

Use the `hdu` command when the user asks for public information from Hangzhou Dianzi University websites.

- Prefer `--json` so results are structured and URLs remain available for citation.
- Use `hdu search <query> --json` for general discovery.
- Use `hdu notice list --json`, `hdu event list --json`, or `hdu news list --json` for recent lists.
- Use `hdu page get <hdu-url> --json` only for URLs under `*.hdu.edu.cn`.
- Use `hdu deadline list --json` as a best-effort helper; verify important deadlines against the source page.
- This version is read-only. Do not attempt authentication, form submission, course selection, or other state-changing actions.
- If `hdu` is unavailable, run `npm run build` followed by `npm link` from this repository, or use `npm run dev -- <arguments>`.

When changing the project, keep commits small and focused, run `npm run typecheck`, `npm test`, `npm run test:live`, and `npm run build`, and preserve the existing read-only and HDU-domain restrictions.
