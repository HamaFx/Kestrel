#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const apply = process.argv.includes('--apply');
const command = (args) =>
  execFileSync('docker', args, {
    stdio: 'inherit',
    timeout: Number.parseInt(process.env.DOCKER_PRUNE_TIMEOUT_MS ?? '900000', 10),
  });

console.log('Docker disk usage:');
command(['system', 'df']);

if (!apply) {
  console.log('\nDry run only. No Docker data was removed.');
  console.log('Review the report, then run: pnpm docker:prune -- --apply');
  process.exit(0);
}

// P3: Remove stopped containers and unused images. `image prune --all`
// also clears tagged-but-unused images (e.g. accumulated
// kestrel-worker:rollback tags) that plain `image prune` leaves behind.
// The 168h (7-day) age filter keeps recent tagged images (current deploy,
// the rollback tag) for fast rollback. Shared image layers in use by a
// running/recent container are never removed.
console.log('\nRemoving unused build cache...');
command(['builder', 'prune', '--force']);
console.log('Removing stopped containers...');
command(['container', 'prune', '--force']);
console.log('Removing unused images older than 168h (dangling + old tags)...');
command(['image', 'prune', '--all', '--force', '--filter', 'until=168h']);
console.log('Cleanup complete. Remaining usage:');
command(['system', 'df']);
