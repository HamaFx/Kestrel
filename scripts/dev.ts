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

// scripts/dev.ts — local development environment guard.
//
// The root `pnpm dev` command loads `.env` and `.env.local` into this process,
// then runs this guard so an absent Postgres URL fails immediately. Turbo is
// started from here rather than from a shell `&&` so the loaded variables are
// inherited by every dev task (Next.js and the worker included).
//
// Usage: pnpm dev

import { execFileSync } from 'node:child_process';

const KESTREL_BANNER = [
  '██╗  ██╗███████╗███████╗████████╗██████╗ ███████╗██╗',
  '██║ ██╔╝██╔════╝██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║',
  '█████╔╝ █████╗  ███████╗   ██║   ██████╔╝█████╗  ██║',
  '██╔═██╗ ██╔══╝  ╚════██║   ██║   ██╔══██╗██╔══╝  ██║',
  '██║  ██╗███████╗███████║   ██║   ██║  ██║███████╗███████╗',
  '╚═╝  ╚═╝╚══════╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚══════╝╚══════╝',
].join('\n');

async function main() {
  console.log(`\n${KESTREL_BANNER}\n\n🚀 Kestrel local development mode\n`);

  // Check if we have a Postgres URL
  const hasDbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!hasDbUrl) {
    console.error(
      '[dev] DATABASE_URL is required — start Postgres (docker compose up -d db) or set DATABASE_URL',
    );
    process.exit(1);
  }
  console.log('📦 Database: Postgres');
  console.log('▶  Starting workspace development tasks...');

  execFileSync('turbo', ['run', 'dev', '--env-mode=loose'], { stdio: 'inherit', env: process.env });
}

main().catch((err) => {
  console.error('Development guard failed:', err);
  process.exit(1);
});
