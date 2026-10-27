#!/usr/bin/env node
/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// `pnpm create:plugin <plugin-id>` — scaffold an installable workspace plugin.
//
// Generated layout:
//   plugins/<id>/package.json
//   plugins/<id>/src/index.ts          (definePlugin with one sample tool)
//   plugins/<id>/src/ui/index.tsx      (definePluginUi slots)
//   plugins/<id>/skills/default-skill/SKILL.md
//   plugins/<id>/test/plugin.test.ts
//
// The script also adds the workspace dependency to `plugins/package.json` and
// appends the import + array entry to `plugins/registry.ts`, so apps discover
// the plugin without any core edits.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pluginsRoot = join(root, 'plugins');

const CATEGORIES = new Set([
  'trading-execution',
  'quant-research',
  'channels-automation',
  'agents-skills',
  'market-data',
]);

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--name') {
      flags.name = argv[++i];
    } else if (arg === '--category') {
      flags.category = argv[++i];
    } else if (arg === '--description') {
      flags.description = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg.startsWith('-')) {
      fail(`Unknown flag ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function titleCase(id) {
  return id
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function camelCase(id) {
  const parts = id.split('-').filter(Boolean);
  return parts
    .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
}

/** Emit a single-quoted TypeScript string literal. */
function tsString(value) {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function writeFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

const LICENSE_HEADER = `/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
`;

function packageJson({ id, name, description }) {
  return `${JSON.stringify(
    {
      name: `@kestrel/plugin-${id}`,
      version: '0.1.0',
      private: true,
      type: 'module',
      main: './dist/index.js',
      types: './dist/index.d.ts',
      files: ['dist', 'skills'],
      exports: {
        '.': {
          source: './src/index.ts',
          types: './dist/index.d.ts',
          import: './dist/index.js',
        },
        './ui': {
          source: './src/ui/index.tsx',
          types: './dist/ui/index.d.ts',
          import: './dist/ui/index.js',
        },
      },
      scripts: {
        lint: 'eslint .',
        typecheck: 'tsrs --noEmit',
        test: 'vitest run',
        build: 'tsrs -p tsconfig.build.json && node ../../scripts/rewrite-dist-imports.mjs dist',
        clean: 'rm -rf node_modules .turbo dist',
      },
      dependencies: {
        '@kestrel/plugin-sdk': 'workspace:*',
        '@kestrel/shared': 'workspace:*',
        zod: '^4.6.7',
      },
      devDependencies: {
        '@kestrel/config': 'workspace:*',
        '@types/node': '^22.20.5',
        '@types/react': '^19.3.0',
        eslint: '^10.13.0',
        tsrs: '0.20.0-ts7.1.0-beta',
        typescript: '^7.0.2',
        vitest: '^5.0.5',
      },
      description,
      license: 'Apache-2.0',
    },
    null,
    2,
  )}\n`;
}

function tsconfig() {
  return `${JSON.stringify(
    {
      extends: '@kestrel/config/typescript/base',
      compilerOptions: { jsx: 'react-jsx' },
      include: ['src/**/*.ts', 'src/**/*.tsx', 'test/**/*.ts'],
    },
    null,
    2,
  )}\n`;
}

function buildTsconfig() {
  return `${JSON.stringify(
    {
      extends: './tsconfig.json',
      compilerOptions: {
        noEmit: false,
        incremental: true,
        tsBuildInfoFile: './dist/.tsbuildinfo',
        outDir: 'dist',
        rootDir: 'src',
      },
      include: ['src/**/*.ts', 'src/**/*.tsx'],
    },
    null,
    2,
  )}\n`;
}

function eslintConfig() {
  return `${LICENSE_HEADER}\nimport config from '@kestrel/config/eslint';\n\nexport default config;\n`;
}

function vitestConfig() {
  return `${LICENSE_HEADER}
import os from 'node:os';

import { defineConfig } from 'vitest/config';

const maxWorkers = process.env.CI ? 2 : Math.max(2, Math.floor(os.availableParallelism() / 2));

export default defineConfig({
  esbuild: { target: 'es2022' },
  resolve: { conditions: ['source'] },
  test: {
    fsModuleCachePath: 'node_modules/.vitest-cache',
    pool: 'forks',
    maxWorkers,
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
`;
}

function pluginEntry({ id, name, description, category }) {
  const toolPrefix = id.replaceAll('-', '_');
  const nameLiteral = tsString(name);
  const descriptionLiteral = tsString(description);
  const toolDescription = tsString(`Return the health/status of the ${name} plugin.`);
  return `${LICENSE_HEADER}
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { definePlugin } from '@kestrel/plugin-sdk';
import { z } from 'zod';

const settingsSchema = z.object({
  /** Example secret: stored AES-256-GCM encrypted, never returned in plaintext. */
  apiKey: z.string().min(1).optional().meta({ secret: true, label: 'API key' }),
});

/**
 * Absolute path so Mastra resolves SKILL.md regardless of the process cwd.
 * Use path.join instead of new URL so bundlers do not try to resolve the
 * skill directory as a JavaScript module.
 */
const defaultSkillPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'skills',
  'default-skill',
);

const plugin = definePlugin({
  manifest: {
    id: '${id}',
    name: ${nameLiteral},
    version: '0.1.0',
    tagline: ${descriptionLiteral},
    description: ${descriptionLiteral},
    category: '${category}',
    iconName: 'IconPuzzle',
    installMode: 'instant',
    settingsSchema,
    defaultSettings: {},
    badges: ['Adds 1 AI tool'],
  },
  skills: [defaultSkillPath],
  tools: [
    {
      name: '${toolPrefix}_status',
      description: ${toolDescription},
      inputSchema: z.object({}),
      outputSchema: z.object({ ok: z.boolean(), pluginId: z.string() }),
      access: 'read-only',
      attachTo: ['canonical-chat'],
      execute: async (_input, ctx) => {
        ctx.log.debug?.('${id} status requested', { userId: ctx.userId });
        return { ok: true, pluginId: ctx.pluginId };
      },
    },
  ],
});

export default plugin;
`;
}

function pluginUi() {
  return `${LICENSE_HEADER}
import { definePluginUi } from '@kestrel/plugin-sdk/ui';

/** Custom chat cards, dashboard widgets, nav items and pages live here. */
const ui = definePluginUi({});

export default ui;
`;
}

function skillMarkdown({ id, name }) {
  return `---
name: ${id}-playbook
description: Working notes and playbook for the ${name} plugin.
---

# ${name}

Explain here how an agent should use this plugin, including:

1. When the plugin's tools should be called.
2. Any risk rules or confirmation requirements.
3. Reference material the agent should read before acting.

Add supporting documents under \`references/\` and read them with the Mastra
\`skill_read\` tool when the plugin is installed.
`;
}

function pluginTest({ id }) {
  return `${LICENSE_HEADER}
import { PluginHost } from '@kestrel/plugin-sdk';
import { describe, expect, it } from 'vitest';

import plugin from '../src/index';

describe('${id} plugin', () => {
  it('registers and resolves its tools only for installed users', () => {
    const host = new PluginHost();
    host.register(plugin);

    expect(host.getPlugin('${id}')).toBeDefined();
    expect(host.resolveToolsForUser(['${id}'])).toHaveLength(plugin.tools?.length ?? 0);
    expect(host.resolveToolsForUser([])).toHaveLength(0);
  });
});
`;
}

function updateRegistry({ id }) {
  const registryPath = join(pluginsRoot, 'registry.ts');
  if (!existsSync(registryPath)) {
    fail(`Missing ${registryPath}. Run this script from the Kestrel repository.`);
  }
  let source = readFileSync(registryPath, 'utf8');
  const identifier = `${camelCase(id)}Plugin`;
  const importLine = `import ${identifier} from '@kestrel/plugin-${id}';`;

  if (source.includes(importLine)) {
    console.log(`• plugins/registry.ts already imports ${identifier}`);
    return;
  }

  const importMarker = '// @kestrel:plugin-imports-end';
  const listMarker = '// @kestrel:plugin-list-end';
  if (!source.includes(importMarker) || !source.includes(listMarker)) {
    fail('plugins/registry.ts is missing the @kestrel:plugin-imports/list markers.');
  }

  source = source.replace(importMarker, `${importLine}\n${importMarker}`);
  // Preserve the two-space array indentation around the list marker.
  source = source.replace(listMarker, `${identifier},\n  ${listMarker}`);
  writeFileSync(registryPath, source);
  console.log(`• Registered ${identifier} in plugins/registry.ts`);
}

function updateUiRegistry({ id }) {
  const registryPath = join(pluginsRoot, 'ui-registry.ts');
  if (!existsSync(registryPath)) {
    console.warn(`• Missing ${registryPath}; skipping plugin UI registration`);
    return;
  }

  let source = readFileSync(registryPath, 'utf8');
  const identifier = `${camelCase(id)}Ui`;
  const importLine = `import ${identifier} from '@kestrel/plugin-${id}/ui';`;

  if (source.includes(importLine)) {
    console.log(`• plugins/ui-registry.ts already imports ${identifier}`);
    return;
  }

  const importMarker = '// @kestrel:plugin-ui-imports-end';
  const listMarker = '// @kestrel:plugin-ui-list-end';
  if (!source.includes(importMarker) || !source.includes(listMarker)) {
    console.warn('• plugins/ui-registry.ts is missing the UI markers; add the entry manually');
    return;
  }

  source = source.replace(importMarker, `${importLine}\n${importMarker}`);
  source = source.replace(
    listMarker,
    `{ pluginId: ${tsString(id)}, ui: ${identifier} },\n  ${listMarker}`,
  );
  writeFileSync(registryPath, source);
  console.log(`• Registered ${identifier} in plugins/ui-registry.ts`);
}

function updatePluginsPackage({ id }) {
  const pkgPath = join(pluginsRoot, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.dependencies = pkg.dependencies ?? {};
  pkg.dependencies[`@kestrel/plugin-${id}`] = 'workspace:*';
  pkg.dependencies = Object.fromEntries(
    Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`• Added @kestrel/plugin-${id} to plugins/package.json`);
}

function updateDockerfiles({ id }) {
  for (const file of ['Dockerfile', 'Dockerfile.worker']) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    let source = readFileSync(path, 'utf8');
    const line = `COPY plugins/${id}/package.json plugins/${id}/`;
    if (source.includes(line)) continue;
    const marker = '# @kestrel:plugin-package-json-end';
    if (!source.includes(marker)) {
      console.warn(`• ${file} is missing the plugin COPY markers; add ${line} manually`);
      continue;
    }
    source = source.replace(marker, `${line}\n${marker}`);
    writeFileSync(path, source);
    console.log(`• Added plugin package.json COPY to ${file}`);
  }
}

function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help || positional.length === 0) {
    console.log(`
Usage: pnpm create:plugin <plugin-id> [--name "Display Name"] [--category <category>] [--description "..."]

Categories: ${[...CATEGORIES].join(', ')}
`);
    process.exit(flags.help ? 0 : 1);
  }

  const id = positional[0];
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) {
    fail(`Plugin id must be kebab-case (e.g. "paper-trading"), got "${id}".`);
  }

  const name = flags.name ?? titleCase(id);
  const description = flags.description ?? `Adds ${name} capabilities to Kestrel.`;
  const category = flags.category ?? 'quant-research';
  if (!CATEGORIES.has(category)) {
    fail(`Unknown category "${category}". Use one of: ${[...CATEGORIES].join(', ')}`);
  }
  if (id.length > 48) {
    fail('Plugin id must be 48 characters or fewer.');
  }

  const pluginDir = join(pluginsRoot, id);
  if (existsSync(pluginDir)) {
    fail(`plugins/${id} already exists.`);
  }

  writeFile(join(pluginDir, 'package.json'), packageJson({ id, name, description }));
  writeFile(join(pluginDir, 'tsconfig.json'), tsconfig());
  writeFile(join(pluginDir, 'tsconfig.build.json'), buildTsconfig());
  writeFile(join(pluginDir, 'eslint.config.js'), eslintConfig());
  writeFile(join(pluginDir, 'vitest.config.ts'), vitestConfig());
  writeFile(join(pluginDir, 'src', 'index.ts'), pluginEntry({ id, name, description, category }));
  writeFile(join(pluginDir, 'src', 'ui', 'index.tsx'), pluginUi());
  writeFile(join(pluginDir, 'skills', 'default-skill', 'SKILL.md'), skillMarkdown({ id, name }));
  writeFile(join(pluginDir, 'test', 'plugin.test.ts'), pluginTest({ id }));

  updatePluginsPackage({ id });
  updateRegistry({ id });
  updateUiRegistry({ id });
  updateDockerfiles({ id });

  console.log(`
✔ Created plugins/${id}

Next steps:
  1. pnpm install
  2. pnpm --filter @kestrel/plugin-${id} test
  3. Start the app and install the plugin from /settings/plugins (Phase 2 UI).
`);
}

main();
