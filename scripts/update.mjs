#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

const REPOSITORY = 'HamaFx/Kestrel';
const RELEASES_URL = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const ROOT = resolve(import.meta.dirname, '..');
const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const PROTECTED_PATHS = new Set(['.env', '.env.local', '.kestrel', '.hamafx', 'node_modules', '.next', '.git']);
const DEFAULT_HEALTH_URL = 'http://localhost:3000/api/health/public';

export function parseFlags(argv) {
  const flags = { dryRun: false, yes: false, help: false };
  for (const arg of argv) {
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--yes' || arg === '-y') flags.yes = true;
    else if (arg === '--help' || arg === '-h') flags.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return flags;
}

export function normalizeVersion(value) {
  const match = String(value ?? '').trim().match(VERSION_PATTERN);
  if (!match) return null;
  return {
    raw: String(value).trim(),
    version: `${match[1]}.${match[2]}.${match[3]}${match[4] ? `-${match[4]}` : ''}`,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

export function compareVersions(left, right) {
  const a = typeof left === 'string' ? normalizeVersion(left) : left;
  const b = typeof right === 'string' ? normalizeVersion(right) : right;
  if (!a || !b) throw new Error('Cannot compare invalid versions.');
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return a.prerelease > b.prerelease ? 1 : a.prerelease < b.prerelease ? -1 : 0;
}

export function isStableRelease(release) {
  return Boolean(
    release &&
      release.draft === false &&
      release.prerelease === false &&
      normalizeVersion(release.tag_name),
  );
}

export function getInstalledVersion(root = ROOT) {
  try {
    const metadata = JSON.parse(readFileSync(resolve(root, '.kestrel/install.json'), 'utf8'));
    const version = normalizeVersion(metadata.version ?? metadata.releaseTag);
    if (version) return { ...version, source: 'install metadata' };
  } catch {
    // Existing installations do not have metadata until an update completes.
  }

  try {
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    const version = normalizeVersion(packageJson.version);
    if (version) return { ...version, source: 'package.json' };
  } catch {
    // The caller reports a useful installation error.
  }
  return null;
}

export async function fetchLatestRelease(fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(RELEASES_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Kestrel-Updater',
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub could not be reached (${response.status} ${response.statusText}).`);
  }
  const release = await response.json();
  if (!isStableRelease(release)) {
    throw new Error('GitHub returned an invalid or non-stable latest release.');
  }
  return release;
}

export function printHelp(output = console.log) {
  output('Kestrel updater');
  output('');
  output('Usage: pnpm update [options]');
  output('');
  output('Options:');
  output('  --dry-run   Check for an update without changing anything');
  output('  --yes, -y   Accept ordinary confirmations automatically');
  output('  --help, -h  Show this help');
  output('');
  output('The updater uses the newest stable GitHub release.');
  output('It creates a backup, preserves your configuration and data, and checks the app after updating.');
}

function write(output, message) {
  output(message);
}

function ask(question, { yes = false, initial = false, input = process.stdin, output = process.stdout } = {}) {
  if (yes) return Promise.resolve(initial);
  if (!input.isTTY || !output.isTTY) return Promise.resolve(initial);
  const readline = createInterface({ input, output });
  return readline
    .question(`${question} [${initial ? 'Y/n' : 'y/N'}] `)
    .then((answer) => {
      readline.close();
      const normalized = answer.trim().toLowerCase();
      if (!normalized) return initial;
      return normalized === 'y' || normalized === 'yes';
    });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with ${signal ? `signal ${signal}` : `code ${code}`}`));
    });
  });
}

function runCommandResult(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('error', reject);
    child.once('exit', (code) => resolvePromise({ code, stdout, stderr }));
  });
}

export async function getTrackedChanges(root = ROOT, runner = runCommandResult) {
  const result = await runner('git', ['status', '--porcelain=v1'], root);
  if (result.code !== 0) throw new Error(`Unable to inspect local changes: ${result.stderr.trim()}`);
  return result.stdout
    .split('\n')
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .filter((path) => !PROTECTED_PATHS.has(path.split('/')[0]));
}

export function detectMode(root = ROOT) {
  const docker = existsSync(resolve(root, 'docker-compose.yml')) && existsSync(resolve(root, '.env'));
  return docker ? 'docker' : 'simple';
}

function isSafeRelativePath(path) {
  return path && !path.startsWith('/') && !path.split('/').includes('..') && !path.includes('\\\\');
}

export function validateReleaseRoot(releaseRoot) {
  const packagePath = resolve(releaseRoot, 'package.json');
  if (!existsSync(packagePath) || !statSync(packagePath).isFile()) {
    throw new Error('The downloaded release archive does not contain a valid package.json.');
  }
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  if (packageJson.name !== 'kestrel') {
    throw new Error('The downloaded release is not a Kestrel release.');
  }
  for (const entry of requireDirectoryEntries(releaseRoot)) {
    if (!isSafeRelativePath(entry)) throw new Error('The release archive contains an unsafe path.');
  }
  return packageJson;
}

export function hasMigrationChanges(root, releaseRoot) {
  const current = resolve(root, 'packages/db/drizzle');
  const incoming = resolve(releaseRoot, 'packages/db/drizzle');
  if (!existsSync(current) || !existsSync(incoming)) return false;
  const currentFiles = requireDirectoryNames(current);
  const incomingFiles = requireDirectoryNames(incoming);
  return incomingFiles.some((name) => {
    if (!currentFiles.includes(name)) return true;
    const currentText = readFileSync(resolve(current, name), 'utf8');
    const incomingText = readFileSync(resolve(incoming, name), 'utf8');
    return currentText !== incomingText;
  });
}

function requireDirectoryNames(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name);
}

async function downloadRelease(release, destination, fetchImpl = globalThis.fetch) {
  const archiveUrl = release.zipball_url;
  if (!archiveUrl) throw new Error('The GitHub release has no source archive URL.');
  const response = await fetchImpl(archiveUrl, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Kestrel-Updater' },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`Could not download the release archive (${response.status}).`);
  const archive = Buffer.from(await response.arrayBuffer());
  if (archive.length < 100) throw new Error('The downloaded release archive is empty or invalid.');
  const archivePath = resolve(destination, 'release.zip');
  writeFileSync(archivePath, archive, { mode: 0o600 });
  mkdirSync(resolve(destination, 'source'), { recursive: true });
  await runCommand(process.platform === 'win32' ? 'powershell.exe' : 'unzip', process.platform === 'win32'
    ? ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${archivePath.replaceAll("'", "''")}' -DestinationPath '${resolve(destination, 'source').replaceAll("'", "''")}' -Force`]
    : ['-q', archivePath, '-d', resolve(destination, 'source')], { stdio: 'ignore' });
  const entries = requireDirectoryNamesRecursive(resolve(destination, 'source'));
  const rootDirectory = entries.find((entry) => existsSync(resolve(entry, 'package.json')));
  if (!rootDirectory) throw new Error('The release archive does not contain a valid Kestrel package.json.');
  validateReleaseRoot(rootDirectory);
  return rootDirectory;
}

function requireDirectoryNamesRecursive(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const result = [directory];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(path, ...requireDirectoryNamesRecursive(path));
  }
  return result;
}

async function makeBackup(root, mode, output) {
  const backupBase = resolve(root, '.kestrel', 'backups');
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const destination = resolve(backupBase, stamp);
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  if (mode === 'simple') {
    const data = resolve(root, '.kestrel', 'data');
    if (existsSync(data)) cpSync(data, resolve(destination, 'data'), { recursive: true, preserveTimestamps: true });
    writeFileSync(resolve(destination, 'README.txt'), 'Simple-mode PGlite data backup. Keep the matching .env.local and ENCRYPTION_SECRET safe.\n', { mode: 0o600 });
  } else {
    writeFileSync(resolve(destination, 'README.txt'), 'Docker database backup created by Kestrel updater. Keep the matching .env and ENCRYPTION_SECRET safe.\n', { mode: 0o600 });
    try {
      await runCommand('docker', ['compose', 'run', '--rm', '--no-deps', 'backup', '/bin/sh', '/usr/local/bin/backup-db.sh', '--once'], { cwd: root });
      write(output, 'Docker database backup completed.');
    } catch (error) {
      rmSync(destination, { recursive: true, force: true });
      throw new Error(`Docker database backup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return destination;
}

export function replaceSource(root, releaseRoot) {
  const stateRoot = resolve(root, '.kestrel');
  const previous = resolve(stateRoot, 'update-source-previous');
  const staging = resolve(stateRoot, 'update-source-staging');
  rmSync(previous, { recursive: true, force: true });
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true, mode: 0o700 });

  try {
    for (const entry of requireDirectoryEntries(releaseRoot)) {
      if (!PROTECTED_PATHS.has(entry)) {
        cpSync(resolve(releaseRoot, entry), resolve(staging, entry), { recursive: true, force: true });
      }
    }
    validateReleaseRoot(staging);

    mkdirSync(previous, { recursive: true, mode: 0o700 });
    for (const entry of requireDirectoryEntries(root)) {
      if (!PROTECTED_PATHS.has(entry)) {
        cpSync(resolve(root, entry), resolve(previous, entry), { recursive: true, force: true });
      }
    }
    // Copy the staged release over the existing tree. We do not delete the
    // current tree first; that keeps old files available if a copy fails.
    for (const entry of requireDirectoryEntries(staging)) {
      cpSync(resolve(staging, entry), resolve(root, entry), { recursive: true, force: true });
    }
    for (const entry of requireDirectoryEntries(root)) {
      if (!PROTECTED_PATHS.has(entry) && !requireDirectoryEntries(staging).includes(entry)) {
        rmSync(resolve(root, entry), { recursive: true, force: true });
      }
    }
    rmSync(staging, { recursive: true, force: true });
    return previous;
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw new Error(`Could not safely replace Kestrel source: ${error instanceof Error ? error.message : String(error)}. Previous source is preserved at ${previous}.`);
  }
}

function requireDirectoryEntries(directory) {
  return readdirSync(directory);
}

function writeInstallMetadata(root, release) {
  const metadataDirectory = resolve(root, '.kestrel');
  mkdirSync(metadataDirectory, { recursive: true, mode: 0o700 });
  writeFileSync(resolve(metadataDirectory, 'install.json'), `${JSON.stringify({
    version: normalizeVersion(release.tag_name).version,
    releaseTag: release.tag_name,
    source: 'github',
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`, { mode: 0o600 });
}

async function applyDockerUpdate(root, output, dependencies = {}) {
  write(output, 'Rebuilding and starting Docker...');
  await runCommand('docker', ['compose', 'up', '-d', '--build'], { cwd: root });
  const started = Date.now();
  while (Date.now() - started < 180_000) {
    const result = await runCommandResult('curl', ['-fsS', dependencies.healthUrl ?? DEFAULT_HEALTH_URL], root);
    if (result.code === 0) return true;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }
  return false;
}

async function applySimpleUpdate(root, output) {
  write(output, 'Installing updated dependencies...');
  await runCommand('pnpm', ['install', '--frozen-lockfile'], { cwd: root });
  write(output, 'Source updated. Restart Kestrel with: pnpm dev:local');
  return true;
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const output = dependencies.output ?? console.log;
  const flags = parseFlags(argv);
  if (flags.help) {
    printHelp(output);
    return 0;
  }
  const root = resolve(dependencies.root ?? ROOT);
  const installed = getInstalledVersion(root);
  if (!installed) throw new Error('This does not look like a Kestrel installation: application version not found.');
  const release = await fetchLatestRelease(dependencies.fetchImpl);
  const latest = normalizeVersion(release.tag_name);
  write(output, 'Kestrel updater');
  write(output, '');
  write(output, `Current version: v${installed.version}`);
  write(output, `Latest version:  ${release.tag_name}`);
  if (compareVersions(latest, installed) <= 0) {
    write(output, `Kestrel is already up to date at v${installed.version}.`);
    return 0;
  }
  write(output, `An update is available: v${installed.version} → ${release.tag_name}`);
  if (flags.dryRun) {
    write(output, 'Dry run: no files, backups, databases, or services were changed.');
    return 0;
  }

  const changed = await getTrackedChanges(root, dependencies.runCommandResult ?? runCommandResult);
  if (changed.length > 0) {
    throw new Error(`Update stopped because local project files were changed: ${changed.join(', ')}`);
  }

  const mode = detectMode(root);
  write(output, `Installation mode: ${mode === 'docker' ? 'Docker' : 'Simple/PGlite'}`);
  const backupApproved = await ask('Create a backup before updating?', { yes: flags.yes, initial: true, ...dependencies });
  let backupPath = null;
  if (backupApproved) {
    backupPath = await makeBackup(root, mode, output, dependencies);
    write(output, `Backup created: ${backupPath}`);
  } else {
    const proceed = await ask('Continue without a backup? This is less safe.', { yes: flags.yes, initial: false, ...dependencies });
    if (!proceed) {
      write(output, 'Update cancelled.');
      return 130;
    }
  }

  const temporary = mkdtempSync(join(tmpdir(), 'kestrel-update-'));
  try {
    write(output, `Downloading ${release.tag_name}...`);
    const releaseRoot = await downloadRelease(release, temporary, dependencies.fetchImpl);
    const migrationChanges = hasMigrationChanges(root, releaseRoot);
    if (migrationChanges) {
      const approved = await ask('This release includes database migrations. Continue?', { yes: flags.yes, initial: false, ...dependencies });
      if (!approved) {
        write(output, 'Update cancelled before changing application files.');
        return 130;
      }
    }
    const sourceBackup = replaceSource(root, releaseRoot);
    if (mode === 'docker') {
      const healthy = await applyDockerUpdate(root, output, dependencies);
      if (!healthy) {
        write(output, 'The update was applied, but the app health check failed.');
        write(output, 'Inspect logs with: docker compose logs --tail=200 app');
        write(output, `Your source backup is here: ${sourceBackup}`);
        write(output, `Your data backup is here: ${backupPath ?? 'no backup was created'}`);
        return 1;
      }
    } else {
      await applySimpleUpdate(root, output);
    }
    writeInstallMetadata(root, release);
    write(output, `Kestrel updated successfully to ${release.tag_name}.`);
    return 0;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.dirname, 'update.mjs')) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(`Update failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
