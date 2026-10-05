import { describe, expect, it } from "vitest";
import { getArticle, listSection } from "../src/sources/main-site.js";
import { getJobSiteArticle, listJobSite } from "../src/sources/job-site.js";
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
