import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const SKILLS_DIR = "skills";
const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
const skills = readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);

function frontmatter(markdown: string): Record<string, string> {
  const block = /^---\n([\s\S]*?)\n---\n/.exec(markdown)?.[1] ?? "";
  return Object.fromEntries(block.split("\n").map((line) => /^(\w+):\s*(.*)$/.exec(line)).filter(Boolean)
    .map((match) => [match![1]!, match![2]!.replace(/^"|"$/g, "")]));
}

function markdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? markdownFiles(join(directory, entry.name)) : entry.name.endsWith(".md") ? [join(directory, entry.name)] : []);
}

const helpCache = new Map<string, Promise<string>>();
function help(path: string[]): Promise<string> {
  const key = path.join(" ");
  if (!helpCache.has(key)) {
    helpCache.set(key, run(process.execPath, ["--import", "tsx", "src/cli.ts", ...path, "--help"]).then((result) => result.stdout));
  }
  return helpCache.get(key)!;
}

/** Names listed under "Commands:" in commander help output. */
function subcommands(helpText: string): string[] {
  const section = helpText.split("Commands:")[1] ?? "";
  return [...section.matchAll(/^\s{2}([a-z][\w-]*)/gm)].map((match) => match[1]!);
}

describe("agent skills", () => {
  it("has the shared skill and the domain skills", () => {
    expect(skills).toEqual(expect.arrayContaining(["hdu-shared", "hdu-jw", "hdu-job", "hdu-campus"]));
  });

  for (const skill of skills) {
    describe(skill, () => {
      const markdown = readFileSync(join(SKILLS_DIR, skill, "SKILL.md"), "utf8");
      const meta = frontmatter(markdown);

      it("has valid frontmatter whose version matches package.json", () => {
        expect(meta.name).toBe(skill);
        expect(meta.description?.length).toBeGreaterThan(40);
        expect(meta.version).toBe(version);
        expect(markdown).toContain('bins: ["hdu"]');
      });

      it("links only to files that exist", () => {
        for (const file of markdownFiles(join(SKILLS_DIR, skill))) {
          for (const [, target] of readFileSync(file, "utf8").matchAll(/\]\(((?:\.\.?\/)?[\w./-]+\.md)\)/g)) {
            expect(existsSync(join(dirname(file), target!)), `${file} -> ${target}`).toBe(true);
          }
        }
      });

      it("mentions only commands and options the CLI has", async () => {
        const spans = markdownFiles(join(SKILLS_DIR, skill))
          .flatMap((file) => [...readFileSync(file, "utf8").matchAll(/`(hdu [^`]+)`/g)].map((match) => match[1]!));
        for (const span of spans) {
          const words = span.split(/\s+/).slice(1);
          const path: string[] = [];
          for (const word of words) {
            if (!/^[a-z][\w-]*$/.test(word) || !subcommands(await help(path)).includes(word)) break;
            path.push(word);
          }
          // Root options (`hdu --version`) and placeholders (`hdu <command> --help`) have no command path.
          if (!/^[-<]/.test(words[0] ?? "")) expect(path.length, `unknown command in: ${span}`).toBeGreaterThan(0);
          const commandHelp = await help(path);
          const next = words[path.length];
          if (next && /^[a-z]/.test(next) && subcommands(commandHelp).length > 0) {
            expect.fail(`unknown subcommand "${next}" in: ${span}`);
          }
          const options = new Set([...commandHelp.matchAll(/--[a-z][\w-]*/g)].map((match) => match[0]));
          for (const [option] of span.matchAll(/--[a-z][\w-]*/g)) {
            if (option === "--help" || option === "--version") continue;
            expect(options.has(option), `${option} in: ${span}`).toBe(true);
          }
        }
      }, 120_000);
    });
  }
});
