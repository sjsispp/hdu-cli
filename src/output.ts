import type {
  Article, ArticleDeadlines, BusSchedule, ClassSchedule, JobSiteArticle, JobSiteListResult,
  JwCourse, JwCourseOfferings, JwDay, JwExams, JwProgress, JwRooms, JwSelections, JwThesis, JwGrades, JwProfile, JwTimetable, JwWeekTimetable, ListItem, ListResult, PhoneOffice, ServiceLink
} from "./types.js";
import type { HduError } from "./errors.js";
import { skillsNotice } from "./skill.js";

/** Success envelope for --json: `{"ok": true, "data": ...}` on stdout. */
export function printJson(data: unknown): void {
  const notice = skillsNotice();
  process.stdout.write(`${JSON.stringify({ ok: true, data, ...(notice ? { _notice: notice } : {}) }, null, 2)}\n`);
}

/** Failure envelope for --json: `{"ok": false, "error": {...}}` on stderr. */
export function printJsonError(error: HduError): void {
  const body = { type: error.type, message: error.message, ...(error.hint ? { hint: error.hint } : {}) };
  process.stderr.write(`${JSON.stringify({ ok: false, error: body }, null, 2)}\n`);
}

function printItems(items: ListItem[]): void {
  if (items.length === 0) {
    console.log("没有找到结果。");
    return;
  }
  for (const item of items) {
    console.log(`${item.publishedAt ?? "日期未知"}  ${item.title}`);
    console.log(`  ${item.url}`);
  }
}

export function printList(result: ListResult): void {
  console.log(`杭电主站 · ${result.section} · 第 ${result.page}/${result.totalPages ?? "?"} 页`);
  printItems(result.items);
}

export function printSearch(items: ListItem[]): void {
  printItems(items);
}

export function printArticle(article: Article): void {
  console.log(article.title);
  console.log(`${article.publishedAt ?? "日期未知"}${article.publisher ? ` · ${article.publisher}` : ""}`);
  console.log(article.url);
  console.log();
  console.log(article.content);
  if (article.attachments.length > 0) {
    console.log("\n附件：");
    for (const attachment of article.attachments) console.log(`- ${attachment.title}: ${attachment.url}`);
  }
}

export function printDeadlines(results: ArticleDeadlines[]): void {
  if (results.length === 0) {
    console.log("最近的公告中没有识别到截止时间。");
    return;
  }
  for (const result of results) {
    console.log(result.article.title);
    console.log(`  ${result.article.url}`);
    for (const match of result.matches) console.log(`  - ${match.rawDate}: ${match.evidence}`);
  }
}

export function printJobList(result: JobSiteListResult): void {
  console.log(`杭电就业网 · ${result.section} · 第 ${result.page}/${result.totalPages ?? "?"} 页${result.authenticated ? " · 已登录" : ""}`);
  if (result.items.length === 0) {
    console.log("没有找到结果。");
    return;
  }
  for (const item of result.items) {
    const details = [item.publishedAt ?? item.startsAt, item.company, item.location, item.salary, item.education]
      .filter(Boolean).join(" · ");
    console.log(`${details || "信息未注明"}  ${item.title}`);
    console.log(`  ${item.url}`);
  }
}

export function printJobArticle(article: JobSiteArticle): void {
  console.log(article.title);
  console.log(`${article.url}${article.authenticated ? " · 已登录" : ""}`);
  for (const [key, value] of Object.entries(article.metadata)) console.log(`${key}: ${value}`);
  if (article.content) console.log(`\n${article.content}`);
  if (article.attachments.length > 0) {
    console.log("\n附件：");
    for (const attachment of article.attachments) console.log(`- ${attachment.title}: ${attachment.url}`);
  }
}

export function printServiceLinks(items: ServiceLink[]): void {
  for (const item of items) console.log(`${item.name}\n  ${item.url}`);
}

export function printPhones(offices: PhoneOffice[]): void {
  if (offices.length === 0) return console.log("没有找到匹配的办公电话。");
  for (const office of offices) {
    console.log(`${office.name} · ${office.categoryName}`);
    for (const contact of office.contacts) console.log(`  ${contact.role}: ${contact.phone}`);
  }
}

export function printBusSchedule(schedule: BusSchedule): void {
  for (const note of schedule.notes) console.log(`提示：${note}`);
  for (const trip of schedule.trips) {
    console.log(`${trip.time} · ${trip.schedule ?? "日期未注明"} · ${trip.direction}`);
    console.log(`  ${trip.route}${trip.vehicle ? ` · ${trip.vehicle}` : ""}`);
  }
}

export function printClassSchedule(schedule: ClassSchedule): void {
  console.log(`${schedule.campus} 校区上课时间`);
  for (const period of schedule.periods) console.log(`${period.session} · ${period.name}: ${period.time}`);
}

export function printJwProfile(profile: JwProfile): void {
  for (const [key, value] of Object.entries(profile.fields)) console.log(`${key}: ${value}`);
}

export function printJwTimetable(timetable: JwTimetable): void {
  console.log(`${timetable.term.label} 学期课表`);
  if (timetable.courses.length === 0 && timetable.unscheduled.length === 0) return console.log("本学期没有课程。");
  for (const course of timetable.courses) {
    console.log(`${course.weekdayName ?? "时间未定"} ${course.periods ?? ""}  ${course.name}`);
    const details = [course.weeks, course.location, course.campus, course.teacher].filter(Boolean).join(" · ");
    if (details) console.log(`  ${details}`);
  }
  if (timetable.unscheduled.length > 0) {
    console.log("\n无固定上课时间：");
    for (const course of timetable.unscheduled) {
      console.log(`- ${course.name}${course.teacher ? ` · ${course.teacher}` : ""}${course.weeks ? ` · ${course.weeks}` : ""}`);
    }
  }
}

export function printJwGrades(grades: JwGrades): void {
  if (grades.items.length === 0) return console.log("没有找到成绩。");
  for (const grade of grades.items) {
    const details = [grade.credit && `${grade.credit} 学分`, grade.gradePoint && `绩点 ${grade.gradePoint}`, grade.courseNature, grade.examNature]
      .filter(Boolean).join(" · ");
    console.log(`${grade.term}  ${grade.courseName}  ${grade.score}${details ? `  (${details})` : ""}`);
  }
}

export function printJwExams(exams: JwExams): void {
  console.log(`${exams.term.label} 学期考试安排`);
  if (exams.items.length === 0) console.log("暂无已安排的考试。");
  for (const exam of exams.items) {
    console.log(`${exam.time ?? "时间未定"}  ${exam.courseName}`);
    const details = [exam.campus, exam.location, exam.seat && `座位 ${exam.seat}`].filter(Boolean).join(" · ");
    if (details) console.log(`  ${details}`);
  }
  if (exams.unscheduled.length > 0) {
    console.log("\n尚未安排考试：");
    for (const course of exams.unscheduled) console.log(`- ${course.courseName}${course.examName ? ` · ${course.examName}` : ""}`);
  }
}

const WEEKDAYS = ["", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"];

function printCourseLines(courses: JwCourse[], withWeekday: boolean): void {
  for (const course of courses) {
    const when = [withWeekday ? course.weekdayName : undefined, course.periods].filter(Boolean).join(" ");
    console.log(`${when || "时间未定"}  ${course.name}`);
    const details = [course.location, course.campus, course.teacher].filter(Boolean).join(" · ");
    if (details) console.log(`  ${details}`);
  }
}

export function printJwWeek(timetable: JwWeekTimetable): void {
  console.log(`${timetable.term.label} 学期第 ${timetable.week.week} 周（${timetable.week.start} 至 ${timetable.week.end}）`);
  if (timetable.courses.length === 0) return console.log("本周没有课程。");
  printCourseLines(timetable.courses, true);
}

export function printJwDay(day: JwDay): void {
  const week = day.week ? `第 ${day.week.week} 周` : "不在教学周内";
  console.log(`${day.date} ${WEEKDAYS[day.weekday]} · ${day.term.label} 学期${week}`);
  if (day.courses.length === 0) return console.log("没有课程。");
  printCourseLines(day.courses, false);
}

const PROGRESS_STATUS = { in_progress: "在修", not_taken: "未修", other: "未通过或其他" } as const;

export function printJwProgress(progress: JwProgress): void {
  if (progress.gpa !== undefined) console.log(`平均学分绩点（官方）：${progress.gpa}`);
  const counts = progress.courseCounts;
  if (counts) {
    console.log(`培养计划 ${counts.planned} 门：通过 ${counts.passed}，未通过 ${counts.failed}，在修 ${counts.inProgress}，未修 ${counts.notTaken}`);
  }
  if (progress.outstanding.length === 0) return console.log("\n各类别学分要求均已满足。");
  const missing = progress.outstanding.reduce((sum, category) => sum + category.missingCredits, 0);
  console.log(`\n尚未满足的类别（共差 ${Math.round(missing * 100) / 100} 学分）：`);
  for (const category of progress.outstanding) {
    console.log(`\n${category.path.join(" / ")}：要求 ${category.requiredCredits}，已获 ${category.earnedCredits}，差 ${category.missingCredits}`);
    for (const course of category.courses) {
      const details = [course.credit && `${course.credit} 学分`, PROGRESS_STATUS[course.status], course.plannedTerm && `建议 ${course.plannedTerm}`]
        .filter(Boolean).join(" · ");
      console.log(`  - ${course.name}（${details}）`);
    }
  }
}

export function printJwRooms(result: JwRooms): void {
  console.log(`${result.campus} · 第 ${result.week} 周 ${WEEKDAYS[result.weekday]} 第 ${result.periods.join(",")} 节空闲场地（${result.rooms.length} 间）`);
  for (const room of result.rooms) {
    console.log(`${room.name}${room.seats ? `  ${room.seats} 座` : ""}${room.type ? `  ${room.type}` : ""}`);
  }
}

export function printJwCourseOfferings(result: JwCourseOfferings): void {
  console.log(`${result.term.label} 学期开课（显示 ${result.items.length} 个教学班）`);
  if (result.items.length === 0) return console.log("没有找到匹配的课程。");
  for (const course of result.items) {
    console.log(`${course.name}  ${course.className}`);
    const details = [course.teachers.join(","), course.schedule, course.location, course.campus,
      course.capacity ? `${course.enrolled}/${course.capacity} 人` : undefined].filter(Boolean).join(" · ");
    if (details) console.log(`  ${details}`);
  }
}

export function printJwSelections(result: JwSelections): void {
  console.log(`${result.term.label} 学期已选课程`);
  if (result.items.length === 0) return console.log("本学期没有选课记录。");
  for (const course of result.items) {
    const details = [course.credit && `${course.credit} 学分`, course.courseNature, course.teachers.join(","), course.weeks,
      course.retake ? "重修" : undefined].filter(Boolean).join(" · ");
    console.log(`${course.name}${details ? `  (${details})` : ""}`);
  }
}

export function printJwThesis(thesis: JwThesis): void {
  if (thesis.topics.length === 0) console.log("暂无毕业设计课题。");
  for (const topic of thesis.topics) {
    console.log(`课题：${topic.title}`);
    const advisor = [topic.advisor, topic.advisorTitle, topic.department].filter(Boolean).join(" · ");
    if (advisor) console.log(`  指导教师：${advisor}`);
    if (topic.term) console.log(`  学期：${topic.term}`);
  }
  if (thesis.defenses.length > 0) {
    console.log("\n答辩安排：");
    for (const defense of thesis.defenses) console.log(`- ${defense.stage}${defense.term ? ` · ${defense.term}` : ""}`);
  }
}
