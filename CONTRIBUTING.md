# Contributing

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

Use the example manifest for manual CLI checks:

```sh
node dist/cli.js validate examples/auth-router.ai-gateway-route.yaml
node dist/cli.js compile examples/auth-router.ai-gateway-route.yaml
node dist/cli.js visualize examples/auth-router.ai-gateway-route.yaml
```

## Pull Requests

- Keep changes focused.
- Add tests for new manifest syntax, compiler behavior, and CLI behavior.
- Run `npm run ci` before asking for review.
- Update `README.md` and schemas when the YAML manifest format changes.

## Schema Updates

Cloudflare's route-create schema snapshot is generated from the public OpenAPI spec:

```sh
npm run schema:update
```

The manifest schema is generated from the package itself:

```sh
npm run build
node dist/cli.js schema -o schemas/ai-gateway-route.schema.json
cp schemas/ai-gateway-route.schema.json vscode/schemas/ai-gateway-route.schema.json
```
