#!/usr/bin/env node
import { Command } from "commander";
import QRCode from "qrcode";
import { clearJobSession, jobAuthStatus, loginToJobSite, loginToJobSiteWithQr, sessionStorageLabel } from "./auth.js";
import { extractDeadlines } from "./deadlines.js";
import {
  printArticle, printBusSchedule, printClassSchedule, printDeadlines, printJobArticle, printJobList,
  printJson, printList, printPhones, printSearch, printServiceLinks
} from "./output.js";
import { getJobSiteArticle, listJobSite } from "./sources/job-site.js";
import { getArticle, listSection, searchMainSite } from "./sources/main-site.js";
import { getBusSchedule, getClassSchedule, listPhones, listServiceLinks } from "./sources/service-info.js";
import type {
  ArticleDeadlines, BusCampus, ClassCampus, JobPositionType, JobSiteSection, MainSiteSection, PhoneCategory
} from "./types.js";

const program = new Command();
program.name("hdu").description("查询杭州电子科技大学公开信息").version("0.3.0");

function positiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`Expected a positive integer, got: ${value}`);
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
    if (!["all", "fulltime", "intern"].includes(options.type)) throw new Error("Position type must be all, fulltime, or intern.");
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
auth.command("login").description("登录杭电统一身份认证并将就业网会话加密保存到本机")
  .option("-m, --method <method>", "qr（钉钉扫码，在终端显示二维码）或 browser（打开浏览器）", "qr")
  .option("--timeout <seconds>", "等待登录的秒数", positiveInteger, 300)
  .action(async (options) => {
    if (options.method === "browser") {
      console.log("请在打开的浏览器中完成杭电统一身份认证；CLI 不会读取或保存你的密码。");
      await loginToJobSite(options.timeout * 1000);
    } else if (options.method === "qr") {
      await loginToJobSiteWithQr(async (content) => {
        console.log(await QRCode.toString(content, { type: "utf8", errorCorrectionLevel: "L" }));
        console.log("请使用钉钉扫描上方二维码并在手机上确认登录；二维码过期后会自动刷新。");
      }, options.timeout * 1000);
    } else {
      throw new Error(`Unknown login method: ${options.method}. Use qr or browser.`);
    }
    console.log(`登录成功，就业网会话已保存到${sessionStorageLabel()}。`);
  });
auth.command("status").description("检查就业网登录状态")
  .option("--json", "输出 JSON")
  .action(async (options) => {
    const status = await jobAuthStatus();
    options.json ? printJson(status) : console.log(status.authenticated ? `已登录（${status.storage}）` : "未登录或会话已过期");
  });
auth.command("logout").description("删除本机保存的就业网会话").action(async () => {
  console.log((await clearJobSession()) ? `已从${sessionStorageLabel()}删除就业网会话。` : "没有找到已保存的就业网会话。");
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
    if (!categories.includes(options.category)) throw new Error(`Phone category must be one of: ${categories.join(", ")}.`);
    const result = await listPhones({ category: options.category as PhoneCategory, query: options.query });
    options.json ? printJson(result) : printPhones(result.offices);
  });

service.command("buses").description("查询工作班车")
  .requiredOption("-c, --campus <campus>", "xiasha 或 shaoxing")
  .option("--json", "输出 JSON")
  .action(async (options) => {
    if (!["xiasha", "shaoxing"].includes(options.campus)) throw new Error("Bus campus must be xiasha or shaoxing.");
    const result = await getBusSchedule(options.campus as BusCampus);
    options.json ? printJson(result) : printBusSchedule(result);
  });

service.command("class-times").description("查询校区上课时间")
  .requiredOption("-c, --campus <campus>", "xiasha、shaoxing 或 qingshanhu")
  .option("--json", "输出 JSON")
  .action(async (options) => {
    if (!["xiasha", "shaoxing", "qingshanhu"].includes(options.campus)) {
      throw new Error("Class campus must be xiasha, shaoxing, or qingshanhu.");
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
    if (options.pages > 5) throw new Error("Deadline scanning is limited to 5 pages per run.");
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

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`hdu: ${message}`);
  process.exitCode = 1;
});
