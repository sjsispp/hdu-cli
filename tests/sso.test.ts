import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { CookieJar, csrfHeaders, decodeQrPng, parseLoginExecution } from "../src/sso.js";

describe("HDU SSO helpers", () => {
  it("derives the Csrf-Value header like the SSO front end", () => {
    expect(csrfHeaders("Abc123Def456Ghi789Jkl012Mno345Pq")).toEqual({
      "Csrf-Key": "Abc123Def456Ghi789Jkl012Mno345Pq",
      "Csrf-Value": "59f6833f0d3fc5b351a522aaa1c0f72e"
    });
    expect(csrfHeaders()["Csrf-Key"]).toHaveLength(32);
  });

  it("reads the login flow key", () => {
    expect(parseLoginExecution(`<p id="login-page-flowkey">e1s1-token</p>`)).toBe("e1s1-token");
    expect(() => parseLoginExecution("<p></p>")).toThrow();
  });

  it("scopes cookies to their domains", () => {
    const jar = new CookieJar();
    jar.setFromResponse("https://sso.hdu.edu.cn/login", ["SESSION=abc; Path=/; HttpOnly", "TGC=t1; Path=/"]);
    jar.setFromResponse("https://job.hdu.edu.cn/default/hdu", ["PHPSESSID2=p1; Domain=.job.hdu.edu.cn"]);
    jar.setFromResponse("https://job.hdu.edu.cn/", ["evil=1; Domain=example.com"]);
    expect(jar.header("https://sso.hdu.edu.cn/api")).toBe("SESSION=abc; TGC=t1");
    expect(jar.header("https://job.hdu.edu.cn/home")).toBe("PHPSESSID2=p1");
    expect(jar.hostCookies("job.hdu.edu.cn")).toBe("PHPSESSID2=p1");
    jar.setFromResponse("https://sso.hdu.edu.cn/logout", ["TGC=; Max-Age=0"]);
    expect(jar.header("https://sso.hdu.edu.cn/")).toBe("SESSION=abc");
  });

  it("decodes a QR code image", async () => {
    const content = "https://sso.hdu.edu.cn/api/public/redirect/id/dingDingQr?t=abc";
    expect(decodeQrPng(await QRCode.toBuffer(content))).toBe(content);
  });
});
