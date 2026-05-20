import type { RouteDefinition } from "./builder";
import { assertValidCompiledRouteGraph } from "./compiler";
import type { CompiledRoute, DeployOptions } from "./types";
import { validateCompiledRoute } from "./validator";

type DeployableRoute = RouteDefinition | CompiledRoute;
type HttpMethod = "GET" | "POST";
type CloudflareRouteSummary = {
  id: string;
  name: string;
};
type RequestContext = {
  fetchImpl: typeof fetch;
  headers: Record<string, string>;
};

export class DeployError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody: unknown,
  ) {
    super(message);
    this.name = "DeployError";
  }
}

export async function deploy(route: DeployableRoute, options: DeployOptions): Promise<unknown> {
  const compiled = assertValidCompiledRouteGraph(
    ("compile" in route ? route.compile() : validateCompiledRoute(route)) as CompiledRoute,
  );
  const fetchImpl = options.fetch ?? globalThis.fetch;

  if (fetchImpl === undefined) {
    throw new Error("No fetch implementation is available. Use Node.js 18+ or pass options.fetch.");
  }

  const baseUrl = (options.baseUrl ?? "https://api.cloudflare.com/client/v4").replace(/\/+$/, "");
  const endpoint = `${baseUrl}/accounts/${encodeURIComponent(
    options.accountId,
  )}/ai-gateway/gateways/${encodeURIComponent(options.gatewayId)}/routes`;
  const context = {
    fetchImpl,
    headers: {
      Authorization: `Bearer ${options.apiToken}`,
      "Content-Type": "application/json",
    },
  };

  const existingRoute = await findExistingRouteByName(endpoint, compiled.name, context);

  if (existingRoute === undefined) {
    return requestCloudflare(context, "POST", endpoint, compiled, "route create");
  }

  const version = await requestCloudflare(
    context,
    "POST",
    `${endpoint}/${encodeURIComponent(existingRoute.id)}/versions`,
    { elements: compiled.elements },
    "route version create",
  );
  const versionId = extractVersionId(version);

  if (versionId === undefined) {
    throw new Error("Cloudflare AI Gateway route deploy failed: version create response did not include version_id.");
  }

  return requestCloudflare(
    context,
    "POST",
    `${endpoint}/${encodeURIComponent(existingRoute.id)}/deployments`,
    { version_id: versionId },
    "route deployment create",
  );
}

async function findExistingRouteByName(
  endpoint: string,
  name: string,
  context: RequestContext,
): Promise<CloudflareRouteSummary | undefined> {
  const perPage = 100;

  for (let page = 1; page <= 100; page += 1) {
    const response = await requestCloudflare(
      context,
      "GET",
      `${endpoint}?page=${page}&per_page=${perPage}`,
      undefined,
      "route list",
    );
    const routes = extractRoutes(response);
    const match = routes.find((route) => route.name === name);

    if (match !== undefined || routes.length < perPage) {
      return match;
    }
  }

  return undefined;
}

async function requestCloudflare(
  context: RequestContext,
  method: HttpMethod,
  endpoint: string,
  body: unknown,
  action: string,
): Promise<unknown> {
  const response = await context.fetchImpl(endpoint, {
    method,
    headers: context.headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const responseBody = await readResponseBody(response);

  if (!response.ok) {
    throw new DeployError(
      `Cloudflare AI Gateway route deploy failed during ${action} with HTTP ${
        response.status
      }.${formatResponseBody(responseBody)}`,
      response.status,
      responseBody,
    );
  }

  return responseBody;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractRoutes(value: unknown): CloudflareRouteSummary[] {
  const routes = getRoutesArray(value);

  return routes.flatMap((route) => {
    if (!isRecord(route) || typeof route.id !== "string" || typeof route.name !== "string") {
      return [];
    }

    return [{ id: route.id, name: route.name }];
  });
}

function getRoutesArray(value: unknown): unknown[] {
  if (!isRecord(value)) {
    return [];
  }

  if (Array.isArray(value.routes)) {
    return value.routes;
  }

  if (isRecord(value.data) && Array.isArray(value.data.routes)) {
    return value.data.routes;
  }

  if (isRecord(value.result) && Array.isArray(value.result.routes)) {
    return value.result.routes;
  }

  if (Array.isArray(value.result)) {
    return value.result;
  }

  return [];
}

function extractVersionId(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (typeof value.version_id === "string") {
    return value.version_id;
  }

  if (isRecord(value.version) && typeof value.version.version_id === "string") {
    return value.version.version_id;
  }

  if (isRecord(value.result)) {
    return extractVersionId(value.result) ?? (typeof value.result.id === "string" ? value.result.id : undefined);
  }

  return typeof value.id === "string" ? value.id : undefined;
}

function formatResponseBody(value: unknown): string {
  if (value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return ` ${value}`;
  }

  const errors = extractCloudflareErrors(value);
  if (errors.length > 0) {
    return ` ${errors.join(" ")}`;
  }

  return ` ${JSON.stringify(value)}`;
}

function extractCloudflareErrors(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.errors)) {
    return [];
  }

  return value.errors.flatMap((error) => {
    if (!isRecord(error)) {
      return [];
    }

    if (typeof error.message === "string") {
      return [error.message];
    }

    return [];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
