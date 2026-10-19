import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CommanderError } from "commander";
import { describe, expect, it } from "vitest";
import { authRequired, ERROR_EXIT_CODES, HduError, toHduError } from "../src/errors.js";

const run = promisify(execFile);

/** Runs the real CLI entry point; only offline error paths are exercised here. */
async function cli(...args: string[]) {
  try {
    const { stdout, stderr } = await run(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
      env: { ...process.env, HDU_JW_COOKIE: "JSESSIONID=offline-test" }
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code: number; stdout: string; stderr: string };
    return { code: failure.code, stdout: failure.stdout, stderr: failure.stderr };
  }
}

describe("error classification", () => {
  it("keeps typed errors and maps the rest", () => {
    const typed = authRequired("教务系统");
    expect(toHduError(typed)).toBe(typed);
    expect(typed.hint).toContain("hdu auth login");
    expect(toHduError(new CommanderError(1, "commander.unknownOption", "error: unknown option '--x'")))
      .toMatchObject({ type: "invalid_argument", message: "unknown option '--x'" });
    expect(toHduError(new TypeError("fetch failed")).type).toBe("network");
    expect(toHduError(new Error("boom")).type).toBe("internal");
  });

  it("gives every error type a distinct non-zero exit code", () => {
    const codes = Object.values(ERROR_EXIT_CODES);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => code > 0)).toBe(true);
  });
});

describe("CLI JSON envelope", () => {
  it("reports usage errors as JSON on stderr", async () => {
    const result = await cli("notice", "list", "--limit", "x", "--json");
    expect(result.code).toBe(ERROR_EXIT_CODES.invalid_argument);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({ ok: false, error: { type: "invalid_argument" } });
  });

  it("reports validation errors raised inside commands", async () => {
    const result = await cli("service", "buses", "--campus", "mars", "--json");
    expect(result.code).toBe(ERROR_EXIT_CODES.invalid_argument);
    expect(JSON.parse(result.stderr).error.message).toContain("xiasha");
  });

  it("refuses non-HDU URLs as unsupported", async () => {
    const result = await cli("page", "get", "https://example.com/", "--json");
    expect(result.code).toBe(ERROR_EXIT_CODES.unsupported);
    expect(JSON.parse(result.stderr).error.type).toBe("unsupported");
  });

  it("prints a hint line in human mode", async () => {
    const result = await cli("service", "buses", "--campus", "mars");
    expect(result.code).toBe(ERROR_EXIT_CODES.invalid_argument);
    expect(result.stderr).toMatch(/^hdu: /);
  });

  it("exits 0 for --version", async () => {
    const result = await cli("--version");
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

it("HduError carries its type", () => {
  expect(new HduError("parse", "x").type).toBe("parse");
});
