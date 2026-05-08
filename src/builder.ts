import { compileRoute } from "./compiler";
import type {
  BucketIndex,
  BucketName,
  CompiledRoute,
  ConditionalProperties,
  ElementDraft,
  FractionalProperties,
  ModelProperties,
  PercentageProperties,
  RateProperties,
  RouteGraph,
} from "./types";

const RESERVED_ELEMENT_IDS = new Set(["start", "end"]);

export type RoutableNode =
  | ConditionalNode
  | ModelNode
  | FractionalNode<readonly number[]>
  | PercentageNode<readonly string[]>
  | RateNode;

export class RouteDefinition {
  constructor(private readonly graph: RouteGraph) {}

  compile(): CompiledRoute {
    return compileRoute(this.graph);
  }

  toGraph(): RouteGraph {
    return {
      name: this.graph.name,
      elements: this.graph.elements.map((element) => ({
        ...element,
        outputs: new Map(element.outputs),
      })),
    };
  }
}

export function defineRoute(
  name: string,
  define: (builder: RouteBuilder) => void,
): RouteDefinition {
  const builder = new RouteBuilder(name);
  define(builder);
  return builder.route();
}

export class RouteBuilder {
  private readonly elements = new Map<string, ElementDraft>();

  constructor(private readonly name: string) {
    this.elements.set("start", {
      id: "start",
      type: "start",
      outputs: new Map(),
      requiredOutputs: ["next"],
    });
    this.elements.set("end", {
      id: "end",
      type: "end",
      outputs: new Map(),
      requiredOutputs: [],
    });
  }

  fromStart(): StartNode {
    return new StartNode(this);
  }

  conditional(id: string, properties: ConditionalProperties): ConditionalNode {
    this.addElement({
      id,
      type: "conditional",
      properties,
      outputs: new Map(),
      requiredOutputs: ["true", "false"],
    });
    return new ConditionalNode(this, id);
  }

  model(id: string, properties: ModelProperties): ModelNode {
    this.addElement({
      id,
      type: "model",
      properties,
      outputs: new Map(),
      requiredOutputs: ["success", "fallback"],
    });
    return new ModelNode(this, id);
  }

  fractional<const TBuckets extends readonly number[]>(
    id: string,
    properties: FractionalProperties<TBuckets>,
  ): FractionalNode<TBuckets> {
    const requiredOutputs = properties.buckets.map(formatPercentageBucket);
    this.addElement({
      id,
      type: "percentage",
      properties,
      outputs: new Map(),
      requiredOutputs,
    });
    return new FractionalNode<TBuckets>(this, id, requiredOutputs);
  }

  percentage<const TOutputs extends readonly string[]>(
    id: string,
    properties: PercentageProperties<TOutputs>,
  ): PercentageNode<TOutputs> {
    this.addElement({
      id,
      type: "percentage",
      properties,
      outputs: new Map(),
      requiredOutputs: properties.outputs,
    });
    return new PercentageNode<TOutputs>(this, id);
  }

  rate(id: string, properties: RateProperties): RateNode {
    this.addElement({
      id,
      type: "rate",
      properties,
      outputs: new Map(),
      requiredOutputs: ["success", "fallback"],
    });
    return new RateNode(this, id);
  }

  route(): RouteDefinition {
    const start = this.getElement("start");
    const end = this.getElement("end");
    const userElements = [...this.elements.values()].filter(
      (element) => element.id !== "start" && element.id !== "end",
    );

    return new RouteDefinition({
      name: this.name,
      elements: [start, ...userElements, end],
    });
  }

  connect(sourceId: string, outputName: string, targetId: string): void {
    const source = this.getElement(sourceId);
    this.getElement(targetId);

    if (!source.requiredOutputs.includes(outputName)) {
      throw new Error(`Element "${sourceId}" does not have output "${outputName}".`);
    }

    source.outputs.set(outputName, targetId);
  }

  private addElement(element: ElementDraft): void {
    if (RESERVED_ELEMENT_IDS.has(element.id)) {
      throw new Error(`Element id "${element.id}" is reserved.`);
    }

    if (this.elements.has(element.id)) {
      throw new Error(`Element id "${element.id}" is already defined.`);
    }

    this.elements.set(element.id, element);
  }

  private getElement(id: string): ElementDraft {
    const element = this.elements.get(id);
    if (element === undefined) {
      throw new Error(`Element "${id}" is not defined.`);
    }

    return element;
  }
}

export class OutputConnector<TSource> {
  constructor(
    private readonly builder: RouteBuilder,
    private readonly source: TSource & { id: string },
    private readonly outputName: string,
  ) {}

  to<TTarget extends RoutableNode>(target: TTarget): TTarget {
    this.builder.connect(this.source.id, this.outputName, target.id);
    return target;
  }

  toEnd(): TSource {
    this.builder.connect(this.source.id, this.outputName, "end");
    return this.source;
  }
}

export class StartNode {
  readonly id = "start";

  constructor(private readonly builder: RouteBuilder) {}

  to<TTarget extends RoutableNode>(target: TTarget): TTarget {
    this.builder.connect(this.id, "next", target.id);
    return target;
  }
}

export class ConditionalNode {
  constructor(
    private readonly builder: RouteBuilder,
    readonly id: string,
  ) {}

  onTrue(): OutputConnector<this> {
    return new OutputConnector(this.builder, this, "true");
  }

  onFalse(): OutputConnector<this> {
    return new OutputConnector(this.builder, this, "false");
  }
}

export class ModelNode {
  constructor(
    private readonly builder: RouteBuilder,
    readonly id: string,
  ) {}

  onSuccess(): OutputConnector<this> {
    return new OutputConnector(this.builder, this, "success");
  }

  onFallback(): OutputConnector<this> {
    return new OutputConnector(this.builder, this, "fallback");
  }
}

export class FractionalNode<TBuckets extends readonly number[]> {
  constructor(
    private readonly builder: RouteBuilder,
    readonly id: string,
    private readonly outputNames: readonly string[],
  ) {}

  onBucket(index: BucketIndex<TBuckets>): OutputConnector<this> {
    return new OutputConnector(this.builder, this, this.outputNameForIndex(index));
  }

  on<TBucket extends BucketName<TBuckets>>(bucket: TBucket): OutputConnector<this> {
    return new OutputConnector(this.builder, this, this.outputNameForIndex(Number(bucket.slice(6))));
  }

  private outputNameForIndex(index: number): string {
    const outputName = this.outputNames[index];
    if (outputName === undefined) {
      throw new Error(`Fractional element "${this.id}" does not have bucket ${index}.`);
    }

    return outputName;
  }
}

export class PercentageNode<TOutputs extends readonly string[]> {
  constructor(
    private readonly builder: RouteBuilder,
    readonly id: string,
  ) {}

  on<TOutput extends TOutputs[number]>(outputName: TOutput): OutputConnector<this> {
    return new OutputConnector(this.builder, this, outputName);
  }
}

export class RateNode {
  constructor(
    private readonly builder: RouteBuilder,
    readonly id: string,
  ) {}

  onSuccess(): OutputConnector<this> {
    return new OutputConnector(this.builder, this, "success");
  }

  onFallback(): OutputConnector<this> {
    return new OutputConnector(this.builder, this, "fallback");
  }
}

function formatPercentageBucket(bucket: number): string {
  const percentage = bucket * 100;
  return `${Number.isInteger(percentage) ? percentage : percentage.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}%`;
}
