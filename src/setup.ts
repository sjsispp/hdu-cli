import { spawn } from "node:child_process";
import { access, constants, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import QRCode from "qrcode";
import { authStatus, loginWithBrowser, loginWithQr, SERVICES, type ServiceId } from "./auth.js";
import { HduError } from "./errors.js";
import { secretStore } from "./secret-store.js";
import { installedSkillsVersion, installSkills } from "./skill.js";
import { CLI_VERSION } from "./version.js";

export type LoginMethod = "qr" | "browser";

export function parseLoginMethod(value: string): LoginMethod | undefined {
  const normalized = value.trim().toLowerCase();
  if (["", "1", "qr", "钉钉", "扫码"].includes(normalized)) return "qr";
  if (["2", "browser", "浏览器"].includes(normalized)) return "browser";
  return undefined;
}

export interface LoginPresentation {
  /** Machine-readable progress for agents: one JSON object per line on stdout. */
  json?: boolean;
  /** Open the QR code image in the system image viewer. */
  open?: boolean;
}

const QR_IMAGE = join(tmpdir(), "hdu-cli", "login-qr.png");

/** Command that opens a file with the platform's default application. */
export function viewerCommand(path: string, platform: NodeJS.Platform = process.platform): [string, string[]] {
  if (platform === "darwin") return ["open", [path]];
  // `start` treats the first quoted argument as a window title, so pass an empty one.
  if (platform === "win32") return ["cmd", ["/c", "start", "\"\"", path]];
  return ["xdg-open", [path]];
}

/** Opens a file with the platform's default application, without waiting for it. */
export function openWithSystemViewer(path: string): void {
  const [command, args] = viewerCommand(path);
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", () => { /* No viewer available; the image path is still reported. */ });
  child.unref();
}

function emitEvent(event: string, data: unknown): void {
  process.stdout.write(`${JSON.stringify({ ok: true, event, data })}\n`);
}

/**
 * Shared by `hdu auth login` and `hdu setup`. With `json`, progress is written as JSON lines so an
 * agent running the command in the background can show the QR image to the user; the final line
 * (without `event`) carries the login status.
 */
export async function performLogin(method: LoginMethod, timeoutMs: number, presentation: LoginPresentation = {}): Promise<void> {
  if (method === "browser") {
    if (presentation.json) emitEvent("browser_opened", { message: "请在打开的浏览器中完成杭电统一身份认证。" });
    else console.log("请在打开的浏览器中完成杭电统一身份认证；CLI 不会读取或保存你的密码。");
    await loginWithBrowser(timeoutMs);
    return;
  }
  const useImage = presentation.json || presentation.open;
  try {
    await loginWithQr(async (content) => {
      if (useImage) {
        await mkdir(dirname(QR_IMAGE), { recursive: true });
        await QRCode.toFile(QR_IMAGE, content, { width: 360, margin: 2, errorCorrectionLevel: "M" });
      }
      if (presentation.json) {
        emitEvent("qr_code", {
          image: QR_IMAGE, opened: Boolean(presentation.open),
          message: "请用钉钉扫描二维码并在手机上确认登录；二维码过期后会自动刷新并再次输出。"
        });
      } else {
        console.log(await QRCode.toString(content, { type: "utf8", errorCorrectionLevel: "L" }));
        console.log("请使用钉钉扫描上方二维码并在手机上确认登录；二维码过期后会自动刷新。");
        if (presentation.open) console.log(`二维码图片已在窗口中打开：${QR_IMAGE}`);
      }
      if (presentation.open) openWithSystemViewer(QR_IMAGE);
    }, timeoutMs);
  } finally {
    if (useImage) await rm(QR_IMAGE, { force: true });
  }
}

/** Finds an executable on PATH, honouring PATHEXT on Windows. */
export async function findOnPath(
  command: string, pathValue = process.env.PATH ?? "", platform: NodeJS.Platform = process.platform
): Promise<string | undefined> {
  const extensions = platform === "win32" ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";") : [""];
  for (const directory of pathValue.split(platform === "win32" ? ";" : delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = join(directory, command + extension.toLowerCase());
      try {
        await access(candidate, platform === "win32" ? constants.F_OK : constants.X_OK);
        return candidate;
      } catch {
        // Keep looking.
      }
    }
  }
  return undefined;
}

function printServices(services: Record<ServiceId, boolean>): void {
  for (const [id, active] of Object.entries(services)) {
    console.log(`  ${SERVICES[id as ServiceId].name}：${active ? "可用" : "不可用"}`);
  }
}

export async function runSetup(options: { method?: LoginMethod; timeoutMs: number }): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new HduError("unsupported", "hdu setup 需要在交互式终端中运行。", "非交互环境请使用 hdu auth login。");
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  let closed = false;
  prompt.on("close", () => { closed = true; });
  /** Returns undefined when the user ends input (Ctrl-D / Ctrl-C), which cancels the step. */
  const ask = async (question: string): Promise<string | undefined> => {
    if (closed) return undefined;
    try {
      return await prompt.question(question);
    } catch {
      return undefined;
    }
  };
  try {
    console.log("欢迎使用 hdu-cli —— 杭州电子科技大学信息命令行工具。");
    console.log("本工具只读：不会选课、报名、投递简历或提交任何申请，也不会读取或保存你的密码。\n");

    console.log("[1/4] 检查运行环境");
    const store = secretStore();
    if (!store) {
      console.log("  当前系统暂不支持加密保存登录会话（支持 macOS 和 Windows）。");
      console.log("  公开信息命令可以直接使用；需要登录的命令可通过 HDU_JOB_COOKIE、HDU_JW_COOKIE 环境变量提供会话。");
      return;
    }
    console.log(`  会话存储：${store.label}`);
    const installed = await findOnPath("hdu");
    if (installed) {
      console.log(`  hdu 命令：${installed}`);
    } else {
      console.log("  hdu 命令尚未加入 PATH，只能在项目目录中通过 npm run dev 使用。");
      console.log("  在项目目录运行 npm run build && npm link 后即可在任意目录使用 hdu。");
    }

    console.log("\n[2/4] 登录杭电统一身份认证");
    const before = await authStatus();
    let shouldLogin = !before.sso;
    if (before.sso) {
      console.log("  已登录：");
      printServices(before.services);
      shouldLogin = /^y(es)?$/i.test((await ask("  是否重新登录？(y/N) "))?.trim() ?? "");
    }
    if (shouldLogin) {
      let method = options.method;
      while (!method) {
        console.log("  1) 钉钉扫码（推荐，在终端显示二维码）");
        console.log("  2) 浏览器（打开 Chrome / Edge，可用密码或短信验证）");
        const answer = await ask("  请选择登录方式 [1]: ");
        if (answer === undefined) {
          console.log("\n已取消。之后可以随时运行 hdu setup 或 hdu auth login。");
          return;
        }
        method = parseLoginMethod(answer);
        if (!method) console.log("  请输入 1 或 2。");
      }
      // Release stdin so the QR flow and browser launch do not compete with readline.
      prompt.pause();
      await performLogin(method, options.timeoutMs);
    }

    console.log("\n[3/4] 智能体技能");
    const installedSkills = installedSkillsVersion();
    if (installedSkills) {
      if (installedSkills !== CLI_VERSION) await installSkills();
      console.log(`  hdu 技能已${installedSkills === CLI_VERSION ? "是最新" : `从 ${installedSkills} 更新到 ${CLI_VERSION}`}。`);
    } else {
      const answer = await ask("  安装 hdu 技能，让 Claude Code、Codex 等智能体能在任意目录使用 hdu？(Y/n) ");
      if (answer !== undefined && !/^n(o)?$/i.test(answer.trim())) {
        for (const location of (await installSkills()).locations) console.log(`  ${location.agent}：${location.path}`);
      } else {
        console.log("  已跳过，之后可以运行 hdu skill install。");
      }
    }

    console.log("\n[4/4] 完成");
    const after = shouldLogin ? await authStatus() : before;
    console.log(`  统一身份认证：${after.sso ? "已登录" : "未登录"}`);
    printServices(after.services);
    console.log("\n试试这些命令：");
    console.log("  hdu jw timetable         本学期课表");
    console.log("  hdu jw exams             考试安排");
    console.log("  hdu job talks            近期宣讲会");
    console.log("  hdu notice list          学校通知公告");
    console.log("  hdu --help               查看全部命令");
  } finally {
    prompt.close();
  }
}
