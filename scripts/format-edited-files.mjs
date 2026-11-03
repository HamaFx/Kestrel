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

// PostToolUse formatter for AI coding agents (Claude Code and Codex).
//
// Hooks pass the tool invocation as JSON on stdin. The exact shape differs
// between clients and tools, so this script extracts any file path it can
// find and otherwise formats the git working tree after a file-editing tool.
// It is deliberately fail-open: a formatting problem must never block an
// agent turn.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const SUPPORTED = /\.(?:ts|tsx|js|jsx|json|md|css)$/;
const EDIT_TOOL_HINTS = ['apply_patch', 'edit', 'write', 'patch', 'create_file', 'replace'];

function readPayload() {
  if (process.stdin.isTTY) return {};
  try {
    const raw = readFileSync(0, 'utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function collectPaths(input) {
  if (!input || typeof input !== 'object') return [];
  const paths = [];
  for (const key of ['file_path', 'filePath', 'path', 'file', 'filename']) {
    const value = input[key];
    if (typeof value === 'string' && value.length > 0) paths.push(value);
  }
  for (const key of ['files', 'file_paths', 'filePaths']) {
    const value = input[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') paths.push(item);
        else if (item && typeof item === 'object' && typeof item.path === 'string') {
          paths.push(item.path);
        }
      }
    }
  }
  return paths;
}

function gitLines(args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Every modified, staged, or untracked file in the working tree. */
function changedFiles() {
  return [
    ...gitLines(['diff', '--name-only', '--diff-filter=ACMR']),
    ...gitLines(['diff', '--cached', '--name-only', '--diff-filter=ACMR']),
    ...gitLines(['ls-files', '--others', '--exclude-standard']),
  ];
}

function toRepoRelative(path) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) return null;
  const rel = relative(root, absolute);
  if (rel.startsWith('..')) return null;
  return rel;
}

const payload = readPayload();
const toolName = String(
  payload.tool_name ?? payload.toolName ?? payload.name ?? payload.tool ?? '',
).toLowerCase();
const explicitPaths = collectPaths(
  payload.tool_input ?? payload.toolInput ?? payload.input ?? payload,
);
const looksLikeEdit =
  explicitPaths.length > 0 || EDIT_TOOL_HINTS.some((hint) => toolName.includes(hint));

if (!looksLikeEdit) process.exit(0);

// Fast path: when the agent hook supplies explicit edited file path(s), format
// only those files without scanning the entire git working tree.
const candidatePaths = explicitPaths.length > 0 ? explicitPaths : changedFiles();
const files = [...new Set(candidatePaths)]
  .map(toRepoRelative)
  .filter((file) => file !== null && SUPPORTED.test(file));

if (files.length === 0) process.exit(0);

const oxfmtBin = resolve(root, 'node_modules/.bin/oxfmt');

try {
  execFileSync(oxfmtBin, ['--write', ...files], {
    cwd: root,
    stdio: 'ignore',
  });
} catch {
  // Fail open: a formatting failure must never block the agent.
}
process.exit(0);
