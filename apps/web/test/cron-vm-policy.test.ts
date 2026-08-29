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

// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('cron VM operational policy', () => {
  it('defers backup jobs until B2 is configured and never uses the retired GCS path', () => {
    const adapter = read('infra/cron-vm/scripts/backup-storage.sh');
    const ready = read('infra/cron-vm/scripts/backup-storage-ready.sh');
    const db = read('infra/cron-vm/scripts/backup-db.sh');
    const journal = read('infra/cron-vm/scripts/backup-journal.sh');
    const restore = read('infra/cron-vm/scripts/verify-restore.sh');

    expect(adapter).toContain('B2_BUCKET');
    expect(adapter).toContain('rclone');
    expect(ready).toContain('backup_storage_available');
    expect(db).toContain('backup_storage_upload_stream');
    expect(journal).toContain('backup_storage_upload_stream');
    expect(restore).toContain('backup_storage_latest_db');
    expect(db).not.toContain('gcloud storage');
    expect(journal).not.toContain('gcloud storage');
    expect(restore).not.toContain('gcloud storage');
  });

  it('skips backup-dependent systemd units until B2 is ready', () => {
    for (const unit of [
      'infra/cron-vm/units/kestrel-backup-db.service',
      'infra/cron-vm/units/kestrel-backup-journal.service',
      'infra/cron-vm/units/kestrel-verify-restore.service',
      'infra/cron-vm/units/kestrel-tenant-export.service',
    ]) {
      expect(read(unit), unit).toContain(
        'ExecCondition=/opt/kestrel/scripts/backup-storage-ready.sh',
      );
    }
  });

  it('keeps tenant deletion rehearsal dry-run and protects the system account', () => {
    const script = read('infra/cron-vm/scripts/delete-tenant.sh');
    const unit = read('infra/cron-vm/units/kestrel-tenant-delete.service');

    expect(unit).toContain('delete-tenant.sh __system__');
    expect(unit).toMatch(/ExecStart=\/opt\/kestrel\/scripts\/delete-tenant\.sh __system__(?:\n|$)/);
    expect(script).toContain('SAFETY CHECK PASSED');
    expect(script).toContain('chat_messages WHERE thread_id');
    expect(script).toContain('diagnostic_traces');
    // Phase 3 — analysis_jobs was replaced by Mastra durable workflow runs.
    expect(script).not.toContain('analysis_jobs');
    expect(script).not.toMatch(/FROM chat_messages[^\n]*\.user_id/);
    expect(script).not.toContain('SELECT COUNT(*) FROM chat_messages WHERE user_id');
    expect(script).not.toContain('DELETE FROM chat_messages WHERE user_id');
  });

  it('exports relationship-owned chat messages without querying a missing user_id column', () => {
    const script = read('infra/cron-vm/scripts/export-tenant.sh');

    expect(script).toContain("'chat_messages'::text");
    expect(script).toContain('JOIN chat_threads th ON th.id = t.thread_id');
    expect(script).not.toMatch(/FROM chat_messages t WHERE t\.user_id/);
    expect(script).toContain('diagnostic_traces');
    // Phase 3 — analysis_jobs was replaced by Mastra durable workflow runs.
    expect(script).not.toContain('analysis_jobs');
  });

  it('keeps heavy jobs in the Docker scheduler instead of restoring deleted timers', () => {
    const compose = read('infra/cron-vm/docker-compose.vm.yml');
    const provisioner = read('infra/cron-vm/_provision-docker.sh');
    expect(compose).toContain('WORKER_MODE: docker');
    expect(provisioner).toContain('reduced set — no heavy job timers');
    expect(compose).not.toContain('kestrel-briefings.timer');
    expect(compose).not.toContain('kestrel-snapshots.timer');
  });

  it('guards the VM cutover against duplicate legacy containers and partial installs', () => {
    const provisioner = read('infra/cron-vm/_provision-docker.sh');

    expect(provisioner).toContain(
      'docker compose -p hamafx --project-directory /opt/hamafx down --remove-orphans',
    );
    expect(provisioner).toContain('non-empty but incomplete while /opt/hamafx still exists');
    expect(provisioner).toContain('refusing legacy migration');
  });

  it('installs and protects the host systemd synchronization path', () => {
    const helper = read('infra/cron-vm/scripts/sync-systemd-units.sh');
    const provisioner = read('infra/cron-vm/_provision-docker.sh');
    const update = read('infra/cron-vm/scripts/docker-update.sh');
    const sudoers = read('infra/cron-vm/sudoers.d/kestrel');

    expect(helper).toContain("TARGET_DIR='/etc/systemd/system'");
    expect(helper).toContain('! -L "$source"');
    expect(helper).toContain('MANAGED_UNITS');
    expect(provisioner).toContain('/usr/local/sbin/kestrel-sync-systemd-units');
    expect(update).toContain('/usr/local/sbin/kestrel-sync-systemd-units');
    expect(sudoers).toContain('/usr/local/sbin/kestrel-sync-systemd-units');
  });

  it('keeps the billing DLQ and AI evaluation retention defaults in the worker contract', () => {
    const workerEnv = read('apps/worker/src/env.ts');
    expect(workerEnv).toContain('BILLING_WEBHOOK_DLQ_RETENTION_DAYS');
    expect(workerEnv).toContain('AI_EVALUATION_RETENTION_DAYS');
    expect(workerEnv).toContain(".default(90)");
  });

  it('provisions the documented billing DLQ timer', () => {
    const provisioner = read('infra/cron-vm/_provision-docker.sh');
    const unit = read('infra/cron-vm/units/kestrel-billing-dlq.timer');

    expect(provisioner).toContain('kestrel-billing-dlq.timer');
    expect(unit).toContain('OnCalendar=hourly');
  });

  it('keeps the VM deployment source free of retired private hostnames', () => {
    const provisioner = read('infra/cron-vm/_provision-docker.sh');
    const compose = read('infra/cron-vm/docker-compose.vm.yml');
    for (const content of [provisioner, compose]) {
      expect(content).not.toContain('hama-fx-ai.vercel.app');
      expect(content).not.toContain('hamafx-78845');
    }
  });

  it('provisions the SLO health alert delivery timer with a bounded webhook call', () => {
    const provisioner = read('infra/cron-vm/_provision-docker.sh');
    const service = read('infra/cron-vm/units/kestrel-health-alerts.service');
    const timer = read('infra/cron-vm/units/kestrel-health-alerts.timer');

    expect(provisioner).toContain('kestrel-health-alerts.timer');
    expect(service).toContain('/api/cron/health-alerts');
    expect(service).toContain('Authorization: Bearer ${CRON_SECRET}');
    expect(service).toContain('curl -fsS -m 30');
    expect(timer).toContain('OnCalendar=*:0/5');
  });

  it('does not fail cleanup when its optional healthcheck ID is missing', () => {
    const unit = read('infra/cron-vm/units/kestrel-light-cleanup-uploads.service');
    expect(unit).toContain('test -z "$HC_CLEANUP_UPLOADS_UUID"');
  });
});
