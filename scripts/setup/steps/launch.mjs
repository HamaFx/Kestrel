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

import { resolve } from 'node:path';

import { upsertEnvFile } from '../lib/env.mjs';
import { getPackageManager, packageManagerLabel } from '../lib/prereqs.mjs';
import { confirm } from '../lib/prompts.mjs';
import {
  findFreePort,
  getComposeHostPorts,
  getOwnPublishedPorts,
  isPortInUse,
  openBrowser,
  waitForApp,
} from '../lib/run.mjs';
import { box, fail, info, note, ok, paint, startSpinner, warn } from '../lib/ui.mjs';

export const title = 'Ready to launch';

export const hint = 'Setup is complete — the summary below shows how to get started';

const APP_URL = 'http://localhost:3000';
const HEALTH_URL = 'http://localhost:3000/api/health/public';

// Published host ports that can be remapped via .env, keyed by service.
const PORT_REMAPS = {
  db: { key: 'POSTGRES_PUBLISHED_PORT', label: 'database', start: 5433 },
  app: { key: 'APP_PUBLISHED_PORT', label: 'web app', start: 3001 },
};

function printSummary(ctx) {
  const { io, answers } = ctx;
  const keys = Object.keys(answers.marketKeys ?? {});
  const summaryLines = [
    `${paint('Mode:', 'bold')}           ${answers.mode === 'docker' ? 'Full mode (Docker)' : 'Simple mode'}`,
    `${paint('AI providers:', 'bold')}     ${paint('BYOK — add keys after registration', 'cyan')}`,
    `${paint('Market data:', 'bold')}      ${
      keys.length > 0
        ? keys.map((k) => k.replace('_API_KEY', '')).join(', ')
        : paint('none (optional)', 'dim')
    }`,
    `${paint('Config file:', 'bold')}     ${answers.mode === 'docker' ? '.env' : '.env.local'}`,
    `${paint('Next steps:', 'bold')}`,
    '  1. Start the app',
    '  2. Register at /register',
    '  3. Add your AI key in the onboarding wizard',
  ];
  box(io, 'Setup Summary', summaryLines, { color: 'green', minWidth: 52 });
}

function printGettingStarted(io) {
  note(
    io,
    'Getting Started',
    [
      '1. Register your owner account at /register',
      '2. Add your AI provider key: Settings → API Keys',
      '   (or walk through the onboarding wizard)',
      '3. Ask: "What is the current XAUUSD price?"',
    ],
    'green',
  );
}

/** Compact summary used on the full-screen launch page. */
function printCompactSummary(ctx) {
  const { io, answers } = ctx;
  const keys = Object.keys(answers.marketKeys ?? {});
  const lines = [
    `${paint('Mode:', 'bold')}         ${answers.mode === 'docker' ? 'Full mode (Docker)' : 'Simple mode'}`,
    `${paint('Market data:', 'bold')}  ${
      keys.length > 0
        ? keys.map((k) => k.replace('_API_KEY', '')).join(', ')
        : paint('none (optional)', 'dim')
    }`,
    `${paint('Config file:', 'bold')} ${answers.mode === 'docker' ? '.env' : '.env.local'}`,
    `${paint('App URL:', 'bold')}     ${APP_URL}`,
  ];
  box(io, 'Setup complete', lines, { color: 'green', minWidth: 44 });
}

export async function run(ctx) {
  const { io, flags } = ctx;
  const repoRoot = resolve(ctx.root ?? process.cwd());
  const isDocker = ctx.answers.mode === 'docker';

  if (ctx.pageMode) {
    printCompactSummary(ctx);
    io.line();
    info(io, `Register at ${APP_URL}/register, then add your AI key in Settings → API Keys.`);
    io.line();
  } else {
    printSummary(ctx);
    printGettingStarted(io);
    io.line();
  }

  const startCommand = isDocker
    ? 'docker compose up -d --build'
    : `${packageManagerLabel(getPackageManager())} dev:local`;

  io.line();
  io.line(`  ${paint('Ready to launch! 🚀', 'bold', 'green')}`);
  io.line();
  io.line(`  ${paint('Start command:', 'bold')} ${paint(startCommand, 'green')}`);
  io.line(`  ${paint('App URL:', 'bold')}       ${APP_URL}`);
  if (isDocker) io.line(`  ${paint('Langfuse:', 'bold')}      http://localhost:3001`);
  io.line(`  ${paint('Register:', 'bold')}      ${APP_URL}/register`);
  io.line();

  if (flags.dryRun) {
    info(io, '[dry-run] would start the app with the command above and open the browser.');
    return 'ok';
  }

  if (flags.noLaunch) {
    info(io, 'Skipping launch (--no-launch). Run it whenever you are ready:');
    io.line(`  ${paint(startCommand, 'green')}`);
    return 'ok';
  }

  const start = await confirm(io, {
    message: isDocker ? 'Start the Docker stack now?' : 'Start dev server now?',
    initial: true,
    auto: flags.yes || flags.json || !io.isTTY,
  });
  if (start === 'cancel') return 'abort';
  if (!start) {
    io.line();
    info(io, 'Run when ready:');
    io.line(`  ${paint(startCommand, 'green')}`);
    return 'ok';
  }

  io.line();
  io.line(
    `  ${paint(isDocker ? 'Building & starting Docker stack...' : 'Starting Kestrel...', 'cyan')}`,
  );
  io.line(`  ${paint('Press Ctrl+C to stop', 'dim')}`);
  io.line();

  const { spawn } = await import('node:child_process');

  if (isDocker) {
    // Pre-flight: catch host port conflicts BEFORE the multi-minute image
    // build, and offer a one-line remap (written to .env) instead of
    // failing after everything has already been built.
    const envPath = resolve(repoRoot, '.env');
    const effective = await ensureFreePorts(ctx, repoRoot, envPath);
    if (effective === null) return 'abort';
    const appUrl = `http://localhost:${effective.appPort}`;
    const healthUrl = `${appUrl}/api/health/public`;

    // B2: The Dockerfiles use BuildKit-only cache mounts
    // (--mount=type=cache,id=pnpm). Without DOCKER_BUILDKIT=1 the pnpm store
    // cache is silently ignored, forcing a full dependency re-download on
    // every rebuild. This matches the env set in the VM and CI build paths.
    // BUILDKIT_PROGRESS=plain prints each build line once instead of the
    // animated TTY progress UI that redraws the whole block every second.
    const buildEnv = {
      ...process.env,
      DOCKER_BUILDKIT: '1',
      COMPOSE_DOCKER_CLI_BUILD: '1',
      BUILDKIT_PROGRESS: 'plain',
    };
    // Pipe the child's output instead of inheriting the TTY: compose falls
    // back to plain (non-animated) output when stdout/stderr are not a
    // terminal, so build progress prints once instead of every second.
    // Output is forwarded through `io` — in --json mode that keeps stdout
    // pure for the JSON result (wizard text goes to stderr there).
    const child = spawn('docker', ['compose', 'up', '-d', '--build'], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: buildEnv,
    });
    child.stdout?.on('data', (chunk) => io.write(chunk));
    child.stderr?.on('data', (chunk) => io.write(chunk));
    child.on('error', (err) => {
      warn(io, `Failed to start Docker: ${err.message}`);
    });
    child.on('exit', async (code) => {
      if (code === 0) {
        const spinner = startSpinner(io, 'Waiting for the app to become ready');
        const ready = await waitForApp(healthUrl, 180_000);
        spinner.stop(ready ? 'The app is ready' : null);
        if (ready) {
          ok(io, 'Full mode is ready. Opening it in your browser.');
          openBrowser(io, appUrl);
        } else {
          warn(io, 'The app is still warming up. Open the URL in a moment.');
        }
        printDockerHints(io, effective.appPort);
      } else {
        fail(io, 'Docker compose failed. Check the output above.');
      }
    });
    // The wizard stays attached to the stack log until the user stops it.
    return 'ok';
  }

  const manager = getPackageManager();
  if (!manager) {
    fail(io, 'The package manager is no longer available. Please restart setup.');
    return 'abort';
  }
  const child = spawn(manager.command, [...manager.prefix, 'dev:local'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, KESTREL_LOCAL_DEV: '1' },
  });
  child.on('error', (err) => {
    warn(io, `Failed to start the app: ${err.message}`);
  });
  child.on('spawn', async () => {
    const spinner = startSpinner(io, 'Waiting for the app to become ready');
    const ready = await waitForApp(HEALTH_URL, 120_000);
    spinner.stop(ready ? 'The app is ready' : null);
    if (ready) {
      ok(io, 'The app is ready. Opening it in your browser.');
      openBrowser(io, APP_URL);
    } else {
      warn(io, 'The app is still starting. Open the URL in a moment.');
    }
  });
  return 'ok';
}

function printDockerHints(io, appPort = 3000) {
  io.line();
  io.line(`  ${paint('Web app:', 'bold')}    http://localhost:${appPort}`);
  io.line(`  ${paint('Logs:', 'dim')}       docker compose logs -f app`);
  io.line(`  ${paint('Stop:', 'dim')}       docker compose down`);
  io.line();
}

/**
 * Verify the published host ports are free before the build starts. On a
 * conflict the user is offered a remap (e.g. 5432 → 127.0.0.1:5433)
 * which is written back to .env so compose picks it up. Returns
 * { appPort } — the effective web-app host port — or null to abort.
 * Ports held by this compose project's own running containers are not
 * conflicts (compose reuses them).
 */
async function ensureFreePorts(ctx, repoRoot, envPath) {
  const { io, flags } = ctx;
  let hostPorts = getComposeHostPorts(repoRoot);
  if (hostPorts === null) {
    warn(io, 'Could not resolve the stack ports — skipping the pre-flight port check.');
    return { appPort: 3000 };
  }
  const ownPorts = getOwnPublishedPorts(repoRoot);
  const auto = flags.yes || flags.json || !io.isTTY;

  for (const entry of hostPorts) {
    const checkHost = !entry.host || entry.host === '0.0.0.0' ? '127.0.0.1' : entry.host;
    if (ownPorts.has(entry.port)) continue;
    if (!(await isPortInUse(entry.port, checkHost))) continue;

    const remap = PORT_REMAPS[entry.service];
    if (!remap) {
      warn(io, `Port ${entry.port} (${entry.service}) is already in use — the stack may fail to start.`);
      continue;
    }
    const freePort = await findFreePort(remap.start, '127.0.0.1');
    if (freePort === null) {
      warn(io, `No free port found near ${entry.port} for the ${remap.label}. Free one up and re-run.`);
      return null;
    }
    const proposed = `127.0.0.1:${freePort}`;
    const answer = await confirm(io, {
      message: `Port ${entry.port} is already in use. Use ${proposed} for the ${remap.label} instead?`,
      initial: true,
      auto,
    });
    if (answer === 'cancel') return null;
    if (!answer) {
      warn(io, `Keeping port ${entry.port}. If the stack fails to start, set ${remap.key} in .env.`);
      continue;
    }
    upsertEnvFile(envPath, { [remap.key]: proposed }, { backup: false });
    ok(io, `Port ${entry.port} was taken — the ${remap.label} will use ${proposed} (saved to .env).`);
    entry.port = freePort;
  }

  const appEntry = hostPorts.find((entry) => entry.service === 'app');
  return { appPort: appEntry?.port ?? 3000 };
}
