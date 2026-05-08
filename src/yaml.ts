import { parseDocument, stringify } from "yaml";
import type { Document } from "yaml";
import { z } from "zod";
import { compileRoute, validateRouteGraph } from "./compiler";
import type {
  CompiledRoute,
  ElementDraft,
  FractionalProperties,
  PercentageProperties,
  RouteGraph,
} from "./types";
import { ConditionsSchema } from "./validator";

type YamlTarget = string | RawYamlNode;

type RawModelConfig = {
  provider: string;
  model: string;
  timeout: number;
  retries: number;
};

type RawYamlRoute = {
  name: string;
  start: YamlTarget;
  models?: Record<string, RawModelConfig>;
  nodes: Record<string, RawYamlNode>;
};

type RawYamlNode =
  | {
      model: string;
      success: YamlTarget;
      fallback: YamlTarget;
    }
  | {
      model: RawModelConfig & {
        success: YamlTarget;
        fallback: YamlTarget;
      };
    }
  | {
      conditional: {
        conditions: z.infer<typeof ConditionsSchema>;
        true: YamlTarget;
        false: YamlTarget;
      };
    }
  | {
      rate: {
        limitType: "count" | "cost";
        key: string;
        limit: number;
        window: number;
        success: YamlTarget;
        fallback: YamlTarget;
      };
    }
  | {
      percentage: Record<string, YamlTarget>;
    }
  | {
      fractional: {
        buckets: number[];
        [outputName: `bucket${number}`]: YamlTarget;
      };
    };

export type YamlDiagnosticSeverity = "error" | "warning";

export type YamlDiagnostic = {
  message: string;
  line: number;
  column: number;
  severity: YamlDiagnosticSeverity;
};

type ParsedYamlSource = {
  document: Document.Parsed;
  value: unknown;
};

const YamlTargetSchema: z.ZodType<YamlTarget> = z.lazy(() =>
  z.union([z.string().min(1), YamlNodeSchema]),
);

const YamlModelConfigSchema = z
  .object({
    provider: z.string().min(1),
    model: z.string().min(1),
    timeout: z.number().positive(),
    retries: z.number().int().nonnegative(),
  })
  .strict();

export const YamlModelNodeSchema = z
  .union([
    z
      .object({
        model: YamlModelConfigSchema.extend({
          success: YamlTargetSchema,
          fallback: YamlTargetSchema,
        }).strict(),
      })
      .strict(),
    z
      .object({
        model: z.string().min(1),
        success: YamlTargetSchema,
        fallback: YamlTargetSchema,
      })
      .strict(),
  ]);

export const YamlConditionalNodeSchema = z
  .object({
    conditional: z
      .object({
        conditions: ConditionsSchema,
        true: YamlTargetSchema,
        false: YamlTargetSchema,
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
      .catchall(YamlTargetSchema)
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
    percentage: z.record(z.string().min(1), YamlTargetSchema).refine(
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
        success: YamlTargetSchema,
        fallback: YamlTargetSchema,
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
    start: YamlTargetSchema,
    models: z.record(z.string().min(1), YamlModelConfigSchema).optional(),
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
    start: makeTargetJsonSchema("The first node id or inline node to connect from the implicit start element."),
    models: {
      type: "object",
      additionalProperties: makeModelConfigJsonSchema(),
    },
    nodes: {
      type: "object",
      additionalProperties: makeNodeJsonSchema(),
    },
  },
} as const;

export function parseYamlRoute(source: string): YamlRoute {
  const { value } = parseYamlSource(source);
  return YamlRouteSchema.parse(value);
}

export function yamlRouteToGraph(route: YamlRoute): RouteGraph {
  const rawRoute = route as RawYamlRoute;
  const startElement: ElementDraft = {
    id: "start",
    type: "start",
    outputs: new Map(),
    requiredOutputs: ["next"],
  };
  const elements: ElementDraft[] = [startElement];
  const usedIds = new Set(["start", "end", ...Object.keys(rawRoute.nodes)]);

  function resolveTarget(target: YamlTarget, preferredId: string): string {
    if (typeof target === "string") {
      return target;
    }

    const inlineId = reserveInlineId(preferredId, usedIds);
    addNode(inlineId, target);
    return inlineId;
  }

  function addNode(id: string, node: RawYamlNode): void {
    if ("model" in node) {
      if (typeof node.model === "string") {
        const modelNode = node as {
          model: string;
          success: YamlTarget;
          fallback: YamlTarget;
        };
        const model = rawRoute.models?.[modelNode.model];
        if (model === undefined) {
          throw new Error(`Model "${modelNode.model}" is not defined in root models.`);
        }

        const element: ElementDraft = {
          id,
          type: "model",
          properties: model,
          outputs: new Map(),
          requiredOutputs: ["success", "fallback"],
        };
        elements.push(element);
        element.outputs.set("success", resolveTarget(modelNode.success, `${id}-success`));
        element.outputs.set("fallback", resolveTarget(modelNode.fallback, `${id}-fallback`));
        return;
      }

      const { success, fallback, ...properties } = node.model;
      const element: ElementDraft = {
        id,
        type: "model",
        properties,
        outputs: new Map(),
        requiredOutputs: ["success", "fallback"],
      };
      elements.push(element);
      element.outputs.set("success", resolveTarget(success, `${id}-success`));
      element.outputs.set("fallback", resolveTarget(fallback, `${id}-fallback`));
      return;
    }

    if ("conditional" in node) {
      const { conditions, true: trueTarget, false: falseTarget } = node.conditional;
      const element: ElementDraft = {
        id,
        type: "conditional",
        properties: { conditions },
        outputs: new Map(),
        requiredOutputs: ["true", "false"],
      };
      elements.push(element);
      element.outputs.set("true", resolveTarget(trueTarget, `${id}-true`));
      element.outputs.set("false", resolveTarget(falseTarget, `${id}-false`));
      return;
    }

    if ("rate" in node) {
      const { success, fallback, ...properties } = node.rate;
      const element: ElementDraft = {
        id,
        type: "rate",
        properties,
        outputs: new Map(),
        requiredOutputs: ["success", "fallback"],
      };
      elements.push(element);
      element.outputs.set("success", resolveTarget(success, `${id}-success`));
      element.outputs.set("fallback", resolveTarget(fallback, `${id}-fallback`));
      return;
    }

    if ("percentage" in node) {
      const outputs = node.percentage;
      const properties = { outputs: Object.keys(outputs) } satisfies PercentageProperties;
      const element: ElementDraft = {
        id,
        type: "percentage",
        properties,
        outputs: new Map(),
        requiredOutputs: properties.outputs,
      };
      elements.push(element);
      for (const [outputName, target] of Object.entries(outputs)) {
        element.outputs.set(outputName, resolveTarget(target, `${id}-${sanitizeIdPart(outputName)}`));
      }
      return;
    }

    const { buckets, ...outputs } = node.fractional;
    const outputNames = buckets.map(formatPercentageBucket);
    const element: ElementDraft = {
      id,
      type: "percentage",
      properties: { buckets } satisfies FractionalProperties,
      outputs: new Map(),
      requiredOutputs: outputNames,
    };
    elements.push(element);
    for (const [outputName, target] of Object.entries(outputs)) {
      const resolvedOutputName = outputNames[Number(outputName.slice(6))] ?? outputName;
      element.outputs.set(
        resolvedOutputName,
        resolveTarget(target, `${id}-${sanitizeIdPart(resolvedOutputName)}`),
      );
    }
  }

  startElement.outputs.set("next", resolveTarget(rawRoute.start, "start-next"));

  for (const [id, node] of Object.entries(rawRoute.nodes)) {
    addNode(id, node);
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

export function formatYamlRoute(source: string): string {
  const route = parseYamlRoute(source);
  return stringify(route, {
    indent: 2,
    lineWidth: 0,
    sortMapEntries: false,
  });
}

export function validateYamlRoute(source: string): YamlDiagnostic[] {
  const parsed = parseYamlSourceSafe(source);
  const parseDiagnostics = getParseDiagnostics(parsed);
  if (parseDiagnostics.length > 0) {
    return parseDiagnostics;
  }

  if (parsed === undefined) {
    return [
      {
        message: "Invalid YAML route.",
        line: 0,
        column: 0,
        severity: "error",
      },
    ];
  }

  let route: YamlRoute;
  const routeResult = YamlRouteSchema.safeParse(parsed.value);

  if (!routeResult.success) {
    return routeResult.error.issues.map((issue) => {
      const position = locateYamlPath(source, parsed.document, issue.path);
      return {
        message: `${formatPath(issue.path)}${issue.message}`,
        line: position.line,
        column: position.column,
        severity: "error",
      };
    });
  }

  route = routeResult.data;

  try {
    const graphIssues = validateRouteGraph(yamlRouteToGraph(route));
    return graphIssues.map((issue) => ({
      message: issue,
      line: 0,
      column: 0,
      severity: "error",
    }));
  } catch (error) {
    return [
      {
        message: error instanceof Error ? error.message : "Invalid YAML route.",
        line: 0,
        column: 0,
        severity: "error",
      },
    ];
  }
}

function parseYamlSource(source: string): ParsedYamlSource {
  const document = parseDocument(source, {
    prettyErrors: false,
    strict: true,
  });

  if (document.errors.length > 0) {
    throw document.errors[0];
  }

  return {
    document,
    value: document.toJSON(),
  };
}

function parseYamlSourceSafe(source: string): ParsedYamlSource | undefined {
  try {
    const document = parseDocument(source, {
      prettyErrors: false,
      strict: true,
    });

    return {
      document,
      value: document.toJSON(),
    };
  } catch {
    return undefined;
  }
}

function getParseDiagnostics(parsed: ParsedYamlSource | undefined): YamlDiagnostic[] {
  if (parsed === undefined) {
    return [
      {
        message: "Unable to parse YAML document.",
        line: 0,
        column: 0,
        severity: "error",
      },
    ];
  }

  return parsed.document.errors.map((error) => {
    const linePosition = "linePos" in error ? error.linePos?.[0] : undefined;
    return {
      message: error.message,
      line: Math.max((linePosition?.line ?? 1) - 1, 0),
      column: Math.max((linePosition?.col ?? 1) - 1, 0),
      severity: "error",
    };
  });
}

function locateYamlPath(
  source: string,
  document: Document.Parsed,
  path: (string | number)[],
): { line: number; column: number } {
  const node = document.getIn(path, true) as { range?: [number, number, number] } | undefined;
  const offset = node?.range?.[0];

  if (offset === undefined) {
    return { line: 0, column: 0 };
  }

  return offsetToPosition(source, offset);
}

function offsetToPosition(source: string, offset: number): { line: number; column: number } {
  let line = 0;
  let column = 0;

  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") {
      line += 1;
      column = 0;
    } else {
      column += 1;
    }
  }

  return { line, column };
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

function reserveInlineId(preferredId: string, usedIds: Set<string>): string {
  const baseId = sanitizeIdPart(preferredId);
  let candidate = baseId;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

function sanitizeIdPart(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "node";
}

function makeModelConfigJsonSchema(): object {
  return {
    type: "object",
    required: ["provider", "model", "timeout", "retries"],
    additionalProperties: false,
    properties: {
      provider: { type: "string", minLength: 1 },
      model: { type: "string", minLength: 1 },
      timeout: { type: "number", exclusiveMinimum: 0 },
      retries: { type: "integer", minimum: 0 },
    },
  };
}

function makeTargetJsonSchema(description?: string): object {
  return {
    ...(description === undefined ? {} : { description }),
    oneOf: [{ type: "string", minLength: 1 }, { type: "object" }],
  };
}

function makeConditionsJsonSchema(): object {
  return {
    type: "object",
    additionalProperties: {
      type: "object",
      minProperties: 1,
      additionalProperties: false,
      properties: {
        $eq: {},
        $neq: {},
        $gt: {},
        $lt: {},
        $in: {},
        $contains: {},
      },
    },
  };
}

function makeNodeJsonSchema(): object {
  return {
    oneOf: [
      {
        type: "object",
        required: ["model"],
        additionalProperties: false,
        properties: {
          model: {
            allOf: [
              makeModelConfigJsonSchema(),
              {
                type: "object",
                required: ["success", "fallback"],
                properties: {
                  success: makeTargetJsonSchema(),
                  fallback: makeTargetJsonSchema(),
                },
              },
            ],
          },
        },
      },
      {
        type: "object",
        required: ["model", "success", "fallback"],
        additionalProperties: false,
        properties: {
          model: { type: "string", minLength: 1 },
          success: makeTargetJsonSchema(),
          fallback: makeTargetJsonSchema(),
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
              conditions: makeConditionsJsonSchema(),
              true: makeTargetJsonSchema(),
              false: makeTargetJsonSchema(),
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
              success: makeTargetJsonSchema(),
              fallback: makeTargetJsonSchema(),
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
            additionalProperties: makeTargetJsonSchema(),
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
              "^bucket\\d+$": makeTargetJsonSchema(),
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
  };
}
