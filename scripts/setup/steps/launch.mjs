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

import { readEnvFile, upsertEnvFile } from '../lib/env.mjs';
import { getPackageManager, packageManagerLabel } from '../lib/prereqs.mjs';
import { confirm } from '../lib/prompts.mjs';
import {
  checkComposeConfig,
  diagnoseComposeError,
  findFreePort,
  getComposeHostPorts,
  getComposeServiceState,
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
    `${paint('AI providers:', 'bold')}     ${paint('BYOK — add keys after registration', 'muted')}`,
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
  box(io, 'Setup Summary', summaryLines, { color: 'success', minWidth: 52 });
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
    'info',
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
  box(io, 'Setup complete', lines, { color: 'success', minWidth: 44 });
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

  // Langfuse observability is opt-in (compose profile `observability`).
  // Offer it here so the launch command, port pre-flight, and the final
  // interfaces list can all reflect the choice.
  let langfuseEnabled = false;
  if (isDocker) {
    const enableLangfuse = await confirm(io, {
      message: 'Enable Langfuse observability at http://localhost:3001? (AI trace viewer)',
      initial: false,
      auto: flags.yes || flags.json || !io.isTTY,
    });
    if (enableLangfuse === 'cancel') return 'abort';
    langfuseEnabled = enableLangfuse;
    ctx.answers.langfuseEnabled = langfuseEnabled;
    if (langfuseEnabled) {
      ok(io, 'Langfuse enabled — trace viewer at http://localhost:3001.');
      // The endpoint is deterministic; only the project keys are created in
      // the Langfuse UI later. Record the base URL now so the app just needs
      // LANGFUSE_PUBLIC_KEY/SECRET_KEY once the user has created a project.
      // The app runs inside the Compose network, so it must export to the
      // internal service URL (langfuse:3000), not the host-facing 3001.
      if (!flags.dryRun) {
        const envPath = resolve(repoRoot, '.env');
        const { changed } = upsertEnvFile(
          envPath,
          { LANGFUSE_BASE_URL: 'http://langfuse:3000' },
          { backup: false },
        );
        if (changed) info(io, 'Saved LANGFUSE_BASE_URL=http://langfuse:3000 to .env');
      }
    }
  }

  const profileArgs = langfuseEnabled ? ['--profile', 'observability'] : [];
  const startCommand = isDocker
    ? `docker compose${langfuseEnabled ? ' --profile observability' : ''} up -d --build`
    : `${packageManagerLabel(getPackageManager())} dev:local`;

  io.line();
  io.line(`  ${paint('Ready to launch! 🚀', 'bold', 'brand')}`);
  io.line();
  io.line(`  ${paint('Start command:', 'bold')} ${paint(startCommand, 'brand')}`);
  io.line(`  ${paint('App URL:', 'bold')}       ${APP_URL}`);
  if (isDocker) {
    io.line(
      langfuseEnabled
        ? `  ${paint('Langfuse:', 'bold')}      http://localhost:3001`
        : `  ${paint('Langfuse:', 'bold')}      ${paint('http://localhost:3001 (opt-in — not enabled)', 'dim')}`,
    );
  }
  io.line(`  ${paint('Register:', 'bold')}      ${APP_URL}/register`);
  io.line();

  if (flags.dryRun) {
    info(io, '[dry-run] would start the app with the command above and open the browser.');
    return 'ok';
  }

  if (flags.noLaunch) {
    info(io, 'Skipping launch (--no-launch). Run it whenever you are ready:');
    io.line(`  ${paint(startCommand, 'brand')}`);
    if (langfuseEnabled) printLangfuseConnectGuide(io);
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
    io.line(`  ${paint(startCommand, 'brand')}`);
    return 'ok';
  }

  io.line();
  io.line(
    `  ${paint(isDocker ? 'Building & starting Docker stack...' : 'Starting Kestrel...', 'info')}`,
  );
  io.line(`  ${paint('Press Ctrl+C to stop', 'dim')}`);
  io.line();

  const { spawn } = await import('node:child_process');

  if (isDocker) {
    // Pre-flight: catch host port conflicts BEFORE the multi-minute image
    // build, and offer a one-line remap (written to .env) instead of
    // failing after everything has already been built. When Langfuse is
    // enabled its profile service (127.0.0.1:3001) is included.
    const envPath = resolve(repoRoot, '.env');
    const effective = await ensureFreePorts(ctx, repoRoot, envPath, profileArgs);
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
    // pure for the JSON result (wizard text goes to stderr there). A tail
    // of the output is also captured so a failure can be diagnosed.
    let buildOutput = '';
    const capture = (chunk) => {
      buildOutput += chunk;
      if (buildOutput.length > 64 * 1024) buildOutput = buildOutput.slice(-64 * 1024);
    };
    const child = spawn('docker', ['compose', ...profileArgs, 'up', '-d', '--build'], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: buildEnv,
    });
    child.stdout?.on('data', (chunk) => {
      io.write(chunk);
      capture(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      io.write(chunk);
      capture(chunk);
    });
    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        fail(io, "Docker doesn't appear to be installed (not found on your PATH).");
        info(io, 'Install Docker (https://docs.docker.com/get-docker/), then re-run the setup wizard.');
      } else {
        fail(io, `Failed to start Docker: ${err.message}`);
      }
    });
    child.on('exit', async (code) => {
      if (code === 0) {
        const spinner = startSpinner(io, 'Waiting for the app to become ready');
        // Abort early when the app container is crash-looping instead of
        // burning the full timeout on a stack that will never come up.
        const ready = await waitForApp(healthUrl, 180_000, {
          shouldAbort: () => getComposeServiceState(repoRoot, 'app') === 'restarting',
        });
        spinner.stop(ready ? 'The app is ready' : null);
        if (ready) {
          ok(io, 'Full mode is ready. Opening it in your browser.');
          openBrowser(io, appUrl);
        } else {
          const state = getComposeServiceState(repoRoot, 'app');
          if (state === 'restarting') {
            warn(io, 'The app container is crash-looping (restarting repeatedly).');
          } else {
            warn(io, 'The app did not become ready within 3 minutes.');
          }
          io.line();
          info(io, 'Diagnose it with:');
          io.line(`  ${paint('docker compose ps', 'brand')}  ${paint('·', 'dim')}  ${paint('docker compose logs app', 'brand')}`);
          info(io, `You can still try opening: ${paint(appUrl, 'brand')}`);
          io.line();
        }
        printDockerHints(io, {
          appPort: effective.appPort,
          dbPort: effective.dbPort,
          langfuseEnabled,
        });
        if (langfuseEnabled) printLangfuseConnectGuide(io);
      } else {
        // Turn the raw compose output into a clear diagnosis instead of
        // just "check the output above".
        printLaunchFailure(io, buildOutput);
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

function printDockerHints(io, { appPort = 3000, dbPort = 5432, langfuseEnabled = false } = {}) {
  io.line();
  box(
    io,
    'Interfaces',
    [
      `${paint('Web app:', 'bold')}    http://localhost:${appPort}`,
      `${paint('Register:', 'bold')}   http://localhost:${appPort}/register`,
      langfuseEnabled
        ? `${paint('Langfuse:', 'bold')}    http://localhost:3001  ${paint('(AI trace viewer)', 'dim')}`
        : `${paint('Langfuse:', 'bold')}    ${paint('not enabled', 'dim')}  → docker compose --profile observability up -d`,
      `${paint('Database:', 'bold')}   127.0.0.1:${dbPort}  ${paint('(Postgres)', 'dim')}`,
      '',
      `${paint('Logs:', 'bold')}       docker compose logs -f app`,
      `${paint('Stop:', 'bold')}       docker compose down`,
    ],
    { color: 'brand', minWidth: 46 },
  );
  io.line();
}

/**
 * Walk the user through the one step the wizard cannot automate: creating a
 * project in the Langfuse UI and connecting its keys to the app.
 */
function printLangfuseConnectGuide(io) {
  io.line();
  box(
    io,
    'Connect your app to Langfuse',
    [
      `1. Open ${paint('http://localhost:3001', 'brand')} and create your account (first run)`,
      '2. Create a project, e.g. "kestrel"',
      '3. Open Project Settings → API Keys and copy the Public & Secret keys',
      `4. Add them to ${paint('.env', 'brand')} (LANGFUSE_BASE_URL is already set):`,
      `   ${paint('LANGFUSE_PUBLIC_KEY=pk-…', 'brand')}`,
      `   ${paint('LANGFUSE_SECRET_KEY=sk-…', 'brand')}`,
      `5. Restart the app: ${paint('docker compose restart app', 'brand')}`,
      'Traces from your next chat will appear in Langfuse.',
    ],
    { color: 'info', minWidth: 48 },
  );
  io.line();
}

/** Explain a failed `docker compose up` with targeted, actionable help. */
function printLaunchFailure(io, buildOutput) {
  io.line();
  fail(io, 'Docker compose failed to start the stack.');
  const diagnosis = diagnoseComposeError(buildOutput);
  if (diagnosis) {
    io.line();
    box(io, 'What went wrong', [diagnosis.summary], { color: 'danger', minWidth: 46 });
    box(
      io,
      'How to fix',
      diagnosis.fixes.map((fix, index) => `${index + 1}. ${fix}`),
      { color: 'info', minWidth: 46 },
    );
  } else {
    io.line();
    warn(io, 'No recognizable error pattern — the raw output above has the details.');
  }
  io.line();
  info(io, `Retry anytime with: ${paint('docker compose up -d --build', 'brand')}`);
  info(io, `More help: ${paint('docs/troubleshooting.md', 'dim')}`);
  io.line();
}

/**
 * Best-effort port list when `docker compose config` is unavailable:
 * the documented defaults, honoring any overrides already in .env.
 */
function defaultHostPorts(repoRoot, langfuseEnabled = false) {
  const { entries } = readEnvFile(resolve(repoRoot, '.env'));
  const hostPort = (key, fallback) => {
    const raw = String(entries.get(key) ?? fallback);
    const match = raw.match(/:(\d+)$/);
    const port = Number(match ? match[1] : raw);
    return Number.isInteger(port) && port > 0 ? port : Number(fallback.split(':').pop());
  };
  return [
    { service: 'db', host: '127.0.0.1', port: hostPort('POSTGRES_PUBLISHED_PORT', '127.0.0.1:5432'), target: 5432 },
    { service: 'app', host: '127.0.0.1', port: hostPort('APP_PUBLISHED_PORT', '127.0.0.1:3000'), target: 3000 },
    // Observability profile ports, mirrored from the compose file for the
    // best-effort fallback when `docker compose config` is unavailable.
    ...(langfuseEnabled
      ? [
          { service: 'langfuse', host: '127.0.0.1', port: 3001, target: 3000 },
          { service: 'minio', host: '127.0.0.1', port: 9090, target: 9000 },
        ]
      : []),
  ];
}

/**
 * Verify the published host ports are free before the build starts. On a
 * conflict the user is offered a remap (e.g. 5432 → 127.0.0.1:5433)
 * which is written back to .env so compose picks it up. Returns
 * { appPort } — the effective web-app host port — or null to abort.
 * Ports held by this compose project's own running containers are not
 * conflicts (compose reuses them).
 */
async function ensureFreePorts(ctx, repoRoot, envPath, profileArgs = []) {
  const { io, flags } = ctx;
  const langfuseEnabled = profileArgs.includes('observability');
  let hostPorts = getComposeHostPorts(repoRoot, profileArgs);
  if (hostPorts === null) {
    // Never skip the check silently: say why compose config failed, then
    // check the documented defaults as an explicit best effort.
    const { error } = checkComposeConfig(repoRoot);
    warn(io, 'Could not read the stack ports from docker compose — checking the default ports instead.');
    if (error) io.line(paint(`  ${error.trim().split('\n')[0]}`, 'dim'));
    hostPorts = defaultHostPorts(repoRoot, langfuseEnabled);
  }
  const ownPorts = getOwnPublishedPorts(repoRoot, profileArgs);
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
    // Never remap onto another service's published port (e.g. the app onto
    // Langfuse's 3001 when the observability profile is enabled).
    const reserved = new Set(hostPorts.filter((e) => e.service !== entry.service).map((e) => e.port));
    const freePort = await findFreePort(remap.start, '127.0.0.1', 50, reserved);
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
  const dbEntry = hostPorts.find((entry) => entry.service === 'db');
  return { appPort: appEntry?.port ?? 3000, dbPort: dbEntry?.port ?? 5432 };
}
