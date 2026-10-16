/** The one Node API the tests use (the project's types are Workers-only). */
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  /** test/privacy-promises.test.ts lists src/ to grep it against the privacy notice. */
  export function readdirSync(path: string, opts: { recursive: true; encoding: "utf8" }): string[];
}
/** Runs the service worker script in a fake worker scope (test/offline-next.test.ts). */
declare module "node:vm" {
  export function createContext(sandbox: Record<string, unknown>): Record<string, unknown>;
  export function runInContext(code: string, context: Record<string, unknown>): unknown;
  const vm: { createContext: typeof createContext; runInContext: typeof runInContext };
  export default vm;
}
