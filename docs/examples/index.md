# Manifest styles

The YAML parser supports more than one authoring style. Use the direct graph style when you want a 1:1 mapping to Cloudflare route elements. Use the readable style when you want the manifest to describe the routing policy more naturally.

## Direct graph style

This is close to the compiled route graph. Every node is declared explicitly.

```yaml
name: auth-router
start: check-auth

models:
  openai:
    provider: openai
    model: gpt-4.1-mini
    timeout: 30
    retries: 2

  nvidia:
    provider: custom-nvidia
    model: nvidia/llama-3.1-nemotron-nano-8b-v1
    timeout: 30
    retries: 2

nodes:
  check-auth:
    conditional:
      conditions:
        metadata.signed_in:
          $eq: true
      true: openai
      false: nvidia

  openai:
    model: openai
    success: end
    fallback: nvidia

  nvidia:
    model: nvidia
    success: end
    fallback: end
```

Use this style when you want stable node IDs for every graph element.

## Inline branch style

Inline targets keep branch-specific nodes local to the branch that uses them.

```yaml
name: inline-auth-router
start: check-auth

models:
  openai:
    provider: openai
    model: gpt-4.1-mini
    timeout: 30
    retries: 2

  nvidia:
    provider: custom-nvidia
    model: nvidia/llama-3.1-nemotron-nano-8b-v1
    timeout: 30
    retries: 2

nodes:
  check-auth:
    conditional:
      conditions:
        metadata.signed_in:
          $eq: true
      true:
        model: openai
        success: end
        fallback:
          model: nvidia
          success: end
          fallback: end
      false:
        model: nvidia
        success: end
        fallback: end
```

The compiler gives inline nodes deterministic generated IDs.

## Model catalog fallback style

Model-level `fallback` and `success` defaults keep fallback chains next to model configuration.

```yaml
name: catalog-fallbacks
start: basic-groq-llama

models:
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

nodes: {}
```

If an output points to a model name that is not also a node ID, the compiler creates a model node from `models`.
