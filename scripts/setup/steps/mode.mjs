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

import { getDockerInfo, waitForDocker } from '../lib/prereqs.mjs';
import { confirm, select } from '../lib/prompts.mjs';
import { box, info, note, paint, renderComparison, startSpinner, warn } from '../lib/ui.mjs';

export const title = 'Choose your setup mode';

export const hint = 'Docker with bundled Postgres or external Postgres';

const DOCKER_FEATURES = [
  ['✓', 'Postgres 16 + pgvector', 'Full RAG & memory'],
  ['✓', 'Worker daemon', 'Live SignalR + crons'],
  ['✓', 'Langfuse UI', 'LLM observability'],
  ['✓', 'All features enabled', 'Production-ready'],
  ['!', 'Slower first start', 'Docker build ~3-5 min'],
  ['!', 'More resource usage', '~2GB RAM recommended'],
];

function featureRow([icon, feat, desc]) {
  const iconPainted =
    icon === '✓' ? paint('✓', 'success') : icon === '!' ? paint('!', 'warn') : paint('✗', 'danger');
  return `${iconPainted}  ${feat.padEnd(28)} ${paint(desc, 'dim')}`;
}

function printModeBoxes(io) {
  box(
    io,
    'Full mode (Docker)',
    [
      `${paint('Recommended for:', 'bold')} a complete self-hosted install`,
      '',
      ...DOCKER_FEATURES.map(featureRow),
      '',
      `${paint('What it does:', 'bold')} runs the complete app automatically`,
    ],
    { color: 'brand', minWidth: 54 },
  );
  io.line();
}

function printByokNote(io, compact) {
  if (compact) {
    info(
      io,
      'BYOK: no server-level AI keys needed — add yours after registering (Settings → API Keys).',
    );
    return;
  }
  note(
    io,
    'Bring Your Own Key (BYOK)',
    [
      'No server-level AI keys are needed to start the app.',
      'After registering, add your AI provider key via the',
      'onboarding wizard or Settings → API Keys.',
      'Your key is encrypted at rest (AES-256-GCM).',
      'Supported: Gemini · Vertex · Anthropic · OpenAI · Groq ·',
      'Mistral · OpenRouter · xAI · DeepSeek · IAMHC API',
    ],
    'info',
  );
}

/** Compact two-column comparison used on the full-screen mode page. */
function printCompactComparison(io) {
  const lines = renderComparison({
    leftTitle: 'External Postgres',
    left: [
      ['✓', 'Bring your own database'],
      ['✓', 'Dockerized app & worker'],
      ['✓', 'Full web app + AI chat'],
      ['!', 'Must configure DB manually'],
    ],
    rightTitle: 'Full — Docker stack',
    right: [
      ['✓', 'Postgres 16 + pgvector'],
      ['✓', 'Worker · live market data'],
      ['✓', 'Langfuse observability'],
      ['!', 'First build ~3–5 min'],
    ],
    width: 60,
  });
  for (const line of lines) io.line(`  ${line}`);
  io.line();
}

export async function run(ctx) {
  const { io, flags } = ctx;
  if (ctx.pageMode) printCompactComparison(io);
  else printModeBoxes(io);

  const docker = ctx.prereqs?.docker ?? getDockerInfo();
  const auto = flags.yes || flags.json || !io.isTTY;

  if (flags.mode) {
    let mode = flags.mode;
    if (mode === 'docker') {
      let ready = docker.ready;
      if (!ready && docker.installed) {
        const spinner = startSpinner(io, 'Waiting for Docker Desktop');
        ready = await waitForDocker();
        spinner.stop(ready ? 'Docker Desktop is ready' : null);
      }
      if (!ready) {
        throw new Error('Docker Desktop is not running.');
      }
    }
    ctx.answers.mode = mode;
    io.line();
    io.line(
      `  ${paint('→', 'success')} Selected: ${paint(
        mode === 'docker' ? 'Full mode (Docker)' : 'External Postgres',
        'bold',
        mode === 'docker' ? 'brand' : 'muted',
      )} ${paint('(from --mode)', 'dim')}`,
    );
    printByokNote(io, ctx.pageMode);
    return 'ok';
  }

  let mode;
  const choice = await select(io, {
    message: 'Choose your setup mode',
    options: [
      {
        value: 'docker',
        label: 'Full mode (Docker)',
        description: docker.ready
          ? 'Docker with bundled Postgres'
          : 'Requires Docker Desktop to be running',
      },
      {
        value: 'external',
        label: 'External Postgres',
        description: 'Bring your own Postgres database (Docker not required)',
      },
    ],
    initialValue: 'docker',
    auto,
  });
  if (choice === 'cancel') return 'abort';
  mode = choice;

  if (mode === 'docker' && !docker.ready) {
    const retry = await confirm(io, {
      message: 'Docker Desktop is not ready. Wait up to 60 seconds for it?',
      initial: true,
      auto,
    });
    if (retry === 'cancel') return 'abort';
    if (retry) {
      const spinner = startSpinner(io, 'Waiting for Docker Desktop');
      docker.ready = await waitForDocker();
      spinner.stop(docker.ready ? 'Docker Desktop is ready' : null);
    }
    if (!docker.ready) throw new Error('Docker Desktop is not running.');
  }

  ctx.answers.mode = mode;
  io.line();
  io.line(
    `  ${paint('→', 'success')} Selected: ${paint(mode === 'docker' ? 'Full mode (Docker)' : 'External Postgres', 'bold', mode === 'docker' ? 'brand' : 'muted')}`,
  );
  printByokNote(io, ctx.pageMode);
  return 'ok';
}
