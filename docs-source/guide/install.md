# Install and usage

Install globally for terminal usage:

```sh
npm install -g ai-gateway-routes
```

Install as a project-local development dependency for CI:

```sh
npm install --save-dev ai-gateway-routes
```

## Usage

```sh
ai-gateway-routes <command> <route.yaml> [options]
```

The package also exposes the shorter binary alias:

```sh
agr <command> <route.yaml> [options]
```

## Common loop

```sh
ai-gateway-routes check auth-router.ai-gateway-route.yaml
ai-gateway-routes format auth-router.ai-gateway-route.yaml --write
ai-gateway-routes visualize auth-router.ai-gateway-route.yaml -o route.mmd
ai-gateway-routes compile auth-router.ai-gateway-route.yaml -o route.json
```

`check` is quiet for CI. `validate` prints a success message for interactive use.
