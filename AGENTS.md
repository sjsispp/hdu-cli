# HDU CLI contributor instructions

`hdu` is a read-only CLI for Hangzhou Dianzi University websites, built for humans and AI agents.

- **Using hdu** (which command answers what, login, output contract, rules) is documented in the agent skills under `skills/`: start with `skills/hdu-shared/SKILL.md`. Inside this repository, run commands with `npm run dev -- <arguments>` or link the build with `npm run build && npm link`.
- Never ask the user for their password or verification code; login is a DingTalk QR scan the user completes in their own terminal.

## Changing the project

- Keep commits small and focused; run `npm run typecheck`, `npm test`, `npm run test:live` (add `HDU_LIVE_AUTH=1` when logged in) and `npm run build`.
- Preserve the read-only boundary and the `*.hdu.edu.cn` domain restriction. Do not add commands that select courses, register, submit or otherwise change state.
- Output personal data only through allowlists; tests and fixtures use synthetic data only.
- Errors are `HduError`s with a type from `src/errors.ts`; `--json` output goes through `printJson` / `printJsonError`.
- When adding or changing a command, update the matching skill in `skills/`. `tests/skills.test.ts` fails if a skill mentions a command or option the CLI does not have.
- Release with `npm version <x.y.z> --no-git-tag-version` (also stamps the skill versions), commit, push, then push the `v<x.y.z>` tag.
