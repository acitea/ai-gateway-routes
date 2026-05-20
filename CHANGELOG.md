# Changelog

## 0.2.0

- Made `deploy` create-or-update by route name. Re-running deploy for an existing route now creates and deploys a new Cloudflare AI Gateway route version instead of trying to create a duplicate route.
- Added Cloudflare API error details to deploy failures so validation errors like HTTP 400 include the response body instead of only the status code.
- Documented the redeploy behavior because the first `deploy` call succeeds, while a later update to the same route name needs Cloudflare's version/deployment API flow.
- Added a recommended readable YAML style: named inline branch targets for local if/else logic, plus model-level `success` and `fallback` defaults in the top-level `models` catalog.
- String targets that match a model name now compile that model into the route graph, which keeps fallback chains with the model definitions instead of repeating one node per model.
- Kept the original 1:1 graph mapping supported. Existing route files with top-level model nodes and explicit `success`/`fallback`/`true`/`false` targets continue to compile.

## 0.1.0

- Initial package with TypeScript builder DSL.
- YAML manifest compiler and validator.
- CLI for validate, compile, visualize, schema, deploy, check, and format.
- VSCode extension scaffold with diagnostics and flow preview.
- Cloudflare OpenAPI route schema snapshot tooling.
