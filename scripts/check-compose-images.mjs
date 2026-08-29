#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const compose = readFileSync(resolve(process.cwd(), 'docker-compose.yml'), 'utf8');
const enforce = process.env.REQUIRE_COMPOSE_DIGESTS === 'true';
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
  `Compose image check passed (${images.length} images${enforce ? ', digest enforcement enabled' : ', local tags allowed'}).`,
);
