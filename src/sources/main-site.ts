import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import { HduError, invalidArgument, parseFailure } from "../errors.js";
import { delay, fetchText, isAllowedHduUrl } from "../http.js";
import type { Article, ListItem, ListResult, MainSiteSection } from "../types.js";

export const MAIN_SITE_ORIGIN = "https://www.hdu.edu.cn";

const SECTION_PATHS: Record<MainSiteSection, string[]> = {
  notices: ["/tzgg/list.htm"],
  events: ["/jzlt/list.htm"],
  news: ["/news/hdxw/list.htm", "/news/zhxw/list.htm"]
};

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function absoluteUrl(href: string, baseUrl: string): string {
  return new URL(href, baseUrl).toString();
}

function listPageUrl(path: string, page: number): string {
  if (page <= 1) return new URL(path, MAIN_SITE_ORIGIN).toString();
  return new URL(path.replace(/list\.htm$/, `list${page}.htm`), MAIN_SITE_ORIGIN).toString();
}

function itemId(url: string): string {
  const articleId = url.match(/a(\d+)\/page\.htm/)?.[1];
  if (articleId) return `hdu-main:${articleId}`;
  return `hdu-main:${createHash("sha256").update(url).digest("hex").slice(0, 16)}`;
}

function parsePublishedAt($item: cheerio.Cheerio<any>): string | undefined {
  const metadataDate = cleanText($item.find(".news_meta").attr("date") ?? "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(metadataDate)) return metadataDate;

  const month = cleanText($item.find(".news_month").first().text()).replace(".", "-");
  const day = cleanText($item.find(".news_day").first().text());
  if (/^\d{4}-\d{2}$/.test(month) && /^\d{1,2}$/.test(day)) {
    return `${month}-${day.padStart(2, "0")}`;
  }

  const textDate = cleanText($item.find(".news_meta, .news_date, .date").first().text());
  return textDate.match(/20\d{2}[-./]\d{1,2}[-./]\d{1,2}/)?.[0].replace(/[./]/g, "-");
}

export function parseListPage(
  html: string,
  pageUrl: string,
  section: MainSiteSection,
  page: number
): ListResult {
  const $ = cheerio.load(html);
  const items: ListItem[] = [];

  $(".news_list li.news, .col_news_list li.news").each((_, element) => {
    const $item = $(element);
    const $link = $item.find(".news_title a").first();
    const href = $link.attr("href");
    const title = cleanText($link.attr("title") ?? $link.text());
    if (!href || !title) return;

    const url = absoluteUrl(href, pageUrl);
    const summary = cleanText($item.find(".news_text").first().text());
    items.push({
      id: itemId(url),
      source: "hdu-main",
      section,
      title,
      publishedAt: parsePublishedAt($item),
      summary: summary || undefined,
      url,
      external: !isAllowedHduUrl(url)
    });
  });

  const pageText = cleanText($(".wp_paging, .pages, .page").text());
  const totalPages = Number(pageText.match(/页码\s*\d+\s*\/\s*(\d+)/)?.[1]) || undefined;

  return { source: "hdu-main", section, page, totalPages, items };
}

export async function listSection(
  section: MainSiteSection,
  options: { page?: number; limit?: number } = {}
): Promise<ListResult> {
  const page = options.page ?? 1;
  if (!Number.isInteger(page) || page < 1) throw invalidArgument("Page must be a positive integer.");

  const combined: ListResult = { source: "hdu-main", section, page, items: [] };
  for (const path of SECTION_PATHS[section]) {
    const url = listPageUrl(path, page);
    const parsed = parseListPage(await fetchText(url), url, section, page);
    combined.totalPages = Math.max(combined.totalPages ?? 0, parsed.totalPages ?? 0) || undefined;
    combined.items.push(...parsed.items);
    if (SECTION_PATHS[section].length > 1) await delay(120);
  }

  const unique = new Map(combined.items.map((item) => [item.url, item]));
  combined.items = [...unique.values()].slice(0, options.limit ?? Number.POSITIVE_INFINITY);
  return combined;
}

export async function searchMainSite(
  query: string,
  options: { pages?: number; limit?: number } = {}
): Promise<ListItem[]> {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  if (!normalizedQuery) throw invalidArgument("Search query cannot be empty.");

  const pages = options.pages ?? 2;
  if (!Number.isInteger(pages) || pages < 1 || pages > 10) {
    throw invalidArgument("Pages must be an integer between 1 and 10.");
  }

  const matches: ListItem[] = [];
  for (const section of ["notices", "events", "news"] as const) {
    for (let page = 1; page <= pages; page += 1) {
      const result = await listSection(section, { page });
      matches.push(
        ...result.items.filter((item) =>
          `${item.title} ${item.summary ?? ""}`.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
        )
      );
      await delay(120);
    }
  }

  return [...new Map(matches.map((item) => [item.url, item])).values()].slice(
    0,
    options.limit ?? 20
  );
}

export function parseArticlePage(html: string, url: string): Article {
  const $ = cheerio.load(html);
  $("script, style, noscript, iframe").remove();

  const title = cleanText($(".arti_title").first().text() || $("title").first().text());
  if (!title) throw parseFailure(`Could not find an article title at ${url}`);

  const info = cleanText($(".arti_info, .arti_metas").first().text());
  const publishedAt = info.match(/发布时间[：:]\s*(20\d{2}-\d{1,2}-\d{1,2})/)?.[1];
  const publisher = info.match(/文章来源[：:]\s*([^|]+?)(?:\s|$)/)?.[1]?.trim();
  const $content = $(".wp_articlecontent").first();
  if (!$content.length) throw parseFailure(`Could not find article content at ${url}`);

  const blocks = $content
    .find("p, li, table tr")
    .toArray()
    .map((element) => cleanText($(element).text()))
    .filter(Boolean);
  const content = [...new Set(blocks)].join("\n") || cleanText($content.text());

  const attachments = new Map<string, { title: string; url: string }>();
  $content.find("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const attachmentUrl = absoluteUrl(href, url);
    if (!isAllowedHduUrl(attachmentUrl)) return;
    const pathname = new URL(attachmentUrl).pathname.toLowerCase();
    if (!/\.(pdf|docx?|xlsx?|pptx?|zip|rar)$/.test(pathname)) return;
    attachments.set(attachmentUrl, {
      title: cleanText($(element).text()) || pathname.split("/").at(-1) || "attachment",
      url: attachmentUrl
    });
  });

  return {
    id: itemId(url),
    source: "hdu-main",
    title,
    publishedAt,
    publisher,
    url,
    content,
    attachments: [...attachments.values()]
  };
}

export async function getArticle(url: string): Promise<Article> {
  if (!isAllowedHduUrl(url)) throw new HduError("unsupported", "Only *.hdu.edu.cn URLs are supported.");
  return parseArticlePage(await fetchText(url), url);
}
