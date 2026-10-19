import { describe, expect, it } from "vitest";
import { makeTerm, parseExams } from "../src/sources/jw.js";
import { parseCourseOfferings, parseSelections } from "../src/sources/jw-courses.js";
import { findOutstanding, parseProgressCourses, parseProgressPage } from "../src/sources/jw-progress.js";
import { bitmask, parseCampusOptions, parsePeriods, parseRooms } from "../src/sources/jw-rooms.js";
import { parseThesis } from "../src/sources/jw-thesis.js";
import { findWeek, isoDate, isoWeekday, parseTeachingWeeks } from "../src/sources/jw-week.js";

// All values below are synthetic; never commit real student data.
const term = makeTerm(2026, 1);

describe("teaching weeks", () => {
  const weeks = parseTeachingWeeks([
    { zs: "1", rq: "2026-09-14/2026-09-20" },
    { zs: "2", rq: "2026-09-21/2026-09-27" },
    { zs: "x", rq: "broken" }
  ]);

  it("parses week ranges and finds the week of a date", () => {
    expect(weeks).toEqual([
      { week: 1, start: "2026-09-14", end: "2026-09-20" },
      { week: 2, start: "2026-09-21", end: "2026-09-27" }
    ]);
    expect(findWeek(weeks, "2026-09-21")?.week).toBe(2);
    expect(findWeek(weeks, "2026-09-28")).toBeUndefined();
  });

  it("uses Monday=1 … Sunday=7 and local dates", () => {
    expect(isoWeekday(new Date(2026, 9, 19))).toBe(1);
    expect(isoWeekday(new Date(2026, 9, 25))).toBe(7);
    expect(isoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("academic progress", () => {
  const node = (id: string, parent: string, name: string, earned: string, required: string, passed: string, plan = "1") =>
    `"<li id='li${id}' class='' fxfyqjd_id='${parent}' xfyqzjdgx='1'>" + "<div class='title' data-content=''" + ` +
    `" xfyqjd_id='${id}' jdkcsx='${plan}' leaf='' sfmjd='0' ><p class='title1' id='p${id}' yxxf='${earned}' yqzdxf='${required}' sftg='${passed}'>" + ` +
    `"${name}&nbsp;要求学分";`;
  const id = (n: number) => String(n).padStart(32, "A");
  const html = `<html><body><input type="hidden" id="xh_id" value="KEY"/>
    <div>当前所有课程 平均学分绩点（GPA）： 3.500 计划总课程 10 门 通过 6 门，未通过 0 门 ；未修 3 门； 在读 1 门！</div>
    <script>${[
      node(id(1), "", "主修", "20.0", "30.0", "0"),
      node(id(2), id(1), "实践必修", "2.0", "10.0", "0"),
      node(id(3), id(1), "专业选修方向", "6.0", "4.0", "1"),
      node(id(4), id(3), "其他方向模块", "0.0", "4.0", "0"),
      node(id(5), id(1), "通识选修", "8.0", "8.0", "1", "")
    ].join("\n")}</script></body></html>`;

  it("reads the summary and the category tree from the page templates", () => {
    const page = parseProgressPage(html);
    expect(page.gpa).toBe(3.5);
    expect(page.courseCounts).toEqual({ planned: 10, passed: 6, failed: 0, notTaken: 3, inProgress: 1 });
    expect(page.studentKey).toBe("KEY");
    expect(page.categories.map((category) => [category.name, category.parentId === id(1)])).toEqual([
      ["主修", false], ["实践必修", true], ["专业选修方向", true], ["其他方向模块", false], ["通识选修", true]
    ]);
    expect(page.categories.find((category) => category.name === "通识选修")?.planCourses).toBe(false);
  });

  it("reports only blocking categories, not untaken alternatives under a satisfied parent", () => {
    expect(findOutstanding(parseProgressPage(html).categories).map((category) => category.name)).toEqual(["实践必修"]);
  });

  it("lists unfinished courses and treats passing grades as done", () => {
    expect(parseProgressCourses([
      { KCMC: "毕业实习", KCH: "S1", XF: "2.0", XDZT: "1", JYXDXNMC: "2026-2027", JYXDXQMC: "1" },
      { KCMC: "毕业设计", XF: "8.0", XDZT: "3" },
      { KCMC: "已通过", XF: "1.0", XDZT: "4", CJ: "90" },
      { KCMC: "替代课程", XF: "0.5", XDZT: "5", MAXCJ: "83" }
    ])).toEqual([
      { name: "毕业实习", courseCode: "S1", credit: "2.0", status: "in_progress", plannedTerm: "2026-2027-1" },
      { name: "毕业设计", courseCode: undefined, credit: "8.0", status: "not_taken", plannedTerm: undefined }
    ]);
  });
});

describe("empty rooms", () => {
  it("parses periods and encodes bitmasks", () => {
    expect(parsePeriods("1-2,6-7")).toEqual([1, 2, 6, 7]);
    expect(parsePeriods("3,3,4")).toEqual([3, 4]);
    expect(() => parsePeriods("0-2")).toThrow();
    expect(() => parsePeriods("5-3")).toThrow();
    expect(bitmask([6])).toBe(32);
    expect(bitmask([1, 2])).toBe(3);
  });

  it("reads campus options and drops placeholder rooms", () => {
    expect(parseCampusOptions(`<select id="xqh_id"><option value="1">下沙</option><option value="G">绍兴</option></select>`))
      .toEqual(new Map([["下沙", "1"], ["绍兴", "G"]]));
    expect(parseRooms({ items: [
      { cdmc: "第6教研楼北102", jxlmc: "06", zws: "208", cdlbmc: "多媒体", xqmc: "下沙" },
      { cdmc: "待定", cdlbmc: "教室待定或不用" }
    ] })).toEqual([{ name: "第6教研楼北102", building: "06", seats: 208, examSeats: undefined, type: "多媒体", campus: "下沙" }]);
  });
});

describe("course offerings and selections", () => {
  it("merges per-teacher rows of one teaching class", () => {
    const result = parseCourseOfferings({ totalResult: 2, items: [
      { kch: "C1", kcmc: "讲座", jxbmc: "(2026-2027-1)-C1-01", jsmc: "甲", sksj: "星期一第1-2节", xkrs: 10, jxbrl: 20 },
      { kch: "C1", kcmc: "讲座", jxbmc: "(2026-2027-1)-C1-01", jsmc: "乙" }
    ] }, term);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(expect.objectContaining({ teachers: ["甲", "乙"], enrolled: 10, capacity: 20 }));
  });

  it("copies only course fields from selection rows", () => {
    const result = parseSelections({ items: [{
      kch: "S1", kcmc: "毕业实习", xf: "2.0", jsmc: "甲,乙", cxbj: "否", xklcmc: "第1轮",
      zjhm: "110101200001010000", sjhm: "13800000000", xm: "测试同学", xh: "20000000"
    }] }, term);
    const serialized = JSON.stringify(result);
    for (const secret of ["110101200001010000", "13800000000", "测试同学", "20000000"]) expect(serialized).not.toContain(secret);
    expect(result.items[0]).toEqual(expect.objectContaining({ name: "毕业实习", teachers: ["甲", "乙"], retake: false }));
  });
});

describe("thesis and exams", () => {
  it("strips advisor staff numbers", () => {
    const thesis = parseThesis(
      { items: [{ ktmc: "测试课题", kt_jg_xm: "王老师", kt_zc_mc: "教授", xn_mc: "2026-2027", xq_mc: "2" }] },
      { items: [{ dblxmc: "开题报告", kt_jg_xm: "王老师(12345)", xnmmc: "2026-2027", xqmmc: "2" }] }
    );
    expect(thesis.topics[0]).toEqual(expect.objectContaining({ title: "测试课题", advisor: "王老师", term: "2026-2027-2" }));
    expect(thesis.defenses).toEqual([{ stage: "开题报告", advisor: "王老师", term: "2026-2027-2" }]);
  });

  it("lists exams that are not scheduled yet", () => {
    const exams = parseExams({ items: [] }, term, { items: [{ kcmc: "测试课程", kch: "A1", ksmc: "期末考试", xf: "3.0", xm: "测试同学" }] });
    expect(exams.unscheduled).toEqual([{ courseName: "测试课程", courseCode: "A1", examName: "期末考试", credit: "3.0", department: undefined }]);
  });
});
