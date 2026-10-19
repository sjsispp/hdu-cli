import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { userInfo } from "node:os";
import { promisify } from "node:util";
import { chromium } from "playwright-core";
import { loginWithDingTalkQr } from "./sso.js";

const execFileAsync = promisify(execFile);
const KEYCHAIN_SERVICE = "hdu-cli.job-session";
const KEYCHAIN_ACCOUNT = userInfo().username;
const LOGIN_URL = "https://job.hdu.edu.cn/default/hdu";

async function keychain(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("/usr/bin/security", args, { encoding: "utf8" });
  return stdout.trim();
}

export async function getJobSessionCookie(): Promise<string | undefined> {
  if (process.env.HDU_JOB_COOKIE?.trim()) return process.env.HDU_JOB_COOKIE.trim();
  if (process.platform !== "darwin") return undefined;
  try {
    return await keychain(["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w"]);
  } catch {
    return undefined;
  }
}

async function saveJobSessionCookie(cookie: string): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error("Automatic secure session storage currently requires macOS Keychain. Use HDU_JOB_COOKIE on other systems.");
  }
  await keychain([
    "add-generic-password", "-U", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT,
    "-l", "HDU CLI employment session", "-w", cookie
  ]);
}

export async function clearJobSession(): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  try {
    await keychain(["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT]);
    return true;
  } catch {
    return false;
  }
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
  const candidates = [
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
    storage: process.env.HDU_JOB_COOKIE?.trim() ? "environment" : cookie ? "macOS Keychain" : "none"
  };
}
