# TypeScript Compatibility

`ai-gateway-routes` is published as an ESM package.

Generated declaration files use `.js` import specifiers because NodeNext projects require file extensions for ESM-style relative imports. Source files stay extensionless because the build uses TypeScript's `Bundler` module resolution and Bun bundles the emitted CLI and library entrypoints.

Recommended consumer settings:

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler"
  }
}
```

For NodeNext projects, use:

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

The package exports declarations through `dist/index.d.ts`, so users should import from the package root:

```ts
import { compileYamlRoute, defineRoute } from "ai-gateway-routes";
```
