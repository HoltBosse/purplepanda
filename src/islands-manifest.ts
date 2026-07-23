// Build-time generator for the `virtual:purplepanda/islands` module.
//
// Given the consumer's Puck config module, this statically derives a map of
//   componentName -> () => import(<the component's own module>).then(m => m[<export>])
// so the front-end island runtime can lazily load only the component(s) whose markers are on the
// page — each as its own Vite chunk — instead of importing the whole config (and every component,
// including editor-only/heavy deps like TipTap).
//
// It is intentionally best-effort and never throws: if anything can't be analyzed, that component
// is simply omitted from the map and the runtime falls back to importing the full config for it.
// A component is included by following its config `import` to the real module, resolving one or
// more levels of barrel re-export (e.g. `export { default as Select } from "./Select.js"`) so the
// emitted chunk is the individual component file rather than a whole barrel.

import { readFileSync } from "node:fs";

export type ResolveFn = (
  source: string,
  importer: string,
) => Promise<{ id: string } | null | undefined>;

// Parses JS source to an ESTree AST. Supplied by the Vite/Rollup plugin context (`this.parse`),
// which is available in both dev and build — unlike a standalone `acorn` import, since modern
// Rollup bundles its parser internally rather than exposing it as a resolvable package.
export type ParseFn = (code: string) => any;

type Leaf = { id: string; exported: string };

function stripQuery(id: string): string {
  return id.split("?")[0] ?? id;
}

function esbuildLoader(file: string): "ts" | "tsx" | "jsx" | "js" {
  if (file.endsWith(".tsx")) return "tsx";
  if (file.endsWith(".ts")) return "ts";
  if (file.endsWith(".jsx")) return "jsx";
  return "js";
}

// Reads a file, strips TS/JSX via esbuild, and parses it to an ESTree AST. Returns null on any
// failure (unreadable, virtual, syntax we can't handle) so callers can skip gracefully.
async function loadAst(file: string, parse: ParseFn): Promise<any | null> {
  try {
    const code = readFileSync(file, "utf8");
    const { transform } = await import("esbuild");
    const { code: js } = await transform(code, {
      loader: esbuildLoader(file),
      format: "esm",
      target: "es2020",
    });
    return parse(js);
  } catch {
    return null;
  }
}

async function safeResolve(resolve: ResolveFn, source: string, importer: string): Promise<string | null> {
  try {
    const resolved = await resolve(source, importer);
    return resolved ? stripQuery(resolved.id) : null;
  } catch {
    return null;
  }
}

function nameOf(node: any): string | null {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal") return String(node.value);
  return null;
}

// Generic AST walk (skips positional metadata) used to locate the `components` object literal
// wherever it sits inside the definePuckConfig(...) call.
function walk(node: any, visit: (n: any) => void): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (typeof node.type === "string") visit(node);
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc" || key === "range") continue;
    walk(node[key], visit);
  }
}

function findComponentsObject(ast: any): any | null {
  let found: any | null = null;
  walk(ast, (n) => {
    if (found) return;
    // The page components map is `components: { ... }`; category `components` values are arrays, so
    // requiring an ObjectExpression value naturally selects the right one.
    if (n.type === "Property" && nameOf(n.key) === "components" && n.value?.type === "ObjectExpression") {
      found = n.value;
    }
  });
  return found;
}

type Binding = { source: string; imported: string };

function collectImportBindings(ast: any): Map<string, Binding> {
  const bindings = new Map<string, Binding>();
  for (const node of ast.body ?? []) {
    if (node.type !== "ImportDeclaration") continue;
    const source = node.source.value as string;
    for (const spec of node.specifiers ?? []) {
      if (spec.type === "ImportDefaultSpecifier") {
        bindings.set(spec.local.name, { source, imported: "default" });
      } else if (spec.type === "ImportSpecifier") {
        bindings.set(spec.local.name, { source, imported: nameOf(spec.imported) ?? spec.local.name });
      }
      // ImportNamespaceSpecifier is intentionally skipped: no single export to point a loader at.
    }
  }
  return bindings;
}

// Resolves `source`+`exported` (as imported from `importer`) to the leaf module and export name,
// transparently following re-export barrels like `export { default as X } from "./X.js"`.
async function followToLeaf(
  source: string,
  exported: string,
  importer: string,
  resolve: ResolveFn,
  parse: ParseFn,
  depth: number,
): Promise<Leaf | null> {
  const id = await safeResolve(resolve, source, importer);
  if (!id) return null;
  if (depth >= 8) return { id, exported };

  const ast = await loadAst(id, parse);
  if (!ast) return { id, exported };

  // esbuild normalizes `export { default as Select } from "./Select.js"` into a *sourceless*
  // `export { <local> as Select }` plus an `import { default as <local> } from "./Select.js"`, so a
  // re-export can surface either with `node.source` set or via the module's import bindings.
  const imports = collectImportBindings(ast);

  for (const node of ast.body ?? []) {
    if (node.type !== "ExportNamedDeclaration") continue;
    for (const spec of node.specifiers ?? []) {
      if (spec.type !== "ExportSpecifier" || nameOf(spec.exported) !== exported) continue;
      const local = nameOf(spec.local) ?? exported;

      if (node.source) {
        // Direct re-export: export { local as exported } from "source".
        return (await followToLeaf(node.source.value, local, id, resolve, parse, depth + 1)) ?? { id, exported };
      }
      const binding = imports.get(local);
      if (binding) {
        // Sourceless export of an imported binding (the esbuild-rewritten form).
        return (await followToLeaf(binding.source, binding.imported, id, resolve, parse, depth + 1)) ?? { id, exported };
      }
      // Exported from a local declaration in this module — this is the leaf.
      return { id, exported };
    }
  }

  // No matching named export (e.g. `export default`) — this module defines the export directly.
  return { id, exported };
}

export async function generateIslandsManifest(
  configPath: string,
  resolve: ResolveFn,
  parse: ParseFn,
): Promise<string> {
  try {
    const ast = await loadAst(configPath, parse);
    if (!ast) return "export default {};\n";

    const bindings = collectImportBindings(ast);
    const componentsObj = findComponentsObject(ast);
    if (!componentsObj) return "export default {};\n";

    const lines: string[] = [];
    for (const prop of componentsObj.properties ?? []) {
      if (prop.type !== "Property") continue;
      const name = nameOf(prop.key);
      // Only components registered as `Name: ImportedBinding` (or shorthand) can be split out;
      // inline-defined components have no module to lazily import.
      if (!name || prop.value?.type !== "Identifier") continue;
      const binding = bindings.get(prop.value.name);
      if (!binding) continue;

      const leaf = await followToLeaf(binding.source, binding.imported, configPath, resolve, parse, 0);
      if (!leaf) continue;

      lines.push(
        `  ${JSON.stringify(name)}: () => import(${JSON.stringify(leaf.id)}).then((m) => m[${JSON.stringify(leaf.exported)}]),`,
      );
    }

    return `// Auto-generated island loaders. Do not edit.\nexport default {\n${lines.join("\n")}\n};\n`;
  } catch {
    // Never break the build over island analysis; the runtime falls back to the full config.
    return "export default {};\n";
  }
}
