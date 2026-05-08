#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { deploy } from "./deploy";
import {
  formatMissingDeployConfigMessage,
  resolveDeployConfig,
} from "./deploy-config";
import { compileTerraformRoute } from "./terraform";
import { visualize } from "./visualize";
import {
  YamlRouteJsonSchema,
  compileYamlRoute,
  formatYamlRoute,
  validateYamlRoute,
} from "./yaml";

type CliOptions = {
  output?: string;
  accountId?: string;
  gatewayId?: string;
  apiToken?: string;
  resourceName?: string;
  write?: boolean;
};

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  switch (command) {
    case "check":
      return checkCommand(rest);
    case "validate":
      return validateCommand(rest);
    case "format":
      return formatCommand(rest);
    case "compile":
      return compileCommand(rest);
    case "visualize":
      return visualizeCommand(rest);
    case "terraform":
      return terraformCommand(rest);
    case "deploy":
      return deployCommand(rest);
    case "schema":
      return schemaCommand(rest);
    case "-h":
    case "--help":
    case undefined:
      printHelp();
      return command === undefined ? 1 : 0;
    default:
      console.error(`Unknown command "${command}".`);
      printHelp();
      return 1;
  }
}

async function validateCommand(args: string[]): Promise<number> {
  const { file } = parseFileArgs(args);
  const source = await readFile(file, "utf8");
  const diagnostics = validateYamlRoute(source);

  if (diagnostics.length === 0) {
    console.log(`${file}: valid`);
    return 0;
  }

  return printDiagnostics(file, diagnostics);
}

async function checkCommand(args: string[]): Promise<number> {
  const { file } = parseFileArgs(args);
  const source = await readFile(file, "utf8");
  const diagnostics = validateYamlRoute(source);
  return diagnostics.length === 0 ? 0 : printDiagnostics(file, diagnostics);
}

function printDiagnostics(file: string, diagnostics: ReturnType<typeof validateYamlRoute>): number {
  for (const diagnostic of diagnostics) {
    console.error(
      `${file}:${diagnostic.line + 1}:${diagnostic.column + 1} ${diagnostic.severity}: ${diagnostic.message}`,
    );
  }

  return 1;
}

async function formatCommand(args: string[]): Promise<number> {
  const { file, options } = parseFileArgs(args);
  const source = await readFile(file, "utf8");
  const formatted = formatYamlRoute(source);

  if (options.write === true) {
    await writeFile(file, formatted, "utf8");
    return 0;
  }

  await writeOutput(options.output, formatted);
  return 0;
}

async function compileCommand(args: string[]): Promise<number> {
  const { file, options } = parseFileArgs(args);
  const source = await readFile(file, "utf8");
  const compiled = compileYamlRoute(source);
  await writeOutput(options.output, `${JSON.stringify(compiled, null, 2)}\n`);
  return 0;
}

async function visualizeCommand(args: string[]): Promise<number> {
  const { file, options } = parseFileArgs(args);
  const source = await readFile(file, "utf8");
  const compiled = compileYamlRoute(source);
  await writeOutput(options.output, `${visualize(compiled)}\n`);
  return 0;
}

async function terraformCommand(args: string[]): Promise<number> {
  const { file, options } = parseFileArgs(args);
  const source = await readFile(file, "utf8");
  const compiled = compileYamlRoute(source);
  const terraform = compileTerraformRoute(compiled, makeTerraformOptions(options));
  await writeOutput(options.output, `${JSON.stringify(terraform, null, 2)}\n`);
  return 0;
}

function makeTerraformOptions(options: CliOptions): Parameters<typeof compileTerraformRoute>[1] {
  return {
    ...(options.accountId === undefined ? {} : { accountId: options.accountId }),
    ...(options.gatewayId === undefined ? {} : { gatewayId: options.gatewayId }),
    ...(options.resourceName === undefined ? {} : { resourceName: options.resourceName }),
  };
}

async function deployCommand(args: string[]): Promise<number> {
  const { file, options } = parseFileArgs(args);
  const inferredAccountId =
    options.accountId === undefined &&
    process.env.CLOUDFLARE_ACCOUNT_ID === undefined &&
    process.env.CF_ACCOUNT_ID === undefined
      ? await inferWranglerAccountId()
      : undefined;
  const { accountId, gatewayId, apiToken, missing } = resolveDeployConfig(
    options,
    process.env,
    inferredAccountId,
  );

  if (missing.length > 0) {
    console.error(formatMissingDeployConfigMessage(missing));
    return 1;
  }

  if (accountId === undefined || gatewayId === undefined || apiToken === undefined) {
    console.error(formatMissingDeployConfigMessage(["accountId", "gatewayId", "apiToken"]));
    return 1;
  }

  const source = await readFile(file, "utf8");
  const compiled = compileYamlRoute(source);
  const response = await deploy(compiled, { accountId, gatewayId, apiToken });
  console.log(JSON.stringify(response, null, 2));
  return 0;
}

async function schemaCommand(args: string[]): Promise<number> {
  const { options } = parseOptions(args);
  await writeOutput(options.output, `${JSON.stringify(YamlRouteJsonSchema, null, 2)}\n`);
  return 0;
}

function parseFileArgs(args: string[]): { file: string; options: CliOptions } {
  const { positional, options } = parseOptions(args);
  const file = positional[0];

  if (file === undefined) {
    throw new Error("Missing route YAML file path.");
  }

  if (positional.length > 1) {
    throw new Error(`Unexpected argument "${positional[1]}".`);
  }

  return { file, options };
}

function parseOptions(args: string[]): { positional: string[]; options: CliOptions } {
  const positional: string[] = [];
  const options: CliOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "-o" || arg === "--output") {
      options.output = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--account-id") {
      options.accountId = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--gateway-id") {
      options.gatewayId = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--api-token") {
      options.apiToken = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--resource-name") {
      options.resourceName = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "-w" || arg === "--write") {
      options.write = true;
      continue;
    }

    if (arg?.startsWith("-")) {
      throw new Error(`Unknown option "${arg}".`);
    }

    if (arg !== undefined) {
      positional.push(arg);
    }
  }

  return { positional, options };
}

function readOptionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("-")) {
    throw new Error(`Missing value for ${option}.`);
  }

  return value;
}

async function writeOutput(output: string | undefined, contents: string): Promise<void> {
  if (output === undefined) {
    process.stdout.write(contents);
    return;
  }

  await writeFile(output, contents, "utf8");
}

async function inferWranglerAccountId(): Promise<string | undefined> {
  const stdout = await execWranglerWhoami();
  if (stdout === undefined) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(stdout) as unknown;
    const accountIds = extractWranglerAccountIds(parsed);
    return accountIds.length === 1 ? accountIds[0] : undefined;
  } catch {
    return undefined;
  }
}

async function execWranglerWhoami(): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      "wrangler",
      ["whoami", "--json"],
      { timeout: 5_000 },
      (error: Error | null, stdout: string) => {
        resolve(error === null ? stdout : undefined);
      },
    );
  });
}

function extractWranglerAccountIds(value: unknown): string[] {
  const ids = new Set<string>();

  collectAccountIds(value, ids);

  return [...ids];
}

function collectAccountIds(value: unknown, ids: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectAccountIds(item, ids);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  addStringValue(value.accountId, ids);
  addStringValue(value.account_id, ids);

  if (isRecord(value.account)) {
    addStringValue(value.account.id, ids);
  }

  if (Array.isArray(value.accounts)) {
    collectAccountIds(value.accounts, ids);
  }

  if (isRecord(value.result)) {
    collectAccountIds(value.result, ids);
  }
}

function addStringValue(value: unknown, ids: Set<string>): void {
  if (typeof value === "string" && value.trim().length > 0) {
    ids.add(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function printHelp(): void {
  const executable = basename(process.argv[1] ?? "ai-gateway-routes");
  console.error(`Usage:
  ${executable} check <route.yaml>
  ${executable} validate <route.yaml>
  ${executable} format <route.yaml> [-o route.yaml | --write]
  ${executable} compile <route.yaml> [-o route.json]
  ${executable} visualize <route.yaml> [-o route.mmd]
  ${executable} terraform <route.yaml> [-o route.tf.json] [--resource-name <name>] [--account-id <id>] [--gateway-id <id>]
  ${executable} schema [-o ai-gateway-route.schema.json]
  ${executable} deploy <route.yaml> [--account-id <id>] --gateway-id <id> --api-token <token>
`);
}

main(process.argv.slice(2))
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
