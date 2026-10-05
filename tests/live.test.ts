import { describe, expect, it } from "vitest";
import { getArticle, listSection } from "../src/sources/main-site.js";

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
