import type {
  Article, ArticleDeadlines, BusSchedule, ClassSchedule, JobSiteArticle, JobSiteListResult,
  ListItem, ListResult, PhoneOffice, ServiceLink
} from "./types.js";

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
