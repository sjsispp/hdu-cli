#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command, CommanderError, InvalidArgumentError } from "commander";
import { authStatus, logout, SERVICES, sessionStorageLabel } from "./auth.js";
import { extractDeadlines } from "./deadlines.js";
import { ERROR_EXIT_CODES, invalidArgument, toHduError } from "./errors.js";
import {
  printArticle, printBusSchedule, printClassSchedule, printDeadlines, printJobArticle, printJobList,
  printJson, printJsonError, printJwDay, printJwExams, printJwGrades, printJwProfile, printJwCourseOfferings, printJwProgress, printJwRooms, printJwSelections, printJwThesis, printJwTimetable, printJwWeek, printList, printPhones, printSearch,
  printServiceLinks
} from "./output.js";
import { getJobSiteArticle, listJobSite } from "./sources/job-site.js";
import { currentTerm, getExams, getGrades, getProfile, getTimetable, makeTerm } from "./sources/jw.js";
import { getSelections, searchCourseOfferings } from "./sources/jw-courses.js";
import { getProgress } from "./sources/jw-progress.js";
import { getEmptyRooms, parsePeriods } from "./sources/jw-rooms.js";
import { getThesis } from "./sources/jw-thesis.js";
import { getDay, getWeekTimetable } from "./sources/jw-week.js";
import { getArticle, listSection, searchMainSite } from "./sources/main-site.js";
import { getBusSchedule, getClassSchedule, listPhones, listServiceLinks } from "./sources/service-info.js";
import { type LoginMethod, performLogin, runSetup } from "./setup.js";
import type {
  ArticleDeadlines, BusCampus, ClassCampus, JobPositionType, JobSiteSection, JwTerm, JwTermNumber, MainSiteSection,
  PhoneCategory
} from "./types.js";

// Both src/cli.ts and dist/cli.js sit one level below the package root.
const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const program = new Command();
program.name("hdu").description("查询杭州电子科技大学公开信息").version(version);

// In --json mode every failure, including usage errors, is reported as one JSON envelope on stderr.
// Subcommands inherit these settings only if they are configured before the commands are added.
const jsonMode = process.argv.includes("--json");
program.exitOverride();
program.configureOutput({ outputError: (message, write) => { if (!jsonMode) write(message); } });

function positiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new InvalidArgumentError(`Expected a positive integer, got: ${value}`);
  return parsed;
}

function addListCommand(parentName: string, section: MainSiteSection, description: string): void {
  const parent = program.command(parentName).description(description);
  parent
    .command("list")
    .option("-p, --page <number>", "页码", positiveInteger, 1)
    .option("-l, --limit <number>", "最多返回数量", positiveInteger, 20)
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const result = await listSection(section, options);
      options.json ? printJson(result) : printList(result);
    });
}

addListCommand("notice", "notices", "学校通知公告");
addListCommand("event", "events", "讲座与论坛");
addListCommand("news", "news", "杭电新闻");

const job = program.command("job").description("杭电就业网公开招聘信息");

function addJobListCommand(name: string, section: JobSiteSection, description: string): void {
  job.command(name).description(description)
    .option("-p, --page <number>", "页码", positiveInteger, 1)
    .option("-l, --limit <number>", "最多返回数量", positiveInteger, 20)
    .option("-q, --query <keyword>", "关键词")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const result = await listJobSite(section, options);
      options.json ? printJson(result) : printJobList(result);
    });
}

addJobListCommand("notices", "notices", "招聘公告");
addJobListCommand("talks", "talks", "校园宣讲会");
addJobListCommand("fairs", "fairs", "招聘会与双选会");

job.command("positions").description("全职与实习岗位")
  .option("-p, --page <number>", "页码", positiveInteger, 1)
  .option("-l, --limit <number>", "最多返回数量", positiveInteger, 20)
  .option("-q, --query <keyword>", "岗位名或公司名")
  .option("-t, --type <type>", "all、fulltime 或 intern", "all")
  .option("--json", "输出 JSON")
  .action(async (options) => {
    if (!["all", "fulltime", "intern"].includes(options.type)) throw invalidArgument("Position type must be all, fulltime, or intern.");
    const result = await listJobSite("positions", { ...options, type: options.type as JobPositionType });
    options.json ? printJson(result) : printJobList(result);
  });

job.command("get").description("读取就业网详情")
  .argument("<url>", "job.hdu.edu.cn 详情地址")
  .option("--json", "输出 JSON")
  .action(async (url, options) => {
    const article = await getJobSiteArticle(url);
    options.json ? printJson(article) : printJobArticle(article);
  });

const auth = program.command("auth").description("杭电统一身份认证会话");
function loginMethod(value: string): LoginMethod {
  if (value !== "qr" && value !== "browser") throw new InvalidArgumentError(`Unknown login method: ${value}. Use qr or browser.`);
  return value;
}

program.command("setup").description("首次使用引导：检查环境并登录杭电统一身份认证")
  .option("-m, --method <method>", "跳过选择，直接使用 qr 或 browser 登录", loginMethod)
  .option("--timeout <seconds>", "等待登录的秒数", positiveInteger, 300)
  .action(async (options) => {
    await runSetup({ method: options.method, timeoutMs: options.timeout * 1000 });
  });

auth.command("login").description("登录杭电统一身份认证，会话加密保存在本机并自动续期")
  .option("-m, --method <method>", "qr（钉钉扫码，在终端显示二维码）或 browser（打开浏览器）", loginMethod, "qr")
  .option("--timeout <seconds>", "等待登录的秒数", positiveInteger, 300)
  .action(async (options) => {
    await performLogin(options.method, options.timeout * 1000);
    console.log(`登录成功，统一身份认证会话已保存到${sessionStorageLabel()}；各网站会话过期后会自动续期。`);
  });
auth.command("status").description("检查统一身份认证和各网站的登录状态")
  .option("--json", "输出 JSON")
  .action(async (options) => {
    const status = await authStatus();
    if (options.json) return printJson(status);
    console.log(`统一身份认证：${status.sso ? "已登录" : "未登录或已过期，请运行 hdu auth login"}（${status.storage}）`);
    for (const [id, active] of Object.entries(status.services)) {
      console.log(`${SERVICES[id as keyof typeof SERVICES].name}：${active ? "可用" : "不可用"}`);
    }
  });
auth.command("logout").description("删除本机保存的统一身份认证和各网站会话").action(async () => {
  console.log((await logout()) ? `已从${sessionStorageLabel()}删除登录会话。` : "没有找到已保存的登录会话。");
});

const jw = program.command("jw").description("杭电教务系统（需要登录，只读）");

function termNumber(value: string): JwTermNumber {
  if (value !== "1" && value !== "2" && value !== "3") throw new InvalidArgumentError(`Expected term 1, 2 or 3, got: ${value}`);
  return Number(value) as JwTermNumber;
}

/** Resolves --year/--term; when both are omitted, `fallback` decides (current term, or undefined for all terms). */
function selectedTerm(options: { year?: number; term?: JwTermNumber }, fallback: () => JwTerm | undefined): JwTerm | undefined {
  if (options.year === undefined && options.term === undefined) return fallback();
  const current = currentTerm();
  return makeTerm(options.year ?? current.year, options.term ?? current.term);
}

function addTermOptions(command: Command): Command {
  return command
    .option("-y, --year <year>", "学年起始年份，如 2026 表示 2026-2027 学年", positiveInteger)
    .option("-t, --term <term>", "学期：1、2 或 3", termNumber)
    .option("--json", "输出 JSON");
}

jw.command("profile").description("个人学籍信息（仅学业字段，不含证件号等敏感信息）")
  .option("--json", "输出 JSON")
  .action(async (options) => {
    const result = await getProfile();
    options.json ? printJson(result) : printJwProfile(result);
  });

addTermOptions(jw.command("timetable").description("个人课表，默认当前学期"))
  .action(async (options) => {
    const result = await getTimetable(selectedTerm(options, currentTerm));
    options.json ? printJson(result) : printJwTimetable(result);
  });

function calendarDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined;
  if (!date || date.getDate() !== Number(match![3])) throw new InvalidArgumentError(`Expected a date like 2026-10-19, got: ${value}`);
  return date;
}

jw.command("today").description("某天的课程（按教学周计算，含调课），默认今天")
  .option("-d, --date <date>", "日期，如 2026-10-21", calendarDate)
  .option("--json", "输出 JSON")
  .action(async (options) => {
    const result = await getDay(options.date);
    options.json ? printJson(result) : printJwDay(result);
  });

addTermOptions(jw.command("week").description("某一教学周的课表（含调课），默认本周"))
  .option("-w, --week <week>", "教学周次", positiveInteger)
  .action(async (options) => {
    const result = await getWeekTimetable({ term: selectedTerm(options, () => undefined), week: options.week });
    options.json ? printJson(result) : printJwWeek(result);
  });

jw.command("progress").description("学业进度：官方 GPA、各类别学分要求与尚未修满的课程")
  .option("--json", "输出 JSON")
  .action(async (options) => {
    const result = await getProgress();
    options.json ? printJson(result) : printJwProgress(result);
  });

function weekday(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 7) throw new InvalidArgumentError(`Expected a weekday 1-7, got: ${value}`);
  return parsed;
}

jw.command("rooms").description("查询空闲教室，默认本周、今天")
  .requiredOption("-p, --periods <periods>", "节次，如 1-2、3,4 或 1-2,6-7")
  .option("-c, --campus <campus>", "校区：xiasha、qingshanhu、shaoxing 或中文名", "xiasha")
  .option("-w, --week <week>", "教学周次", positiveInteger)
  .option("--weekday <weekday>", "星期 1-7", weekday)
  .option("-d, --date <date>", "按日期推算周次和星期，如 2026-10-21", calendarDate)
  .option("-b, --building <text>", "按场地名称过滤，如 第6教研楼")
  .option("--min-seats <seats>", "最少座位数", positiveInteger)
  .option("--json", "输出 JSON")
  .action(async (options) => {
    const result = await getEmptyRooms({
      campus: options.campus, periods: parsePeriods(options.periods), week: options.week, weekday: options.weekday,
      date: options.date, building: options.building, minSeats: options.minSeats
    });
    options.json ? printJson(result) : printJwRooms(result);
  });

addTermOptions(jw.command("courses").description("全校开课查询：按课程、教师或地点查找教学班，默认当前学期"))
  .option("-q, --query <text>", "课程代码或名称")
  .option("--teacher <text>", "教师姓名或工号")
  .option("--location <text>", "上课地点")
  .option("-l, --limit <number>", "最多返回的教学班数量", positiveInteger, 30)
  .action(async (options) => {
    const result = await searchCourseOfferings({
      query: options.query, teacher: options.teacher, location: options.location,
      term: selectedTerm(options, () => undefined), limit: options.limit
    });
    options.json ? printJson(result) : printJwCourseOfferings(result);
  });

addTermOptions(jw.command("selections").description("本人选课结果，默认当前学期"))
  .action(async (options) => {
    const result = await getSelections(selectedTerm(options, currentTerm));
    options.json ? printJson(result) : printJwSelections(result);
  });

jw.command("thesis").description("毕业设计：课题、指导教师与答辩环节")
  .option("--json", "输出 JSON")
  .action(async (options) => {
    const result = await getThesis();
    options.json ? printJson(result) : printJwThesis(result);
  });

addTermOptions(jw.command("grades").description("课程成绩，默认全部学期"))
  .action(async (options) => {
    const result = await getGrades(selectedTerm(options, () => undefined));
    options.json ? printJson(result) : printJwGrades(result);
  });

addTermOptions(jw.command("exams").description("考试安排，默认当前学期"))
  .action(async (options) => {
    const result = await getExams(selectedTerm(options, currentTerm));
    options.json ? printJson(result) : printJwExams(result);
  });

const service = program.command("service").description("主站服务信息");
service.command("links").description("列出图书馆、档案馆、校医院等服务入口")
  .option("--json", "输出 JSON")
  .action(async (options) => {
    const result = await listServiceLinks();
    options.json ? printJson(result) : printServiceLinks(result.items);
  });

service.command("phones").description("查询学校办公电话")
  .option("-c, --category <category>", "all、administration、academic、support、affiliated 或 research", "all")
  .option("-q, --query <keyword>", "机构、岗位或电话号码关键词")
  .option("--json", "输出 JSON")
  .action(async (options) => {
    const categories = ["all", "administration", "academic", "support", "affiliated", "research"];
    if (!categories.includes(options.category)) throw invalidArgument(`Phone category must be one of: ${categories.join(", ")}.`);
    const result = await listPhones({ category: options.category as PhoneCategory, query: options.query });
    options.json ? printJson(result) : printPhones(result.offices);
  });

service.command("buses").description("查询工作班车")
  .requiredOption("-c, --campus <campus>", "xiasha 或 shaoxing")
  .option("--json", "输出 JSON")
  .action(async (options) => {
    if (!["xiasha", "shaoxing"].includes(options.campus)) throw invalidArgument("Bus campus must be xiasha or shaoxing.");
    const result = await getBusSchedule(options.campus as BusCampus);
    options.json ? printJson(result) : printBusSchedule(result);
  });

service.command("class-times").description("查询校区上课时间")
  .requiredOption("-c, --campus <campus>", "xiasha、shaoxing 或 qingshanhu")
  .option("--json", "输出 JSON")
  .action(async (options) => {
    if (!["xiasha", "shaoxing", "qingshanhu"].includes(options.campus)) {
      throw invalidArgument("Class campus must be xiasha, shaoxing, or qingshanhu.");
    }
    const result = await getClassSchedule(options.campus as ClassCampus);
    options.json ? printJson(result) : printClassSchedule(result);
  });

program
  .command("search")
  .argument("<query>", "关键词")
  .option("--pages <number>", "每个栏目检索的页数，最多 10", positiveInteger, 2)
  .option("-l, --limit <number>", "最多返回数量", positiveInteger, 20)
  .option("--json", "输出 JSON")
  .action(async (query, options) => {
    const result = await searchMainSite(query, options);
    options.json ? printJson({ query, items: result }) : printSearch(result);
  });

program
  .command("page")
  .description("读取杭电网页")
  .command("get")
  .argument("<url>", "*.hdu.edu.cn 文章地址")
  .option("--json", "输出 JSON")
  .action(async (url, options) => {
    const article = await getArticle(url);
    options.json ? printJson(article) : printArticle(article);
  });

program
  .command("deadline")
  .description("从近期公告中识别截止时间")
  .command("list")
  .option("--pages <number>", "检查公告页数，最多 5", positiveInteger, 1)
  .option("-l, --limit <number>", "最多检查文章数量", positiveInteger, 10)
  .option("--json", "输出 JSON")
  .action(async (options) => {
    if (options.pages > 5) throw invalidArgument("Deadline scanning is limited to 5 pages per run.");
    const candidates = [];
    for (let page = 1; page <= options.pages; page += 1) {
      candidates.push(...(await listSection("notices", { page })).items);
    }

    const results: ArticleDeadlines[] = [];
    for (const item of candidates.filter((candidate) => !candidate.external).slice(0, options.limit)) {
      const article = await getArticle(item.url);
      const matches = extractDeadlines(article.content);
      if (matches.length > 0) {
        results.push({
          article: {
            id: article.id,
            title: article.title,
            publishedAt: article.publishedAt,
            url: article.url
          },
          matches
        });
      }
    }
    options.json ? printJson({ source: "hdu-main", results }) : printDeadlines(results);
  });

program.parseAsync().catch((thrown: unknown) => {
  // --help and --version also exit through CommanderError, with exit code 0.
  if (thrown instanceof CommanderError && thrown.exitCode === 0) return;
  const error = toHduError(thrown);
  if (jsonMode) {
    printJsonError(error);
  } else if (!(thrown instanceof CommanderError)) {
    console.error(`hdu: ${error.message}`);
    if (error.hint) console.error(`提示：${error.hint}`);
  }
  process.exitCode = ERROR_EXIT_CODES[error.type];
});
