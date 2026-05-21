# Motivation

I made this because AI can already generate a lot of infrastructure code, but reviewing the result is still the hard part.

Cloudflare AI Gateway Dynamic Routing is graph-shaped. That is the right shape for the platform, but the generated JSON can quickly become difficult to review. The decisions I cared about were more semantic:

- if the request asks for an advanced capability, check whether advanced usage is enabled;
- if the user is signed in, use the primary model path;
- if the primary model fails, fall back through the cheaper model chain;
- if traffic is rate-limited, stop before reaching a model;
- if I am testing a model change, split traffic by percentage.

Those rules are easier to review as YAML than as a JSON graph full of repeated `elements`, `outputs`, and generated IDs.

`ai-gateway-routes` is the small authoring layer I wanted:

- keep reusable model configuration in one `models` catalog;
- express route policy with metadata conditions;
- keep fallback chains next to model definitions;
- define branch-local checks with named inline conditionals;
- validate the route locally before deploy;
- compile the readable manifest into Cloudflare's explicit route graph.

## Manifest and compiled graph

The YAML manifest and compiled JSON describe the same route at different layers.

:::: details Compare YAML manifest and compiled graph JSON

::: code-group

```yaml [YAML manifest]
name: capability-router
start: select-advanced

models:
  advanced:
    provider: openai
    model: gpt-4.1
    timeout: 30
    retries: 2
    fallback: basic-groq-llama

  basic-groq-llama:
    provider: groq
    model: llama-3.1-8b
    timeout: 30
    retries: 2
    fallback: basic-openrouter-qwen

  basic-openrouter-qwen:
    provider: openrouter
    model: qwen/qwen3
    timeout: 30
    retries: 2

nodes:
  select-advanced:
    conditional:
      conditions:
        metadata.capability:
          $eq: ai.query.advanced
      true:
        - name: require-advanced-enabled
          conditional:
            conditions:
              metadata.advanced_allowed:
                $eq: true
            true: advanced
            false: basic-groq-llama
      false: basic-groq-llama
```

```json [Compiled graph JSON]
{
  "name": "capability-router",
  "elements": [
    {
      "id": "start",
      "type": "start",
      "outputs": {
        "next": { "elementId": "select-advanced" }
      }
    },
    {
      "id": "select-advanced",
      "type": "conditional",
      "properties": {
        "conditions": {
          "metadata.capability": { "$eq": "ai.query.advanced" }
        }
      },
      "outputs": {
        "true": { "elementId": "require-advanced-enabled" },
        "false": { "elementId": "basic-groq-llama" }
      }
    },
    {
      "id": "require-advanced-enabled",
      "type": "conditional",
      "properties": {
        "conditions": {
          "metadata.advanced_allowed": { "$eq": true }
        }
      },
      "outputs": {
        "true": { "elementId": "advanced" },
        "false": { "elementId": "basic-groq-llama" }
      }
    },
    {
      "id": "advanced",
      "type": "model",
      "properties": {
        "provider": "openai",
        "model": "gpt-4.1",
        "timeout": 30,
        "retries": 2
      },
      "outputs": {
        "success": { "elementId": "end" },
        "fallback": { "elementId": "basic-groq-llama" }
      }
    },
    {
      "id": "basic-groq-llama",
      "type": "model",
      "properties": {
        "provider": "groq",
        "model": "llama-3.1-8b",
        "timeout": 30,
        "retries": 2
      },
      "outputs": {
        "success": { "elementId": "end" },
        "fallback": { "elementId": "basic-openrouter-qwen" }
      }
    },
    {
      "id": "basic-openrouter-qwen",
      "type": "model",
      "properties": {
        "provider": "openrouter",
        "model": "qwen/qwen3",
        "timeout": 30,
        "retries": 2
      },
      "outputs": {
        "success": { "elementId": "end" },
        "fallback": { "elementId": "end" }
      }
    },
    {
      "id": "end",
      "type": "end",
      "outputs": {}
    }
  ]
}
```

:::

::::

## Design goals

- Keep route files close to how people reason about routing decisions.
- Preserve the original explicit graph mapping for users who want direct control.
- Make CI checks quiet and deterministic.
- Keep deploys repeatable by updating an existing route by name.
- Avoid hiding Cloudflare concepts: `model`, `conditional`, `rate`, `fractional`, `success`, `fallback`, `true`, and `false` still map to route graph behavior.

## Main workflow

```sh
npm install -g ai-gateway-routes
ai-gateway-routes check route.ai-gateway-route.yaml
ai-gateway-routes visualize route.ai-gateway-route.yaml -o route.mmd
ai-gateway-routes compile route.ai-gateway-route.yaml -o route.json
```

For production changes, keep the YAML file in the same review path as application code and run `check` in CI.

## Cloudflare references

Useful Cloudflare references for AI Gateway setup and Dynamic Routing:

- [Cloudflare AI Gateway overview](https://developers.cloudflare.com/ai-gateway/)
- [Dynamic Routing feature guide](https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/)
- [Using a dynamic route](https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/usage/)
- [Custom metadata](https://developers.cloudflare.com/ai-gateway/configuration/custom-metadata/)
- [Authenticated Gateway](https://developers.cloudflare.com/ai-gateway/configuration/authentication/)
- [BYOK / Store Keys](https://developers.cloudflare.com/ai-gateway/configuration/bring-your-own-keys/)
