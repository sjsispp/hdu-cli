import * as cheerio from "cheerio";
import { getServiceSession } from "../auth.js";
import { authRequired, HduError, parseFailure } from "../errors.js";
import { isAllowedHduUrl } from "../http.js";
import type {
  JwCourse, JwExam, JwExams, JwGrade, JwGrades, JwProfile, JwTerm, JwTermNumber, JwTimetable
} from "../types.js";

const BASE_URL = "https://newjw.hdu.edu.cn/jwglxt";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) hdu-cli";

/** ZFSoft encodes terms 1/2/3 as xqm 3/12/16. */
const TERM_CODES: Record<JwTermNumber, string> = { 1: "3", 2: "12", 3: "16" };

/**
 * Only these profile fields are returned. The page also shows identity numbers, household registration,
 * birth date, ethnicity and political status, which are deliberately left out.
 */
const PROFILE_FIELDS = [
  "学号", "姓名", "学院名称", "系名称", "专业名称", "专业方向", "班级名称", "年级", "学制",
  "学籍状态", "是否在校", "学历层次", "培养层次", "学生类别", "入学日期"
];

type Row = Record<string, unknown>;


export function makeTerm(year: number, term: JwTermNumber): JwTerm {
  return { year, term, label: `${year}-${year + 1}-${term}` };
}

/** Academic year starts in August: Aug–Jan is the first term, Feb–Jul the second. */
export function currentTerm(now = new Date()): JwTerm {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 8) return makeTerm(year, 1);
  if (month === 1) return makeTerm(year - 1, 1);
  return makeTerm(year - 1, 2);
}

function text(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).replace(/\s+/g, " ").trim();
  return trimmed || undefined;
}

function rows(data: unknown, key: string): Row[] {
  const list = (data as Record<string, unknown> | null)?.[key];
  return Array.isArray(list) ? (list as Row[]) : [];
}

export function parseProfile(html: string): JwProfile {
  const $ = cheerio.load(html);
  const fields: Record<string, string> = {};
  $(".form-group").each((_, group) => {
    const label = $(group).find("label").first().text().replace(/[：:\s]/g, "");
    const value = text($(group).find(".form-control-static").first().text());
    if (PROFILE_FIELDS.includes(label) && value && !(label in fields)) fields[label] = value;
  });
  if (Object.keys(fields).length === 0) throw parseFailure("Could not read the academic profile page.");
  return { source: "hdu-jw", fields };
}

export function parseTimetable(data: unknown, term: JwTerm): JwTimetable {
  const courses: JwCourse[] = rows(data, "kbList").map((row) => ({
    name: text(row.kcmc) ?? "未命名课程",
    courseCode: text(row.kch),
    teacher: text(row.xm),
    weekday: Number(row.xqj) || undefined,
    weekdayName: text(row.xqjmc),
    periods: text(row.jc),
    weeks: text(row.zcd),
    location: text(row.cdmc),
    campus: text(row.xqmc),
    credit: text(row.xf)
  }));
  courses.sort((a, b) => (a.weekday ?? 8) - (b.weekday ?? 8) ||
    (parseInt(a.periods ?? "", 10) || 99) - (parseInt(b.periods ?? "", 10) || 99));
  const unscheduled: JwCourse[] = rows(data, "sjkList").map((row) => ({
    name: text(row.kcmc) ?? "未命名课程",
    teacher: text(row.jsxm),
    weeks: text(row.qsjsz),
    credit: text(row.xf)
  }));
  return { source: "hdu-jw", term, courses, unscheduled };
}

export function parseGrades(data: unknown, term?: JwTerm): JwGrades {
  const items: JwGrade[] = rows(data, "items").map((row) => ({
    term: [text(row.xnmmc), text(row.xqmmc)].filter(Boolean).join("-"),
    courseName: text(row.kcmc) ?? "未命名课程",
    courseCode: text(row.kch),
    credit: text(row.xf),
    score: text(row.cj) ?? "",
    gradePoint: text(row.jd),
    courseNature: text(row.kcxzmc),
    examNature: text(row.ksxz)
  }));
  return { source: "hdu-jw", ...(term ? { term } : {}), items };
}

export function parseExams(data: unknown, term: JwTerm): JwExams {
  const items: JwExam[] = rows(data, "items").map((row) => ({
    courseName: text(row.kcmc) ?? "未命名课程",
    examName: text(row.ksmc),
    time: text(row.kssj),
    location: text(row.cdmc),
    campus: text(row.cdxqmc),
    seat: text(row.zwh)
  }));
  items.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  return { source: "hdu-jw", term, items };
}

async function jwRequest(path: string, form?: Record<string, string>): Promise<Response> {
  const url = `${BASE_URL}${path}`;
  if (!isAllowedHduUrl(url)) throw new HduError("unsupported", `Refusing to fetch a non-HDU URL: ${url}`);
  const cookie = await getServiceSession("jw");
  if (!cookie) throw authRequired("教务系统");
  const response = await fetch(url, {
    method: form ? "POST" : "GET",
    headers: {
      cookie,
      "user-agent": USER_AGENT,
      ...(form ? { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", "x-requested-with": "XMLHttpRequest" } : {})
    },
    body: form ? new URLSearchParams(form) : undefined,
    // An expired session redirects to the login page; never follow it.
    redirect: "manual",
    signal: AbortSignal.timeout(20_000)
  });
  // ZFSoft answers AJAX requests from a logged-out session with the non-standard status 901.
  if ((response.status >= 300 && response.status < 400) || response.status === 901) throw authRequired("教务系统");
  if (!response.ok) throw new HduError("upstream", `HTTP ${response.status} for ${url}`, "教务系统暂时不可用，请稍后重试。");
  return response;
}

/** Read-only query endpoints answer JSON; an HTML body means the session was rejected. */
async function jwQuery(path: string, form: Record<string, string>): Promise<unknown> {
  const response = await jwRequest(path, form);
  if (!response.headers.get("content-type")?.includes("json")) throw authRequired("教务系统");
  return response.json();
}

const PAGE_ALL = {
  "queryModel.showCount": "5000", "queryModel.currentPage": "1", "queryModel.sortName": "",
  "queryModel.sortOrder": "asc", _search: "false", time: "0"
};

export async function getProfile(): Promise<JwProfile> {
  const response = await jwRequest("/xsxxxggl/xsgrxxwh_cxXsgrxx.html?gnmkdm=N100801&layout=default");
  return parseProfile(await response.text());
}

export async function getTimetable(term = currentTerm()): Promise<JwTimetable> {
  const data = await jwQuery("/kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N2151", {
    xnm: String(term.year), xqm: TERM_CODES[term.term], kzlx: "ck"
  });
  return parseTimetable(data, term);
}

export async function getGrades(term?: JwTerm): Promise<JwGrades> {
  const data = await jwQuery("/cjcx/cjcx_cxDgXscj.html?doType=query&gnmkdm=N305005", {
    xnm: term ? String(term.year) : "", xqm: term ? TERM_CODES[term.term] : "", ...PAGE_ALL
  });
  return parseGrades(data, term);
}

export async function getExams(term = currentTerm()): Promise<JwExams> {
  const data = await jwQuery("/kwgl/kscx_cxXsksxxIndex.html?doType=query&gnmkdm=N358105", {
    xnm: String(term.year), xqm: TERM_CODES[term.term], ...PAGE_ALL
  });
  return parseExams(data, term);
}
