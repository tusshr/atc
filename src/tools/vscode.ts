import { json, type Tool } from "../plan.ts";

const NEXT_LAUNCH = {
  version: "0.2.0",
  configurations: [
    {
      name: "Next.js: debug server-side",
      type: "node-terminal",
      request: "launch",
      command: "npm run dev -- --inspect",
    },
    {
      name: "Next.js: debug client-side",
      type: "chrome",
      request: "launch",
      url: "http://localhost:3000",
    },
  ],
};

export const vscode: Tool = {
  id: "vscode",
  enabled: (ctx) => ctx.extras.has("vscode"),
  apply(ctx) {
    const { linter, project } = ctx;
    const formatter =
      linter === "eslint"
        ? "esbenp.prettier-vscode"
        : linter === "biome"
          ? "biomejs.biome"
          : undefined;
    const recommendations = [
      linter === "eslint" && "dbaeumer.vscode-eslint",
      formatter,
      project.tailwind && "bradlc.vscode-tailwindcss",
      ctx.framework === "astro" && "astro-build.astro-vscode",
    ].filter(Boolean);

    const settings: Record<string, unknown> = {};
    if (formatter) {
      settings["editor.defaultFormatter"] = formatter;
      settings["editor.formatOnSave"] = true;
      settings["editor.codeActionsOnSave"] =
        linter === "biome"
          ? { "source.fixAll.biome": "explicit", "source.organizeImports.biome": "explicit" }
          : { "source.fixAll.eslint": "explicit" };
    }
    if (project.tailwind) settings["files.associations"] = { "*.css": "tailwindcss" };
    if (project.typescript) settings["typescript.tsdk"] = "node_modules/typescript/lib";

    const files: Record<string, string> = {
      ".vscode/extensions.json": json({ recommendations }),
      ".vscode/settings.json": json(settings),
    };
    if (ctx.framework === "next") files[".vscode/launch.json"] = json(NEXT_LAUNCH);
    return { files };
  },
};
