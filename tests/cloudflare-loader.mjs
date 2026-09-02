import { access, readFile } from "node:fs/promises";
import ts from "typescript";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { url: "data:text/javascript,export const env = {};", shortCircuit: true };
  }
  if (specifier.startsWith(".") && context.parentURL && !/\.[a-z0-9]+$/i.test(specifier)) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL);
    try { await access(candidate); return { url: candidate.href, shortCircuit: true }; } catch { /* fall through */ }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("file:") && (url.endsWith(".ts") || url.endsWith(".tsx"))) {
    const source = await readFile(new URL(url), "utf8");
    const transpiled = ts.transpileModule(source, {
      fileName: new URL(url).pathname,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        sourceMap: false,
        inlineSourceMap: false,
      },
    });
    return { format: "module", source: transpiled.outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
