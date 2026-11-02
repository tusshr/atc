import { type Casing, json, type Tool } from "../plan.ts";
import { routeDirs, SOURCE_DIRS } from "./eslint.ts";

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
    if (ctx.framework === "next") {
      Object.assign(domains, { next: "recommended", react: "recommended" });
    }
    if (ctx.framework === "astro") domains.astro = "recommended";

    const config = {
      $schema: "./node_modules/@biomejs/biome/configuration_schema.json",
      vcs: { enabled: true, clientKind: "git", useIgnoreFile: true },
      formatter: { indentStyle: "space" },
      javascript: { formatter: { quoteStyle: "double", trailingCommas: "es5" } },
      ...(ctx.project.tailwind && { css: { parser: { tailwindDirectives: true } } }),
      // Lets Biome see components used in .astro templates, so they aren't flagged as unused.
      ...(ctx.framework === "astro" && { html: { experimentalFullSupportEnabled: true } }),
      linter: {
        rules: { preset: "recommended" },
        ...(Object.keys(domains).length && { domains }),
      },
      assist: {
        actions: { source: { organizeImports: ctx.extras.has("sortImports") ? "on" : "off" } },
      },
      overrides: [
        { includes: SOURCE_DIRS.map((d) => `${d}/**`), ...filenameRule("error", ctx.casing) },
        ...(routeDirs(ctx).length
          ? [{ includes: routeDirs(ctx), ...filenameRule("off", ctx.casing) }]
          : []),
      ],
    };
    return {
      files: { "biome.json": json(config) },
      remove: ctx.read("biome.jsonc") === undefined ? [] : ["biome.jsonc"],
      devDependencies: ["@biomejs/biome"],
      scripts: {
        lint: "biome check .",
        "lint:fix": "biome check --write .",
        format: "biome format --write .",
      },
    };
  },
};
