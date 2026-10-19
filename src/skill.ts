import { readdirSync, readFileSync } from "node:fs";
import { cp, lstat, mkdir, rm, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { CLI_VERSION } from "./version.js";

/** skills/ ships next to dist/ in the package and next to src/ in the repository. */
export function bundledSkillsDirectory(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "skills");
}

export function bundledSkillNames(): string[] {
  return readdirSync(bundledSkillsDirectory(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("hdu-"))
    .map((entry) => entry.name)
    .sort();
}

/** ~/.agents/skills is read by Codex and other Agent Skills clients; Claude Code reads ~/.claude/skills. */
function sharedDirectory(home: string): string {
  return join(home, ".agents", "skills");
}

function claudeDirectory(home: string): string {
  return join(home, ".claude", "skills");
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

export interface SkillInstallResult {
  skills: string[];
  locations: { agent: string; path: string; mode: "copy" | "symlink" }[];
}

/**
 * Copies every bundled skill into ~/.agents/skills and, when Claude Code is present, links them into
 * ~/.claude/skills (copies on Windows, where symlinks need extra privileges). Re-running updates them.
 */
export async function installSkills(home = homedir(), platform: NodeJS.Platform = process.platform): Promise<SkillInstallResult> {
  const skills = bundledSkillNames();
  const shared = sharedDirectory(home);
  await mkdir(shared, { recursive: true });
  for (const skill of skills) {
    await rm(join(shared, skill), { recursive: true, force: true });
    await cp(join(bundledSkillsDirectory(), skill), join(shared, skill), { recursive: true });
  }
  const locations: SkillInstallResult["locations"] = [{ agent: "Codex 等 Agent Skills 客户端", path: shared, mode: "copy" }];

  if (await exists(join(home, ".claude"))) {
    const claude = claudeDirectory(home);
    await mkdir(claude, { recursive: true });
    const mode = platform === "win32" ? "copy" : "symlink";
    for (const skill of skills) {
      await rm(join(claude, skill), { recursive: true, force: true });
      if (mode === "copy") await cp(join(shared, skill), join(claude, skill), { recursive: true });
      else await symlink(relative(claude, join(shared, skill)), join(claude, skill));
    }
    locations.push({ agent: "Claude Code", path: claude, mode });
  }
  return { skills, locations };
}

/** Removes the hdu skills from both locations; returns the removed paths. */
export async function uninstallSkills(home = homedir()): Promise<string[]> {
  const removed: string[] = [];
  for (const directory of [claudeDirectory(home), sharedDirectory(home)]) {
    for (const skill of bundledSkillNames()) {
      const path = join(directory, skill);
      if (await exists(path)) {
        await rm(path, { recursive: true, force: true });
        removed.push(path);
      }
    }
  }
  return removed;
}

/** Version recorded in the installed hdu-shared skill, or undefined when the skills are not installed. */
export function installedSkillsVersion(home = homedir()): string | undefined {
  for (const directory of [sharedDirectory(home), claudeDirectory(home)]) {
    try {
      const markdown = readFileSync(join(directory, "hdu-shared", "SKILL.md"), "utf8");
      return /^version:\s*(\S+)/m.exec(markdown)?.[1];
    } catch {
      // Try the next location.
    }
  }
  return undefined;
}

/**
 * `_notice` for JSON output when installed skills do not match this CLI version. Not shown when the
 * skills were never installed, or when HDU_CLI_NO_SKILLS_NOTICE is set.
 */
export function skillsNotice(home = homedir()): { skills: { message: string; command: string } } | undefined {
  if (process.env.HDU_CLI_NO_SKILLS_NOTICE) return undefined;
  const installed = installedSkillsVersion(home);
  if (!installed || installed === CLI_VERSION) return undefined;
  return {
    skills: {
      message: `本机 hdu 技能版本 ${installed} 与 CLI 版本 ${CLI_VERSION} 不一致，智能体可能使用了过期的说明。`,
      command: "hdu skill install"
    }
  };
}
