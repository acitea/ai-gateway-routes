import type { RouteDefinition } from "./builder.js";
import type { CompiledRoute, DeployOptions } from "./types.js";
import { validateCompiledRoute } from "./validator.js";

type DeployableRoute = RouteDefinition | CompiledRoute;

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
  const compiled = "compile" in route ? route.compile() : validateCompiledRoute(route);
  const fetchImpl = options.fetch ?? globalThis.fetch;

  if (fetchImpl === undefined) {
    throw new Error("No fetch implementation is available. Use Node.js 18+ or pass options.fetch.");
  }

  const baseUrl = options.baseUrl ?? "https://api.cloudflare.com/client/v4";
  const endpoint = `${baseUrl}/accounts/${encodeURIComponent(
    options.accountId,
  )}/ai-gateway/gateways/${encodeURIComponent(options.gatewayId)}/routes`;

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(compiled),
  });

  const body = await readResponseBody(response);

  if (!response.ok) {
    throw new DeployError(
      `Cloudflare AI Gateway route deploy failed with HTTP ${response.status}.`,
      response.status,
      body,
    );
  }

  return body;
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
