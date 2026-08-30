#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const failures = [];
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const packageJson = JSON.parse(read('package.json'));

// Version selection is a maintainer release decision. This contract verifies
// reproducibility and provenance without forcing a version before publication.
if (!packageJson.version) failures.push('package.json must declare a version');

const dockerWorkflow = read('.github/workflows/docker-publish.yml');
for (const image of ['web', 'worker']) {
  if (!dockerWorkflow.includes('type=sha') || !dockerWorkflow.includes(`images: ghcr.io/${'${{ github.repository }}'}/${image}`)) {
    failures.push(`Docker workflow must publish an immutable SHA tag for ${image}`);
  }
}
if (!dockerWorkflow.includes('provenance: mode=max')) {
  failures.push('Docker workflow must publish provenance attestations');
}
if (!dockerWorkflow.includes('sbom: true')) {
  failures.push('Docker workflow must publish image SBOM attestations');
}
if (!dockerWorkflow.includes('docker/metadata-action')) {
  failures.push('Docker workflow should expose metadata labels/tags through a metadata step');
}
if (!dockerWorkflow.includes('type=sha')) {
  failures.push('Docker workflow must configure SHA-derived metadata tags');
}

const releaseWorkflow = read('.github/workflows/release.yml');
if (!releaseWorkflow.includes('source-sbom')) failures.push('release workflow must archive the source SBOM');
if (!releaseWorkflow.includes('dependency-licenses')) {
  failures.push('release workflow must archive dependency license metadata');
}
if (!existsSync(resolve(root, 'docs/DEPENDENCY_LICENSES.md'))) failures.push('dependency license inventory is missing');

if (failures.length) {
  console.error('Release metadata contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Release metadata contract passed.');
