import { type Casing, json, type Tool } from "../plan.ts";
import { nextRouterDirs, SOURCE_DIRS } from "./eslint.ts";

const BIOME_CASE: Record<Casing, string> = {
  kebab: "kebab-case",
  camel: "camelCase",
  pascal: "PascalCase",
  snake: "snake_case",
};

const filenameRule = (level: "off" | "error", casing: Casing) => ({
  linter: {
    rules: {
      style: {
        useFilenamingConvention:
          level === "off"
            ? "off"
            : { level, options: { filenameCases: [BIOME_CASE[casing]], requireAscii: true } },
      },
    },
  },
});

export const biome: Tool = {
  id: "biome",
  enabled: (ctx) => ctx.linter === "biome",
  apply(ctx) {
    const domains: Record<string, string> = {};
    if (ctx.framework === "next")
      Object.assign(domains, { next: "recommended", react: "recommended" });

    const config = {
      $schema: "./node_modules/@biomejs/biome/configuration_schema.json",
      vcs: { enabled: true, clientKind: "git", useIgnoreFile: true },
      formatter: { indentStyle: "space" },
      javascript: { formatter: { quoteStyle: "double", trailingCommas: "es5" } },
      ...(ctx.project.tailwind && { css: { parser: { tailwindDirectives: true } } }),
      linter: {
        rules: { preset: "recommended" },
        ...(Object.keys(domains).length && { domains }),
      },
      assist: {
        actions: { source: { organizeImports: ctx.extras.has("sortImports") ? "on" : "off" } },
      },
      overrides: [
        { includes: SOURCE_DIRS.map((d) => `${d}/**`), ...filenameRule("error", ctx.casing) },
        ...(nextRouterDirs(ctx).length
          ? [{ includes: nextRouterDirs(ctx), ...filenameRule("off", ctx.casing) }]
          : []),
      ],
    };
    return {
      files: { "biome.json": json(config) },
      devDependencies: ["@biomejs/biome"],
      scripts: {
        lint: "biome check .",
        "lint:fix": "biome check --write .",
        format: "biome format --write .",
      },
    };
  },
};
