const DEFAULT_TIMEOUT_MS = 15_000;
const USER_AGENT = "hdu-cli/0.1 (+https://www.hdu.edu.cn/; public-information-reader)";

export function isAllowedHduUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      (url.hostname === "hdu.edu.cn" || url.hostname.endsWith(".hdu.edu.cn"))
    );
  } catch {
    return false;
  }
}

export async function fetchText(
  url: string,
  options: { timeoutMs?: number; retries?: number; cookie?: string } = {}
): Promise<string> {
  if (!isAllowedHduUrl(url)) {
    throw new Error(`Refusing to fetch a non-HDU URL: ${url}`);
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? 2;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml",
          ...(options.cookie ? { cookie: options.cookie } : {})
        },
        redirect: "follow",
        signal: controller.signal
      });

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === retries) {
          throw new Error(`HTTP ${response.status} for ${url}`);
        }
        await delay(250 * (attempt + 1));
        continue;
      }

      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await delay(250 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Failed to fetch ${url}: ${reason}`);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
