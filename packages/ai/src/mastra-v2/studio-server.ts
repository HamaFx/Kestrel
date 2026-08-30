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

// SPDX-License-Identifier: Apache-2.0

/**
 * Standalone Mastra Studio development server.
 *
 * The current `mastra dev` CLI cannot bundle this workspace reliably: its bundler
 * inlines the whole workspace graph (including `@kestrel/shared` → pino)
 * and then *validates* the bundle by importing it with externals stubbed
 * to `{}`, which crashes on our module-scope `pino(...)` call in
 * `packages/shared/src/logger.ts`. The version skew between the CLI
 * (1.x launcher) and core (1.60) compounds this.
 *
 * Instead of fighting the CLI, this entry runs the Mastra HTTP server +
 * Studio directly against the *built* `@kestrel/ai` package via
 * `createNodeServer()` from `@mastra/deployer/server` — the same server
 * the CLI spawns, minus the bundler. Run it with:
 *
 *   node --conditions=react-server dist/mastra-v2/studio-server.js
 *
 * `--conditions=react-server` makes Node resolve `server-only` to its
 * no-op `empty.js` variant (the app's own worker build does the same via
 * an esbuild stub), so importing `@kestrel/shared/encryption` etc. doesn't
 * throw outside Next.js.
 *
 * Studio assets are served from `MASTRA_STUDIO_PATH` (defaults to the
 * CLI's bundled `dist/studio` directory) — see `resolveStudioPath()`.
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Mastra } from '@mastra/core';
import { createNodeServer } from '@mastra/deployer/server';

import { createKestrelMastra, MASTRA_DEFAULT_PORT } from './instance.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const log = {
  info: (message: string, data?: unknown) => console.info(`[studio] ${message}`, data ?? ''),
  warn: (message: string, data?: unknown) => console.warn(`[studio] ${message}`, data ?? ''),
};

/** Locate the prebuilt Studio UI assets shipped inside the `mastra` CLI package. */
function resolveStudioPath(): string {
  const fromEnv = process.env.MASTRA_STUDIO_PATH;
  if (fromEnv) return fromEnv;
  // `mastra` (the CLI, which ships the bundled Studio UI in dist/studio) is a
  // devDependency of this package; resolve its real location through pnpm's
  // symlink so we don't hardcode a .pnpm store path.
  const candidates: string[] = [];
  try {
    const cliPkg = dirname(require.resolve('mastra/package.json'));
    candidates.push(join(cliPkg, 'dist', 'studio'));
  } catch {
    // CLI not installed — fall through to a copied Studio build.
  }
  candidates.push(join(process.cwd(), '.mastra', 'output', 'studio'));
  for (const candidate of candidates) {
    try {
      if (existsSync(join(candidate, 'index.html'))) return candidate;
    } catch {
      // keep probing
    }
  }
  return candidates[0]!;
}

async function main(): Promise<void> {
  const studioPath = resolveStudioPath();
  if (process.env.MASTRA_STUDIO_PATH === undefined) process.env.MASTRA_STUDIO_PATH = studioPath;

  const { instance } = createKestrelMastra({ runWorkers: true });

  // Register canonical (non-BYOK) agents and workflows on the instance so
  // Studio's agents/workflows views are populated. These use operator-level
  // models resolved from env; the per-request BYOK factories in the web/worker
  // paths remain the production entry points.
  await registerCanonicalComponents(instance);

  const port = Number(process.env.MASTRA_SERVER_PORT ?? '') || MASTRA_DEFAULT_PORT;

  log.info(`building Mastra server (studio: ${studioPath})`);
  await createNodeServer(instance, {
    studio: true,
    isDev: true,
    tools: {},
  });

  log.info(`Mastra Studio ready at http://localhost:${port} (serving ${studioPath})`);
}

main().catch((err: unknown) => {
  console.error('[studio] failed to start:', err);
  process.exit(1);
});

/**
 * Register canonical (non-BYOK) agents and workflows on the Mastra instance
 * so Studio's agent/workflow views are populated. These use operator-level
 * models resolved from env; the per-request BYOK factories in the web/worker
 * paths remain the production entry points.
 *
 * Best-effort: if model resolution or registration fails, the server still
 * starts — Studio just shows an empty agents/workflows list.
 */
async function registerCanonicalComponents(instance: Mastra): Promise<void> {
  try {
    const { resolveChatModel } = await import('../model');
    const { createXauusdMastraAgent } = await import('../mastra/agent');
    const { createSymbolResearchWorkflow } = await import('./workflows/symbol-research');
    const { createXauusdReportWorkflow } = await import('./workflows/xauusd-report');
    const { createMutationWorkflow } = await import('./workflows/mutation');

    const env = process.env as never;
    const resolution = resolveChatModel(
      { aiApiKeys: null, chatModel: process.env.AI_DEFAULT_MODEL ?? null },
      env,
      'technical',
    );

    // Canonical XAUUSD conversation agent.
    const agent = createXauusdMastraAgent({ model: resolution.model });
    (
      instance as unknown as { __registerFsAgents: (agents: Record<string, unknown>) => void }
    ).__registerFsAgents({ xauusdConversation: agent });

    // Canonical workflows (non-BYOK, for Studio visibility only).
    const mastra = instance;
    const symbolResearch = createSymbolResearchWorkflow(
      {
        model: resolution.model,
        modelId: resolution.modelId,
        providerId: resolution.providerId,
        memory: undefined as never,
        specialistCallOptions: {} as never,
        fusionCallOptions: {} as never,
        mastra,
      },
      'standard',
    );
    const xauusdReport = createXauusdReportWorkflow({
      agent: agent as never,
      callOptions: {} as never,
      providerId: resolution.providerId,
      mastra,
    });
    const workflows: Record<string, unknown> = {
      symbolResearch,
      xauusdResearch: xauusdReport,
    };
    for (const kind of [
      'set_alert',
      'log_journal',
      'share_snapshot',
      'run_system_action',
    ] as const) {
      const mutationWf = createMutationWorkflow({
        mutation: kind,
        userId: 'studio-canonical',
        threadId: 'studio',
        execute: async () => {
          throw new Error('Studio mutations are view-only');
        },
        writeAudit: async () => {},
        mastra,
      });
      workflows[`mutationWorkflows-${kind}`] = mutationWf;
    }
    (
      instance as unknown as { __registerFsWorkflows: (wfs: Record<string, unknown>) => void }
    ).__registerFsWorkflows(workflows);

    log.info('registered canonical agents + workflows');
  } catch (err) {
    log.warn('[studio] canonical component registration skipped', {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
