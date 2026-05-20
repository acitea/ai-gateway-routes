# ai-gateway-routes

YAML tooling for Cloudflare AI Gateway dynamic routes.

Write a readable route file, check it locally, preview the flow, then deploy it directly or generate Terraform config.

This project is not affiliated with or endorsed by Cloudflare, Inc. Cloudflare and Cloudflare AI Gateway are trademarks and/or registered trademarks of Cloudflare, Inc.

## Install

```sh
npm install -g ai-gateway-routes
```

For project-local CI usage:

```sh
npm install --save-dev ai-gateway-routes
```

## Quick Start

```yaml
# auth-router.ai-gateway-route.yaml
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
      true:
        model: openai
        success: end
        fallback: nvidia
      false: nvidia

  nvidia:
    model: nvidia
    success: end
    fallback: end
```

```sh
ai-gateway-routes check auth-router.ai-gateway-route.yaml
ai-gateway-routes compile auth-router.ai-gateway-route.yaml -o route.json
ai-gateway-routes visualize auth-router.ai-gateway-route.yaml -o route.mmd
```

## Commands

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

`check` is quiet for CI. `validate` prints a success message. `compile` emits Cloudflare API JSON. `terraform` emits Terraform `.tf.json`.

## Route Files

Routes use four top-level keys:

- `name`: Cloudflare dynamic route name.
- `start`: first node ID.
- `models`: reusable model catalog. Model entries may define `success` and `fallback` defaults.
- `nodes`: route flow.

`end` is built in.

Prefer the readable YAML style: keep model configuration and fallback chains in `models`, and use named inline branch targets for local if/else logic. This keeps the route file close to how people reason about routing decisions while still compiling to Cloudflare's explicit element graph.

Supported node types:

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
      # values must sum to 1
      buckets: [0.25, 0.75]
      bucket0: control
      bucket1: treatment
```

Outputs can point to an existing node ID or contain an inline node.
If an output points to a model name that is not also a top-level node ID, the compiler creates a model node from `models`.

The original 1:1 graph mapping is still supported. You can define every Cloudflare route element under `nodes` with explicit `success`, `fallback`, `true`, and `false` outputs when you want direct control over the compiled graph.

Recommended style:

```yaml
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

The `true` branch above defines a named inline conditional. That node is local to the branch in the YAML, but it compiles into a normal Cloudflare route element named `require-advanced-enabled`.

## Deploy

```sh
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_GATEWAY_ID=...
CLOUDFLARE_API_TOKEN=...

ai-gateway-routes deploy auth-router.ai-gateway-route.yaml
```

Flags are also supported:

```sh
ai-gateway-routes deploy auth-router.ai-gateway-route.yaml \
  --account-id "$CLOUDFLARE_ACCOUNT_ID" \
  --gateway-id "$CLOUDFLARE_GATEWAY_ID" \
  --api-token "$CLOUDFLARE_API_TOKEN"
```

If `wrangler` is installed and logged in, the CLI can infer `accountId`. `gatewayId` and `apiToken` still need to come from flags or environment variables.

`deploy` is idempotent by route name. If a route with the same `name` already exists in the gateway, the CLI creates a new route version and deploys it instead of creating a duplicate route.

This matters because Cloudflare's create route endpoint only handles the first deploy. Updating an existing dynamic route requires creating a new route version and deploying that version, which this CLI now does automatically.

## Terraform

Cloudflare's Terraform provider supports AI Gateway routes through `cloudflare_ai_gateway_dynamic_routing`.

```sh
ai-gateway-routes terraform auth-router.ai-gateway-route.yaml -o ai-gateway-route.tf.json
terraform plan
terraform apply
```

Declare the provider in your Terraform project:

```hcl
terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.19"
    }
  }
}
```

## VS Code

An experimental VS Code extension is included in `vscode/` and is intended to be published separately. It adds diagnostics, flow preview, JSON compilation, and Mermaid copy commands for:

- `*.ai-gateway-route.yaml`
- `*.ai-gateway-route.yml`
- `*.agroute.yaml`
- `*.agroute.yml`

## TypeScript

The YAML workflow is the main interface. For generated routes or library usage, see [docs/typescript.md](docs/typescript.md).

## Notes

The package validates routes before producing output. It catches broken connections, missing outputs, cycles, invalid fractional buckets, and schema mismatches before the route reaches Cloudflare or Terraform.

Refresh the Cloudflare API schema snapshot with:

```sh
npm run schema:update
```

## Development

Building from source requires Node.js and Bun.

```sh
npm install
npm run ci
```
