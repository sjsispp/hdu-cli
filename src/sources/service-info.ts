import * as cheerio from "cheerio";
import { fetchText } from "../http.js";
import type {
  BusCampus, BusSchedule, BusTrip, ClassCampus, ClassPeriod, ClassSchedule,
  PhoneCategory, PhoneContact, PhoneOffice, ServiceLink
} from "../types.js";

const ORIGIN = "https://www.hdu.edu.cn";

const PHONE_SOURCES: Record<Exclude<PhoneCategory, "all">, { name: string; path: string }> = {
  administration: { name: "党政管理机构、群团组织", path: "/7504/list.htm" },
  academic: { name: "教学科研机构", path: "/7505/list.htm" },
  support: { name: "教辅机构", path: "/7506/list.htm" },
  affiliated: { name: "独立学院、下属单位", path: "/7507/list.htm" },
  research: { name: "科研机构", path: "/kyjg/list.htm" }
};

const BUS_PATHS: Record<BusCampus, string> = { xiasha: "/768/list.htm", shaoxing: "/769/list.htm" };
const CLASS_PATHS: Record<ClassCampus, string> = {
  xiasha: "/770/list.htm", shaoxing: "/sxxq/list.htm", qingshanhu: "/771/list.htm"
};

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function pageUrl(path: string): string {
  return new URL(path, ORIGIN).toString();
}

export function parseServiceLinks(html: string): ServiceLink[] {
  const $ = cheerio.load(html);
  return $("li.menu-item.i8 > ul.sub-menu > li.sub-item > a.sub-link")
    .toArray()
    .map((element) => ({
      name: cleanText($(element).text()),
      url: new URL($(element).attr("href") ?? "", ORIGIN).toString()
    }))
    .filter((link) => link.name && link.url !== `${ORIGIN}/`);
}

export async function listServiceLinks(): Promise<{ source: "hdu-main"; items: ServiceLink[] }> {
  return { source: "hdu-main", items: parseServiceLinks(await fetchText(`${ORIGIN}/main.htm`)) };
}

export function parsePhoneDirectory(
  html: string,
  category: Exclude<PhoneCategory, "all">,
  url: string
): PhoneOffice[] {
  const $ = cheerio.load(html);
  const categoryName = PHONE_SOURCES[category].name;
  const offices: PhoneOffice[] = [];
  $("ul.news_list.list2 > li.news:not(.thead)").each((_, element) => {
    const $office = $(element);
    const name = cleanText($office.find(".news_title").first().text());
    if (!name) return;
    const contacts: PhoneContact[] = [];
    $office.find(".news_nr p").each((_, row) => {
      const values = $(row).find("span").toArray().map((span) => cleanText($(span).text())).filter(Boolean);
      if (values.length >= 2) contacts.push({ role: values.slice(0, -1).join(" "), phone: values.at(-1)! });
      else {
        const text = cleanText($(row).text());
        const match = text.match(/^(.*?)(\d{7,}(?:-\d+)?)$/);
        if (match) contacts.push({ role: match[1]!.trim(), phone: match[2]! });
      }
    });
    offices.push({ id: `hdu-service:phone:${category}:${offices.length + 1}`, category, categoryName, name, contacts, url });
  });
  return offices;
}

export async function listPhones(
  options: { category?: PhoneCategory; query?: string } = {}
): Promise<{ source: "hdu-main"; category: PhoneCategory; offices: PhoneOffice[] }> {
  const category = options.category ?? "all";
  const categories = category === "all" ? Object.keys(PHONE_SOURCES) as Exclude<PhoneCategory, "all">[] : [category];
  const groups = await Promise.all(categories.map(async (item) => {
    const url = pageUrl(PHONE_SOURCES[item].path);
    return parsePhoneDirectory(await fetchText(url), item, url);
  }));
  let offices = groups.flat();
  const query = options.query?.trim().toLocaleLowerCase("zh-CN");
  if (query) offices = offices.filter((office) =>
    `${office.name} ${office.categoryName} ${office.contacts.map((contact) => `${contact.role} ${contact.phone}`).join(" ")}`
      .toLocaleLowerCase("zh-CN").includes(query));
  return { source: "hdu-main", category, offices };
}

function normalizeTime(value: string): string {
  return cleanText(value).replace(/\s*:\s*/g, ":").replace(/\s*[～~]\s*/g, "–");
}

export function parseBusSchedule(html: string, campus: BusCampus, url: string): BusSchedule {
  const $ = cheerio.load(html);
  const $content = $(".wp_articlecontent").first();
  const notes = $content.children("p").toArray().map((node) => cleanText($(node).text())).filter(Boolean);
  const trips: BusTrip[] = [];
  $content.find("table").each((_, table) => {
    const $table = $(table);
    const headers = $table.find("thead th").toArray().map((node) => cleanText($(node).text()));
    const direction = headers.at(-1) ?? "";
    const section = cleanText($table.prevAll("p").first().text()) || undefined;
    let schedule: string | undefined;
    $table.find("tbody tr").each((_, row) => {
      const cells = $(row).children("td,th").toArray().map((node) => cleanText($(node).text()));
      if (cells.length >= 4) {
        schedule = cells[0] || schedule;
        cells.shift();
      }
      if (cells.length < 3) return;
      trips.push({
        campus, section, schedule, direction,
        time: normalizeTime(cells[0]!), vehicle: cells[1] || undefined,
        route: cells.slice(2).join(" "), url
      });
    });
  });
  return { source: "hdu-main", campus, notes, trips, url };
}

export async function getBusSchedule(campus: BusCampus): Promise<BusSchedule> {
  const url = pageUrl(BUS_PATHS[campus]);
  return parseBusSchedule(await fetchText(url), campus, url);
}

export function parseClassSchedule(html: string, campus: ClassCampus, url: string): ClassSchedule {
  const $ = cheerio.load(html);
  const periods: ClassPeriod[] = [];
  let session = "";
  $(".wp_articlecontent table tbody tr").each((_, row) => {
    const cells = $(row).children("td,th").toArray().map((node) => cleanText($(node).text()));
    if (cells.length >= 3) {
      session = cells[0]!;
      cells.shift();
    }
    if (cells.length < 2) return;
    periods.push({ campus, session, name: cells[0]!, time: normalizeTime(cells[1]!) });
  });
  return { source: "hdu-main", campus, periods, url };
}

export async function getClassSchedule(campus: ClassCampus): Promise<ClassSchedule> {
  const url = pageUrl(CLASS_PATHS[campus]);
  return parseClassSchedule(await fetchText(url), campus, url);
}
