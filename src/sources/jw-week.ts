import { invalidArgument, parseFailure } from "../errors.js";
import type { JwDay, JwTeachingWeek, JwTerm, JwWeekTimetable } from "../types.js";
import { currentTerm, jwQuery, parseTimetable, type Row, TERM_CODES, text } from "./jw.js";

/** Local calendar date as YYYY-MM-DD (the school runs on China time, as does the user's machine). */
export function isoDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 1 = Monday … 7 = Sunday, matching ZFSoft's xqj. */
export function isoWeekday(date: Date): number {
  return date.getDay() === 0 ? 7 : date.getDay();
}

export function parseTeachingWeeks(data: unknown): JwTeachingWeek[] {
  if (!Array.isArray(data)) throw parseFailure("Could not read the teaching week list.");
  return (data as Row[]).flatMap((row) => {
    const week = Number(row.zs);
    const [start, end] = (text(row.rq) ?? "").split("/");
    return week > 0 && /^\d{4}-\d{2}-\d{2}$/.test(start ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(end ?? "")
      ? [{ week, start: start!, end: end! }]
      : [];
  });
}

export function findWeek(weeks: JwTeachingWeek[], date: string): JwTeachingWeek | undefined {
  return weeks.find((week) => week.start <= date && date <= week.end);
}

export async function getTeachingWeeks(term: JwTerm): Promise<JwTeachingWeek[]> {
  return parseTeachingWeeks(await jwQuery("/kbcx/xskbcxZccx_cxZcByXnxq.html?gnmkdm=N2154", {
    xnm: String(term.year), xqm: TERM_CODES[term.term]
  }));
}

/** Timetable for one teaching week, reflecting rescheduled and cancelled classes. */
export async function getWeekTimetable(options: { term?: JwTerm; week?: number; date?: Date } = {}): Promise<JwWeekTimetable> {
  const date = options.date ?? new Date();
  const term = options.term ?? currentTerm(date);
  const weeks = await getTeachingWeeks(term);
  const week = options.week === undefined ? findWeek(weeks, isoDate(date)) : weeks.find((item) => item.week === options.week);
  if (!week) {
    throw invalidArgument(
      options.week === undefined ? `${isoDate(date)} 不在 ${term.label} 学期的教学周内。` : `${term.label} 学期没有第 ${options.week} 周。`,
      `${term.label} 学期共 ${weeks.length} 周；可用 --week 指定周次。`
    );
  }
  const data = await jwQuery("/kbcx/xskbcxMobile_cxXsKb.html?gnmkdm=N2154", {
    xnm: String(term.year), xqm: TERM_CODES[term.term], zs: String(week.week), kblx: "1", doType: "app", xh: ""
  });
  return { source: "hdu-jw", term, week, courses: parseTimetable(data, term).courses };
}

export async function getDay(date = new Date()): Promise<JwDay> {
  const term = currentTerm(date);
  const weekday = isoWeekday(date);
  const week = findWeek(await getTeachingWeeks(term), isoDate(date));
  if (!week) return { source: "hdu-jw", date: isoDate(date), weekday, term, courses: [] };
  const timetable = await getWeekTimetable({ term, week: week.week });
  return {
    source: "hdu-jw", date: isoDate(date), weekday, term, week,
    courses: timetable.courses.filter((course) => course.weekday === weekday)
  };
}
