/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closePGliteDb, applyMigrations, getPGliteDb } from '../src/pglite-client';
import {
  executeMutationOnce,
  MutationExecutionContextError,
} from '../src/queries/mutation-executions';

const USER_ID = 'mutation-test-user';
const RUN_ID = 'mutation-run-1';
const THREAD_ID = '11111111-1111-4111-8111-111111111111';

function asDbClient(db: unknown) {
  return db as Parameters<typeof executeMutationOnce>[0]['db'] & object;
}

describe('executeMutationOnce', { timeout: 30_000 }, () => {
  let dir: string;
  let db: Awaited<ReturnType<typeof getPGliteDb>>;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'kestrel-mutation-ledger-'));
    await applyMigrations(dir);
    db = await getPGliteDb(dir);
    await db.execute(`ALTER TABLE "mutation_executions" ADD COLUMN IF NOT EXISTS "approval_id" text`);
    await db.execute(`ALTER TABLE "mutation_executions" ADD COLUMN IF NOT EXISTS "approval_expires_at" timestamptz`);
    await db.execute(
      `INSERT INTO "user" ("id", "email") VALUES ('${USER_ID}', 'mutation-test@example.com')`,
    );
  });

  afterEach(async () => {
    await closePGliteDb();
  });

  it('rolls back the business write and ledger when execution fails', async () => {
    await expect(
      executeMutationOnce({
        db: asDbClient(db),
        runId: RUN_ID,
        userId: USER_ID,
        threadId: THREAD_ID,
        mutation: 'set_alert',
        inputDigest: 'a'.repeat(64),
        execute: async (tx) => {
          await tx.execute(
            `INSERT INTO "alerts" ("user_id", "rule", "channels")
             VALUES ('${USER_ID}', '{"type":"priceCross"}', ARRAY['email'])`,
          );
          throw new Error('business write failed');
        },
      }),
    ).rejects.toThrow('business write failed');

    const { rows: ledgerRows } = await db.execute(
      `SELECT run_id FROM "mutation_executions" WHERE run_id = '${RUN_ID}'`,
    );
    const { rows: alertRows } = await db.execute(
      `SELECT id FROM "alerts" WHERE user_id = '${USER_ID}'`,
    );
    const { rows: auditRows } = await db.execute(
      `SELECT id FROM "audit_logs" WHERE user_id = '${USER_ID}' AND action = 'mutation.set_alert.executed'`,
    );

    expect(ledgerRows).toHaveLength(0);
    expect(alertRows).toHaveLength(0);
    expect(auditRows).toHaveLength(0);
  });

  it('rolls back the business write when the audit insert fails', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    await expect(
      executeMutationOnce({
        db: asDbClient(db),
        runId: RUN_ID,
        userId: USER_ID,
        threadId: THREAD_ID,
        mutation: 'run_system_action',
        inputDigest: 'e'.repeat(64),
        auditMetadata: circular,
        execute: async () => ({ id: 'system:maintenance' }),
      }),
    ).rejects.toThrow();

    const { rows: ledgerRows } = await db.execute(
      `SELECT run_id FROM "mutation_executions" WHERE run_id = '${RUN_ID}'`,
    );
    const { rows: auditRows } = await db.execute(
      `SELECT id FROM "audit_logs" WHERE user_id = '${USER_ID}' AND action = 'mutation.run_system_action.executed'`,
    );

    expect(ledgerRows).toHaveLength(0);
    expect(auditRows).toHaveLength(0);
  });

  it('commits the ledger and audit, then replays without executing twice', async () => {
    let calls = 0;
    const input = {
      db: asDbClient(db),
      runId: RUN_ID,
      userId: USER_ID,
      threadId: THREAD_ID,
      mutation: 'run_system_action',
      inputDigest: 'b'.repeat(64),
      execute: async () => {
        calls += 1;
        return { id: 'system:maintenance' };
      },
    };

    const first = await executeMutationOnce(input);
    const second = await executeMutationOnce(input);

    expect(first).toEqual({ result: { id: 'system:maintenance' }, replayed: false });
    expect(second).toEqual({ result: { id: 'system:maintenance' }, replayed: true });
    expect(calls).toBe(1);

    const { rows: ledgerRows } = await db.execute(
      `SELECT run_id, status, tenant_id, result_id FROM "mutation_executions" WHERE run_id = '${RUN_ID}'`,
    );
    const { rows: auditRows } = await db.execute(
      `SELECT action, tenant_id FROM "audit_logs" WHERE user_id = '${USER_ID}' AND action = 'mutation.run_system_action.executed'`,
    );

    expect(ledgerRows).toEqual([
      expect.objectContaining({
        run_id: RUN_ID,
        status: 'executed',
        tenant_id: USER_ID,
        result_id: 'system:maintenance',
      }),
    ]);
    expect(auditRows).toEqual([
      expect.objectContaining({ action: 'mutation.run_system_action.executed', tenant_id: USER_ID }),
    ]);
  });

  it('rejects a replay with a different immutable context', async () => {
    const input = {
      db: asDbClient(db),
      runId: RUN_ID,
      userId: USER_ID,
      threadId: THREAD_ID,
      mutation: 'run_system_action',
      inputDigest: 'c'.repeat(64),
      execute: async () => ({ id: 'system:maintenance' }),
    };
    await executeMutationOnce(input);

    await expect(
      executeMutationOnce({ ...input, threadId: '22222222-2222-4222-8222-222222222222' }),
    ).rejects.toThrow(MutationExecutionContextError);
  });

  it('serializes concurrent confirmations to one business execution', async () => {
    let calls = 0;
    let executionStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      executionStarted = resolve;
    });
    let releaseExecution!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseExecution = resolve;
    });

    const baseInput = {
      db: asDbClient(db),
      runId: RUN_ID,
      userId: USER_ID,
      threadId: THREAD_ID,
      mutation: 'run_system_action',
      inputDigest: 'd'.repeat(64),
    } as const;

    const first = executeMutationOnce({
      ...baseInput,
      execute: async () => {
        calls += 1;
        executionStarted();
        await release;
        return { id: 'system:maintenance' };
      },
    });

    await started;
    const second = executeMutationOnce({
      ...baseInput,
      execute: async () => {
        calls += 1;
        return { id: 'system:maintenance' };
      },
    });

    releaseExecution();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(calls).toBe(1);
    expect([firstResult.replayed, secondResult.replayed].sort()).toEqual([false, true]);

    const { rows: auditRows } = await db.execute(
      `SELECT id FROM "audit_logs" WHERE user_id = '${USER_ID}' AND action = 'mutation.run_system_action.executed'`,
    );
    expect(auditRows).toHaveLength(1);
  });
});
