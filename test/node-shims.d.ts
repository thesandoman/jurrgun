/** The one Node API the tests use (the project's types are Workers-only). */
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
}
