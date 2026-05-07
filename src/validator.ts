import { z } from "zod";

const OutputRefSchema = z
  .object({
    elementId: z.string().min(1),
  })
  .strict();

export const ConditionExpressionSchema = z
  .object({
    $eq: z.unknown().optional(),
    $neq: z.unknown().optional(),
    $gt: z.unknown().optional(),
    $lt: z.unknown().optional(),
    $in: z.unknown().optional(),
    $contains: z.unknown().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "A condition expression must include at least one operator.",
  });

export const ConditionsSchema = z.record(z.string().min(1), ConditionExpressionSchema);

export const StartElementSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("start"),
    outputs: z
      .object({
        next: OutputRefSchema,
      })
      .strict(),
  })
  .strict();

export const EndElementSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("end"),
    outputs: z.object({}).strict(),
  })
  .strict();

export const ConditionalElementSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("conditional"),
    properties: z
      .object({
        conditions: ConditionsSchema.optional(),
      })
      .strict(),
    outputs: z
      .object({
        true: OutputRefSchema,
        false: OutputRefSchema,
      })
      .strict(),
  })
  .strict();

export const ModelElementSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("model"),
    properties: z
      .object({
        provider: z.string().min(1),
        model: z.string().min(1),
        timeout: z.number().positive(),
        retries: z.number().int().nonnegative(),
      })
      .strict(),
    outputs: z
      .object({
        success: OutputRefSchema,
        fallback: OutputRefSchema,
      })
      .strict(),
  })
  .strict();

export const PercentageElementSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("percentage"),
    outputs: z.record(OutputRefSchema),
  })
  .strict();

export const FractionalElementSchema = PercentageElementSchema;

export const RateElementSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("rate"),
    properties: z
      .object({
        limitType: z.enum(["count", "cost"]),
        key: z.string().min(1),
        limit: z.number().positive(),
        window: z.number().positive(),
      })
      .strict(),
    outputs: z
      .object({
        success: OutputRefSchema,
        fallback: OutputRefSchema,
      })
      .strict(),
  })
  .strict();

export const RouteElementSchema = z.union([
  StartElementSchema,
  EndElementSchema,
  ConditionalElementSchema,
  ModelElementSchema,
  PercentageElementSchema,
  RateElementSchema,
]);

export const CloudflareRouteSchema = z
  .object({
    name: z.string().min(1),
    elements: z.array(RouteElementSchema).min(2),
  })
  .strict()
  .superRefine((route, context) => {
    const ids = new Set<string>();
    let startCount = 0;
    let endCount = 0;

    for (const [index, element] of route.elements.entries()) {
      if (ids.has(element.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["elements", index, "id"],
          message: `Duplicate element id "${element.id}".`,
        });
      }

      ids.add(element.id);

      if (element.type === "start") {
        startCount += 1;
      }

      if (element.type === "end") {
        endCount += 1;
      }
    }

    if (startCount !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["elements"],
        message: `Expected exactly one start element, found ${startCount}.`,
      });
    }

    if (endCount !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["elements"],
        message: `Expected exactly one end element, found ${endCount}.`,
      });
    }

    for (const [index, element] of route.elements.entries()) {
      const outputs = element.outputs as Record<string, { elementId: string }>;

      for (const [outputName, output] of Object.entries(outputs)) {
        if (!ids.has(output.elementId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["elements", index, "outputs", outputName, "elementId"],
            message: `Output references missing element "${output.elementId}".`,
          });
        }
      }
    }
  });

export type CloudflareRoute = z.infer<typeof CloudflareRouteSchema>;
export type CloudflareRouteElement = z.infer<typeof RouteElementSchema>;

export function validateCompiledRoute(value: unknown): CloudflareRoute {
  return CloudflareRouteSchema.parse(value);
}
