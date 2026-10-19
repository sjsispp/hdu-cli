import { describe, expect, it } from "vitest";
import { secretStore } from "../src/secret-store.js";

describe("secret store selection", () => {
  it("uses the platform's per-user encrypted storage", () => {
    expect(secretStore("darwin")?.label).toBe("macOS 钥匙串");
    expect(secretStore("win32")?.label).toBe("Windows DPAPI 加密文件");
    expect(secretStore("linux")).toBeUndefined();
  });
});

// Touches the real Windows DPAPI store, so it only runs on Windows.
describe.runIf(process.platform === "win32")("Windows DPAPI store", () => {
  it("round-trips a secret", async () => {
    const store = secretStore()!;
    const name = `hdu-cli.test-${process.pid}`;
    const value = "PHPSESSID2=测试; route=abc";
    await store.set(name, value, "HDU CLI test secret");
    expect(await store.get(name)).toBe(value);
    expect(await store.delete(name)).toBe(true);
    expect(await store.get(name)).toBeUndefined();
  });
});
