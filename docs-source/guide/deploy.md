# Deploy

Credentials can come from environment variables:

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
