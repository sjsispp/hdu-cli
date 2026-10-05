import type { DeadlineMatch } from "./types.js";

const TRIGGER = /(截止|报名时间|申报时间|提交时间|申请时间|受理时间|征集时间)/;
const DATE = /(?:20\d{2}[年/-])?\d{1,2}[月/-]\d{1,2}日?(?:\s*(?:上午|下午)?\s*\d{1,2}(?:[:：]\d{2})?)?/g;

export function extractDeadlines(content: string): DeadlineMatch[] {
  const segments = content
    .split(/(?<=[。！？；;])|\n+/)
    .map((segment) => segment.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const matches: DeadlineMatch[] = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    if (!TRIGGER.test(segment)) continue;
    const dates = segment.match(DATE) ?? [];
    for (const rawDate of dates) {
      const evidence = segment.slice(0, 240);
      const key = `${rawDate}|${evidence}`;
      if (!seen.has(key)) {
        seen.add(key);
        matches.push({ rawDate, evidence });
      }
    }
  }

  return matches;
}
