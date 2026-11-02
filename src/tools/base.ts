import type { Tool } from "../plan.ts";

/** Always on: a .gitignore when the project has none, and a typecheck script for TS projects. */
export const base: Tool = {
  id: "base",
  enabled: () => true,
  apply(ctx) {
    const files: Record<string, string> = {};
    if (ctx.read(".gitignore") === undefined) {
      files[".gitignore"] =
        `${["node_modules", ...ctx.outDirs, "coverage", ".env*", "!.env.example", "*.log"].join("\n")}\n`;
    }
    const scripts: Record<string, string> = {};
    if (ctx.project.typescript && !ctx.project.scripts.typecheck)
      scripts.typecheck = "tsc --noEmit";
    return { files, scripts };
  },
};
