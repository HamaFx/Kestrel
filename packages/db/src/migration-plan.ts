import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface MigrationEntry {
  tag: string;
  when?: number;
  breakpoints?: number;
}

export interface MigrationPlanEntry extends MigrationEntry {
  file: string;
  hash: string;
}

export interface MigrationPlan {
  entries: MigrationPlanEntry[];
  unjournaledFiles: string[];
  missingTags: string[];
}

export function buildMigrationPlan(migrationsDir: string): MigrationPlan {
  const journalPath = join(migrationsDir, 'meta', '_journal.json');
  if (!existsSync(journalPath)) {
    throw new Error(`No migration journal found at ${journalPath}`);
  }

  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries?: MigrationEntry[];
  };
  const entries = journal.entries ?? [];
  const sqlFiles = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql'));
  const plan: MigrationPlanEntry[] = [];
  const missingTags: string[] = [];

  for (const entry of entries) {
    const file = sqlFiles.find((candidate) => candidate.startsWith(`${entry.tag}.`));
    if (!file) {
      missingTags.push(entry.tag);
      continue;
    }
    plan.push({
      ...entry,
      file,
      hash: createHash('sha256')
        .update(readFileSync(join(migrationsDir, file)))
        .digest('hex'),
    });
  }

  const tags = new Set(entries.map((entry) => entry.tag));
  const unjournaledFiles = sqlFiles.filter(
    (file) => ![...tags].some((tag) => file.startsWith(`${tag}.`)),
  );

  return { entries: plan, unjournaledFiles, missingTags };
}

export function assertMigrationPlanIsConsistent(plan: MigrationPlan): void {
  if (plan.missingTags.length > 0) {
    throw new Error(`Missing migration files: ${plan.missingTags.join(', ')}`);
  }
  if (plan.unjournaledFiles.length > 0) {
    throw new Error(`Unjournaled migration files: ${plan.unjournaledFiles.join(', ')}`);
  }
}
