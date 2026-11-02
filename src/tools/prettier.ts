import { json, type Tool } from "../plan.ts";

export const prettier: Tool = {
  id: "prettier",
  enabled: (ctx) => ctx.linter === "eslint",
  apply(ctx) {
    const { framework, project } = ctx;
    const plugins: string[] = [];
    const config: Record<string, unknown> = {
      semi: true,
      singleQuote: false,
      tabWidth: 2,
      trailingComma: "es5",
    };

    if (ctx.extras.has("sortImports")) {
      plugins.push("@ianvs/prettier-plugin-sort-imports");
      const head =
        framework === "next"
          ? ["^server-only$", "", "^(react|next(/[a-zA-Z/]*))$", ""]
          : ["<BUILTIN_MODULES>", ""];
      config.importOrder = [...head, "<THIRD_PARTY_MODULES>", "", "^@/(.*)$", "", "^[./]"];
      config.importOrderCaseSensitive = false;
    }
    if (framework === "astro") {
      plugins.push("prettier-plugin-astro");
      config.overrides = [{ files: "*.astro", options: { parser: "astro" } }];
    }
    if (project.tailwind) plugins.push("prettier-plugin-tailwindcss"); // must be last
    if (plugins.length) config.plugins = plugins;

    const ignore = [
      ...ctx.outDirs,
      "node_modules",
      "coverage",
      "CHANGELOG.md",
      "pnpm-lock.yaml",
      ...(framework === "next" ? ["next-env.d.ts"] : []),
    ];
    return {
      files: { ".prettierrc.json": json(config), ".prettierignore": `${ignore.join("\n")}\n` },
      devDependencies: ["prettier", ...plugins],
      scripts: { format: "prettier --write .", "format:check": "prettier --check ." },
    };
  },
};
