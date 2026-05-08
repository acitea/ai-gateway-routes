import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "bun:test";
import {
  CloudflareRouteSchema,
  RouteValidationError,
  compileYamlRoute,
  compileRoute,
  compileTerraformRoute,
  defineRoute,
  deploy,
  formatYamlRoute,
  validateYamlRoute,
  validateCompiledRouteGraph,
  validateCompiledRoute,
  visualize,
} from "../src/index";
import { resolveDeployConfig } from "../src/deploy-config";

describe("ai-gateway-routes", () => {
  it("compiles a simple linear route", () => {
    const route = defineRoute("linear", (b) => {
      const openai = b.model("openai", {
        provider: "openai",
        model: "gpt-4.1-mini",
        timeout: 30,
        retries: 2,
      });

      b.fromStart().to(openai);
      openai.onSuccess().toEnd();
      openai.onFallback().toEnd();
    });

    expect(route.compile()).toEqual({
      name: "linear",
      elements: [
        {
          id: "start",
          type: "start",
          outputs: { next: { elementId: "openai" } },
        },
        {
          id: "openai",
          type: "model",
          properties: {
            provider: "openai",
            model: "gpt-4.1-mini",
            timeout: 30,
            retries: 2,
          },
          outputs: {
            success: { elementId: "end" },
            fallback: { elementId: "end" },
          },
        },
        {
          id: "end",
          type: "end",
          outputs: {},
        },
      ],
    });
  });

  it("compiles a branching conditional route", () => {
    const route = defineRoute("auth-router", (b) => {
      const checkAuth = b.conditional("check-auth", {
        conditions: { "metadata.signed_in": { $eq: true } },
      });

      const openai = b.model("openai", {
        provider: "openai",
        model: "gpt-4.1-mini",
        timeout: 30,
        retries: 2,
      });

      const nvidia = b.model("nvidia", {
        provider: "custom-nvidia",
        model: "nvidia/llama-3.1-nemotron-nano-8b-v1",
        timeout: 30,
        retries: 2,
      });

      b.fromStart().to(checkAuth);
      checkAuth.onTrue().to(openai);
      checkAuth.onFalse().to(nvidia);
      openai.onSuccess().toEnd();
      openai.onFallback().to(nvidia);
      nvidia.onSuccess().toEnd();
      nvidia.onFallback().toEnd();
    });

    const json = route.compile();

    expect(json.elements).toHaveLength(5);
    expect(json.elements.find((element) => element.id === "check-auth")).toMatchObject({
      id: "check-auth",
      type: "conditional",
      outputs: {
        true: { elementId: "openai" },
        false: { elementId: "nvidia" },
      },
    });
    expect(validateCompiledRoute(json)).toEqual(json);
  });

  it("compiles a fractional route for A/B testing", () => {
    const route = defineRoute("ab-test", (b) => {
      const split = b.fractional("split", {
        buckets: [0.25, 0.75] as const,
      });
      const control = b.model("control", {
        provider: "openai",
        model: "gpt-4.1-mini",
        timeout: 30,
        retries: 2,
      });
      const treatment = b.model("treatment", {
        provider: "workers-ai",
        model: "@cf/meta/llama-3.1-8b-instruct",
        timeout: 30,
        retries: 2,
      });

      b.fromStart().to(split);
      split.onBucket(0).to(control);
      split.on("bucket1").to(treatment);
      control.onSuccess().toEnd();
      control.onFallback().toEnd();
      treatment.onSuccess().toEnd();
      treatment.onFallback().toEnd();
    });

    const split = route.compile().elements.find((element) => element.id === "split");

    expect(split).toEqual({
      id: "split",
      type: "percentage",
      outputs: {
        "25%": { elementId: "control" },
        "75%": { elementId: "treatment" },
      },
    });
  });

  it("compiles a rate limit route", () => {
    const route = defineRoute("rate-limit", (b) => {
      const limit = b.rate("limit", {
        limitType: "count",
        key: "metadata.user_id",
        limit: 100,
        window: 60,
      });
      const model = b.model("openai", {
        provider: "openai",
        model: "gpt-4.1-mini",
        timeout: 30,
        retries: 2,
      });

      b.fromStart().to(limit);
      limit.onSuccess().to(model);
      limit.onFallback().toEnd();
      model.onSuccess().toEnd();
      model.onFallback().toEnd();
    });

    expect(route.compile().elements.find((element) => element.id === "limit")).toEqual({
      id: "limit",
      type: "rate",
      properties: {
        limitType: "count",
        key: "metadata.user_id",
        limit: 100,
        window: 60,
      },
      outputs: {
        success: { elementId: "openai" },
        fallback: { elementId: "end" },
      },
    });
  });

  it("throws validation errors for missing outputs", () => {
    const route = defineRoute("missing-output", (b) => {
      const model = b.model("model", {
        provider: "openai",
        model: "gpt-4.1-mini",
        timeout: 30,
        retries: 2,
      });

      b.fromStart().to(model);
      model.onSuccess().toEnd();
    });

    expect(() => route.compile()).toThrow(RouteValidationError);
    expect(() => route.compile()).toThrow('Element "model" is missing required output "fallback".');
  });

  it("throws validation errors for a missing end element", () => {
    expect(() =>
      compileRoute({
        name: "missing-end",
        elements: [
          {
            id: "start",
            type: "start",
            outputs: new Map([["next", "model"]]),
            requiredOutputs: ["next"],
          },
          {
            id: "model",
            type: "model",
            properties: {
              provider: "openai",
              model: "gpt-4.1-mini",
              timeout: 30,
              retries: 2,
            },
            outputs: new Map([
              ["success", "model"],
              ["fallback", "model"],
            ]),
            requiredOutputs: ["success", "fallback"],
          },
        ],
      }),
    ).toThrow("Expected exactly one end element, found 0.");
  });

  it("throws validation errors for unreachable elements", () => {
    const route = defineRoute("unreachable", (b) => {
      const reachable = b.model("reachable", {
        provider: "openai",
        model: "gpt-4.1-mini",
        timeout: 30,
        retries: 2,
      });
      const orphan = b.model("orphan", {
        provider: "openai",
        model: "gpt-4.1-mini",
        timeout: 30,
        retries: 2,
      });

      b.fromStart().to(reachable);
      reachable.onSuccess().toEnd();
      reachable.onFallback().toEnd();
      orphan.onSuccess().toEnd();
      orphan.onFallback().toEnd();
    });

    expect(() => route.compile()).toThrow('Element "orphan" is not reachable from start.');
  });

  it("throws validation errors for cycles", () => {
    const route = defineRoute("cycle", (b) => {
      const first = b.model("first", {
        provider: "openai",
        model: "gpt-4.1-mini",
        timeout: 30,
        retries: 2,
      });
      const second = b.model("second", {
        provider: "openai",
        model: "gpt-4.1-mini",
        timeout: 30,
        retries: 2,
      });

      b.fromStart().to(first);
      first.onSuccess().toEnd();
      first.onFallback().to(second);
      second.onSuccess().toEnd();
      second.onFallback().to(first);
    });

    expect(() => route.compile()).toThrow("Route contains a cycle:");
  });

  it("validates graph semantics for externally supplied compiled JSON", async () => {
    const compiled = {
      name: "external-cycle",
      elements: [
        {
          id: "start",
          type: "start",
          outputs: { next: { elementId: "model" } },
        },
        {
          id: "model",
          type: "model",
          properties: {
            provider: "openai",
            model: "gpt-4.1-mini",
            timeout: 30,
            retries: 2,
          },
          outputs: {
            success: { elementId: "end" },
            fallback: { elementId: "model" },
          },
        },
        {
          id: "end",
          type: "end",
          outputs: {},
        },
      ],
    } as const;

    expect(validateCompiledRouteGraph(compiled).some((issue) => issue.startsWith("Route contains a cycle"))).toBe(
      true,
    );
    await expect(
      deploy(compiled, {
        accountId: "account",
        gatewayId: "gateway",
        apiToken: "token",
        fetch: (() => {
          throw new Error("fetch should not be called for invalid route graphs");
        }) as typeof fetch,
      }),
    ).rejects.toThrow("Route contains a cycle");
  });

  it("validates the compiled JSON schema", () => {
    const route = defineRoute("schema", (b) => {
      const model = b.model("model", {
        provider: "openai",
        model: "gpt-4.1-mini",
        timeout: 30,
        retries: 2,
      });

      b.fromStart().to(model);
      model.onSuccess().toEnd();
      model.onFallback().toEnd();
    });

    expect(CloudflareRouteSchema.safeParse(route.compile()).success).toBe(true);
  });

  it("creates Mermaid flowchart output", () => {
    const route = defineRoute("diagram", (b) => {
      const model = b.model("model", {
        provider: "openai",
        model: "gpt-4.1-mini",
        timeout: 30,
        retries: 2,
      });

      b.fromStart().to(model);
      model.onSuccess().toEnd();
      model.onFallback().toEnd();
    });

    expect(visualize(route)).toBe(`flowchart TD
  node_start([start])
  node_model[model]
  node_end([end])
  node_start -->|next| node_model
  node_model -->|success| node_end
  node_model -->|fallback| node_end`);
  });

  it("keeps Mermaid node ids unique when route ids normalize to the same value", () => {
    expect(
      visualize({
        name: "collisions",
        elements: [
          {
            id: "start",
            type: "start",
            outputs: { next: { elementId: "a-b" } },
          },
          {
            id: "a-b",
            type: "model",
            properties: {
              provider: "openai",
              model: "gpt-4.1-mini",
              timeout: 30,
              retries: 2,
            },
            outputs: {
              success: { elementId: "a_b" },
              fallback: { elementId: "end" },
            },
          },
          {
            id: "a_b",
            type: "model",
            properties: {
              provider: "openai",
              model: "gpt-4.1-mini",
              timeout: 30,
              retries: 2,
            },
            outputs: {
              success: { elementId: "end" },
              fallback: { elementId: "end" },
            },
          },
          {
            id: "end",
            type: "end",
            outputs: {},
          },
        ],
      }),
    ).toContain("node_a_b_2[a_b]");
  });

  it("compiles the YAML manifest format", () => {
    const yaml = `
name: auth-router
start: check-auth
nodes:
  check-auth:
    conditional:
      conditions:
        metadata.signed_in:
          $eq: true
      true: openai
      false: nvidia
  openai:
    model:
      provider: openai
      model: gpt-4.1-mini
      timeout: 30
      retries: 2
      success: end
      fallback: nvidia
  nvidia:
    model:
      provider: custom-nvidia
      model: nvidia/llama-3.1-nemotron-nano-8b-v1
      timeout: 30
      retries: 2
      success: end
      fallback: end
`;

    const compiled = compileYamlRoute(yaml);

    expect(compiled.name).toBe("auth-router");
    expect(compiled.elements[0]).toMatchObject({
      id: "start",
      outputs: { next: { elementId: "check-auth" } },
    });
    expect(compiled.elements[1]).toMatchObject({
      id: "check-auth",
      type: "conditional",
      outputs: {
        true: { elementId: "openai" },
        false: { elementId: "nvidia" },
      },
    });
  });

  it("compiles YAML model catalog references and inline branch nodes", () => {
    const yaml = `
name: inline-auth-router
start: check-auth

models:
  openai:
    provider: openai
    model: gpt-4.1-mini
    timeout: 30
    retries: 2
  nvidia:
    provider: custom-nvidia
    model: nvidia/llama-3.1-nemotron-nano-8b-v1
    timeout: 30
    retries: 2

nodes:
  check-auth:
    conditional:
      conditions:
        metadata.signed_in:
          $eq: true
      true:
        model: openai
        success: end
        fallback:
          model: nvidia
          success: end
          fallback: end
      false:
        model: nvidia
        success: end
        fallback: end
`;

    const compiled = compileYamlRoute(yaml);

    expect(compiled.elements).toEqual([
      {
        id: "start",
        type: "start",
        outputs: { next: { elementId: "check-auth" } },
      },
      {
        id: "check-auth",
        type: "conditional",
        properties: {
          conditions: {
            "metadata.signed_in": { $eq: true },
          },
        },
        outputs: {
          true: { elementId: "check-auth-true" },
          false: { elementId: "check-auth-false" },
        },
      },
      {
        id: "check-auth-true",
        type: "model",
        properties: {
          provider: "openai",
          model: "gpt-4.1-mini",
          timeout: 30,
          retries: 2,
        },
        outputs: {
          success: { elementId: "end" },
          fallback: { elementId: "check-auth-true-fallback" },
        },
      },
      {
        id: "check-auth-true-fallback",
        type: "model",
        properties: {
          provider: "custom-nvidia",
          model: "nvidia/llama-3.1-nemotron-nano-8b-v1",
          timeout: 30,
          retries: 2,
        },
        outputs: {
          success: { elementId: "end" },
          fallback: { elementId: "end" },
        },
      },
      {
        id: "check-auth-false",
        type: "model",
        properties: {
          provider: "custom-nvidia",
          model: "nvidia/llama-3.1-nemotron-nano-8b-v1",
          timeout: 30,
          retries: 2,
        },
        outputs: {
          success: { elementId: "end" },
          fallback: { elementId: "end" },
        },
      },
      {
        id: "end",
        type: "end",
        outputs: {},
      },
    ]);
  });

  it("formats YAML manifests into a stable canonical layout", () => {
    const yaml = `name: demo
start: generate
models: { openai: { provider: openai, model: gpt-4.1-mini, timeout: 30, retries: 2 } }
nodes: { generate: { model: openai, success: end, fallback: end } }
`;

    expect(formatYamlRoute(yaml)).toBe(`name: demo
start: generate
models:
  openai:
    provider: openai
    model: gpt-4.1-mini
    timeout: 30
    retries: 2
nodes:
  generate:
    model: openai
    success: end
    fallback: end
`);
  });

  it("reports structural YAML diagnostics near the offending node", () => {
    const yaml = `name: invalid
start: generate
nodes:
  generate:
    model: openai
    success: end
`;

    expect(validateYamlRoute(yaml)[0]).toMatchObject({
      line: 4,
      column: 4,
      severity: "error",
    });
  });

  it("compiled YAML output satisfies Cloudflare's extracted route schema", () => {
    const schema = JSON.parse(
      readFileSync("schemas/cloudflare-route-create.schema.json", "utf8"),
    ) as object;
    const ajv = new Ajv2020({ strict: false });
    const validate = ajv.compile(schema);
    const compiled = compileYamlRoute(readFileSync("examples/auth-router.ai-gateway-route.yaml", "utf8"));

    expect(validate(compiled), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it("reports YAML manifest diagnostics", () => {
    const yaml = `
name: invalid
start: split
nodes:
  split:
    fractional:
      buckets: [0.5, 0.25]
      bucket0: a
      bucket1: end
`;

    expect(validateYamlRoute(yaml).map((diagnostic) => diagnostic.message)).toContain(
      'Element "split" output "50%" references missing element "a".',
    );
    expect(validateYamlRoute(yaml).map((diagnostic) => diagnostic.message)).toContain(
      'Percentage element "split" buckets must sum to 1.',
    );
  });

  it("resolves deploy credentials from flags, env vars, and inferred Wrangler account id", () => {
    expect(
      resolveDeployConfig(
        { gatewayId: "flag-gateway" },
        {
          CLOUDFLARE_ACCOUNT_ID: "env-account",
          CLOUDFLARE_GATEWAY_ID: "env-gateway",
          CLOUDFLARE_API_TOKEN: "env-token",
        },
        "wrangler-account",
      ),
    ).toEqual({
      accountId: "env-account",
      gatewayId: "flag-gateway",
      apiToken: "env-token",
      missing: [],
    });

    expect(
      resolveDeployConfig(
        {},
        {
          AI_GATEWAY_ID: "alias-gateway",
          CF_API_TOKEN: "alias-token",
        },
        "wrangler-account",
      ),
    ).toEqual({
      accountId: "wrangler-account",
      gatewayId: "alias-gateway",
      apiToken: "alias-token",
      missing: [],
    });

    expect(resolveDeployConfig({}, {}, undefined).missing).toEqual([
      "accountId",
      "gatewayId",
      "apiToken",
    ]);
  });

  it("compiles YAML routes to Terraform JSON configuration", () => {
    const yaml = `
name: auth-router
start: check-auth
models:
  openai:
    provider: openai
    model: gpt-4.1-mini
    timeout: 30
    retries: 2
nodes:
  check-auth:
    conditional:
      conditions:
        metadata.signed_in:
          $eq: true
      true: openai
      false: end
  openai:
    model: openai
    success: end
    fallback: end
`;

    expect(compileTerraformRoute(compileYamlRoute(yaml))).toEqual({
      variable: {
        cloudflare_account_id: {
          type: "string",
        },
        ai_gateway_id: {
          type: "string",
        },
      },
      resource: {
        cloudflare_ai_gateway_dynamic_routing: {
          auth_router: {
            account_id: "${var.cloudflare_account_id}",
            gateway_id: "${var.ai_gateway_id}",
            name: "auth-router",
            elements: [
              {
                id: "start",
                type: "start",
                outputs: {
                  next: {
                    element_id: "check-auth",
                  },
                },
              },
              {
                id: "check-auth",
                type: "conditional",
                properties: {
                  conditions: '{"metadata.signed_in":{"$eq":true}}',
                },
                outputs: {
                  true: {
                    element_id: "openai",
                  },
                  false: {
                    element_id: "end",
                  },
                },
              },
              {
                id: "openai",
                type: "model",
                properties: {
                  ai_gateway_dynamic_routing_provider: "openai",
                  model: "gpt-4.1-mini",
                  timeout: 30,
                  retries: 2,
                },
                outputs: {
                  success: {
                    element_id: "end",
                  },
                  fallback: {
                    element_id: "end",
                  },
                },
              },
              {
                id: "end",
                type: "end",
                outputs: {},
              },
            ],
          },
        },
      },
    });
  });

  it("supports literal Terraform account and gateway ids", () => {
    const route = compileYamlRoute(`
name: literal-ids
start: openai
models:
  openai:
    provider: openai
    model: gpt-4.1-mini
    timeout: 30
    retries: 2
nodes:
  openai:
    model: openai
    success: end
    fallback: end
`);

    const terraform = compileTerraformRoute(route, {
      accountId: "account",
      gatewayId: "gateway",
      resourceName: "route",
    });

    expect(terraform.variable).toBeUndefined();
    expect(terraform.resource.cloudflare_ai_gateway_dynamic_routing.route).toMatchObject({
      account_id: "account",
      gateway_id: "gateway",
    });
  });
});
