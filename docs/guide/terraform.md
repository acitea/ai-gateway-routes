# Terraform

`ai-gateway-routes terraform` compiles a route manifest into Terraform JSON for Cloudflare's `cloudflare_ai_gateway_dynamic_routing` resource.

Useful Cloudflare references for Terraform fields and provider behavior:

- [Terraform AI Gateway resources](https://developers.cloudflare.com/api/terraform/resources/ai_gateway/)
- [Dynamic Routing](https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/)

## Generate Terraform JSON

```sh
ai-gateway-routes terraform auth-router.ai-gateway-route.yaml -o ai-gateway-route.tf.json
terraform plan
terraform apply
```

## Provider declaration

Declare the Cloudflare provider in your Terraform project:

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

## Literal account and gateway IDs

The CLI can emit literal account and gateway IDs when you want the generated file to be directly runnable:

```sh
ai-gateway-routes terraform auth-router.ai-gateway-route.yaml \
  --account-id "$CLOUDFLARE_ACCOUNT_ID" \
  --gateway-id "$CLOUDFLARE_GATEWAY_ID" \
  -o ai-gateway-route.tf.json
```

Without literal IDs, wire the generated JSON into your existing Terraform variables and provider setup.
