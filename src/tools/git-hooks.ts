import { readFileSync } from "node:fs";

import { json, type Tool } from "../plan.ts";

const commitMsgHook = () =>
  readFileSync(new URL("../../templates/commit-msg", import.meta.url), "utf8");

// `|| true` keeps production installs (npm ci --omit=dev) working when husky isn't installed.
const husky = { devDependencies: ["husky"], scripts: { prepare: "husky || true" } };

/** Lint and format staged files before every commit. */
export const preCommit: Tool = {
  id: "pre-commit",
  enabled: (ctx) => ctx.extras.has("hooks") && ctx.linter !== "none",
  apply(ctx) {
    const code = `*.{js,jsx,mjs,cjs,ts,tsx,mts,cts${ctx.framework === "astro" ? ",astro" : ""}}`;
    const stages =
      ctx.linter === "biome"
        ? { "*": ["biome check --write --no-errors-on-unmatched --files-ignore-unknown=true"] }
        : {
            [code]: ["eslint --fix", "prettier --write"],
            "*.{json,md,mdx,css,scss,yml,yaml,html}": ["prettier --write"],
          };
    return {
      files: {
        ".lintstagedrc.json": json(stages),
        ".husky/pre-commit": `${ctx.exec} lint-staged\n`,
      },
      devDependencies: [...husky.devDependencies, "lint-staged"],
      scripts: husky.scripts,
    };
  },
};

/** Reject commit messages that don't follow Conventional Commits. */
export const commitMsg: Tool = {
  id: "commit-msg",
  enabled: (ctx) => ctx.extras.has("commits"),
  apply: () => ({ files: { ".husky/commit-msg": commitMsgHook() }, ...husky }),
};
