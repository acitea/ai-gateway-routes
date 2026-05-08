import type { RouteDefinition } from "./builder";
import type { CompiledRoute, RouteElement } from "./types";

type VisualizableRoute = RouteDefinition | CompiledRoute;

export function visualize(route: VisualizableRoute): string {
  const compiled = "compile" in route ? route.compile() : route;
  const lines = ["flowchart TD"];

  for (const element of compiled.elements) {
    lines.push(`  ${nodeId(element.id)}${nodeShape(element)}`);
  }

  for (const element of compiled.elements) {
    for (const [outputName, output] of Object.entries(element.outputs)) {
      lines.push(`  ${nodeId(element.id)} -->|${escapeLabel(outputName)}| ${nodeId(output.elementId)}`);
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

function nodeId(id: string): string {
  return `node_${id.replace(/[^A-Za-z0-9_]/g, "_")}`;
}

function escapeLabel(label: string): string {
  return label.replace(/"/g, '\\"');
}
