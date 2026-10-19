import { createHash, randomBytes } from "node:crypto";
import * as cheerio from "cheerio";
import jsQRModule from "jsqr";
import { PNG } from "pngjs";
import { delay, isAllowedHduUrl } from "./http.js";

const SSO_ORIGIN = "https://sso.hdu.edu.cn";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) hdu-cli";
const MAX_REDIRECTS = 10;

// jsqr is CommonJS with an ESM-style default export, so its typings disagree with Node's interop.
type DecodeQr = (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;
const jsQR = ((jsQRModule as unknown as { default?: DecodeQr }).default ?? jsQRModule) as unknown as DecodeQr;

/** Minimal cookie jar that keeps cookies per domain; paths and expiry are ignored for short login flows. */
export class CookieJar {
  private readonly store = new Map<string, Map<string, string>>();

  setFromResponse(url: string, setCookieHeaders: string[]): void {
    const host = new URL(url).hostname;
    for (const header of setCookieHeaders) {
      const [pair, ...attributes] = header.split(";");
      const separator = pair.indexOf("=");
      if (separator < 1) continue;
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      const domainAttribute = attributes
        .map((attribute) => attribute.trim().split("="))
        .find(([key]) => key.toLowerCase() === "domain")?.[1];
      const domain = (domainAttribute ?? host).replace(/^\./, "").toLowerCase();
      if (host !== domain && !host.endsWith(`.${domain}`)) continue;
      const cookies = this.store.get(domain) ?? new Map<string, string>();
      if (value === "" || /max-age=0\b/i.test(header)) cookies.delete(name);
      else cookies.set(name, value);
      this.store.set(domain, cookies);
    }
  }

  header(url: string): string {
    const host = new URL(url).hostname;
    const pairs: string[] = [];
    for (const [domain, cookies] of this.store) {
      if (host !== domain && !host.endsWith(`.${domain}`)) continue;
      for (const [name, value] of cookies) pairs.push(`${name}=${value}`);
    }
    return pairs.join("; ");
  }

  /** Cookies issued for exactly this host, suitable for persisting a single site's session. */
  hostCookies(host: string): string {
    const cookies = this.store.get(host);
    return cookies ? [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") : "";
  }
}

/** Reproduces the Csrf-Key / Csrf-Value header pair the SSO front end sends to its protected APIs. */
export function csrfHeaders(key = randomBytes(24).toString("base64url").slice(0, 32)): Record<string, string> {
  const encoded = Buffer.from(key).toString("base64");
  const half = Math.floor(encoded.length / 2);
  const mixed = encoded.slice(0, half) + encoded + encoded.slice(half);
  return { "Csrf-Key": key, "Csrf-Value": createHash("md5").update(mixed).digest("hex") };
}

export function parseLoginExecution(html: string): string {
  const execution = cheerio.load(html)("#login-page-flowkey").text().trim();
  if (!execution) throw new Error("Could not read the HDU SSO login form.");
  return execution;
}

export function decodeQrPng(png: Buffer): string {
  const image = PNG.sync.read(png);
  const result = jsQR(new Uint8ClampedArray(image.data), image.width, image.height);
  if (!result?.data) throw new Error("Could not decode the DingTalk login QR code.");
  return result.data;
}

export async function ssoRequest(
  jar: CookieJar,
  url: string,
  init: { method?: "GET" | "POST"; body?: URLSearchParams; headers?: Record<string, string>; timeoutMs?: number } = {}
): Promise<{ url: string; status: number; body: Buffer }> {
  let current = url;
  let method = init.method ?? "GET";
  let body: URLSearchParams | undefined = init.body;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isAllowedHduUrl(current)) throw new Error(`Refusing to follow a non-HDU URL during login: ${current}`);
    const cookie = jar.header(current);
    const response = await fetch(current, {
      method,
      body,
      redirect: "manual",
      headers: {
        "user-agent": USER_AGENT,
        ...(cookie ? { cookie } : {}),
        ...(hop === 0 ? init.headers : {})
      },
      signal: AbortSignal.timeout(init.timeoutMs ?? 15_000)
    });
    jar.setFromResponse(current, response.headers.getSetCookie());
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current).toString();
      method = "GET";
      body = undefined;
      continue;
    }
    return { url: current, status: response.status, body: Buffer.from(await response.arrayBuffer()) };
  }
  throw new Error(`Too many redirects while logging in to ${url}`);
}

async function ssoJson<T>(jar: CookieJar, path: string, timeoutMs?: number): Promise<{ code: number; data: T }> {
  const response = await ssoRequest(jar, `${SSO_ORIGIN}${path}`, { headers: csrfHeaders(), timeoutMs });
  return JSON.parse(response.body.toString("utf8")) as { code: number; data: T };
}

export interface QrLoginOptions {
  /** Service URL registered with the HDU SSO, e.g. https://job.hdu.edu.cn/default/hdu. */
  service: string;
  timeoutMs: number;
  /** Called with the URL encoded in each new QR code so the caller can render it. */
  onQrCode: (content: string) => void | Promise<void>;
}

/**
 * Logs in to the HDU SSO by DingTalk QR scan and follows the CAS ticket to the service.
 * Returns the cookie jar holding both the SSO session and the service session.
 */
export async function loginWithDingTalkQr(options: QrLoginOptions): Promise<{ jar: CookieJar; finalUrl: string }> {
  const jar = new CookieJar();
  const loginUrl = `${SSO_ORIGIN}/login?service=${encodeURIComponent(options.service)}`;
  const deadline = Date.now() + options.timeoutMs;

  while (Date.now() < deadline) {
    const loginPage = await ssoRequest(jar, loginUrl);
    const execution = parseLoginExecution(loginPage.body.toString("utf8"));
    const loginId = await ssoJson<string>(jar, "/api/protected/qrlogin/loginid");
    if (loginId.code !== 200 || !loginId.data) throw new Error("The HDU SSO did not issue a QR login id.");

    const qr = await ssoRequest(jar, `${SSO_ORIGIN}/api/public/qrlogin/qrgen/${encodeURIComponent(loginId.data)}/dingDingQr`);
    await options.onQrCode(decodeQrPng(qr.body));

    // The scan endpoint long-polls (~30 s) and answers 408 "wait" until the code is scanned and confirmed.
    let username: string | undefined;
    while (Date.now() < deadline) {
      let status: { code: number; data: string };
      try {
        status = await ssoJson<string>(jar, `/api/protected/qrlogin/scan/${encodeURIComponent(loginId.data)}`, 45_000);
      } catch {
        await delay(1_000);
        continue;
      }
      if (status.code === 200 && status.data) {
        username = status.data;
        break;
      }
      if (status.code !== 408) break; // Expired or cancelled: issue a fresh QR code.
    }
    if (!username) continue;

    const result = await ssoRequest(jar, `${SSO_ORIGIN}/login`, {
      method: "POST",
      body: new URLSearchParams({
        username, type: "dingDingQr", _eventId: "submit", geolocation: "", execution
      })
    });
    if (new URL(result.url).hostname === "sso.hdu.edu.cn") {
      throw new Error("DingTalk QR login was not accepted by the HDU SSO.");
    }
    return { jar, finalUrl: result.url };
  }
  throw new Error("Timed out waiting for the DingTalk QR scan.");
}
