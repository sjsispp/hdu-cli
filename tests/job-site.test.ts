import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodeEmbeddedContent, parseJobSiteArticle, parseJobSiteList } from "../src/sources/job-site.js";

function protectedPage(fragment: string, id = "1234"): string {
  const prefix = "guard";
  const payload = Buffer.from(fragment).toString("base64");
  const compressed = deflateSync(Buffer.from(prefix + payload)).toString("base64");
  return `<section id="content${id}"></section><script>$("#content${id}").each(function(){
    $(this).replaceWith(Base64.decode(unzip("${compressed}").substr(${prefix.length})).substr(0));
  });</script>`;
}

describe("employment site parser", () => {
  it("decodes and parses recruitment notices", () => {
    const fragment = `<ul class="infoList">
      <li><a href="/campus/view?id=10052">测试招聘公告</a></li>
      <li>2026-10-05 09:30:00</li>
    </ul><div class="pages"><a href="?page=8">8</a></div>`;
    const html = protectedPage(fragment);
    expect(decodeEmbeddedContent(html)).toContain("测试招聘公告");
    const result = parseJobSiteList(html, "notices", 1);
    expect(result.totalPages).toBe(8);
    expect(result.items[0]).toEqual(expect.objectContaining({
      id: "hdu-job:campus:10052",
      title: "测试招聘公告",
      publishedAt: "2026-10-05 09:30:00",
      url: "https://job.hdu.edu.cn/campus/view?id=10052"
    }));
  });

  it("parses structured position fields", () => {
    const fragment = `<div class="job-box"><ul class="list"><li data-id="42"><div class="job">
      <div class="company"><a>测试公司</a></div>
      <div class="name"><a href="/job/view?id=42" title="算法工程师">算法工程师</a><span>2026-10-05</span></div>
      <div class="salary"><p>15000-20000</p><ul><li>杭州市</li><li>全职</li><li>硕士</li></ul></div>
    </div></li></ul></div>`;
    const result = parseJobSiteList(protectedPage(fragment), "positions", 1, true);
    expect(result.authenticated).toBe(true);
    expect(result.items[0]).toEqual(expect.objectContaining({
      company: "测试公司", salary: "15000-20000", location: "杭州市", positionType: "全职", education: "硕士"
    }));
  });

  it("parses an employment detail page and attachments", () => {
    const detail = `<div class="common-view"><div class="details-title"><h5>测试岗位</h5></div>
      <div class="details-list"><ul><li>招聘人数：2人</li></ul></div>
      <div class="details-mge"><h5>职位详情</h5><div class="aContent"><p>负责测试工作。</p>
      <a href="/attachment/test.pdf">岗位说明</a></div></div></div>`;
    const article = parseJobSiteArticle(detail, "https://job.hdu.edu.cn/job/view?id=42");
    expect(article.title).toBe("测试岗位");
    expect(article.metadata["招聘人数"]).toBe("2人");
    expect(article.content).toContain("负责测试工作");
    expect(article.attachments[0]?.url).toBe("https://job.hdu.edu.cn/attachment/test.pdf");
  });
});
