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

console.log('\nRemoving unused build cache...');
command(['builder', 'prune', '--force']);
console.log('Removing stopped containers and dangling images...');
command(['container', 'prune', '--force']);
command(['image', 'prune', '--force']);
console.log('Cleanup complete. Remaining usage:');
command(['system', 'df']);
