import type { Tool } from "../plan.ts";

/** `npm run release`: bump version from conventional commits, write CHANGELOG.md, tag. */
export const release: Tool = {
  id: "release",
  enabled: (ctx) => ctx.extras.has("release"),
  apply: () => ({
    devDependencies: ["commit-and-tag-version"],
    scripts: { release: "commit-and-tag-version" },
  }),
};
