# ai-gateway-routes

YAML tooling for Cloudflare AI Gateway dynamic routes.

Write a readable route file, check it locally, preview the flow, then deploy it directly or generate Terraform config.

::: warning Trademark notice
This project is not affiliated with or endorsed by Cloudflare, Inc. Cloudflare and Cloudflare AI Gateway are trademarks and/or registered trademarks of Cloudflare, Inc.
:::

## Install

```sh
npm install -g ai-gateway-routes
```

For project-local CI usage:

```sh
npm install --save-dev ai-gateway-routes
```

## Usage

```sh
ai-gateway-routes <command> <route.yaml> [options]
agr <command> <route.yaml> [options]
```

## Quick route check

```sh
ai-gateway-routes check auth-router.ai-gateway-route.yaml
ai-gateway-routes visualize auth-router.ai-gateway-route.yaml -o route.mmd
ai-gateway-routes compile auth-router.ai-gateway-route.yaml -o route.json
```

## Why the YAML parser exists

Cloudflare AI Gateway dynamic routes are graph-shaped. That is useful at runtime, but it is not always the easiest format to write, review, or update by hand.

The parser gives you a small authoring layer for semantic route policy:

- keep reusable model configuration in one `models` catalog;
- express decisions with metadata conditions such as `metadata.capability` or `metadata.signed_in`;
- keep fallback chains next to model definitions;
- define branch-local checks with named inline conditionals;
- compile the readable YAML into Cloudflare's explicit route graph.

For a deeper explanation, see [Motivation](/guide/).

## Manifest styles

The YAML workflow supports both explicit graph-style manifests and more semantic manifests. Start with [Manifest styles](/examples/) and [Semantic routing](/examples/semantic-routing).

## Cloudflare references

Useful Cloudflare references:

- [AI Gateway overview](https://developers.cloudflare.com/ai-gateway/)
- [Dynamic Routing](https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/)
- [Using a dynamic route](https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/usage/)
- [Dynamic Routing API](https://developers.cloudflare.com/api/resources/ai_gateway/subresources/dynamic_routing/)
- [Terraform `cloudflare_ai_gateway_dynamic_routing`](https://developers.cloudflare.com/api/terraform/resources/ai_gateway/)
