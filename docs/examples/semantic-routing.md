# Semantic routing

The readable style is most useful when route decisions are product or application policy, not just graph wiring.

Cloudflare Dynamic Routing supports conditions that can reference request body, headers, or metadata. See Cloudflare's [Dynamic Routing guide](https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/) and [Custom metadata docs](https://developers.cloudflare.com/ai-gateway/configuration/custom-metadata/) for platform details.

This example describes the policy in route terms:

- advanced requests are selected by `metadata.capability`;
- advanced requests must also pass `metadata.advanced_allowed`;
- allowed advanced traffic goes to the `advanced` model;
- blocked or basic traffic goes through the basic fallback chain;
- fallback behavior lives in `models`, not duplicated in each branch.

```yaml
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

The `true` branch defines a named inline conditional. That node is local to the branch in YAML, but compiles into a normal Cloudflare route element named `require-advanced-enabled`.

## Why this form is easier to review

The manifest reads like an `if / else` policy:

```text
if metadata.capability == "ai.query.advanced":
  if metadata.advanced_allowed == true:
    use advanced
  else:
    use basic fallback chain
else:
  use basic fallback chain
```

That is the motivation for the YAML parser: the route source can stay semantic and reviewable while the compiler still produces the explicit graph Cloudflare expects.
