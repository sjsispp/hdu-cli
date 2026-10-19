import { CommanderError } from "commander";

/**
 * Error categories exposed to agents in `{"ok": false, "error": {...}}`. Each maps to its own exit
 * code so callers can branch without parsing messages.
 */
export const ERROR_EXIT_CODES = {
  internal: 1,
  invalid_argument: 2,
  auth_required: 3,
  network: 4,
  upstream: 5,
  parse: 6,
  unsupported: 7
} as const;

export type ErrorType = keyof typeof ERROR_EXIT_CODES;

export class HduError extends Error {
  constructor(readonly type: ErrorType, message: string, readonly hint?: string) {
    super(message);
    this.name = "HduError";
  }
}

export const LOGIN_HINT = "请用户在自己的终端运行 hdu setup（首次）或 hdu auth login 完成扫码登录，然后重试。";
export const PARSE_HINT = "学校网站的页面结构可能已变化；请升级 hdu 后重试，或到 https://github.com/sjsispp/hdu-cli/issues 反馈。";

export function authRequired(siteName: string): HduError {
  return new HduError("auth_required", `${siteName}未登录或会话已过期。`, LOGIN_HINT);
}

export function parseFailure(message: string): HduError {
  return new HduError("parse", message, PARSE_HINT);
}

export function invalidArgument(message: string, hint?: string): HduError {
  return new HduError("invalid_argument", message, hint);
}

/** Maps any thrown value to an HduError so every failure has a stable type. */
export function toHduError(error: unknown): HduError {
  if (error instanceof HduError) return error;
  if (error instanceof CommanderError) {
    return new HduError("invalid_argument", error.message.replace(/^error:\s*/, ""), "运行 hdu <命令> --help 查看用法。");
  }
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError" || /fetch failed/i.test(message))) {
    return new HduError("network", message, "请检查网络连接后重试；校外网络访问部分系统可能需要学校 VPN。");
  }
  return new HduError("internal", message);
}
