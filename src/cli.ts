#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { deploy } from "./deploy.js";
import { visualize } from "./visualize.js";
import {
  YamlRouteJsonSchema,
  compileYamlRoute,
  validateYamlRoute,
} from "./yaml.js";

type CliOptions = {
  output?: string;
  accountId?: string;
  gatewayId?: string;
  apiToken?: string;
};

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  switch (command) {
    case "validate":
      return validateCommand(rest);
    case "compile":
      return compileCommand(rest);
    case "visualize":
      return visualizeCommand(rest);
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

  for (const diagnostic of diagnostics) {
    console.error(
      `${file}:${diagnostic.line + 1}:${diagnostic.column + 1} ${diagnostic.severity}: ${diagnostic.message}`,
    );
  }

  return 1;
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

async function deployCommand(args: string[]): Promise<number> {
  const { file, options } = parseFileArgs(args);
  const accountId = options.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID;
  const gatewayId = options.gatewayId ?? process.env.CLOUDFLARE_GATEWAY_ID;
  const apiToken = options.apiToken ?? process.env.CLOUDFLARE_API_TOKEN;

  if (accountId === undefined || gatewayId === undefined || apiToken === undefined) {
    console.error(
      "Missing deploy credentials. Pass --account-id, --gateway-id, --api-token or set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_GATEWAY_ID, CLOUDFLARE_API_TOKEN.",
    );
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

function printHelp(): void {
  const executable = basename(process.argv[1] ?? "ai-gateway-routes");
  console.error(`Usage:
  ${executable} validate <route.yaml>
  ${executable} compile <route.yaml> [-o route.json]
  ${executable} visualize <route.yaml> [-o route.mmd]
  ${executable} schema [-o ai-gateway-route.schema.json]
  ${executable} deploy <route.yaml> --account-id <id> --gateway-id <id> --api-token <token>
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
