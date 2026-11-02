import type { Casing, Context, Tool } from "../plan.ts";

const CHECK_FILE_CASE: Record<Casing, string> = {
  kebab: "KEBAB_CASE",
  camel: "CAMEL_CASE",
  pascal: "PASCAL_CASE",
  snake: "SNAKE_CASE",
};

/** Folders whose file names follow the chosen casing. Root config files are left alone. */
export const SOURCE_DIRS = ["src", "app", "components", "lib", "hooks", "utils"];

/** Next.js dictates file names inside the app router (page.tsx, not-found.tsx, …). */
export const nextRouterDirs = (ctx: Context): string[] =>
  ctx.framework === "next" && ctx.casing !== "kebab" ? ["app/**", "src/app/**"] : [];

export const eslint: Tool = {
  id: "eslint",
  enabled: (ctx) => ctx.linter === "eslint",
  apply(ctx) {
    const { framework, project } = ctx;
    const ts = project.typescript;
    const imports = [
      `import checkFile from "eslint-plugin-check-file";`,
      `import prettier from "eslint-config-prettier/flat";`,
      `import { defineConfig, globalIgnores } from "eslint/config";`,
    ];
    const configs: string[] = [];
    const devDependencies = ["eslint", "eslint-plugin-check-file", "eslint-config-prettier"];

    if (framework === "next") {
      imports.push(`import nextVitals from "eslint-config-next/core-web-vitals";`);
      configs.push("...nextVitals");
      if (ts) {
        imports.push(`import nextTs from "eslint-config-next/typescript";`);
        configs.push("...nextTs");
      }
      if (!project.deps.has("eslint-config-next")) devDependencies.push("eslint-config-next");
    } else {
      imports.push(`import js from "@eslint/js";`, `import globals from "globals";`);
      configs.push("js.configs.recommended");
      devDependencies.push("@eslint/js", "globals");
      if (ts) {
        imports.push(`import tseslint from "typescript-eslint";`);
        configs.push("...tseslint.configs.recommended");
        devDependencies.push("typescript-eslint");
      }
      if (framework === "astro") {
        imports.push(`import astro from "eslint-plugin-astro";`);
        configs.push("...astro.configs.recommended");
        devDependencies.push("eslint-plugin-astro");
        if (ts) devDependencies.push("@typescript-eslint/parser");
      }
      const env = framework === "astro" ? "...globals.node, ...globals.browser" : "...globals.node";
      configs.push(`{ languageOptions: { globals: { ${env} } } }`);
    }
    configs.push("prettier");

    const ignores = [
      ...ctx.outDirs.map((d) => `${d}/**`),
      "coverage/**",
      ...(framework === "next" ? ["next-env.d.ts"] : []),
    ];
    configs.push(`globalIgnores(${JSON.stringify(ignores)})`);

    const unused = `["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }]`;
    configs.push(`{
    rules: {
      "prefer-arrow-callback": "error",
      "prefer-template": "error",
      ${ts ? `"no-unused-vars": "off",\n      "@typescript-eslint/no-unused-vars": ${unused},` : `"no-unused-vars": ${unused},`}
    },
  }`);

    const exts = framework === "astro" ? "ts,tsx,js,jsx,astro" : "ts,tsx,js,jsx";
    configs.push(`{
    files: ${JSON.stringify(SOURCE_DIRS.map((d) => `${d}/**/*.{${exts}}`))},
    ignores: ${JSON.stringify(nextRouterDirs(ctx))},
    plugins: { "check-file": checkFile },
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        { "**/*": "${CHECK_FILE_CASE[ctx.casing]}" },
        { ignoreMiddleExtensions: true },
      ],
    },
  }`);
    if (framework === "next") {
      configs.push(`{
    files: ["{app,src/app}/**/"],
    plugins: { "check-file": checkFile },
    rules: {
      "check-file/folder-naming-convention": ["error", { "{app,src/app}/**/": "NEXT_JS_APP_ROUTER_CASE" }],
    },
  }`);
    }

    return {
      files: {
        "eslint.config.mjs": `${imports.join("\n")}\n\nexport default defineConfig([\n  ${configs.join(",\n  ")},\n]);\n`,
      },
      devDependencies,
      scripts: { lint: "eslint .", "lint:fix": "eslint . --fix" },
    };
  },
};
