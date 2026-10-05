import { describe, expect, it } from "vitest";
import { extractDeadlines } from "../src/deadlines.js";
import { parseArticlePage, parseListPage } from "../src/sources/main-site.js";

describe("main site parser", () => {
  it("parses a WebPlus list item", () => {
    const html = `
      <ul class="news_list">
        <li class="news">
          <div class="news_meta" date=""><div class="news_day">05</div><div class="news_month">2026.10</div></div>
          <div class="news_title"><a href="/2026/1005/c1a123/page.htm" title="测试通知">省略标题</a></div>
          <div class="news_text"><a>这是通知摘要。</a></div>
        </li>
      </ul>
      <div class="wp_paging">页码 1/12</div>`;

    const result = parseListPage(html, "https://www.hdu.edu.cn/tzgg/list.htm", "notices", 1);
    expect(result.totalPages).toBe(12);
    expect(result.items).toEqual([
      expect.objectContaining({
        id: "hdu-main:123",
        title: "测试通知",
        publishedAt: "2026-10-05",
        url: "https://www.hdu.edu.cn/2026/1005/c1a123/page.htm",
        external: false
      })
    ]);
  });

  it("parses article content and attachments", () => {
    const html = `
      <h1 class="arti_title">测试公告</h1>
      <div class="arti_info">发布时间：2026-10-05 文章来源：教务处</div>
      <div class="wp_articlecontent">
        <p>报名截止时间为2026年10月12日17:00。</p>
        <p><a href="/_upload/test.pdf">附件一</a></p>
      </div>`;
    const article = parseArticlePage(html, "https://www.hdu.edu.cn/2026/1005/c1a123/page.htm");
    expect(article.title).toBe("测试公告");
    expect(article.publishedAt).toBe("2026-10-05");
    expect(article.attachments[0]?.url).toBe("https://www.hdu.edu.cn/_upload/test.pdf");
    expect(article.content).toContain("报名截止时间");
  });
});

describe("deadline extraction", () => {
  it("extracts dates only from deadline-like sentences", () => {
    const result = extractDeadlines(
      "通知发布于2026年10月5日。报名截止时间为2026年10月12日17:00。活动在10月20日举行。"
    );
    expect(result).toEqual([
      expect.objectContaining({ rawDate: "2026年10月12日17:00" })
    ]);
  });
});
