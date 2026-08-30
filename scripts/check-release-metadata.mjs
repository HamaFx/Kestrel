#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const failures = [];
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const version = packageJson.version;
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

// The application has its own release version. Workspace package versions may
// be managed separately and must not be treated as the application release.
if (!version) failures.push('package.json must declare an application version');
else if (!semverPattern.test(version)) {
  failures.push(`package.json application version is not valid SemVer: ${version}`);
}
if (version === '0.0.0') {
  failures.push(
    'package.json application version must be changed from the placeholder 0.0.0 before release',
  );
}

const releaseTag = `v${version}`;
const releaseWorkflow = read('.github/workflows/release.yml');
const dockerWorkflow = read('.github/workflows/docker-publish.yml');
if (!releaseWorkflow.includes('branches:\n      - main')) {
  failures.push('release workflow must remain explicit about its main-branch release automation');
}
if (!dockerWorkflow.includes('type=raw,value=${{ github.event.release.tag_name }}')) {
  failures.push(
    `Docker workflow must publish the GitHub release tag ${releaseTag} when a release is published`,
  );
}

for (const image of ['web', 'worker']) {
  if (
    !dockerWorkflow.includes('type=sha') ||
    !dockerWorkflow.includes(`images: ghcr.io/${'${{ github.repository }}'}/${image}`)
  ) {
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

if (!releaseWorkflow.includes('source-sbom'))
  failures.push('release workflow must archive the source SBOM');
if (!releaseWorkflow.includes('dependency-licenses')) {
  failures.push('release workflow must archive dependency license metadata');
}
if (!existsSync(resolve(root, 'docs/DEPENDENCY_LICENSES.md')))
  failures.push('dependency license inventory is missing');

if (failures.length) {
  console.error('Release metadata contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Release metadata contract passed.');
