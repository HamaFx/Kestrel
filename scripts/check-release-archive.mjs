#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const forbidden = /(^|\/)(?:\.env(?:\.|$)|\.kestrel(?:\/|$)|node_modules(?:\/|$)|\.next(?:\/|$)|dist(?:\/|$)|coverage(?:\/|$)|artifacts(?:\/|$)|.*\.(?:pem|key|p12|pfx|bak|dump|sql\.gz))$/i;
const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const failures = files.filter((file) => forbidden.test(file));

if (failures.length) {
  console.error('Release archive check failed:');
  for (const file of failures) console.error(`- forbidden release path: ${file}`);
  process.exit(1);
}
console.log(`Release archive check passed (${files.length} tracked files reviewed).`);
