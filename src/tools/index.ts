import type { Tool } from "../plan.ts";
import { base } from "./base.ts";
import { biome } from "./biome.ts";
import { docker } from "./docker.ts";
import { eslint } from "./eslint.ts";
import { commitMsg, preCommit } from "./git-hooks.ts";
import { prettier } from "./prettier.ts";
import { release } from "./release.ts";
import { vscode } from "./vscode.ts";

/** Order matters only when two tools write the same file or script: later wins. */
export const TOOLS: readonly Tool[] = [
  base,
  eslint,
  prettier,
  biome,
  preCommit,
  commitMsg,
  release,
  vscode,
  docker,
];
