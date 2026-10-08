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
const SEEN_TTL_DAYS = 60; // 已读记录保留天数，过期清理，避免文件无限增长

const PROFILES = {
  // 每日：只提醒「新出现」的近期活动，空结果不打扰
  daily: { label: "未来 3 天新增", windowDays: 3, respectSeen: true, sendWhenEmpty: false },
  // 每周：本周概览，无论是否推送过都完整列出
  weekly: { label: "未来 7 天", windowDays: 7, respectSeen: false, sendWhenEmpty: true }
};

// 每个栏目抓取的页数上限。招聘会按日期分布不规律，多翻几页更稳；宣讲会密度高需覆盖一周。
const MAX_PAGES = { fairs: 3, talks: 5 };

const ENRICH_CONCURRENCY = 4; // 逐条抓详情页的并发上限，控制对就业网的请求压力

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
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

/** 抓取一个栏目的前若干页并合并（按 id 去重）。 */
async function collectSection(section) {
  const byId = new Map();
  for (let page = 1; page <= MAX_PAGES[section]; page += 1) {
    let result;
    try {
      result = await listJobSite(section, { page });
    } catch (error) {
      console.error(`[warn] 抓取 ${section} 第 ${page} 页失败：${error.message}`);
      break;
    }
    for (const item of result.items) byId.set(item.id, item);
    if (page >= (result.totalPages ?? 1)) break;
  }
  return [...byId.values()];
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
    console.error("用法: node digest.mjs <daily|weekly> [--seed] [--dry-run]");
    process.exit(2);
  }
  const seed = flags.includes("--seed");
  const dryRun = flags.includes("--dry-run");

  const config = await loadConfig();
  if (!config.webhook && !dryRun && !seed) {
    console.error("缺少 Webhook：请设置 HDU_DIGEST_WEBHOOK 或在 config.json 中填写 webhook。");
    process.exit(2);
  }

  const todayStart = startOfToday();
  const windowEnd = new Date(todayStart);
  windowEnd.setDate(windowEnd.getDate() + profile.windowDays);

  const [fairsRaw, talksRaw] = await Promise.all([collectSection("fairs"), collectSection("talks")]);
  let fairs = filterUpcoming(fairsRaw, todayStart, windowEnd);
  let talks = filterUpcoming(talksRaw, todayStart, windowEnd);

  // 已读记录：{ [id]: 首次推送的 ISO 时间 }
  const seen = await loadJson(SEEN_PATH, {});
  const nowIso = new Date().toISOString();

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

  if (pushedIds.length === 0 && !profile.sendWhenEmpty) {
    console.log(`[${profileName}] 无新增活动，跳过发送。`);
    return;
  }

  // 逐条抓详情页：补公司画像 + 该公司在招岗位（受并发限制）。
  [fairs, talks] = await Promise.all([
    mapWithConcurrency(fairs, ENRICH_CONCURRENCY, enrichEvent),
    mapWithConcurrency(talks, ENRICH_CONCURRENCY, enrichEvent)
  ]);

  const card = buildCard(profile, fairs, talks);
  if (dryRun || !config.webhook) {
    console.log(JSON.stringify({ msg_type: "interactive", card }, null, 2));
  } else {
    await sendToFeishu(config.webhook, config.secret, card);
    console.log(`[${profileName}] 已发送：招聘会 ${fairs.length}，宣讲会 ${talks.length}。`);
  }

  // 记录本次推送过的 id，供后续增量去重；两个任务共享记录。
  for (const id of pushedIds) seen[id] = nowIso;
  await saveSeen(seen);
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
