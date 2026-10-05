import type { Article, ArticleDeadlines, ListItem, ListResult } from "./types.js";

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
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
