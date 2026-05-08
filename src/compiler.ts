import type {
  CompiledRoute,
  ConditionalElement,
  ElementDraft,
  FractionalProperties,
  FractionalElement,
  ModelElement,
  RateElement,
  RouteElement,
  RouteGraph,
  StartElement,
} from "./types";
import { CloudflareRouteSchema } from "./validator";

export class RouteValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid AI Gateway route:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "RouteValidationError";
    this.issues = issues;
  }
}

export function compileRoute(graph: RouteGraph): CompiledRoute {
  const issues = validateRouteGraph(graph);

  if (issues.length > 0) {
    throw new RouteValidationError(issues);
  }

  const route: CompiledRoute = {
    name: graph.name,
    elements: graph.elements.map(toRouteElement),
  };

  return CloudflareRouteSchema.parse(route) as CompiledRoute;
}

export function validateRouteGraph(graph: RouteGraph): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const elementsById = new Map<string, ElementDraft>();

  for (const element of graph.elements) {
    if (ids.has(element.id)) {
      issues.push(`Duplicate element id "${element.id}".`);
      continue;
    }

    ids.add(element.id);
    elementsById.set(element.id, element);
  }

  const starts = graph.elements.filter((element) => element.type === "start");
  const ends = graph.elements.filter((element) => element.type === "end");

  if (starts.length !== 1) {
    issues.push(`Expected exactly one start element, found ${starts.length}.`);
  }

  if (ends.length !== 1) {
    issues.push(`Expected exactly one end element, found ${ends.length}.`);
  }

  for (const element of graph.elements) {
    for (const outputName of element.requiredOutputs) {
      if (!element.outputs.has(outputName)) {
        issues.push(`Element "${element.id}" is missing required output "${outputName}".`);
      }
    }

    for (const outputName of element.outputs.keys()) {
      if (!element.requiredOutputs.includes(outputName)) {
        issues.push(`Element "${element.id}" has invalid output "${outputName}".`);
      }
    }

    if (element.type === "percentage") {
      validateFractionalElement(element, issues);
    }

    for (const [outputName, targetId] of element.outputs) {
      if (!elementsById.has(targetId)) {
        issues.push(
          `Element "${element.id}" output "${outputName}" references missing element "${targetId}".`,
        );
      }
    }
  }

  if (!elementsById.has("start")) {
    return issues;
  }

  const reachable = getReachableElementIds(elementsById, "start");
  for (const element of graph.elements) {
    if (!reachable.has(element.id)) {
      issues.push(`Element "${element.id}" is not reachable from start.`);
    }
  }

  const cycle = findCycle(elementsById, "start");
  if (cycle.length > 0) {
    issues.push(`Route contains a cycle: ${cycle.join(" -> ")}.`);
  }

  return issues;
}

function validateFractionalElement(element: ElementDraft, issues: string[]): void {
  const properties = element.properties as FractionalProperties | undefined;
  const buckets = properties?.buckets;

  if (buckets !== undefined) {
    if (!Array.isArray(buckets) || buckets.length === 0) {
      issues.push(`Percentage element "${element.id}" must define at least one bucket.`);
      return;
    }

    const sum = buckets.reduce((total, bucket) => total + bucket, 0);
    if (Math.abs(sum - 1) > 0.000001) {
      issues.push(`Percentage element "${element.id}" buckets must sum to 1.`);
    }

    for (const [index, bucket] of buckets.entries()) {
      if (!Number.isFinite(bucket) || bucket < 0) {
        issues.push(`Percentage element "${element.id}" bucket ${index} must be a non-negative number.`);
      }
    }
  }
}

function getReachableElementIds(
  elementsById: ReadonlyMap<string, ElementDraft>,
  startId: string,
): Set<string> {
  const reachable = new Set<string>();
  const stack = [startId];

  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || reachable.has(id)) {
      continue;
    }

    reachable.add(id);
    const element = elementsById.get(id);
    if (element === undefined) {
      continue;
    }

    for (const targetId of element.outputs.values()) {
      stack.push(targetId);
    }
  }

  return reachable;
}

function findCycle(elementsById: ReadonlyMap<string, ElementDraft>, startId: string): string[] {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];

  function visit(id: string): string[] {
    if (visiting.has(id)) {
      const cycleStart = path.indexOf(id);
      return [...path.slice(cycleStart), id];
    }

    if (visited.has(id)) {
      return [];
    }

    const element = elementsById.get(id);
    if (element === undefined) {
      return [];
    }

    visiting.add(id);
    path.push(id);

    for (const targetId of element.outputs.values()) {
      const cycle = visit(targetId);
      if (cycle.length > 0) {
        return cycle;
      }
    }

    path.pop();
    visiting.delete(id);
    visited.add(id);
    return [];
  }

  return visit(startId);
}

function toRouteElement(element: ElementDraft): RouteElement {
  const outputs = Object.fromEntries(
    [...element.outputs.entries()].map(([name, elementId]) => [name, { elementId }]),
  );

  switch (element.type) {
    case "start":
      return {
        id: element.id,
        type: "start",
        outputs: outputs as StartElement["outputs"],
      };
    case "end":
      return {
        id: element.id,
        type: "end",
        outputs: {},
      };
    case "conditional":
      return {
        id: element.id,
        type: "conditional",
        properties: element.properties as ConditionalElement["properties"],
        outputs: outputs as ConditionalElement["outputs"],
      };
    case "model":
      return {
        id: element.id,
        type: "model",
        properties: element.properties as ModelElement["properties"],
        outputs: outputs as ModelElement["outputs"],
      };
    case "percentage":
      return {
        id: element.id,
        type: "percentage",
        outputs: outputs as FractionalElement["outputs"],
      };
    case "rate":
      return {
        id: element.id,
        type: "rate",
        properties: element.properties as RateElement["properties"],
        outputs: outputs as RateElement["outputs"],
      };
  }
}
