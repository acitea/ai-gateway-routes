export type ElementType =
  | "start"
  | "end"
  | "conditional"
  | "model"
  | "percentage"
  | "rate";

export type OutputRef = {
  elementId: string;
};

export type ComparisonOperator =
  | "$eq"
  | "$neq"
  | "$gt"
  | "$lt"
  | "$in"
  | "$contains";

export type ConditionExpression = Partial<Record<ComparisonOperator, unknown>>;

export type Conditions = Record<string, ConditionExpression>;

export type ConditionalProperties = {
  conditions: Conditions;
};

export type ModelProperties = {
  provider: string;
  model: string;
  timeout: number;
  retries: number;
};

export type FractionalProperties<TBuckets extends readonly number[] = readonly number[]> = {
  buckets: TBuckets;
};

export type PercentageProperties<TOutputs extends readonly string[] = readonly string[]> = {
  outputs: TOutputs;
};

export type RateProperties = {
  limitType: "count" | "cost";
  key: string;
  limit: number;
  window: number;
};

export type StartElement = {
  id: string;
  type: "start";
  outputs: {
    next: OutputRef;
  };
};

export type EndElement = {
  id: string;
  type: "end";
  outputs: Record<string, never>;
};

export type ConditionalElement = {
  id: string;
  type: "conditional";
  properties: ConditionalProperties;
  outputs: {
    true: OutputRef;
    false: OutputRef;
  };
};

export type ModelElement = {
  id: string;
  type: "model";
  properties: ModelProperties;
  outputs: {
    success: OutputRef;
    fallback: OutputRef;
  };
};

export type FractionalElement = {
  id: string;
  type: "percentage";
  outputs: Record<string, OutputRef>;
};

export type PercentageElement = FractionalElement;

export type RateElement = {
  id: string;
  type: "rate";
  properties: RateProperties;
  outputs: {
    success: OutputRef;
    fallback: OutputRef;
  };
};

export type RouteElement =
  | StartElement
  | EndElement
  | ConditionalElement
  | ModelElement
  | PercentageElement
  | RateElement;

export type CompiledRoute = {
  name: string;
  elements: RouteElement[];
};

export type ElementDraft = {
  id: string;
  type: ElementType;
  properties?: unknown;
  outputs: Map<string, string>;
  requiredOutputs: readonly string[];
};

export type RouteGraph = {
  name: string;
  elements: ElementDraft[];
};

export type TupleIndexes<T extends readonly unknown[]> = Exclude<
  keyof T,
  keyof unknown[]
> &
  `${number}`;

export type BucketIndex<TBuckets extends readonly number[]> = number extends TBuckets["length"]
  ? number
  : TupleIndexes<TBuckets> extends infer TIndex
    ? TIndex extends `${infer TNumber extends number}`
      ? TNumber
      : never
    : never;

export type BucketName<TBuckets extends readonly number[]> = number extends TBuckets["length"]
  ? `bucket${number}`
  : `bucket${TupleIndexes<TBuckets>}`;

export type DeployOptions = {
  accountId: string;
  gatewayId: string;
  apiToken: string;
  baseUrl?: string;
  fetch?: typeof fetch;
};
