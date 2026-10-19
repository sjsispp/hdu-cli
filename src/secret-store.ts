import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Per-user encrypted storage for session secrets. */
export interface SecretStore {
  readonly label: string;
  get(name: string): Promise<string | undefined>;
  set(name: string, value: string, description: string): Promise<void>;
  delete(name: string): Promise<boolean>;
}

const macKeychain: SecretStore = {
  label: "macOS 钥匙串",
  async get(name) {
    try {
      const { stdout } = await execFileAsync("/usr/bin/security", [
        "find-generic-password", "-s", name, "-a", userInfo().username, "-w"
      ], { encoding: "utf8" });
      return stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  },
  async set(name, value, description) {
    await execFileAsync("/usr/bin/security", [
      "add-generic-password", "-U", "-s", name, "-a", userInfo().username, "-l", description, "-w", value
    ]);
  },
  async delete(name) {
    try {
      await execFileAsync("/usr/bin/security", ["delete-generic-password", "-s", name, "-a", userInfo().username]);
      return true;
    } catch {
      return false;
    }
  }
};

/** Runs a Windows PowerShell script, passing the payload on stdin so secrets never appear in process arguments. */
function powershell(script: string, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      stdio: ["pipe", "pipe", "pipe"], windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`PowerShell exited with code ${code}: ${stderr.trim()}`));
    });
    child.stdin.end(input);
  });
}

const DPAPI_PREFIX = "Add-Type -AssemblyName System.Security; $in = [Console]::In.ReadToEnd().Trim();";

/** Windows DPAPI (CurrentUser scope): only the same Windows account on the same machine can decrypt. */
const windowsDpapi: SecretStore = {
  label: "Windows DPAPI 加密文件",
  async get(name) {
    let encrypted: string;
    try {
      encrypted = await readFile(windowsSecretPath(name), "utf8");
    } catch {
      return undefined;
    }
    try {
      return await powershell(`${DPAPI_PREFIX}
        $bytes = [Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($in), $null, 'CurrentUser');
        [Console]::Out.Write([Convert]::ToBase64String($bytes))`, encrypted)
        .then((encoded) => Buffer.from(encoded, "base64").toString("utf8") || undefined);
    } catch {
      return undefined;
    }
  },
  async set(name, value) {
    const encrypted = await powershell(`${DPAPI_PREFIX}
      $bytes = [Convert]::FromBase64String($in);
      [Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($bytes, $null, 'CurrentUser')))`,
    Buffer.from(value, "utf8").toString("base64"));
    await mkdir(windowsSecretDirectory(), { recursive: true });
    await writeFile(windowsSecretPath(name), encrypted, "utf8");
  },
  async delete(name) {
    try {
      await rm(windowsSecretPath(name));
      return true;
    } catch {
      return false;
    }
  }
};

function windowsSecretDirectory(): string {
  return join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "hdu-cli");
}

function windowsSecretPath(name: string): string {
  return join(windowsSecretDirectory(), `${name}.dpapi`);
}

export function secretStore(platform: NodeJS.Platform = process.platform): SecretStore | undefined {
  if (platform === "darwin") return macKeychain;
  if (platform === "win32") return windowsDpapi;
  return undefined;
}
