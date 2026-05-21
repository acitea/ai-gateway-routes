# Commands

For the Cloudflare API surface that `deploy` talks to, see Cloudflare's [Dynamic Routing API reference](https://developers.cloudflare.com/api/resources/ai_gateway/subresources/dynamic_routing/).

```sh
ai-gateway-routes check <route.yaml>
ai-gateway-routes validate <route.yaml>
ai-gateway-routes format <route.yaml> [--write | -o route.yaml]
ai-gateway-routes compile <route.yaml> [-o route.json]
ai-gateway-routes visualize <route.yaml> [-o route.mmd]
ai-gateway-routes terraform <route.yaml> [-o route.tf.json]
ai-gateway-routes deploy <route.yaml> --gateway-id <id> --api-token <token>
ai-gateway-routes schema [-o ai-gateway-route.schema.json]
```

| Command | Output |
| --- | --- |
| `check` | Quiet validation for CI. |
| `validate` | Validation with a success message. |
| `format` | Stable YAML formatting. |
| `compile` | Cloudflare API JSON. |
| `visualize` | Mermaid flowchart. |
| `terraform` | Terraform `.tf.json`. |
| `deploy` | Cloudflare AI Gateway dynamic route create-or-update. |
| `schema` | YAML route schema. |
