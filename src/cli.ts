#!/usr/bin/env node
import { Command } from "commander";
import { extractDeadlines } from "./deadlines.js";
import { printArticle, printDeadlines, printJson, printList, printSearch } from "./output.js";
import { getArticle, listSection, searchMainSite } from "./sources/main-site.js";
import type { ArticleDeadlines, MainSiteSection } from "./types.js";

const program = new Command();
program.name("hdu").description("查询杭州电子科技大学公开信息").version("0.1.0");

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
