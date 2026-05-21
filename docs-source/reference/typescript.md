# TypeScript API

The CLI and YAML manifest workflow are the primary interface. Use the TypeScript API when routes need to be generated from code or embedded in another tool.

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

## YAML helpers

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

## Common exports

- `defineRoute`
- `compileYamlRoute`
- `formatYamlRoute`
- `validateYamlRoute`
- `compileTerraformRoute`
- `visualize`
- `deploy`
- `CloudflareRouteSchema`
- `YamlRouteSchema`
