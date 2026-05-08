import type { RouteDefinition } from "./builder";
import type { CompiledRoute, RouteElement } from "./types";

type VisualizableRoute = RouteDefinition | CompiledRoute;

export function visualize(route: VisualizableRoute): string {
  const compiled = "compile" in route ? route.compile() : route;
  const lines = ["flowchart TD"];
  const nodeIds = makeNodeIdMap(compiled.elements);

  for (const element of compiled.elements) {
    lines.push(`  ${nodeIds.get(element.id)}${nodeShape(element)}`);
  }

  for (const element of compiled.elements) {
    for (const [outputName, output] of Object.entries(element.outputs)) {
      lines.push(
        `  ${nodeIds.get(element.id)} -->|${escapeLabel(outputName)}| ${nodeIds.get(output.elementId)}`,
      );
    }
  }

  return lines.join("\n");
}

function nodeShape(element: RouteElement): string {
  const label = escapeLabel(element.id);

  switch (element.type) {
    case "start":
      return `([${label}])`;
    case "end":
      return `([${label}])`;
    case "conditional":
      return `{${label}}`;
    case "model":
      return `[${label}]`;
    case "percentage":
      return `{{${label}}}`;
    case "rate":
      return `[/${label}/]`;
  }
}

function makeNodeIdMap(elements: RouteElement[]): Map<string, string> {
  const nodeIds = new Map<string, string>();
  const used = new Set<string>();

  for (const element of elements) {
    const baseId = `node_${element.id.replace(/[^A-Za-z0-9_]/g, "_")}`;
    let candidate = baseId;
    let suffix = 2;

    while (used.has(candidate)) {
      candidate = `${baseId}_${suffix}`;
      suffix += 1;
    }

    used.add(candidate);
    nodeIds.set(element.id, candidate);
  }

  return nodeIds;
}

function escapeLabel(label: string): string {
  return label.replace(/"/g, '\\"');
}
