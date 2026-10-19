import { describe, expect, it } from "vitest";
import { getArticle, listSection } from "../src/sources/main-site.js";
import { getJobSiteArticle, listJobSite } from "../src/sources/job-site.js";
import { CookieJar, csrfHeaders, decodeQrPng, parseLoginExecution, ssoRequest } from "../src/sso.js";
import { SERVICES, getServiceSession } from "../src/auth.js";
import { getExams, getGrades, getProfile, getTimetable } from "../src/sources/jw.js";
import { getBusSchedule, getClassSchedule, listPhones, listServiceLinks } from "../src/sources/service-info.js";

const live = process.env.HDU_LIVE_TEST === "1";

describe.runIf(live)("HDU main site live integration", () => {
  it("reads the public notice list", async () => {
    const result = await listSection("notices", { page: 1, limit: 3 });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]?.url).toMatch(/^https?:\/\//);
    expect(result.items[0]?.title.length).toBeGreaterThan(2);
  });

  it("reads a public article", async () => {
    const result = await listSection("notices", { page: 1 });
    const firstInternal = result.items.find((item) => !item.external);
    expect(firstInternal).toBeDefined();
    const article = await getArticle(firstInternal!.url);
    expect(article.title.length).toBeGreaterThan(2);
    expect(article.content.length).toBeGreaterThan(20);
  });
});

describe.runIf(live)("HDU employment site live integration", () => {
  it("reads public employment lists", async () => {
    for (const section of ["notices", "talks", "fairs", "positions"] as const) {
      const result = await listJobSite(section, { page: 1, limit: 2 });
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0]?.url).toMatch(/^https:\/\/job\.hdu\.edu\.cn\//);
    }
  }, 30_000);

  it("reads an employment detail", async () => {
    const result = await listJobSite("positions", { page: 1, limit: 1 });
    const article = await getJobSiteArticle(result.items[0]!.url);
    expect(article.title.length).toBeGreaterThan(1);
    expect(article.content.length).toBeGreaterThan(10);
  });
});

describe.runIf(live)("HDU main site service information", () => {
  it("reads service links and phone directory", async () => {
    const [links, phones] = await Promise.all([
      listServiceLinks(), listPhones({ category: "administration", query: "教务处" })
    ]);
    expect(links.items.some((item) => item.name === "图书馆")).toBe(true);
    expect(phones.offices.some((office) => office.name.includes("教务处"))).toBe(true);
  });

  it("reads bus and class schedules", async () => {
    const [buses, classes] = await Promise.all([getBusSchedule("xiasha"), getClassSchedule("xiasha")]);
    expect(buses.trips.length).toBeGreaterThan(0);
    expect(buses.trips[0]?.time).toMatch(/\d{1,2}:\d{2}/);
    expect(classes.periods.some((period) => period.name === "第一节")).toBe(true);
  });
});

describe.runIf(live)("HDU SSO DingTalk QR login", () => {
  it("issues a decodable QR code without completing a login", async () => {
    const jar = new CookieJar();
    const page = await ssoRequest(jar, "https://sso.hdu.edu.cn/login?service=https%3A%2F%2Fjob.hdu.edu.cn%2Fdefault%2Fhdu");
    expect(parseLoginExecution(page.body.toString("utf8")).length).toBeGreaterThan(10);
    const id = JSON.parse((await ssoRequest(jar, "https://sso.hdu.edu.cn/api/protected/qrlogin/loginid", {
      headers: csrfHeaders()
    })).body.toString("utf8")) as { code: number; data: string };
    expect(id.code).toBe(200);
    const qr = await ssoRequest(jar, `https://sso.hdu.edu.cn/api/public/qrlogin/qrgen/${id.data}/dingDingQr`);
    expect(decodeQrPng(qr.body)).toContain(`/api/public/redirect/${id.data}/dingDingQr`);
  });
});

// Needs a saved login (hdu auth login); asserts on shape only so no personal data ends up in test output.
describe.runIf(live && process.env.HDU_LIVE_AUTH === "1")("HDU academic system live integration", () => {
  it("opens an academic session from the saved SSO login", async () => {
    expect(SERVICES.jw.host).toBe("newjw.hdu.edu.cn");
    expect(await getServiceSession("jw")).toBeTruthy();
  });

  it("reads profile, timetable, grades and exams", async () => {
    const [profile, timetable, grades, exams] = await Promise.all([getProfile(), getTimetable(), getGrades(), getExams()]);
    expect(Object.keys(profile.fields)).toContain("学号");
    expect(Object.keys(profile.fields)).not.toContain("证件号码");
    expect(Array.isArray(timetable.courses)).toBe(true);
    expect(grades.items.every((grade) => grade.courseName && grade.term)).toBe(true);
    expect(Array.isArray(exams.items)).toBe(true);
  }, 60_000);
});
