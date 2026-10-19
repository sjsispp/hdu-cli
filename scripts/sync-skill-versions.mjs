// Runs from the npm "version" lifecycle: stamps the new package version into every skill's frontmatter.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
for (const entry of readdirSync("skills", { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = join("skills", entry.name, "SKILL.md");
  const markdown = readFileSync(file, "utf8");
  const updated = markdown.replace(/^version: .*$/m, `version: ${version}`);
  if (updated === markdown && !markdown.includes(`version: ${version}`)) throw new Error(`${file} has no version line`);
  writeFileSync(file, updated);
}
console.log(`Skills set to version ${version}`);
