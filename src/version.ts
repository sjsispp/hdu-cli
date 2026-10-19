import { createRequire } from "node:module";

// Both src/ and dist/ sit one level below the package root.
export const { version: CLI_VERSION } = createRequire(import.meta.url)("../package.json") as { version: string };
