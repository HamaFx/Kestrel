#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// C6: Digest pinning is now enforced BY DEFAULT. All Compose images must be
// pinned with @sha256: digests for reproducible and secure deployments.
// Set ALLOW_UNPINNED_COMPOSE_IMAGES=true to opt out (e.g. local development
// with custom tags). The CI workflow no longer needs to set a flag.
const enforce = process.env.ALLOW_UNPINNED_COMPOSE_IMAGES !== 'true';

const compose = readFileSync(resolve(process.cwd(), 'docker-compose.yml'), 'utf8');
const images = [...compose.matchAll(/^\s*image:\s*(\S+)/gm)].map((match) => match[1]);
const failures = images.flatMap((image) => {
  if (!image.includes('@sha256:')) {
    return enforce ? [`image is not digest-pinned: ${image}`] : [];
  }
  if (!/^.+@sha256:[a-f0-9]{64}$/.test(image)) return [`invalid image digest: ${image}`];
  return [];
});
if (failures.length) {
  console.error('Compose image pinning check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(
  `Compose image check passed (${images.length} images${enforce ? ', digest enforcement enabled' : ', unpinned tags allowed'}).`,
);
