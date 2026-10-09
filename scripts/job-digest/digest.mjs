#!/usr/bin/env node
// 杭电就业网「招聘会 + 宣讲会」定时摘要，推送到飞书自定义机器人。
//
// 用法:
//   node digest.mjs daily          每日任务：未来 3 天内「新增」的活动（增量提醒）
//   node digest.mjs weekly         每周任务：未来 7 天内的全量活动（本周概览）
//   node digest.mjs daily --seed   只把当前活动写入已读记录，不发送（首次安装时用）
//   node digest.mjs weekly --dry-run   打印而不发送（本地调试）
//
// 配置来源（优先级：环境变量 > config.json）:
//   HDU_DIGEST_WEBHOOK   飞书群自定义机器人 Webhook 地址（必填，--dry-run 时可省略）
//   HDU_DIGEST_SECRET    机器人签名校验密钥（可选，若机器人开启了签名校验则必填）
//   HDU_JOB_COOKIE       就业网会话（可选；macOS 下默认走钥匙串，见 `hdu auth login`）

import { createHmac } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import * as cheerio from "cheerio";
import { listJobSite, decodeEmbeddedContent } from "../../dist/sources/job-site.js";
import { fetchText } from "../../dist/http.js";
import { getJobSessionCookie } from "../../dist/auth.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SEEN_PATH = join(HERE, "seen.json");
const CONFIG_PATH = join(HERE, "config.json");
const STATE_PATH = join(HERE, "state.json"); // 记录每个任务最近一次成功发送的日期/周，实现「每天/每周只发一次」
const SEEN_TTL_DAYS = 60; // 已读记录保留天数，过期清理，避免文件无限增长

const PROFILES = {
  // 每日：只提醒「新出现」的近期活动，空结果不打扰；每天最多发一次
  daily: { label: "未来 3 天新增", windowDays: 3, respectSeen: true, sendWhenEmpty: false, cadence: "daily" },
  // 每周：本周概览，无论是否推送过都完整列出；每周最多发一次
  weekly: { label: "未来 7 天", windowDays: 7, respectSeen: false, sendWhenEmpty: true, cadence: "weekly" }
};

// 每个栏目抓取的页数上限。招聘会按日期分布不规律，多翻几页更稳；宣讲会密度高需覆盖一周。
const MAX_PAGES = { fairs: 3, talks: 5 };

const ENRICH_CONCURRENCY = 4; // 逐条抓详情页的并发上限，控制对就业网的请求压力
const SEND_AFTER_HOUR = 8; // 每天最早可发送的小时（本地时间），早于此点的轮询直接跳过

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** 本地日期键，形如 "2026-10-09"。 */
function localDateKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 本地「周」键：取当周周一的日期，形如 "W2026-10-05"。 */
function weekKey(date = new Date()) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return `W${localDateKey(monday)}`;
}

/** 当前任务的节律键：daily 用日期，weekly 用周一日期。 */
function cadenceKey(cadence, date = new Date()) {
  return cadence === "weekly" ? weekKey(date) : localDateKey(date);
}

/** 从 startsAt 文本中解析起始日期（形如 "2026-10-21 13:30-16:30 （周三）" 或 "2026-09-20 — 2027-01-15"）。 */
function parseStartDate(startsAt) {
  const match = (startsAt ?? "").match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

async function loadJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function loadConfig() {
  const fromFile = await loadJson(CONFIG_PATH, {});
  return {
    webhook: process.env.HDU_DIGEST_WEBHOOK?.trim() || fromFile.webhook || "",
    secret: process.env.HDU_DIGEST_SECRET?.trim() || fromFile.secret || ""
  };
}

const RETRY_DELAYS_MS = [5_000, 15_000, 30_000]; // 列表抓取失败后的重试间隔（应对刚唤醒网络未就绪）

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 带重试地抓取某栏目某一页；全部重试失败则抛出。 */
async function fetchPageWithRetry(section, page) {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await listJobSite(section, { page });
    } catch (error) {
      lastError = error;
      if (attempt < RETRY_DELAYS_MS.length) {
        console.error(`[warn] 抓取 ${section} 第 ${page} 页失败（第 ${attempt + 1} 次）：${error.message}，稍后重试`);
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
  }
  throw lastError;
}

/**
 * 抓取一个栏目的前若干页并合并（按 id 去重）。
 * 返回 { items, ok }：ok 表示第 1 页是否成功抓到（用于区分“抓取失败”与“确实没内容”）。
 */
async function collectSection(section) {
  const byId = new Map();
  let ok = false;
  for (let page = 1; page <= MAX_PAGES[section]; page += 1) {
    let result;
    try {
      result = await fetchPageWithRetry(section, page);
    } catch (error) {
      console.error(`[warn] 抓取 ${section} 第 ${page} 页最终失败：${error.message}`);
      break;
    }
    ok = true;
    for (const item of result.items) byId.set(item.id, item);
    if (page >= (result.totalPages ?? 1)) break;
  }
  return { items: [...byId.values()], ok };
}

/** 以固定并发对一组输入执行异步映射，控制对就业网的请求压力。 */
async function mapWithConcurrency(inputs, limit, worker) {
  const results = new Array(inputs.length);
  let cursor = 0;
  async function run() {
    while (cursor < inputs.length) {
      const index = cursor++;
      results[index] = await worker(inputs[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, inputs.length) }, run));
  return results;
}

function cleanText(value) {
  return (value ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

function normalizeJobUrl(href) {
  const url = new URL(href, "https://job.hdu.edu.cn");
  const id = url.searchParams.get("id");
  return id ? `https://job.hdu.edu.cn/job/view?id=${id}` : url.toString();
}

/**
 * 读取活动详情页，补充：
 *   - 公司画像（行业 / 规模 / 投递邮箱）
 *   - 该公司在这场活动下挂出的在招岗位（标题 + 链接）
 * 失败则原样返回。
 */
async function enrichEvent(item) {
  try {
    const cookie = await getJobSessionCookie();
    const $ = cheerio.load(decodeEmbeddedContent(await fetchText(item.url, { cookie })));

    const meta = {};
    $("li, p, td").each((_, element) => {
      const match = cleanText($(element).text()).match(/^(单位行业|单位规模|简历投递邮箱)[：:]\s*(.+)$/);
      if (match && !meta[match[1]]) meta[match[1]] = match[2].trim();
    });

    const positions = new Map();
    $('a[href*="/job/view"]').each((_, element) => {
      const href = $(element).attr("href");
      const title = cleanText($(element).text());
      if (!href || !title) return;
      const url = normalizeJobUrl(href);
      if (!positions.has(url)) positions.set(url, { title, url });
    });

    return {
      ...item,
      industry: meta["单位行业"],
      scale: meta["单位规模"],
      email: meta["简历投递邮箱"],
      positions: [...positions.values()]
    };
  } catch {
    return item;
  }
}

function filterUpcoming(items, todayStart, windowEnd) {
  return items
    .map((item) => ({ item, start: parseStartDate(item.startsAt) }))
    .filter(({ start }) => start && start >= todayStart && start <= windowEnd)
    .sort((a, b) => a.start - b.start)
    .map(({ item }) => item);
}

function renderSection(title, emoji, items) {
  if (items.length === 0) return [];
  const header = { tag: "div", text: { tag: "lark_md", content: `**${emoji} ${title}（${items.length}）**` } };
  const blocks = items.map((item) => {
    const lines = [`**[${item.title}](${item.url})**`];
    if (item.startsAt) lines.push(`🕒 ${item.startsAt}`);
    const place = [item.location, item.mode].filter(Boolean).join(" · ");
    if (place) lines.push(`📍 ${place}`);
    const profile = [item.industry, item.scale].filter(Boolean).join(" · ");
    if (profile) lines.push(`🏢 ${profile}`);
    if (item.email) lines.push(`✉️ ${item.email}`);
    if (item.positions?.length) {
      const links = item.positions.map((position) => `[${position.title}](${position.url})`).join("、");
      lines.push(`💼 在招岗位：${links}`);
    }
    return { tag: "div", text: { tag: "lark_md", content: lines.join("\n") } };
  });
  return [header, ...blocks, { tag: "hr" }];
}

function buildCard(profile, fairs, talks) {
  const elements = [
    ...renderSection("招聘会", "🎪", fairs),
    ...renderSection("宣讲会", "🎤", talks)
  ];
  if (elements.length === 0) {
    elements.push({ tag: "div", text: { tag: "lark_md", content: `${profile.label}暂无招聘会或宣讲会。` } });
  }
  elements.push({
    tag: "note",
    elements: [{ tag: "lark_md", content: `数据来源 job.hdu.edu.cn · 生成于 ${new Date().toLocaleString("zh-CN", { hour12: false })}` }]
  });
  return {
    config: { wide_screen_mode: true },
    header: {
      template: "blue",
      title: { tag: "plain_text", content: `📣 杭电招聘会/宣讲会 · ${profile.label}` }
    },
    elements
  };
}

async function sendToFeishu(webhook, secret, card) {
  const payload = { msg_type: "interactive", card };
  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000);
    payload.timestamp = String(timestamp);
    payload.sign = createHmac("sha256", `${timestamp}\n${secret}`).update("").digest("base64");
  }
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || (body.code !== undefined && body.code !== 0)) {
    throw new Error(`飞书返回异常：HTTP ${response.status} ${JSON.stringify(body)}`);
  }
}

async function main() {
  const [profileName, ...flags] = process.argv.slice(2);
  const profile = PROFILES[profileName];
  if (!profile) {
    console.error("用法: node digest.mjs <daily|weekly> [--seed] [--dry-run] [--force]");
    process.exit(2);
  }
  const seed = flags.includes("--seed");
  const dryRun = flags.includes("--dry-run");
  const force = flags.includes("--force"); // 无视“时间/已发”守卫，手动强制发送

  const config = await loadConfig();
  if (!config.webhook && !dryRun && !seed) {
    console.error("缺少 Webhook：请设置 HDU_DIGEST_WEBHOOK 或在 config.json 中填写 webhook。");
    process.exit(2);
  }

  // 轮询守卫：每 15 分钟会被 launchd 唤起一次，这里先用极轻量的判断决定要不要真正干活，
  // 避免早于发送时间、或当天/当周已发过时还去抓网络。seed / dry-run / --force 不受限。
  const now = new Date();
  const key = cadenceKey(profile.cadence, now);
  const state = await loadJson(STATE_PATH, {});
  if (!seed && !dryRun && !force) {
    if (now.getHours() < SEND_AFTER_HOUR) {
      console.log(`[${profileName}] 未到发送时间（${SEND_AFTER_HOUR} 点后），跳过。`);
      return;
    }
    if (state[profileName] === key) {
      console.log(`[${profileName}] 本${profile.cadence === "weekly" ? "周" : "日"}已发送，跳过。`);
      return;
    }
  }

  const todayStart = startOfToday();
  const windowEnd = new Date(todayStart);
  windowEnd.setDate(windowEnd.getDate() + profile.windowDays);

  const [fairsRes, talksRes] = await Promise.all([collectSection("fairs"), collectSection("talks")]);

  // 两个栏目都没抓成功 = 网络/站点异常（如刚唤醒热点未连上）。视为失败而非“没内容”：
  // 不更新任何状态，非零退出；靠下一次 15 分钟轮询在网络就绪后重试。
  if (!fairsRes.ok && !talksRes.ok) {
    console.error("[error] 招聘会和宣讲会列表均抓取失败（可能网络未就绪），本次放弃，等待下次轮询重试。");
    process.exit(1);
  }

  const fairsRaw = fairsRes.items;
  const talksRaw = talksRes.items;
  let fairs = filterUpcoming(fairsRaw, todayStart, windowEnd);
  let talks = filterUpcoming(talksRaw, todayStart, windowEnd);

  // 已读记录：{ [id]: 首次推送的 ISO 时间 }
  const seen = await loadJson(SEEN_PATH, {});
  const nowIso = now.toISOString();

  if (profile.respectSeen) {
    fairs = fairs.filter((item) => !seen[item.id]);
    talks = talks.filter((item) => !seen[item.id]);
  }

  const pushedIds = [...fairs, ...talks].map((item) => item.id);

  // --seed：仅记录当前活动，不发送（首次安装用，避免第一次把一堆历史活动一次性推出来）
  if (seed) {
    for (const id of [...fairsRaw, ...talksRaw].map((item) => item.id)) seen[id] = nowIso;
    await saveSeen(seen);
    console.log(`[seed] 已记录 ${Object.keys(seen).length} 条活动，后续只推送新增。`);
    return;
  }

  // 预览模式：只打印将要发送的内容，不发送、不改动任何状态。
  if (dryRun || !config.webhook) {
    [fairs, talks] = await enrichBoth(fairs, talks);
    console.log(JSON.stringify({ msg_type: "interactive", card: buildCard(profile, fairs, talks) }, null, 2));
    return;
  }

  // 抓取成功但本次无内容可发：也算“今天已检查过”，记状态避免当天反复轮询抓取。
  if (pushedIds.length === 0 && !profile.sendWhenEmpty) {
    state[profileName] = key;
    await writeFile(STATE_PATH, JSON.stringify(state, null, 2));
    console.log(`[${profileName}] 无新增活动，标记本${profile.cadence === "weekly" ? "周" : "日"}已检查，跳过发送。`);
    return;
  }

  [fairs, talks] = await enrichBoth(fairs, talks);
  await sendToFeishu(config.webhook, config.secret, buildCard(profile, fairs, talks));
  console.log(`[${profileName}] 已发送：招聘会 ${fairs.length}，宣讲会 ${talks.length}。`);

  // 记录「本节律已发送」+ 推送过的 id（供增量去重）。
  state[profileName] = key;
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2));
  for (const id of pushedIds) seen[id] = nowIso;
  await saveSeen(seen);
}

/** 对两个栏目的活动逐条抓详情页补充公司画像与在招岗位（受并发限制）。 */
async function enrichBoth(fairs, talks) {
  return Promise.all([
    mapWithConcurrency(fairs, ENRICH_CONCURRENCY, enrichEvent),
    mapWithConcurrency(talks, ENRICH_CONCURRENCY, enrichEvent)
  ]);
}

async function saveSeen(seen) {
  const cutoff = Date.now() - SEEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  const pruned = Object.fromEntries(
    Object.entries(seen).filter(([, iso]) => new Date(iso).getTime() >= cutoff)
  );
  await writeFile(SEEN_PATH, JSON.stringify(pruned, null, 2));
}

main().catch((error) => {
  console.error(`[error] ${error.stack ?? error.message}`);
  process.exit(1);
});
