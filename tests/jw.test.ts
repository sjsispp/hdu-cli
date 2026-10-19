import { describe, expect, it } from "vitest";
import { currentTerm, makeTerm, parseExams, parseGrades, parseProfile, parseTimetable } from "../src/sources/jw.js";

// All values below are synthetic; never commit real student data.
describe("academic system parsers", () => {
  it("resolves the current term from the date", () => {
    expect(currentTerm(new Date(2026, 9, 19))).toEqual({ year: 2026, term: 1, label: "2026-2027-1" });
    expect(currentTerm(new Date(2027, 0, 10))).toEqual(makeTerm(2026, 1));
    expect(currentTerm(new Date(2027, 2, 1))).toEqual(makeTerm(2026, 2));
  });

  it("keeps only academic profile fields", () => {
    const field = (label: string, value: string) =>
      `<div class="form-group"><label class="control-label"> ${label}： </label><div><p class="form-control-static">${value}</p></div></div>`;
    const profile = parseProfile([
      field("学号", "20000000"), field("姓名", "测试同学"), field("专业名称", "测试专业"),
      field("证件号码", "110101200001010000"), field("户口所在地", "测试市"), field("出生日期", "2000-01-01")
    ].join(""));
    expect(profile.fields).toEqual({ 学号: "20000000", 姓名: "测试同学", 专业名称: "测试专业" });
    expect(() => parseProfile("<html>login</html>")).toThrow();
  });

  it("parses and orders the timetable", () => {
    const timetable = parseTimetable({
      kbList: [
        { kcmc: "课程乙", xqj: "3", xqjmc: "星期三", jc: "6-7节", zcd: "1-16周", cdmc: "第1教研楼101", xqmc: "下沙", xm: "王老师", xf: "2.0" },
        { kcmc: "课程甲", xqj: "1", xqjmc: "星期一", jc: "1-2节", zcd: "1-8周", cdmc: "第2教研楼202", xqmc: "下沙", xm: "李老师", xf: "3.0" }
      ],
      sjkList: [{ kcmc: "实践课", jsxm: "赵老师", qsjsz: "9-12周", xf: "1.0" }]
    }, makeTerm(2026, 1));
    expect(timetable.courses.map((course) => course.name)).toEqual(["课程甲", "课程乙"]);
    expect(timetable.courses[0]).toEqual(expect.objectContaining({
      weekday: 1, periods: "1-2节", weeks: "1-8周", location: "第2教研楼202", teacher: "李老师"
    }));
    expect(timetable.unscheduled[0]).toEqual({ name: "实践课", teacher: "赵老师", weeks: "9-12周", credit: "1.0" });
  });

  it("parses grades without student identity fields", () => {
    const grades = parseGrades({
      items: [{ xnmmc: "2025-2026", xqmmc: "2", kcmc: "测试课程", kch: "A001", xf: "2.0", cj: "90", jd: "4.0",
        kcxzmc: "必修", ksxz: "正常考试", xm: "测试同学", xh: "20000000" }]
    });
    expect(grades.items).toEqual([{
      term: "2025-2026-2", courseName: "测试课程", courseCode: "A001", credit: "2.0", score: "90",
      gradePoint: "4.0", courseNature: "必修", examNature: "正常考试"
    }]);
  });

  it("parses and orders exams", () => {
    const exams = parseExams({
      items: [
        { kcmc: "课程乙", ksmc: "期末", kssj: "2026-01-12(09:00-11:00)", cdmc: "6教101", cdxqmc: "下沙", zwh: "12" },
        { kcmc: "课程甲", ksmc: "期末", kssj: "2026-01-10(14:00-16:00)", cdmc: "7教202", cdxqmc: "下沙", zwh: "3" }
      ]
    }, makeTerm(2025, 1));
    expect(exams.items.map((exam) => exam.courseName)).toEqual(["课程甲", "课程乙"]);
    expect(exams.items[0]).toEqual(expect.objectContaining({ location: "7教202", seat: "3" }));
  });
});
