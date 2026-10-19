import { lstat, mkdir, mkdtemp, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { bundledSkillNames, installedSkillsVersion, installSkills, skillsNotice, uninstallSkills } from "../src/skill.js";
import { CLI_VERSION } from "../src/version.js";

const homes: string[] = [];
async function home(withClaude: boolean): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "hdu-home-"));
  homes.push(directory);
  if (withClaude) await mkdir(join(directory, ".claude"));
  return directory;
}
afterAll(async () => Promise.all(homes.map((directory) => rm(directory, { recursive: true, force: true }))));

describe("skill installation", () => {
  it("bundles the shared and domain skills", () => {
    expect(bundledSkillNames()).toEqual(["hdu-campus", "hdu-job", "hdu-jw", "hdu-shared"]);
  });

  it.skipIf(process.platform === "win32")("copies to ~/.agents/skills and links into ~/.claude/skills", async () => {
    const directory = await home(true);
    const result = await installSkills(directory, "darwin");
    expect(result.locations.map((location) => location.mode)).toEqual(["copy", "symlink"]);
    const link = join(directory, ".claude", "skills", "hdu-jw");
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readlink(link)).toBe(join("..", "..", ".agents", "skills", "hdu-jw"));
    expect(await readFile(join(link, "SKILL.md"), "utf8")).toContain("name: hdu-jw");
    expect(installedSkillsVersion(directory)).toBe(CLI_VERSION);
  });

  it("copies instead of linking on Windows and skips Claude Code when absent", async () => {
    const withClaude = await home(true);
    expect((await installSkills(withClaude, "win32")).locations.map((location) => location.mode)).toEqual(["copy", "copy"]);
    expect((await lstat(join(withClaude, ".claude", "skills", "hdu-shared"))).isDirectory()).toBe(true);
    const withoutClaude = await home(false);
    expect((await installSkills(withoutClaude, "darwin")).locations).toHaveLength(1);
  });

  it("flags out-of-date skills and uninstalls cleanly", async () => {
    const directory = await home(false);
    expect(skillsNotice(directory)).toBeUndefined();
    await installSkills(directory, "darwin");
    expect(skillsNotice(directory)).toBeUndefined();
    const shared = join(directory, ".agents", "skills", "hdu-shared", "SKILL.md");
    await writeFile(shared, (await readFile(shared, "utf8")).replace(/^version: .*$/m, "version: 0.0.1"));
    expect(skillsNotice(directory)?.skills.command).toBe("hdu skill install");
    expect(await uninstallSkills(directory)).toHaveLength(4);
    expect(installedSkillsVersion(directory)).toBeUndefined();
  });
});
