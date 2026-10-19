import * as cheerio from "cheerio";
import { invalidArgument, parseFailure } from "../errors.js";
import type { JwRoom, JwRooms, JwTerm } from "../types.js";
import { currentTerm, jwQuery, jwRequest, PAGE_ALL, rows, TERM_CODES, text } from "./jw.js";
import { findWeek, getTeachingWeeks, isoDate, isoWeekday } from "./jw-week.js";

export const CAMPUS_ALIASES: Record<string, string> = {
  xiasha: "下沙", qingshanhu: "青山湖", shaoxing: "绍兴", dongyue: "东岳", wenyi: "文一"
};

/** Room types that are placeholders rather than bookable rooms. */
const PLACEHOLDER_TYPES = new Set(["教室待定或不用"]);

/** Parses "1-2", "3,4" or "1-2,6-7" into sorted unique class periods. */
export function parsePeriods(value: string): number[] {
  const periods = new Set<number>();
  for (const part of value.split(",").map((item) => item.trim()).filter(Boolean)) {
    const match = /^(\d{1,2})(?:-(\d{1,2}))?$/.exec(part);
    const start = Number(match?.[1]);
    const end = Number(match?.[2] ?? match?.[1]);
    if (!match || start < 1 || end > 16 || start > end) throw invalidArgument(`Invalid class periods: ${value}`, "例如 1-2、3,4 或 1-2,6-7。");
    for (let period = start; period <= end; period += 1) periods.add(period);
  }
  if (periods.size === 0) throw invalidArgument("At least one class period is required.");
  return [...periods].sort((a, b) => a - b);
}

/** ZFSoft encodes week and period selections as bitmasks (bit n-1 for week/period n). */
export function bitmask(values: number[]): number {
  return values.reduce((mask, value) => mask + 2 ** (value - 1), 0);
}

export function parseCampusOptions(html: string): Map<string, string> {
  const $ = cheerio.load(html);
  const campuses = new Map<string, string>();
  $("#xqh_id option").each((_, option) => {
    const id = $(option).attr("value");
    const name = $(option).text().trim();
    if (id && name) campuses.set(name, id);
  });
  if (campuses.size === 0) throw parseFailure("Could not read the campus list for empty rooms.");
  return campuses;
}

export function parseRooms(data: unknown): JwRoom[] {
  return rows(data, "items")
    .filter((row) => !PLACEHOLDER_TYPES.has(text(row.cdlbmc) ?? ""))
    .map((row) => ({
      name: text(row.cdmc) ?? "未命名场地",
      building: text(row.jxlmc),
      seats: Number(row.zws) || undefined,
      examSeats: Number(row.kszws1) || undefined,
      type: text(row.cdlbmc),
      campus: text(row.xqmc)
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

export async function getEmptyRooms(options: {
  campus: string; periods: number[]; week?: number; weekday?: number; date?: Date;
  term?: JwTerm; building?: string; minSeats?: number;
}): Promise<JwRooms> {
  const date = options.date ?? new Date();
  const term = options.term ?? currentTerm(date);
  const campusName = CAMPUS_ALIASES[options.campus.toLowerCase()] ?? options.campus;
  const campuses = parseCampusOptions(await (await jwRequest("/cdjy/cdjy_cxKxcdlb.html?gnmkdm=N2155&layout=default")).text());
  const campusId = campuses.get(campusName);
  if (!campusId) {
    throw invalidArgument(`Unknown campus: ${options.campus}`, `可选校区：${[...campuses.keys()].join("、")}（也可用 xiasha、qingshanhu、shaoxing）。`);
  }
  let week = options.week;
  if (week === undefined) {
    week = findWeek(await getTeachingWeeks(term), isoDate(date))?.week;
    if (week === undefined) throw invalidArgument(`${isoDate(date)} 不在教学周内。`, "请用 --week 指定教学周。");
  }
  const weekday = options.weekday ?? isoWeekday(date);
  const data = await jwQuery("/cdjy/cdjy_cxKxcdlb.html?doType=query&gnmkdm=N2155", {
    fwzt: "cx", xqh_id: campusId, xnm: String(term.year), xqm: TERM_CODES[term.term],
    cdlb_id: "", cdejlb_id: "", qszws: "", jszws: "", cdmc: "", lh: "", jyfs: "0", cdjylx: "",
    zcd: String(bitmask([week])), xqj: String(weekday), jcd: String(bitmask(options.periods)), ...PAGE_ALL
  });
  const rooms = parseRooms(data).filter((room) =>
    (!options.building || room.name.includes(options.building)) && (!options.minSeats || (room.seats ?? 0) >= options.minSeats));
  return { source: "hdu-jw", term, campus: campusName, week, weekday, periods: options.periods, rooms };
}
