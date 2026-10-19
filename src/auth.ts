import { access } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { HduError } from "./errors.js";
import { secretStore } from "./secret-store.js";
import {
  CookieJar, exchangeSsoSession, loginWithDingTalkQr, SSO_HOST, ssoSessionIsActive, type StoredCookie
} from "./sso.js";

const SSO_SESSION_NAME = "hdu-cli.sso-session";

/** An HDU site that accepts the shared SSO login through a CAS service URL. */
interface ServiceDefinition {
  name: string;
  host: string;
  /** CAS service URL; the SSO redirects here with a ticket. */
  service: string;
  /** Secret-store entry holding this site's session cookies. */
  sessionName: string;
  /** Environment variable that overrides the stored session. */
  envVariable: string;
  isSessionValid(cookie: string): Promise<boolean>;
}

export const SERVICES = {
  job: {
    name: "就业网",
    host: "job.hdu.edu.cn",
    service: "https://job.hdu.edu.cn/default/hdu",
    sessionName: "hdu-cli.job-session",
    envVariable: "HDU_JOB_COOKIE",
    async isSessionValid(cookie) {
      const response = await fetch("https://job.hdu.edu.cn/home/index", {
        headers: { cookie, "user-agent": "hdu-cli/0.1" }, redirect: "manual",
        signal: AbortSignal.timeout(15_000)
      });
      return response.status === 200;
    }
  },
  jw: {
    name: "教务系统",
    host: "newjw.hdu.edu.cn",
    service: "http://newjw.hdu.edu.cn/sso/driot4login",
    sessionName: "hdu-cli.jw-session",
    envVariable: "HDU_JW_COOKIE",
    async isSessionValid(cookie) {
      // An expired session redirects to the login page instead of rendering the student menu.
      const response = await fetch("https://newjw.hdu.edu.cn/jwglxt/xtgl/index_initMenu.html?jsdm=xs", {
        headers: { cookie, "user-agent": "hdu-cli/0.1" }, redirect: "manual",
        signal: AbortSignal.timeout(15_000)
      });
      return response.status === 200;
    }
  }
} satisfies Record<string, ServiceDefinition>;

export type ServiceId = keyof typeof SERVICES;

function requireStore() {
  const store = secretStore();
  if (!store) {
    throw new HduError("unsupported", "Secure session storage is supported on macOS and Windows.", "其他系统可通过 HDU_JOB_COOKIE、HDU_JW_COOKIE 环境变量提供会话。");
  }
  return store;
}

/** Where sessions are kept on this platform, for user-facing messages. */
export function sessionStorageLabel(): string {
  return secretStore()?.label ?? "环境变量";
}

async function loadSsoCookies(): Promise<StoredCookie[]> {
  const saved = await secretStore()?.get(SSO_SESSION_NAME);
  if (!saved) return [];
  try {
    return JSON.parse(saved) as StoredCookie[];
  } catch {
    return [];
  }
}

async function saveSsoCookies(cookies: StoredCookie[]): Promise<void> {
  if (cookies.length === 0) throw new HduError("upstream", "The HDU SSO did not issue a login session.", "请重新运行 hdu auth login。");
  await requireStore().set(SSO_SESSION_NAME, JSON.stringify(cookies), "HDU CLI SSO session");
}

async function isValid(id: ServiceId, cookie: string | undefined): Promise<boolean> {
  if (!cookie) return false;
  try {
    return await SERVICES[id].isSessionValid(cookie);
  } catch {
    return false;
  }
}

/** Obtains a new site session from the saved SSO session; undefined when the SSO session has expired. */
async function refreshServiceSession(id: ServiceId): Promise<string | undefined> {
  const exchanged = await exchangeSsoSession(await loadSsoCookies(), SERVICES[id].service).catch(() => undefined);
  if (!exchanged || !(await isValid(id, exchanged.serviceCookie))) return undefined;
  await saveSsoCookies(exchanged.ssoCookies);
  await requireStore().set(SERVICES[id].sessionName, exchanged.serviceCookie, `HDU CLI ${SERVICES[id].name} session`);
  return exchanged.serviceCookie;
}

const sessionCache = new Map<ServiceId, Promise<string | undefined>>();

/**
 * Returns a working session cookie for the site, silently renewing it from the SSO session when it
 * has expired. Returns undefined when the user needs to run `hdu auth login` again.
 */
export function getServiceSession(id: ServiceId): Promise<string | undefined> {
  const override = process.env[SERVICES[id].envVariable]?.trim();
  if (override) return Promise.resolve(override);
  let session = sessionCache.get(id);
  if (!session) {
    session = (async () => {
      const saved = await secretStore()?.get(SERVICES[id].sessionName);
      if (await isValid(id, saved)) return saved;
      return refreshServiceSession(id);
    })();
    sessionCache.set(id, session);
  }
  return session;
}

export function getJobSessionCookie(): Promise<string | undefined> {
  return getServiceSession("job");
}

/** Saves the SSO session from a completed login and derives sessions for every registered site. */
async function completeLogin(ssoCookies: StoredCookie[]): Promise<void> {
  await saveSsoCookies(ssoCookies);
  sessionCache.clear();
  for (const id of Object.keys(SERVICES) as ServiceId[]) {
    if (!(await refreshServiceSession(id))) throw new HduError("upstream", `Could not open a ${SERVICES[id].name} session after logging in.`, "请稍后重新运行 hdu auth login。");
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
  throw new HduError("unsupported", "No supported browser found.", "请安装 Chrome、Edge 或 Chromium，或改用 hdu auth login --method qr 扫码登录。");
}

export async function loginWithBrowser(timeoutMs = 5 * 60_000): Promise<void> {
  const { service, host } = SERVICES.job;
  const browser = await chromium.launch({ executablePath: await findBrowser(), headless: false });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(service, { waitUntil: "domcontentloaded" });
    await page.waitForURL(
      (url) => url.hostname === host && !url.pathname.startsWith("/default/hdu") && !url.pathname.startsWith("/user/login"),
      { timeout: timeoutMs }
    );
    const ssoCookies = (await context.cookies(`https://${SSO_HOST}`))
      .map(({ domain, name, value }) => ({ domain: domain.replace(/^\./, ""), name, value }));
    await completeLogin(new CookieJar(ssoCookies).export(SSO_HOST));
  } finally {
    await browser.close();
  }
}

export async function loginWithQr(
  onQrCode: (content: string) => void | Promise<void>, timeoutMs = 5 * 60_000
): Promise<void> {
  const { jar } = await loginWithDingTalkQr({ service: SERVICES.job.service, timeoutMs, onQrCode });
  await completeLogin(jar.export(SSO_HOST));
}

export async function logout(): Promise<boolean> {
  const store = secretStore();
  if (!store) return false;
  sessionCache.clear();
  const removed = await Promise.all(
    [SSO_SESSION_NAME, ...Object.values(SERVICES).map((service) => service.sessionName)].map((name) => store.delete(name))
  );
  return removed.some(Boolean);
}

export interface AuthStatus {
  /** True when employment-site session fields are available (kept for existing callers). */
  authenticated: boolean;
  sso: boolean;
  services: Record<ServiceId, boolean>;
  storage: string;
}

export async function authStatus(): Promise<AuthStatus> {
  const ids = Object.keys(SERVICES) as ServiceId[];
  const sessions = await Promise.all(ids.map(async (id) => [id, Boolean(await getServiceSession(id))] as const));
  const services = Object.fromEntries(sessions) as Record<ServiceId, boolean>;
  return {
    authenticated: services.job,
    sso: await ssoSessionIsActive(await loadSsoCookies(), SERVICES.job.service),
    services,
    storage: sessionStorageLabel()
  };
}
