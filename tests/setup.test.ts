import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { findOnPath, parseLoginMethod } from "../src/setup.js";

describe("setup helpers", () => {
  it("parses login method choices", () => {
    expect(parseLoginMethod("")).toBe("qr");
    expect(parseLoginMethod(" 1 ")).toBe("qr");
    expect(parseLoginMethod("2")).toBe("browser");
    expect(parseLoginMethod("Browser")).toBe("browser");
    expect(parseLoginMethod("3")).toBeUndefined();
  });

  const directories: string[] = [];
  afterAll(async () => Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true }))));

  it.skipIf(process.platform === "win32")("finds executables on PATH", async () => {
    const empty = await mkdtemp(join(tmpdir(), "hdu-path-"));
    const bin = await mkdtemp(join(tmpdir(), "hdu-path-"));
    directories.push(empty, bin);
    await writeFile(join(bin, "hdu"), "#!/bin/sh\n");
    await chmod(join(bin, "hdu"), 0o755);
    expect(await findOnPath("hdu", `${empty}:${bin}`, "darwin")).toBe(join(bin, "hdu"));
    expect(await findOnPath("hdu", empty, "darwin")).toBeUndefined();
  });
});

describe("QR image viewer", () => {
  it("opens images with each platform's default viewer", async () => {
    const { viewerCommand } = await import("../src/setup.js");
    expect(viewerCommand("/tmp/qr.png", "darwin")).toEqual(["open", ["/tmp/qr.png"]]);
    expect(viewerCommand("C:\\qr.png", "win32")).toEqual(["cmd", ["/c", "start", "\"\"", "C:\\qr.png"]]);
    expect(viewerCommand("/tmp/qr.png", "linux")).toEqual(["xdg-open", ["/tmp/qr.png"]]);
  });
});
