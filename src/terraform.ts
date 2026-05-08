import type {
  CompiledRoute,
  ConditionalElement,
  ModelElement,
  RateElement,
  RouteElement,
} from "./types";
import { validateCompiledRoute } from "./validator";

export type TerraformRouteOptions = {
  resourceName?: string;
  accountId?: string;
  gatewayId?: string;
  includeVariables?: boolean;
};

export type TerraformRouteJson = {
  variable?: {
    cloudflare_account_id?: {
      type: "string";
    };
    ai_gateway_id?: {
      type: "string";
    };
  };
  resource: {
    cloudflare_ai_gateway_dynamic_routing: Record<string, TerraformDynamicRoutingResource>;
  };
};

export type TerraformDynamicRoutingResource = {
  account_id: string;
  gateway_id: string;
  name: string;
  elements: TerraformRouteElement[];
};

export type TerraformRouteElement = {
  id: string;
  type: RouteElement["type"];
  outputs: Record<string, { element_id: string }>;
  properties?: Record<string, unknown>;
};

export function compileTerraformRoute(
  route: CompiledRoute,
  options: TerraformRouteOptions = {},
): TerraformRouteJson {
  const compiled = validateCompiledRoute(route) as CompiledRoute;
  const accountId = options.accountId ?? "${var.cloudflare_account_id}";
  const gatewayId = options.gatewayId ?? "${var.ai_gateway_id}";
  const resourceName = options.resourceName ?? sanitizeTerraformIdentifier(compiled.name);
  const includeVariables =
    options.includeVariables ?? (options.accountId === undefined || options.gatewayId === undefined);

  return {
    ...(includeVariables
      ? {
          variable: {
            ...(options.accountId === undefined
              ? { cloudflare_account_id: { type: "string" as const } }
              : {}),
            ...(options.gatewayId === undefined ? { ai_gateway_id: { type: "string" as const } } : {}),
          },
        }
      : {}),
    resource: {
      cloudflare_ai_gateway_dynamic_routing: {
        [resourceName]: {
          account_id: accountId,
          gateway_id: gatewayId,
          name: compiled.name,
          elements: compiled.elements.map(toTerraformElement),
        },
      },
    },
  };
}

function toTerraformElement(element: RouteElement): TerraformRouteElement {
  const converted: TerraformRouteElement = {
    id: element.id,
    type: element.type,
    outputs: Object.fromEntries(
      Object.entries(element.outputs).map(([name, output]) => [
        name,
        { element_id: output.elementId },
      ]),
    ),
  };

  const properties = toTerraformProperties(element);
  if (properties !== undefined) {
    converted.properties = properties;
  }

  return converted;
}

function toTerraformProperties(element: RouteElement): Record<string, unknown> | undefined {
  switch (element.type) {
    case "conditional":
      return {
        conditions: JSON.stringify((element as ConditionalElement).properties.conditions),
      };
    case "model": {
      const properties = (element as ModelElement).properties;
      return {
        ai_gateway_dynamic_routing_provider: properties.provider,
        model: properties.model,
        timeout: properties.timeout,
        retries: properties.retries,
      };
    }
    case "rate": {
      const properties = (element as RateElement).properties;
      return {
        limit_type: properties.limitType,
        key: properties.key,
        limit: properties.limit,
        window: properties.window,
      };
    }
    case "start":
    case "end":
    case "percentage":
      return undefined;
  }
}

function sanitizeTerraformIdentifier(value: string): string {
  const identifier = value
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  if (identifier.length === 0) {
    return "route";
  }

  return /^[A-Za-z_]/.test(identifier) ? identifier : `route_${identifier}`;
}
