import { access } from "node:fs/promises";

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
