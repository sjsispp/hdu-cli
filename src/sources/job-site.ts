import * as cheerio from "cheerio";
import { inflateSync } from "node:zlib";
import { fetchText, isAllowedHduUrl } from "../http.js";
import { getJobSessionCookie } from "../auth.js";
import type {
  Attachment,
  JobPositionType,
  JobSiteArticle,
  JobSiteItem,
  JobSiteListResult,
  JobSiteSection
} from "../types.js";

export const JOB_SITE_ORIGIN = "https://job.hdu.edu.cn";

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function absoluteUrl(href: string, baseUrl = JOB_SITE_ORIGIN): string {
  return new URL(href, baseUrl).toString();
}

function itemId(url: string): string {
  const parsed = new URL(url);
  const id = parsed.searchParams.get("id") ?? parsed.searchParams.get("aid");
  return `hdu-job:${parsed.pathname.split("/").filter(Boolean)[0] ?? "page"}:${id ?? parsed.pathname}`;
}

/** Decode the compressed fragments used by the employment site's server-rendered pages. */
export function decodeEmbeddedContent(html: string): string {
  const fragments = new Map<string, string>();
  const pattern = /\$\("#content(\d+)"\)[\s\S]*?unzip\("([A-Za-z0-9+/=]+)"\)\.substr\((\d+)\)\)\.substr\((\d+)\)/g;
  for (const match of html.matchAll(pattern)) {
    try {
      const inflated = inflateSync(Buffer.from(match[2]!, "base64")).toString("utf8");
      const encodedHtml = inflated.slice(Number(match[3]));
      const decoded = Buffer.from(encodedHtml, "base64").toString("utf8").slice(Number(match[4]));
      fragments.set(match[1]!, decoded);
    } catch {
      // Keep the original placeholder if the upstream encoding changes.
    }
  }

  let decodedPage = html;
  for (const [id, fragment] of fragments) {
    const section = new RegExp(`<section\\s+id=["']content${id}["'][^>]*>[\\s\\S]*?<\\/section>`, "g");
    decodedPage = decodedPage.replace(section, fragment);
  }
  return decodedPage;
}

function totalPages($: cheerio.CheerioAPI): number | undefined {
  const pages = $(".pages a[href]")
    .toArray()
    .map((element) => Number(new URL($(element).attr("href")!, JOB_SITE_ORIGIN).searchParams.get("page")))
    .filter((page) => Number.isInteger(page) && page > 0);
  return pages.length > 0 ? Math.max(...pages) : 1;
}

export function parseJobSiteList(
  html: string,
  section: JobSiteSection,
  page: number,
  authenticated = false
): JobSiteListResult {
  const $ = cheerio.load(decodeEmbeddedContent(html));
  const items: JobSiteItem[] = [];

  if (section === "positions") {
    $(".job-box > ul.list > li[data-id]").each((_, element) => {
      const $item = $(element);
      const $link = $item.find(".job .name a[href*='/job/view']").first();
      const href = $link.attr("href");
      if (!href) return;
      const details = $item.find(".salary li").toArray().map((node) => cleanText($(node).text()));
      const url = absoluteUrl(href);
      items.push({
        id: itemId(url), source: "hdu-job", section, title: cleanText($link.attr("title") ?? $link.text()), url,
        publishedAt: cleanText($item.find(".job .name span").first().text()) || undefined,
        company: cleanText($item.find(".company > a").first().text()) || undefined,
        salary: cleanText($item.find(".salary p").first().text()) || undefined,
        location: details[0] || undefined, positionType: details[1] || undefined, education: details[2] || undefined
      });
    });
  } else {
    const selector = section === "notices" ? "ul.infoList:not(.teachinList):not(.jobfairList)" :
      section === "talks" ? "ul.infoList.teachinList" : "ul.infoList.jobfairList";
    $(selector).each((_, element) => {
      const $item = $(element);
      const expectedPath = section === "notices" ? "/campus/view" : section === "talks" ? "/teachin/view" : "/jobfair/view";
      const $link = $item.find(`a[href*='${expectedPath}']`).first();
      const href = $link.attr("href");
      if (!href) return;
      const columns = $item.children("li").toArray().map((node) => cleanText($(node).text()));
      const url = absoluteUrl(href);
      items.push({
        id: itemId(url), source: "hdu-job", section,
        title: cleanText($link.attr("title") ?? $link.text()), url,
        publishedAt: section === "notices" ? columns[1] : undefined,
        location: section === "notices" ? undefined : columns[1],
        startsAt: section === "notices" ? undefined : columns[2],
        mode: section === "notices" ? undefined : cleanText($item.find(".status-text").first().text()) || undefined
      });
    });
  }

  return { source: "hdu-job", section, page, totalPages: totalPages($), authenticated, items };
}

function listUrl(
  section: JobSiteSection,
  options: { page: number; query?: string; type?: JobPositionType }
): string {
  const paths: Record<JobSiteSection, string> = {
    notices: "/campus/index", talks: "/teachin/index", fairs: "/jobfair/index", positions: "/job/search"
  };
  const url = new URL(paths[section], JOB_SITE_ORIGIN);
  if (options.page > 1) url.searchParams.set("page", String(options.page));
  if (options.query) url.searchParams.set(section === "notices" ? "keyword" : "title", options.query);
  if (section === "positions" && options.type && options.type !== "all") {
    url.searchParams.set("d_category", options.type === "fulltime" ? "100" : "102");
  }
  return url.toString();
}

export async function listJobSite(
  section: JobSiteSection,
  options: { page?: number; limit?: number; query?: string; type?: JobPositionType } = {}
): Promise<JobSiteListResult> {
  const page = options.page ?? 1;
  if (!Number.isInteger(page) || page < 1) throw new Error("Page must be a positive integer.");
  const cookie = await getJobSessionCookie();
  const html = await fetchText(listUrl(section, { page, query: options.query, type: options.type }), { cookie });
  const result = parseJobSiteList(html, section, page, Boolean(cookie));
  result.items = result.items.slice(0, options.limit ?? Number.POSITIVE_INFINITY);
  return result;
}

export function parseJobSiteArticle(html: string, url: string, authenticated = false): JobSiteArticle {
  const $ = cheerio.load(decodeEmbeddedContent(html));
  $("script, style, noscript, iframe, button, .operation, .share, .jf-anchor").remove();
  const root = $(".common-view").first();
  const title = cleanText(
    root.find(".details-title h5, .title-message .title, .titleBox .text-t").first().text() || $("title").first().text()
  );
  if (!title) throw new Error(`Could not find an employment article title at ${url}`);

  const metadata: Record<string, string> = {};
  root.find(".details-list li, .titleBox .text-b p, .unit-info .item").each((_, element) => {
    const text = cleanText($(element).text());
    const split = text.match(/^([^：:]{2,12})[：:]\s*(.+)$/);
    if (split) metadata[split[1]!.trim()] = split[2]!.trim();
  });

  const attachments = new Map<string, Attachment>();
  root.find("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const attachmentUrl = absoluteUrl(href, url);
    if (!isAllowedHduUrl(attachmentUrl) || !/\.(pdf|docx?|xlsx?|pptx?|zip|rar)(?:$|\?)/i.test(attachmentUrl)) return;
    attachments.set(attachmentUrl, { title: cleanText($(element).text()) || "attachment", url: attachmentUrl });
  });

  root.find("nav, .breadcrumb, .siderinfo, .details-table, a.btn, .common-view-tips").remove();
  const blocks = root.find("h5, h6, p, li").toArray()
    .map((element) => cleanText($(element).text())).filter(Boolean);
  const content = [...new Set(blocks)].filter((text) => text !== title).join("\n");
  return { id: itemId(url), source: "hdu-job", title, url, content, metadata, attachments: [...attachments.values()], authenticated };
}

export async function getJobSiteArticle(url: string): Promise<JobSiteArticle> {
  const parsed = new URL(url);
  if (parsed.hostname !== "job.hdu.edu.cn") throw new Error("Only job.hdu.edu.cn URLs are supported here.");
  const cookie = await getJobSessionCookie();
  return parseJobSiteArticle(await fetchText(url, { cookie }), url, Boolean(cookie));
}
