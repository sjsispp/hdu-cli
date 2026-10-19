import { invalidArgument } from "../errors.js";
import type { JwCourseOffering, JwCourseOfferings, JwSelection, JwSelections, JwTerm } from "../types.js";
import { currentTerm, jwQuery, PAGE_ALL, rows, TERM_CODES, text } from "./jw.js";

function splitNames(value: unknown): string[] {
  return (text(value) ?? "").split(/[,，]/).map((name) => name.trim()).filter(Boolean);
}

/** The offering search returns one row per teacher; merge rows of the same teaching class. */
export function parseCourseOfferings(data: unknown, term: JwTerm): JwCourseOfferings {
  const byClass = new Map<string, JwCourseOffering>();
  for (const row of rows(data, "items")) {
    const className = text(row.jxbmc) ?? text(row.jxb_id) ?? "";
    const existing = byClass.get(className);
    const teachers = splitNames(row.jsmc);
    if (existing) {
      for (const teacher of teachers) if (!existing.teachers.includes(teacher)) existing.teachers.push(teacher);
      continue;
    }
    byClass.set(className, {
      courseCode: text(row.kch) ?? "",
      name: text(row.kcmc) ?? "未命名课程",
      className,
      credit: text(row.xf),
      teachers,
      schedule: text(row.sksj),
      location: text(row.jxdd),
      campus: text(row.xiaoqmc),
      enrolled: Number(row.xkrs) || 0,
      capacity: Number(row.jxbrl) || undefined,
      department: text(row.kkbm),
      courseNature: text(row.kcxzmc),
      assessment: text(row.khfsmc),
      weeks: text(row.qsjsz)
    });
  }
  const total = Number((data as { totalResult?: unknown } | null)?.totalResult) || byClass.size;
  return { source: "hdu-jw", term, total, items: [...byClass.values()] };
}

/** Course offerings across the school, filtered by course, teacher or location (at least one is required). */
export async function searchCourseOfferings(options: {
  query?: string; teacher?: string; location?: string; term?: JwTerm; limit: number;
}): Promise<JwCourseOfferings> {
  if (!options.query && !options.teacher && !options.location) {
    throw invalidArgument("A course, teacher or location filter is required.", "使用 --query、--teacher 或 --location 之一。");
  }
  const term = options.term ?? currentTerm();
  const data = await jwQuery("/rwlscx/rwlscx_cxRwlsIndex.html?doType=query&gnmkdm=N1548", {
    xnm: String(term.year), xqm: TERM_CODES[term.term], kch: options.query ?? "", js: options.teacher ?? "",
    jxdd: options.location ?? "", ...PAGE_ALL, "queryModel.showCount": String(Math.min(options.limit * 4, 500))
  });
  const result = parseCourseOfferings(data, term);
  return { ...result, items: result.items.slice(0, options.limit) };
}

/**
 * The selection list rows also carry the student's ID number, phone and other personal data; only
 * course fields are copied out.
 */
export function parseSelections(data: unknown, term: JwTerm): JwSelections {
  const items: JwSelection[] = rows(data, "items").map((row) => ({
    courseCode: text(row.kch),
    name: text(row.kcmc) ?? "未命名课程",
    className: text(row.jxbmc),
    credit: text(row.xf),
    teachers: splitNames(row.jsmc),
    courseNature: text(row.kcxzmc),
    category: text(row.kclbmc),
    department: text(row.kkxymc),
    weeks: text(row.qsjsz),
    selectedAt: text(row.xksj),
    selectionRound: text(row.xklcmc),
    retake: text(row.cxbj) === "是"
  }));
  return { source: "hdu-jw", term, items };
}

export async function getSelections(term = currentTerm()): Promise<JwSelections> {
  const data = await jwQuery("/xkcx/xkmdcx_cxXkmdcxIndex.html?doType=query&gnmkdm=N255010", {
    xnm: String(term.year), xqm: TERM_CODES[term.term], ...PAGE_ALL
  });
  return parseSelections(data, term);
}
