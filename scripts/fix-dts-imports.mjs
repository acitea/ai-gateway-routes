import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const distDir = new URL("../dist/", import.meta.url);

const declarationFiles = (await readdir(distDir)).filter((file) =>
  file.endsWith(".d.ts"),
);

for (const file of declarationFiles) {
  const path = join(distDir.pathname, file);
  const source = await readFile(path, "utf8");
  const rewritten = source.replace(
    /(\bfrom\s+["']\.\/[^"']+)(["'])/g,
    (match, specifier, quote) =>
      specifier.endsWith(".js") ? match : `${specifier}.js${quote}`,
  );

  if (rewritten !== source) {
    await writeFile(path, rewritten);
  }
}
