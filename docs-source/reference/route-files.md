# Route files

Cloudflare Dynamic Routing defines route concepts, node types, versions, and deployments. See the [Dynamic Routing documentation](https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/) for platform details.

Routes use four top-level keys:

| Key | Purpose |
| --- | --- |
| `name` | Cloudflare dynamic route name. |
| `start` | First node ID or inline target. |
| `models` | Reusable model catalog. Model entries may define `success` and `fallback` defaults. |
| `nodes` | Route flow. |

`end` is built in.

Outputs can point to an existing node ID or contain an inline node. If an output points to a model name that is not also a top-level node ID, the compiler creates a model node from `models`.

## Supported node types

```yaml
nodes:
  choose:
    conditional:
      conditions:
        metadata.signed_in:
          $eq: true
      true: openai
      false: nvidia

  openai:
    model: openai
    fallback: nvidia

  limit:
    rate:
      limitType: count
      key: metadata.user_id
      limit: 100
      window: 60
      success: openai
      fallback: end

  split:
    fractional:
      buckets: [0.25, 0.75]
      bucket0: control
      bucket1: treatment
```

The original 1:1 graph mapping is still supported for users who want direct control over compiled graph structure.
