import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { detectProject } from "../src/detect.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "atc-detect-")));
after(() => rmSync(root, { recursive: true, force: true }));

test("packageManager field wins over lockfiles", () => {
  const dir = join(root, "declared");
  mkdirSync(dir);
  writeFileSync(join(dir, "package-lock.json"), "{}");
  assert.equal(detectProject(dir, { packageManager: "pnpm@10.0.0" }).pm, "pnpm");
});

test("workspace packages use the lockfile at the repository root", () => {
  const repo = join(root, "repo");
  const pkg = join(repo, "packages", "app");
  mkdirSync(pkg, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: repo });
  writeFileSync(join(repo, "pnpm-lock.yaml"), "");
  const project = detectProject(pkg, {});
  assert.equal(project.pm, "pnpm");
  assert.equal(project.gitRoot, repo);
});

test("outside git, only the project folder is searched", () => {
  const dir = join(root, "plain");
  mkdirSync(dir);
  assert.equal(detectProject(dir, {}).pm, "npm");
});
