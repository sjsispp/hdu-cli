import { describe, expect, it } from "vitest";
import {
  parseBusSchedule, parseClassSchedule, parsePhoneDirectory, parseServiceLinks
} from "../src/sources/service-info.js";

describe("main site service information", () => {
  it("parses service entry links", () => {
    const html = `<li class="menu-item i8"><ul class="sub-menu">
      <li class="sub-item"><a class="sub-link" href="https://tsg.hdu.edu.cn">图书馆</a></li>
      <li class="sub-item"><a class="sub-link" href="/7504/list.htm">办公电话</a><ul><li><a class="sub-link">nested</a></li></ul></li>
    </ul></li>`;
    expect(parseServiceLinks(html)).toEqual([
      { name: "图书馆", url: "https://tsg.hdu.edu.cn/" },
      { name: "办公电话", url: "https://www.hdu.edu.cn/7504/list.htm" }
    ]);
  });

  it("parses offices and their phone contacts", () => {
    const html = `<ul class="news_list list2"><li class="news thead"></li><li class="news">
      <div class="news_title"><a></a>教务处</div><div class="news_nr">
      <p><span>处长</span><span>86915009</span></p><p><span>办公室</span><span>86915011</span></p>
    </div></li></ul>`;
    const offices = parsePhoneDirectory(html, "administration", "https://www.hdu.edu.cn/7504/list.htm");
    expect(offices[0]).toEqual(expect.objectContaining({
      name: "教务处",
      contacts: [{ role: "处长", phone: "86915009" }, { role: "办公室", phone: "86915011" }]
    }));
  });

  it("carries merged schedule cells across bus rows", () => {
    const html = `<div class="wp_articlecontent"><p><strong>工作日班车</strong></p><table>
      <thead><tr><th></th><th>时间</th><th>车型</th><th>城西 → 下沙</th></tr></thead><tbody>
      <tr><td rowspan="2">工作日</td><td>6 : 35</td><td>大客一辆</td><td>A—B</td></tr>
      <tr><td>6 : 40</td><td>大客一辆</td><td>C—D</td></tr></tbody></table></div>`;
    const result = parseBusSchedule(html, "xiasha", "https://www.hdu.edu.cn/768/list.htm");
    expect(result.trips).toHaveLength(2);
    expect(result.trips[1]).toEqual(expect.objectContaining({ schedule: "工作日", time: "6:40", route: "C—D" }));
  });

  it("parses class periods by session", () => {
    const html = `<div class="wp_articlecontent"><table><tbody>
      <tr><td rowspan="2">上午</td><td>预备铃</td><td>8:00</td></tr>
      <tr><td>第一节</td><td>8:05 ～ 8:50</td></tr></tbody></table></div>`;
    const result = parseClassSchedule(html, "xiasha", "https://www.hdu.edu.cn/770/list.htm");
    expect(result.periods).toEqual([
      { campus: "xiasha", session: "上午", name: "预备铃", time: "8:00" },
      { campus: "xiasha", session: "上午", name: "第一节", time: "8:05–8:50" }
    ]);
  });
});
