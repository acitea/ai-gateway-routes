const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const vscode = require("vscode");

const ROUTE_FILE_PATTERN = /\.(ai-gateway-route|agroute)\.ya?ml$/;

let apiPromise;

function activate(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection("ai-gateway-routes");
  context.subscriptions.push(diagnostics);

  const refresh = (document) => {
    if (isRouteDocument(document)) {
      updateDiagnostics(document, diagnostics, context);
    }
  };

  for (const document of vscode.workspace.textDocuments) {
    refresh(document);
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((event) => refresh(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => diagnostics.delete(document.uri)),
    vscode.languages.registerCompletionItemProvider(
      { language: "ai-gateway-route-yaml" },
      createCompletionProvider(),
      " ",
      "\n",
      ":",
    ),
    vscode.commands.registerCommand("aiGatewayRoutes.preview", () => previewRoute(context)),
    vscode.commands.registerCommand("aiGatewayRoutes.compile", () => compileRoute(context)),
    vscode.commands.registerCommand("aiGatewayRoutes.copyMermaid", () => copyMermaid(context)),
  );
}

function createCompletionProvider() {
  return {
    provideCompletionItems(document, position) {
      const line = document.lineAt(position).text;
      const indent = line.match(/^\s*/)?.[0].length ?? 0;

      if (indent === 0) {
        return ["name", "start", "models", "nodes"].map((key) => yamlKeyCompletion(key));
      }

      if (indent === 4) {
        return ["model", "conditional", "fractional"].map((key) => yamlKeyCompletion(key));
      }

      return [
        "provider",
        "model",
        "timeout",
        "retries",
        "success",
        "fallback",
        "conditions",
        "true",
        "false",
        "buckets",
        "bucket0",
        "bucket1",
      ].map((key) => yamlKeyCompletion(key));
    },
  };
}

function yamlKeyCompletion(key) {
  const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
  item.insertText = `${key}: `;
  return item;
}

function deactivate() {}

async function updateDiagnostics(document, diagnostics, context) {
  const api = await loadApi(context);
  const routeDiagnostics = api.validateYamlRoute(document.getText()).map((diagnostic) => {
    const start = new vscode.Position(diagnostic.line, diagnostic.column);
    const end = new vscode.Position(diagnostic.line, Number.MAX_SAFE_INTEGER);
    return new vscode.Diagnostic(
      new vscode.Range(start, end),
      diagnostic.message,
      vscode.DiagnosticSeverity.Error,
    );
  });

  diagnostics.set(document.uri, routeDiagnostics);
}

async function previewRoute(context) {
  const document = getActiveRouteDocument();
  if (!document) {
    return;
  }

  const api = await loadApi(context);
  const compiled = api.compileYamlRoute(document.getText());
  const mermaid = api.visualize(compiled);
  const panel = vscode.window.createWebviewPanel(
    "aiGatewayRoutesPreview",
    `AI Gateway Route: ${compiled.name}`,
    vscode.ViewColumn.Beside,
    { enableScripts: false },
  );

  panel.webview.html = renderPreviewHtml(compiled, mermaid);
}

async function compileRoute(context) {
  const document = getActiveRouteDocument();
  if (!document) {
    return;
  }

  const api = await loadApi(context);
  const compiled = api.compileYamlRoute(document.getText());
  const output = JSON.stringify(compiled, null, 2);
  const target = await vscode.workspace.openTextDocument({
    content: output,
    language: "json",
  });
  await vscode.window.showTextDocument(target, vscode.ViewColumn.Beside);
}

async function copyMermaid(context) {
  const document = getActiveRouteDocument();
  if (!document) {
    return;
  }

  const api = await loadApi(context);
  const compiled = api.compileYamlRoute(document.getText());
  await vscode.env.clipboard.writeText(api.visualize(compiled));
  vscode.window.showInformationMessage("Copied AI Gateway route Mermaid diagram.");
}

function getActiveRouteDocument() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isRouteDocument(editor.document)) {
    vscode.window.showErrorMessage("Open an AI Gateway route YAML file first.");
    return undefined;
  }

  return editor.document;
}

function isRouteDocument(document) {
  return (
    document.languageId === "ai-gateway-route-yaml" ||
    ROUTE_FILE_PATTERN.test(path.basename(document.fileName))
  );
}

async function loadApi(context) {
  if (!apiPromise) {
    apiPromise = importApi(context);
  }

  return apiPromise;
}

async function importApi(context) {
  const candidates = [
    path.join(context.extensionPath, "node_modules", "ai-gateway-routes", "dist", "index.js"),
    path.join(context.extensionPath, "..", "dist", "index.js"),
    path.join(context.extensionPath, "..", "..", "dist", "index.js"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return import(pathToFileURL(candidate).href);
    }
  }

  throw new Error("Could not find ai-gateway-routes dist/index.js. Build the package or install the extension dependencies.");
}

function renderPreviewHtml(compiled, mermaid) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0;
      padding: 24px;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
    }
    h1 {
      margin: 0 0 18px;
      font-size: 18px;
      font-weight: 600;
    }
    svg {
      width: 100%;
      max-width: 980px;
      height: auto;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
    }
    pre {
      padding: 14px;
      overflow: auto;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-textCodeBlock-background);
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(compiled.name)}</h1>
  ${renderSvg(compiled)}
  <h1>Mermaid</h1>
  <pre>${escapeHtml(mermaid)}</pre>
</body>
</html>`;
}

function renderSvg(compiled) {
  const nodeWidth = 180;
  const nodeHeight = 48;
  const x = 60;
  const gap = 78;
  const positions = new Map();
  const height = 80 + compiled.elements.length * (nodeHeight + gap);
  const width = 720;

  compiled.elements.forEach((element, index) => {
    positions.set(element.id, {
      x,
      y: 40 + index * (nodeHeight + gap),
    });
  });

  const edges = [];
  const nodes = [];

  for (const element of compiled.elements) {
    const position = positions.get(element.id);
    nodes.push(renderSvgNode(element, position, nodeWidth, nodeHeight));

    for (const [outputName, output] of Object.entries(element.outputs)) {
      const target = positions.get(output.elementId);
      if (!target) {
        continue;
      }

      const sourceX = position.x + nodeWidth;
      const sourceY = position.y + nodeHeight / 2;
      const targetX = target.x;
      const targetY = target.y + nodeHeight / 2;
      const midX = sourceX + 110;
      edges.push(`
        <path d="M ${sourceX} ${sourceY} C ${midX} ${sourceY}, ${midX} ${targetY}, ${targetX} ${targetY}" fill="none" stroke="var(--vscode-editor-foreground)" stroke-width="1.4" marker-end="url(#arrow)" opacity="0.75" />
        <text x="${midX + 8}" y="${(sourceY + targetY) / 2 - 6}" fill="var(--vscode-descriptionForeground)" font-size="12">${escapeHtml(outputName)}</text>
      `);
    }
  }

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="AI Gateway route flow">
    <defs>
      <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,6 L9,3 z" fill="var(--vscode-editor-foreground)" />
      </marker>
    </defs>
    ${edges.join("\n")}
    ${nodes.join("\n")}
  </svg>`;
}

function renderSvgNode(element, position, width, height) {
  const radius = element.type === "conditional" ? 0 : 6;
  const fill = element.type === "start" || element.type === "end"
    ? "var(--vscode-button-background)"
    : "var(--vscode-editor-background)";
  const stroke = element.type === "fractional"
    ? "var(--vscode-charts-yellow)"
    : "var(--vscode-focusBorder)";

  return `
    <rect x="${position.x}" y="${position.y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />
    <text x="${position.x + 14}" y="${position.y + 24}" fill="var(--vscode-editor-foreground)" font-size="13" font-weight="600">${escapeHtml(element.id)}</text>
    <text x="${position.x + 14}" y="${position.y + 40}" fill="var(--vscode-descriptionForeground)" font-size="11">${escapeHtml(element.type)}</text>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = {
  activate,
  deactivate,
};
