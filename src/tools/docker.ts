import { type Context, dockerSupported, type Tool } from "../plan.ts";

const NODE_IMAGE = "node:24-slim";
const BUN_IMAGE = "oven/bun:1-slim";

function nextDockerfile(ctx: Context): string {
  const bun = ctx.pm === "bun";
  const builder = bun ? BUN_IMAGE : NODE_IMAGE;
  const install = bun
    ? "COPY package.json bun.lock* ./\nRUN bun install --frozen-lockfile"
    : "COPY package.json package-lock.json ./\nRUN npm ci --no-audit --no-fund";
  return `# syntax=docker/dockerfile:1
FROM ${builder} AS deps
WORKDIR /app
# Skip git hooks; dependency install scripts (native modules) still run
ENV HUSKY=0
${install}

FROM ${builder} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# public/ is optional in Next.js but the runner stage copies it
RUN mkdir -p public && ${bun ? "bun run build" : "npm run build"}

# Next.js standalone output runs on Node
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \\
    NEXT_TELEMETRY_DISABLED=1 \\
    PORT=3000 \\
    HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
`;
}

function serverDockerfile(ctx: Context): string {
  const hasBuild = Boolean(ctx.project.scripts.build);
  if (ctx.pm === "bun") {
    return `# syntax=docker/dockerfile:1
FROM ${BUN_IMAGE} AS build
WORKDIR /app
ENV HUSKY=0
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
${hasBuild ? "RUN bun run build\n" : ""}RUN rm -rf node_modules && bun install --frozen-lockfile --production

FROM ${BUN_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build --chown=bun:bun /app ./
USER bun
EXPOSE 3000
CMD ["bun", "run", "start"]
`;
  }
  return `# syntax=docker/dockerfile:1
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV HUSKY=0
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
${hasBuild ? "RUN npm run build\n" : ""}RUN npm prune --omit=dev

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
CMD ["npm", "start"]
`;
}

const NEXT_CONFIGS = ["next.config.ts", "next.config.mjs", "next.config.js"];
const CONFIG_OPEN = /(const nextConfig[^=]*=\s*\{)/;

export const docker: Tool = {
  id: "docker",
  enabled: (ctx) => ctx.extras.has("docker") && dockerSupported(ctx.framework, ctx.pm),
  apply(ctx) {
    const files: Record<string, string> = {
      Dockerfile: ctx.framework === "next" ? nextDockerfile(ctx) : serverDockerfile(ctx),
      ".dockerignore": `${[
        "node_modules",
        ".git",
        ...ctx.outDirs,
        "coverage",
        ".env*",
        "Dockerfile*",
        ".dockerignore",
        "*.log",
      ].join("\n")}\n`,
    };
    const notes: string[] = [];

    if (ctx.framework === "next") {
      const path = NEXT_CONFIGS.find((p) => ctx.read(p) !== undefined);
      const src = path ? ctx.read(path) : undefined;
      if (path && src && /\boutput\s*:\s*["']standalone["']/.test(src)) {
        // already configured
      } else if (path && src && /\boutput\s*:/.test(src)) {
        notes.push(
          `${path} sets a different output mode. The Dockerfile needs output: "standalone"; change it or delete the Dockerfile.`,
        );
      } else if (path && src && CONFIG_OPEN.test(src)) {
        files[path] = src.replace(CONFIG_OPEN, `$1\n  output: "standalone",`);
      } else {
        notes.push(`Add output: "standalone" to your next.config; the Dockerfile needs it.`);
      }
    } else if (!ctx.project.scripts.start) {
      notes.push(`The Dockerfile runs the "start" script, but package.json has none yet.`);
    }
    return { files, notes };
  },
};
