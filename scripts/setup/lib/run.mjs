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

/**
 * Process helpers: spawning install/launch commands, health polling,
 * opening the browser, and validating docker compose configs.
 */

import { execFileSync, spawn } from 'node:child_process';
import { createConnection } from 'node:net';

import { hasBin } from './prereqs.mjs';
import { info } from './ui.mjs';

/** Spawn a child process and resolve when it exits. */
export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: options.stdio ?? 'inherit',
      env: options.env,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

/** Validate that a docker compose file parses. Returns { ok, error }. */
export function checkComposeConfig(cwd) {
  try {
    execFileSync('docker', ['compose', 'config', '--quiet'], { cwd, stdio: 'pipe' });
    return { ok: true, error: null };
  } catch (err) {
    const stderr = err?.stderr?.toString?.() ?? String(err?.message ?? err);
    return { ok: false, error: stderr };
  }
}

/** True when a TCP host:port currently has a listener. */
export function isPortInUse(port, host = '127.0.0.1', timeoutMs = 750) {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const done = (inUse) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolvePromise(inUse);
    };
    // A reachable listener means the port is taken; a refusal or timeout
    // means nothing is bound there (localhost refuses immediately).
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/** Find the first free host port at or above `start`. Returns null when none is found. */
export async function findFreePort(start, host = '127.0.0.1', maxTries = 50) {
  for (let port = start; port < start + maxTries; port++) {
    if (!(await isPortInUse(port, host))) return port;
  }
  return null;
}

/**
 * Resolve the host ports the stack publishes via `docker compose config`.
 * Returns [{ service, host, port, target }] or null when the config
 * cannot be resolved (docker missing or compose broken). Profile-gated
 * services (e.g. langfuse) are excluded by compose itself.
 */
export function getComposeHostPorts(cwd) {
  try {
    const out = execFileSync('docker', ['compose', 'config', '--format', 'json'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const config = JSON.parse(out);
    const ports = [];
    for (const [service, def] of Object.entries(config.services ?? {})) {
      for (const p of def.ports ?? []) {
        if (p.published === undefined) continue;
        ports.push({
          service,
          host: p.host_ip ?? '0.0.0.0',
          port: Number(p.published),
          target: p.target,
        });
      }
    }
    return ports;
  } catch {
    return null;
  }
}

/**
 * Host ports already published by this compose project's own running
 * containers. The wizard skips these in its conflict check: a port held
 * by the project itself (e.g. re-running setup on a live stack) is not a
 * conflict — compose reuses the container instead of rebinding.
 */
export function getOwnPublishedPorts(cwd) {
  try {
    const out = execFileSync('docker', ['compose', 'ps', '--format', 'json'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(out);
    const containers = Array.isArray(parsed) ? parsed : Object.values(parsed ?? {});
    const ports = new Set();
    for (const container of containers) {
      for (const entry of String(container.Ports ?? '').split(',')) {
        const match = entry.trim().match(/^(?:[^:]+:)?(\d+)->\d+\/tcp$/);
        if (match) ports.add(Number(match[1]));
      }
    }
    return ports;
  } catch {
    return new Set();
  }
}

/** Poll an HTTP endpoint until it responds OK. */
export async function waitForApp(url, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // server still starting
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }
  return false;
}

/** Open a URL in the platform browser; prints the URL on headless boxes. */
export function openBrowser(io, url) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else if (hasBin('xdg-open')) {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      info(io, `Open this address in your browser: ${url}`);
    }
  } catch {
    info(io, `Open this address in your browser: ${url}`);
  }
}

/** Mask a sensitive value for display: "abcd••••••wxyz". */
export function maskKey(key) {
  if (!key || key.length < 8) return key;
  return key.slice(0, 4) + '•'.repeat(Math.min(20, key.length - 8)) + key.slice(-4);
}
