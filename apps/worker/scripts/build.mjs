// Bundle the worker into self-contained ESM files. Workspace packages
// (`@kestrel/shared`, `@kestrel/db`, `@kestrel/data`, `@kestrel/ai`,
// `@kestrel/indicators`) publish built JavaScript via their `import`
// condition (`dist/*.js`), so this build REQUIRES `packages/*/dist` to exist
// (turbo's `^build` guarantees that in CI/Docker; a bare
// `pnpm --filter @kestrel/worker build` on a clean checkout needs
// `pnpm build:packages` first). Everything in `dependencies` except the
// workspace packages, OpenTelemetry and `ws` stays external and is resolved
// from node_modules at runtime; the rest is inlined into one file per
// entrypoint.
//
// Two entrypoints:
//   - dist/index.js       — long-running worker (BiQuote SignalR + flush loop)
//   - dist/runner/cli.js  — `node dist/runner/cli.js <job-name>`
//
// Run from the package root: `pnpm --filter @kestrel/worker build`.

import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// esbuild never deletes orphaned outputs (e.g. sourcemaps from an older
// build), so clean the output tree first.
rmSync(resolve(root, 'dist'), { recursive: true, force: true });

// Read the worker's own package.json to figure out which deps stay
// external (anything from `dependencies` other than @kestrel/* gets
// installed via pnpm at runtime).
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies ?? {});
// Don't auto-externalize OpenTelemetry packages — they'd need to resolve
// from node_modules at runtime, but pnpm's strict layout won't hoist
// transitive @opentelemetry/* deps into the worker's node_modules.
// Bundling them is simpler and avoids a long chain of manual deps.
// With shamefully-hoist=true, external deps are available from the monorepo
// root node_modules. ws is bundled via the pnpm-resolver plugin below
// to avoid runtime resolution issues with pnpm's strict layout.
const alwaysBundle = new Set(['ws']);
// QuickJS ships a .wasm asset that esbuild cannot inline. Keep the package
// external so Node resolves it from the deployed node_modules (pnpm deploy
// includes it as a transitive dependency of @kestrel/plugin-backtesting).
const alwaysExternal = new Set(['quickjs-emscripten', '@jitl/quickjs-wasmfile-release-sync']);
const external = [
  ...deps.filter(
    (d) => !d.startsWith('@kestrel/') && !d.startsWith('@opentelemetry/') && !alwaysBundle.has(d),
  ),
  ...alwaysExternal,
];

// Plus Node built-ins that shouldn't be inlined.
external.push('node:*');

// Stub out `server-only` — it's a build-time guard that throws at module
// load time, which breaks the worker (Node.js backend with no bundler
// stripping). The modules that import it (@kestrel/shared/src/encryption)
// are never called by the worker, but the import side-effect is evaluated
// eagerly during ESM module graph loading.
const serverOnlyPlugin = {
  name: 'server-only',
  setup(build) {
    build.onResolve({ filter: /^server-only$/ }, () => ({
      path: 'server-only-stub',
      namespace: 'server-only-stub',
    }));
    build.onLoad({ filter: /^server-only-stub$/, namespace: 'server-only-stub' }, () => ({
      contents: '',
      loader: 'js',
    }));
  },
};

// Resolve packages from the monorepo root's node_modules so esbuild can
// find packages in pnpm's .pnpm store when alwaysBundle includes them.
const monorepoRoot = resolve(root, '..', '..');

// Plugin: resolve specific packages from pnpm's .pnpm store when
// esbuild's default resolution fails (pnpm strict layout).
// Only activates for packages listed in pnpmBundlePackages.
const pnpmBundlePackages = new Set(['ws']);
const pnpmResolver = {
  name: 'pnpm-resolver',
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      // Only handle specific packages that need bundling from pnpm store
      if (!pnpmBundlePackages.has(args.path)) return undefined;
      if (args.path.startsWith('.') || args.path.startsWith('/') || args.path.startsWith('node:')) {
        return undefined;
      }
      // Search .pnpm store for matching package directories
      const pnpmStore = join(monorepoRoot, 'node_modules', '.pnpm');
      if (!existsSync(pnpmStore)) return undefined;
      const entries = readdirSync(pnpmStore);
      const match = entries.find((e) => e.startsWith(`${args.path}@`));
      if (match) {
        const pkgDir = join(pnpmStore, match, 'node_modules', args.path);
        // Read the package.json main field to get the entry point
        const pkgJsonPath = join(pkgDir, 'package.json');
        if (existsSync(pkgJsonPath)) {
          const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
          const mainFile = pkgJson.main || 'index.js';
          const entryPath = join(pkgDir, mainFile);
          if (existsSync(entryPath)) {
            return { path: entryPath };
          }
        }
        // Fallback: try index.js
        const fallback = join(pkgDir, 'index.js');
        if (existsSync(fallback)) return { path: fallback };
      }
      return undefined;
    });
  },
};

const common = {
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  // Sourcemaps are opt-in: production images shipped ~100 MB of .map files
  // for a ~25 MB bundle. Set WORKER_SOURCEMAPS=1 for a debuggable local build.
  sourcemap: process.env.WORKER_SOURCEMAPS === '1',
  // The bundle only ever runs in production-shaped contexts (Docker, VM,
  // Botkeep); pin NODE_ENV so inlined libraries drop development branches.
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'none',
  external,
  nodePaths: [resolve(monorepoRoot, 'node_modules')],
  plugins: [pnpmResolver, serverOnlyPlugin],
  // Workspace packages are pure ESM; force the bundler to emit ESM and
  // not wrap dynamic-import shims that confuse Node.
  banner: {
    js: "import { createRequire as _cr } from 'node:module'; const require = _cr(import.meta.url);",
  },
  logLevel: 'info',
};

await Promise.all([
  build({
    ...common,
    entryPoints: [resolve(root, 'src/index.ts')],
    outfile: resolve(root, 'dist/index.js'),
  }),
  build({
    ...common,
    entryPoints: [resolve(root, 'src/runner/cli.ts')],
    outfile: resolve(root, 'dist/runner/cli.js'),
  }),
]);
