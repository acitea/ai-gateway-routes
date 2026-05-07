import { parseDocument } from "yaml";
import { z } from "zod";
import { compileRoute, validateRouteGraph } from "./compiler.js";
import type {
  CompiledRoute,
  ElementDraft,
  FractionalProperties,
  PercentageProperties,
  RouteGraph,
} from "./types.js";
import { ConditionsSchema } from "./validator.js";

export type YamlDiagnosticSeverity = "error" | "warning";

export type YamlDiagnostic = {
  message: string;
  line: number;
  column: number;
  severity: YamlDiagnosticSeverity;
};

export const YamlModelNodeSchema = z
  .object({
    model: z
      .object({
        provider: z.string().min(1),
        model: z.string().min(1),
        timeout: z.number().positive(),
        retries: z.number().int().nonnegative(),
        success: z.string().min(1),
        fallback: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export const YamlConditionalNodeSchema = z
  .object({
    conditional: z
      .object({
        conditions: ConditionsSchema,
        true: z.string().min(1),
        false: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export const YamlFractionalNodeSchema = z
  .object({
    fractional: z
      .object({
        buckets: z.array(z.number().nonnegative()).min(1),
      })
      .catchall(z.string().min(1))
      .superRefine((node, context) => {
        const expectedOutputs = node.buckets.map((_, index) => `bucket${index}`);
        const outputNames = Object.keys(node).filter((key) => key !== "buckets");

        for (const expectedOutput of expectedOutputs) {
          if (!outputNames.includes(expectedOutput)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [expectedOutput],
              message: `Missing output "${expectedOutput}".`,
            });
          }
        }

        for (const outputName of outputNames) {
          if (!/^bucket\d+$/.test(outputName)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [outputName],
              message: `Unexpected fractional key "${outputName}". Use bucket0, bucket1, ...`,
            });
            continue;
          }

          if (!expectedOutputs.includes(outputName)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [outputName],
              message: `Unexpected output "${outputName}" for ${node.buckets.length} buckets.`,
            });
          }
        }
      }),
  })
  .strict();

export const YamlPercentageNodeSchema = z
  .object({
    percentage: z.record(z.string().min(1), z.string().min(1)).refine(
      (outputs) => Object.keys(outputs).length > 0,
      "Percentage nodes must define at least one output.",
    ),
  })
  .strict();

export const YamlRateNodeSchema = z
  .object({
    rate: z
      .object({
        limitType: z.enum(["count", "cost"]),
        key: z.string().min(1),
        limit: z.number().positive(),
        window: z.number().positive(),
        success: z.string().min(1),
        fallback: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export const YamlNodeSchema = z.union([
  YamlModelNodeSchema,
  YamlConditionalNodeSchema,
  YamlFractionalNodeSchema,
  YamlPercentageNodeSchema,
  YamlRateNodeSchema,
]);

export const YamlRouteSchema = z
  .object({
    name: z.string().min(1),
    start: z.string().min(1),
    nodes: z.record(z.string().min(1), YamlNodeSchema),
  })
  .strict();

export type YamlRoute = z.infer<typeof YamlRouteSchema>;
export type YamlNode = z.infer<typeof YamlNodeSchema>;

export const YamlRouteJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "AI Gateway Route YAML",
  type: "object",
  required: ["name", "start", "nodes"],
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1 },
    start: {
      type: "string",
      minLength: 1,
      description: "The first node id to connect from the implicit start element.",
    },
    nodes: {
      type: "object",
      additionalProperties: {
        oneOf: [
          {
            type: "object",
            required: ["model"],
            additionalProperties: false,
            properties: {
              model: {
                type: "object",
                required: ["provider", "model", "timeout", "retries", "success", "fallback"],
                additionalProperties: false,
                properties: {
                  provider: { type: "string", minLength: 1 },
                  model: { type: "string", minLength: 1 },
                  timeout: { type: "number", exclusiveMinimum: 0 },
                  retries: { type: "integer", minimum: 0 },
                  success: { type: "string", minLength: 1 },
                  fallback: { type: "string", minLength: 1 },
                },
              },
            },
          },
          {
            type: "object",
            required: ["conditional"],
            additionalProperties: false,
            properties: {
              conditional: {
                type: "object",
                required: ["conditions", "true", "false"],
                additionalProperties: false,
                properties: {
                  conditions: { type: "object" },
                  true: { type: "string", minLength: 1 },
                  false: { type: "string", minLength: 1 },
                },
              },
            },
          },
          {
            type: "object",
            required: ["rate"],
            additionalProperties: false,
            properties: {
              rate: {
                type: "object",
                required: ["limitType", "key", "limit", "window", "success", "fallback"],
                additionalProperties: false,
                properties: {
                  limitType: { enum: ["count", "cost"], type: "string" },
                  key: { type: "string", minLength: 1 },
                  limit: { type: "number", exclusiveMinimum: 0 },
                  window: { type: "number", exclusiveMinimum: 0 },
                  success: { type: "string", minLength: 1 },
                  fallback: { type: "string", minLength: 1 },
                },
              },
            },
          },
          {
            type: "object",
            required: ["percentage"],
            additionalProperties: false,
            properties: {
              percentage: {
                type: "object",
                minProperties: 1,
                additionalProperties: { type: "string", minLength: 1 },
              },
            },
          },
          {
            type: "object",
            required: ["fractional"],
            additionalProperties: false,
            properties: {
              fractional: {
                type: "object",
                required: ["buckets"],
                additionalProperties: false,
                patternProperties: {
                  "^bucket\\d+$": { type: "string", minLength: 1 },
                },
                properties: {
                  buckets: {
                    type: "array",
                    minItems: 1,
                    items: { type: "number", minimum: 0 },
                  },
                },
              },
            },
          },
        ],
      },
    },
  },
} as const;

export function parseYamlRoute(source: string): YamlRoute {
  const value = parseYamlDocument(source);
  return YamlRouteSchema.parse(value);
}

export function yamlRouteToGraph(route: YamlRoute): RouteGraph {
  const elements: ElementDraft[] = [
    {
      id: "start",
      type: "start",
      outputs: new Map([["next", route.start]]),
      requiredOutputs: ["next"],
    },
  ];

  for (const [id, node] of Object.entries(route.nodes)) {
    if ("model" in node) {
      const { success, fallback, ...properties } = node.model;
      elements.push({
        id,
        type: "model",
        properties,
        outputs: new Map([
          ["success", success],
          ["fallback", fallback],
        ]),
        requiredOutputs: ["success", "fallback"],
      });
      continue;
    }

    if ("conditional" in node) {
      const { conditions, true: trueTarget, false: falseTarget } = node.conditional;
      elements.push({
        id,
        type: "conditional",
        properties: { conditions },
        outputs: new Map([
          ["true", trueTarget],
          ["false", falseTarget],
        ]),
        requiredOutputs: ["true", "false"],
      });
      continue;
    }

    if ("rate" in node) {
      const { success, fallback, ...properties } = node.rate;
      elements.push({
        id,
        type: "rate",
        properties,
        outputs: new Map([
          ["success", success],
          ["fallback", fallback],
        ]),
        requiredOutputs: ["success", "fallback"],
      });
      continue;
    }

    if ("percentage" in node) {
      const outputs = node.percentage;
      const properties = { outputs: Object.keys(outputs) } satisfies PercentageProperties;
      elements.push({
        id,
        type: "percentage",
        properties,
        outputs: new Map(Object.entries(outputs)),
        requiredOutputs: properties.outputs,
      });
      continue;
    }

    const { buckets, ...outputs } = node.fractional;
    const outputNames = buckets.map(formatPercentageBucket);
    elements.push({
      id,
      type: "percentage",
      properties: { buckets } satisfies FractionalProperties,
      outputs: new Map(
        Object.entries(outputs).map(([outputName, target]) => [
          outputNames[Number(outputName.slice(6))] ?? outputName,
          target as string,
        ]),
      ),
      requiredOutputs: outputNames,
    });
  }

  elements.push({
    id: "end",
    type: "end",
    outputs: new Map(),
    requiredOutputs: [],
  });

  return {
    name: route.name,
    elements,
  };
}

export function compileYamlRoute(source: string): CompiledRoute {
  return compileRoute(yamlRouteToGraph(parseYamlRoute(source)));
}

export function validateYamlRoute(source: string): YamlDiagnostic[] {
  const parseDiagnostics = getParseDiagnostics(source);
  if (parseDiagnostics.length > 0) {
    return parseDiagnostics;
  }

  let route: YamlRoute;
  try {
    route = parseYamlRoute(source);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return error.issues.map((issue) => ({
        message: `${formatPath(issue.path)}${issue.message}`,
        line: 0,
        column: 0,
        severity: "error",
      }));
    }

    return [
      {
        message: error instanceof Error ? error.message : "Invalid YAML route.",
        line: 0,
        column: 0,
        severity: "error",
      },
    ];
  }

  const graphIssues = validateRouteGraph(yamlRouteToGraph(route));
  return graphIssues.map((issue) => ({
    message: issue,
    line: 0,
    column: 0,
    severity: "error",
  }));
}

function parseYamlDocument(source: string): unknown {
  const document = parseDocument(source, {
    prettyErrors: false,
    strict: true,
  });

  if (document.errors.length > 0) {
    throw document.errors[0];
  }

  return document.toJSON();
}

function getParseDiagnostics(source: string): YamlDiagnostic[] {
  const document = parseDocument(source, {
    prettyErrors: false,
    strict: true,
  });

  return document.errors.map((error) => {
    const linePosition = "linePos" in error ? error.linePos?.[0] : undefined;
    return {
      message: error.message,
      line: Math.max((linePosition?.line ?? 1) - 1, 0),
      column: Math.max((linePosition?.col ?? 1) - 1, 0),
      severity: "error",
    };
  });
}

function formatPath(path: (string | number)[]): string {
  if (path.length === 0) {
    return "";
  }

  return `${path.join(".")}: `;
}

function formatPercentageBucket(bucket: number): string {
  const percentage = bucket * 100;
  return `${Number.isInteger(percentage) ? percentage : percentage.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}%`;
}
