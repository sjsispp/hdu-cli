import * as cheerio from "cheerio";
import { parseFailure } from "../errors.js";
import type { JwOutstandingCategory, JwProgress, JwProgressCategory, JwProgressCourse } from "../types.js";
import { jwQuery, jwRequest, type Row, text } from "./jw.js";

const PAGE_PATH = "/xsxy/xsxyqk_cxXsxyqkIndex.html?gnmkdm=N105515&layout=default";

interface PageCategory extends JwProgressCategory {
  /** "1" when the category's courses come from the teaching plan (selects the course endpoint). */
  planCourses: boolean;
}

export interface ProgressPage {
  gpa?: number;
  courseCounts?: JwProgress["courseCounts"];
  categories: PageCategory[];
  studentKey?: string;
}

/**
 * The page renders its category tree from JavaScript string templates, so the requirement numbers
 * are read from those templates rather than from the DOM.
 */
export function parseProgressPage(html: string): ProgressPage {
  const parents = new Map<string, string | undefined>();
  for (const match of html.matchAll(/id='[a-zA-Z]*([0-9A-F]{32})'[^>]{0,200}?fxfyqjd_id='([0-9A-F]{32})?'/g)) {
    if (!parents.has(match[1]!)) parents.set(match[1]!, match[2] || undefined);
  }
  const categories = new Map<string, PageCategory>();
  const node = /xfyqjd_id='([0-9A-F]{32})' jdkcsx='(\d*)'[^>]*><p class='title1' id='p\1' yxxf='([\d.]*)' yqzdxf='([\d.]*)' sftg='(\d*)'>"\s*\+\s*"([^&"]*)/g;
  for (const match of html.matchAll(node)) {
    const [, id, planCourses, earned, required, passed, name] = match;
    if (categories.has(id!)) continue;
    categories.set(id!, {
      id: id!, parentId: parents.get(id!), name: name!.trim(),
      requiredCredits: Number(required) || 0, earnedCredits: Number(earned) || 0,
      satisfied: passed === "1", planCourses: planCourses === "1"
    });
  }
  if (categories.size === 0) throw parseFailure("Could not read the academic progress categories.");

  const $ = cheerio.load(html);
  $("script, style").remove();
  const body = $("body").text().replace(/\s+/g, " ");
  const gpa = Number(/平均学分绩点（GPA）：\s*([\d.]+)/.exec(body)?.[1]);
  const counts = /计划总课程\s*(\d+)\s*门\s*通过\s*(\d+)\s*门，\s*未通过\s*(\d+)\s*门\s*；\s*未修\s*(\d+)\s*门；\s*在读\s*(\d+)\s*门/.exec(body);
  return {
    ...(Number.isFinite(gpa) ? { gpa } : {}),
    ...(counts ? {
      courseCounts: {
        planned: Number(counts[1]), passed: Number(counts[2]), failed: Number(counts[3]),
        notTaken: Number(counts[4]), inProgress: Number(counts[5])
      }
    } : {}),
    categories: [...categories.values()],
    studentKey: $("#xh_id").val()?.toString() || undefined
  };
}

/**
 * Unmet categories that actually block graduation: every ancestor is also unmet (an unmet child of a
 * satisfied parent is an alternative the student did not pick) and no unmet child qualifies instead.
 */
export function findOutstanding(categories: JwProgressCategory[]): JwProgressCategory[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const ancestors = (category: JwProgressCategory): JwProgressCategory[] => {
    const chain: JwProgressCategory[] = [];
    for (let parent = category.parentId && byId.get(category.parentId); parent; parent = parent.parentId && byId.get(parent.parentId)) {
      chain.push(parent);
    }
    return chain;
  };
  const blocking = categories.filter((category) => !category.satisfied && ancestors(category).every((parent) => !parent.satisfied));
  const blockingIds = new Set(blocking.map((category) => category.id));
  return blocking.filter((category) => !blocking.some((other) => other.parentId === category.id && blockingIds.has(other.id)));
}

const COURSE_STATUS: Record<string, JwProgressCourse["status"]> = { 1: "in_progress", 3: "not_taken" };

const PASSING_GRADES = new Set(["优秀", "良好", "中等", "及格", "合格", "通过"]);

function hasPassingGrade(row: Row): boolean {
  const grade = text(row.MAXCJ ?? row.CJ);
  if (!grade) return false;
  return PASSING_GRADES.has(grade) || Number(grade) >= 60;
}

/** Courses of a category that are not yet passed: XDZT 4 means passed, and some other states still carry a passing grade. */
export function parseProgressCourses(data: unknown): JwProgressCourse[] {
  return (Array.isArray(data) ? (data as Row[]) : [])
    .filter((row) => String(row.XDZT) !== "4" && !hasPassingGrade(row))
    .map((row) => ({
      name: text(row.KCMC) ?? "未命名课程",
      courseCode: text(row.KCH),
      credit: text(row.XF ?? row.JHXF),
      status: COURSE_STATUS[String(row.XDZT)] ?? "other",
      plannedTerm: [text(row.JYXDXNMC), text(row.JYXDXQMC)].filter(Boolean).join("-") || undefined
    }));
}

export async function getProgress(): Promise<JwProgress> {
  const page = parseProgressPage(await (await jwRequest(PAGE_PATH)).text());
  const byId = new Map(page.categories.map((category) => [category.id, category]));
  const path = (category: JwProgressCategory): string[] => {
    const names = [category.name];
    for (let parent = category.parentId && byId.get(category.parentId); parent; parent = parent.parentId && byId.get(parent.parentId)) {
      names.unshift(parent.name);
    }
    return names;
  };
  const outstanding: JwOutstandingCategory[] = await Promise.all(findOutstanding(page.categories).map(async (category) => {
    const endpoint = byId.get(category.id)?.planCourses ? "xsxyqk_cxJxzxjhxfyqKcxx" : "xsxyqk_cxJxzxjhxfyqFKcxx";
    const courses = page.studentKey
      ? parseProgressCourses(await jwQuery(`/xsxy/${endpoint}.html?gnmkdm=N105515`, {
        xfyqjd_id: category.id, xh_id: page.studentKey, fromXh_id: ""
      }))
      : [];
    return {
      id: category.id, name: category.name, path: path(category),
      requiredCredits: category.requiredCredits, earnedCredits: category.earnedCredits,
      missingCredits: Math.max(0, Math.round((category.requiredCredits - category.earnedCredits) * 100) / 100),
      courses
    };
  }));
  return {
    source: "hdu-jw",
    ...(page.gpa !== undefined ? { gpa: page.gpa } : {}),
    ...(page.courseCounts ? { courseCounts: page.courseCounts } : {}),
    categories: page.categories.map(({ planCourses: _planCourses, ...category }) => category),
    outstanding
  };
}
