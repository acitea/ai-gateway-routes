#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(here, "..");
const repoRoot = resolve(extensionRoot, "..");
const source = resolve(repoRoot, "src/index.ts");
const packageRoot = resolve(extensionRoot, "vendor/ai-gateway-routes");
const target = resolve(packageRoot, "index.js");

await rm(resolve(extensionRoot, "vendor"), { recursive: true, force: true });
await mkdir(dirname(target), { recursive: true });
await writeFile(resolve(packageRoot, "package.json"), '{"type":"module"}\n', "utf8");
await execFileAsync("bun", [
  "build",
  source,
  "--outfile",
  target,
  "--target",
  "node",
  "--format",
  "esm",
]);
