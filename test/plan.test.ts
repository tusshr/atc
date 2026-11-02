import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type Answers,
  biomeBlocker,
  buildPlan,
  createContext,
  type Extra,
  eslintBlocker,
  hooksSupported,
  type Project,
} from "../src/plan.ts";
import { TOOLS } from "../src/tools/index.ts";
import { wrap } from "../src/ui.ts";

const ALL_EXTRAS: Extra[] = ["sortImports", "hooks", "commits", "release", "vscode", "docker"];

function project(over: Partial<Project> = {}): Project {
  return {
    name: "demo",
    framework: "node",
    frameworkMajor: undefined,
    pm: "npm",
    deps: new Set(),
    versions: {},
    scripts: {},
    typescript: true,
    tsMajor: 6,
    tailwind: false,
    gitRoot: undefined,
    ...over,
  };
}

function plan(p: Project, a: Partial<Answers> = {}, files: Record<string, string> = {}) {
  const answers: Answers = {
    framework: p.framework,
    pm: p.pm,
    linter: "eslint",
    casing: "kebab",
    extras: new Set(ALL_EXTRAS),
    ...a,
  };
  return buildPlan(
    createContext(p, answers, (path) => files[path]),
    TOOLS,
  );
}

test("next + eslint uses Next's config, Prettier and the app router folder rule", () => {
  const p = plan(
    project({ framework: "next", deps: new Set(["next", "eslint", "eslint-config-next"]) }),
  );
  const config = p.files.get("eslint.config.mjs") ?? "";
  assert.match(config, /eslint-config-next\/core-web-vitals/);
  assert.match(config, /NEXT_JS_APP_ROUTER_CASE/);
  assert.match(config, /"KEBAB_CASE"/);
  assert.ok(p.files.has(".prettierrc.json"));
  assert.ok(!p.devDependencies.includes("eslint"), "already installed deps are not re-added");
  assert.ok(!p.devDependencies.includes("eslint-config-next"));
});

test("non-kebab casing exempts the Next.js app router from file naming", () => {
  const p = plan(project({ framework: "next" }), { casing: "camel" });
  const config = p.files.get("eslint.config.mjs") ?? "";
  assert.match(config, /"CAMEL_CASE"/);
  assert.match(config, /"app\/\*\*"/);
});

test("biome replaces eslint + prettier and maps casing, import sorting and domains", () => {
  const p = plan(project({ framework: "next", tailwind: true }), {
    linter: "biome",
    casing: "pascal",
  });
  assert.ok(!p.files.has("eslint.config.mjs"));
  assert.ok(!p.files.has(".prettierrc.json"));
  const biome = JSON.parse(p.files.get("biome.json") ?? "{}");
  assert.equal(biome.assist.actions.source.organizeImports, "on");
  assert.deepEqual(biome.linter.domains, { next: "recommended", react: "recommended" });
  assert.equal(biome.css.parser.tailwindDirectives, true);
  const rule = biome.overrides[0].linter.rules.style.useFilenamingConvention;
  assert.deepEqual(rule.options.filenameCases, ["PascalCase"]);
  assert.equal(biome.overrides[1].linter.rules.style.useFilenamingConvention, "off");
  assert.deepEqual(JSON.parse(p.files.get(".lintstagedrc.json") ?? "{}"), {
    "*": ["biome check --write --no-errors-on-unmatched --files-ignore-unknown=true"],
  });
});

test("turning off import sorting removes the prettier plugin", () => {
  const extras = new Set<Extra>(["hooks"]);
  const p = plan(project(), { extras });
  const prettierrc = JSON.parse(p.files.get(".prettierrc.json") ?? "{}");
  assert.equal(prettierrc.plugins, undefined);
  assert.ok(!p.devDependencies.includes("@ianvs/prettier-plugin-sort-imports"));
});

test("commit check alone installs husky without lint-staged", () => {
  const p = plan(project(), { linter: "none", extras: new Set<Extra>(["commits"]) });
  assert.ok(p.files.has(".husky/commit-msg"));
  assert.ok(!p.files.has(".husky/pre-commit"));
  assert.deepEqual(p.devDependencies, ["husky"]);
  assert.equal(p.scripts.prepare, "husky || true");
});

test("pre-commit hook uses the package manager's runner", () => {
  const p = plan(project({ pm: "pnpm" }));
  assert.equal(p.files.get(".husky/pre-commit"), "pnpm exec lint-staged\n");
});

test("docker: bun projects get a Bun image, pnpm projects get no Dockerfile", () => {
  const bun = plan(project({ pm: "bun", scripts: { start: "bun src/index.ts" } }));
  assert.match(bun.files.get("Dockerfile") ?? "", /FROM oven\/bun/);
  assert.ok(!plan(project({ pm: "pnpm" })).files.has("Dockerfile"));
});

test("docker: patches next.config with standalone output, once", () => {
  const src = `const nextConfig: NextConfig = {\n  reactCompiler: true,\n};\n`;
  const p = plan(project({ framework: "next" }), {}, { "next.config.ts": src });
  assert.match(p.files.get("next.config.ts") ?? "", /output: "standalone"/);
  const again = plan(
    project({ framework: "next" }),
    {},
    { "next.config.ts": p.files.get("next.config.ts") ?? "" },
  );
  assert.ok(!again.files.has("next.config.ts"), "already configured configs are left alone");
});

test("docker: dependency install scripts run; optional public/ is created", () => {
  const server = plan(project({ scripts: { start: "node ." } })).files.get("Dockerfile") ?? "";
  assert.doesNotMatch(server, /--ignore-scripts/);
  assert.match(server, /ENV HUSKY=0/);
  const next = plan(project({ framework: "next" })).files.get("Dockerfile") ?? "";
  assert.match(next, /mkdir -p public/);
});

test("docker: a different next output mode is reported, not overwritten", () => {
  const src = `const nextConfig = {\n  output: "export",\n};\n`;
  const p = plan(project({ framework: "next" }), {}, { "next.config.ts": src });
  assert.ok(!p.files.has("next.config.ts"));
  assert.ok(p.notes.some((n) => n.includes("output mode")));
});

test("docker: warns when a server project has no start script", () => {
  const p = plan(project({ framework: "express" }));
  assert.ok(p.notes.some((n) => n.includes("start")));
});

test("gitignore is only written when missing", () => {
  assert.ok(plan(project()).files.has(".gitignore"));
  assert.ok(!plan(project(), {}, { ".gitignore": "node_modules\n" }).files.has(".gitignore"));
});

test("eslint is blocked on TypeScript 7, ESLint 8 and Prettier 2; biome on Biome 1", () => {
  assert.match(eslintBlocker(project({ tsMajor: 7 })) ?? "", /TypeScript/);
  assert.equal(eslintBlocker(project({ tsMajor: 6 })), undefined);
  assert.equal(eslintBlocker(project({ typescript: false, tsMajor: 7 })), undefined);
  assert.match(eslintBlocker(project({ versions: { eslint: "^8.57.1" } })) ?? "", /eslint 9/);
  assert.match(eslintBlocker(project({ versions: { prettier: "2.8.8" } })) ?? "", /prettier 3/);
  assert.match(biomeBlocker(project({ versions: { "@biomejs/biome": "1.9.4" } })) ?? "", /2\+/);
  assert.equal(biomeBlocker(project({ versions: { "@biomejs/biome": "^2.6.0" } })), undefined);
});

test("existing scripts are kept, never replaced; prepare is extended", () => {
  const p = plan(
    project({
      scripts: { lint: "my-lint", prepare: "npm run codegen", release: "commit-and-tag-version" },
    }),
  );
  assert.equal(p.scripts.lint, undefined, "user's lint script is kept");
  assert.ok(p.notes.some((n) => n.includes(`"lint"`)));
  assert.equal(p.scripts.release, undefined, "identical script is not rewritten");
  assert.ok(!p.notes.some((n) => n.includes(`"release"`)));
  assert.equal(p.scripts.prepare, "npm run codegen && (husky || true)");
  const again = plan(project({ scripts: { prepare: "husky" } }));
  assert.equal(again.scripts.prepare, undefined, "prepare that already runs husky is left alone");
});

test("prepare tolerates production installs without husky", () => {
  assert.equal(plan(project()).scripts.prepare, "husky || true");
});

test("configs that would shadow the generated ones are removed", () => {
  const p = plan(
    project(),
    {},
    { "eslint.config.js": "", ".prettierrc": "", "package.json": `{"prettier":{}}` },
  );
  assert.deepEqual(p.remove.sort(), [".prettierrc", "eslint.config.js"]);
  assert.ok(p.notes.some((n) => n.includes(`"prettier" key`)));
  const b = plan(project(), { linter: "biome" }, { "biome.jsonc": "{}" });
  assert.deepEqual(b.remove, ["biome.jsonc"]);
});

test("route folders are exempt from file naming; Next folder rule matches files", () => {
  const next = plan(project({ framework: "next" })).files.get("eslint.config.mjs") ?? "";
  assert.match(next, /"pages\/\*\*"/);
  assert.match(next, /"\{app,src\/app\}\/\*\*\/\*\.\{ts,tsx,js,jsx\}"/);
  const astro = plan(project({ framework: "astro" })).files.get("eslint.config.mjs") ?? "";
  assert.match(astro, /"src\/pages\/\*\*"/);
});

test("bun projects get Bun globals", () => {
  const config = plan(project({ pm: "bun" })).files.get("eslint.config.mjs") ?? "";
  assert.match(config, /globals\.bunBuiltin/);
});

test("astro + biome enables template support", () => {
  const biome = JSON.parse(
    plan(project({ framework: "astro" }), { linter: "biome" }).files.get("biome.json") ?? "{}",
  );
  assert.equal(biome.html.experimentalFullSupportEnabled, true);
  assert.equal(biome.linter.domains.astro, "recommended");
});

test("npm runs local binaries with -- so their flags aren't eaten by npx", () => {
  assert.equal(plan(project()).files.get(".husky/pre-commit"), "npx --no -- lint-staged\n");
});

test("git hooks only at the repository root", () => {
  assert.equal(hooksSupported(project({ gitRoot: "/repo" }), "/repo"), true);
  assert.equal(hooksSupported(project({ gitRoot: "/repo" }), "/repo/packages/app"), false);
  assert.equal(hooksSupported(project(), "/anywhere"), true);
});

test("wrap keeps lines under the limit", () => {
  assert.deepEqual(wrap(["aaaa", "bbbb", "cccc"], 11), ["aaaa · bbbb", "cccc"]);
});
