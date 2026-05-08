export type DeployCliOptions = {
  accountId?: string;
  gatewayId?: string;
  apiToken?: string;
};

export type DeployEnvironment = Record<string, string | undefined>;

export type ResolvedDeployConfig = {
  accountId: string | undefined;
  gatewayId: string | undefined;
  apiToken: string | undefined;
  missing: Array<"accountId" | "gatewayId" | "apiToken">;
};

export function resolveDeployConfig(
  options: DeployCliOptions,
  env: DeployEnvironment,
  inferredAccountId?: string,
): ResolvedDeployConfig {
  const accountId =
    firstNonEmpty(options.accountId, env.CLOUDFLARE_ACCOUNT_ID, env.CF_ACCOUNT_ID) ??
    inferredAccountId;
  const gatewayId = firstNonEmpty(
    options.gatewayId,
    env.CLOUDFLARE_GATEWAY_ID,
    env.AI_GATEWAY_ID,
  );
  const apiToken = firstNonEmpty(options.apiToken, env.CLOUDFLARE_API_TOKEN, env.CF_API_TOKEN);
  const missing: ResolvedDeployConfig["missing"] = [];

  if (accountId === undefined) {
    missing.push("accountId");
  }

  if (gatewayId === undefined) {
    missing.push("gatewayId");
  }

  if (apiToken === undefined) {
    missing.push("apiToken");
  }

  return { accountId, gatewayId, apiToken, missing };
}

export function formatMissingDeployConfigMessage(missing: ResolvedDeployConfig["missing"]): string {
  const labels = missing.join(", ");

  return `Missing deploy credentials: ${labels}. Pass --account-id, --gateway-id, and --api-token as needed; set CLOUDFLARE_ACCOUNT_ID/CF_ACCOUNT_ID, CLOUDFLARE_GATEWAY_ID/AI_GATEWAY_ID, and CLOUDFLARE_API_TOKEN/CF_API_TOKEN; or install Wrangler so accountId can be inferred from \`wrangler whoami --json\`.`;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value !== undefined && value.trim().length > 0);
}
