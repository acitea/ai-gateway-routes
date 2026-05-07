#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const OPENAPI_URL =
  process.env.CLOUDFLARE_OPENAPI_URL ??
  "https://raw.githubusercontent.com/cloudflare/api-schemas/main/openapi.json";
const ROUTES_PATH = "/accounts/{account_id}/ai-gateway/gateways/{gateway_id}/routes";
const OUTFILE = resolve("schemas/cloudflare-route-create.schema.json");

const response = await fetch(OPENAPI_URL);
if (!response.ok) {
  throw new Error(`Failed to fetch Cloudflare OpenAPI schema: HTTP ${response.status}`);
}

const spec = await response.json();
const schema =
  spec.paths?.[ROUTES_PATH]?.post?.requestBody?.content?.["application/json"]?.schema;

if (schema === undefined) {
  throw new Error(`Could not find POST ${ROUTES_PATH} request body schema.`);
}

const output = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $comment: `Extracted from ${OPENAPI_URL} at path POST ${ROUTES_PATH}.`,
  ...schema,
};

await mkdir(dirname(OUTFILE), { recursive: true });
await writeFile(OUTFILE, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Wrote ${OUTFILE}`);
