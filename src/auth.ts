import { access } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { secretStore } from "./secret-store.js";
import { loginWithDingTalkQr } from "./sso.js";

const SESSION_NAME = "hdu-cli.job-session";
const LOGIN_URL = "https://job.hdu.edu.cn/default/hdu";

export async function getJobSessionCookie(): Promise<string | undefined> {
  if (process.env.HDU_JOB_COOKIE?.trim()) return process.env.HDU_JOB_COOKIE.trim();
  return secretStore()?.get(SESSION_NAME);
}

async function saveJobSessionCookie(cookie: string): Promise<void> {
  const store = secretStore();
  if (!store) {
    throw new Error("Secure session storage is supported on macOS and Windows. Use HDU_JOB_COOKIE on other systems.");
  }
  await store.set(SESSION_NAME, cookie, "HDU CLI employment session");
}

export async function clearJobSession(): Promise<boolean> {
  return (await secretStore()?.delete(SESSION_NAME)) ?? false;
}

/** Where the employment session is kept on this platform, for user-facing messages. */
export function sessionStorageLabel(): string {
  return secretStore()?.label ?? "HDU_JOB_COOKIE 环境变量";
}

export async function validateJobSession(providedCookie?: string): Promise<boolean> {
  const cookie = providedCookie ?? await getJobSessionCookie();
  if (!cookie) return false;
  try {
    const response = await fetch("https://job.hdu.edu.cn/home/index", {
      headers: { cookie, "user-agent": "hdu-cli/0.1" }, redirect: "manual",
      signal: AbortSignal.timeout(15_000)
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

async function findBrowser(): Promise<string> {
  const programFiles = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA]
    .filter((directory): directory is string => Boolean(directory));
  const candidates = process.platform === "win32"
    ? programFiles.flatMap((directory) => [
      join(directory, "Google", "Chrome", "Application", "chrome.exe"),
      join(directory, "Microsoft", "Edge", "Application", "msedge.exe")
    ])
    : [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next locally installed browser.
    }
  }
  throw new Error("No supported browser found. Install Google Chrome, Microsoft Edge, or Chromium.");
}

export async function loginToJobSite(timeoutMs = 5 * 60_000): Promise<void> {
  const browser = await chromium.launch({ executablePath: await findBrowser(), headless: false });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
    await page.waitForURL(
      (url) => url.hostname === "job.hdu.edu.cn" &&
        !url.pathname.startsWith("/default/hdu") && !url.pathname.startsWith("/user/login"),
      { timeout: timeoutMs }
    );
    await page.goto("https://job.hdu.edu.cn/home/index", { waitUntil: "domcontentloaded" });
    if (page.url().includes("/user/login") || page.url().includes("/default/hdu") || page.url().includes("sso.hdu.edu.cn")) {
      throw new Error("HDU identity authentication did not complete.");
    }

    const cookies = (await context.cookies("https://job.hdu.edu.cn"))
      .filter((cookie) => cookie.domain === "job.hdu.edu.cn" || cookie.domain === ".job.hdu.edu.cn")
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
    if (!cookies) throw new Error("The employment site did not issue a session cookie.");
    await saveJobSessionCookie(cookies);
    if (!(await validateJobSession(cookies))) throw new Error("The saved employment session could not be validated.");
  } finally {
    await browser.close();
  }
}

export async function loginToJobSiteWithQr(
  onQrCode: (content: string) => void | Promise<void>, timeoutMs = 5 * 60_000
): Promise<void> {
  const { jar } = await loginWithDingTalkQr({ service: LOGIN_URL, timeoutMs, onQrCode });
  const cookies = jar.hostCookies("job.hdu.edu.cn");
  if (!cookies) throw new Error("The employment site did not issue a session cookie.");
  if (!(await validateJobSession(cookies))) throw new Error("The employment session could not be validated.");
  await saveJobSessionCookie(cookies);
}

export async function jobAuthStatus(): Promise<{ authenticated: boolean; storage: string }> {
  const cookie = await getJobSessionCookie();
  return {
    authenticated: await validateJobSession(cookie),
    storage: process.env.HDU_JOB_COOKIE?.trim() ? "environment" : cookie ? secretStore()!.label : "none"
  };
}
