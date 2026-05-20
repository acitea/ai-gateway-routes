# TypeScript API

The CLI and YAML manifest workflow are the primary interface. Use the TypeScript API when routes need to be generated from code or embedded in another tool.

For package and module-resolution details, see [TypeScript compatibility](./typescript-compatibility.md).

## Builder

```ts
import { defineRoute } from "ai-gateway-routes";

const route = defineRoute("linear", (b) => {
  const model = b.model("openai", {
    provider: "openai",
    model: "gpt-4.1-mini",
    timeout: 30,
    retries: 2,
  });

  b.fromStart().to(model);
  model.onSuccess().toEnd();
  model.onFallback().toEnd();
});

const json = route.compile();
```

## YAML Helpers

```ts
import {
  compileYamlRoute,
  formatYamlRoute,
  validateYamlRoute,
} from "ai-gateway-routes";

const diagnostics = validateYamlRoute(source);
const formatted = formatYamlRoute(source);
const route = compileYamlRoute(source);
```

## Terraform

```ts
import { compileTerraformRoute, compileYamlRoute } from "ai-gateway-routes";

const route = compileYamlRoute(source);
const terraform = compileTerraformRoute(route);
```

## Deploy

```ts
import { deploy } from "ai-gateway-routes";

await deploy(route, {
  accountId: "...",
  gatewayId: "...",
  apiToken: "...",
});
```

`deploy()` accepts either a builder route or compiled Cloudflare API JSON.
It creates a route when the route name is new. If the gateway already has a route with the same name, it creates and deploys a new version for that route.

## Schemas

```ts
import {
  CloudflareRouteSchema,
  YamlRouteSchema,
  validateCompiledRoute,
} from "ai-gateway-routes";

const parsed = CloudflareRouteSchema.parse(json);
const route = validateCompiledRoute(json);
```

Common exports:

- `defineRoute`
- `compileYamlRoute`
- `formatYamlRoute`
- `validateYamlRoute`
- `compileTerraformRoute`
- `visualize`
- `deploy`
- `CloudflareRouteSchema`
- `YamlRouteSchema`
