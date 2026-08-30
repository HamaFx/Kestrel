/**
 * Real PostgreSQL RLS verification.
 *
 * Opt in with RUN_POSTGRES_RLS_TESTS=1 and TEST_POSTGRES_ADMIN_URL. The test
 * never falls back to PGlite because PGlite cannot prove role/RLS semantics.
 */
import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { describe, expect, it } from 'vitest';

const enabled = process.env.RUN_POSTGRES_RLS_TESTS === '1';
const connectionString = process.env.TEST_POSTGRES_ADMIN_URL;

describe.skipIf(!enabled || !connectionString)('real PostgreSQL RLS isolation', () => {
  it('isolates tenant rows between non-owner roles', async () => {
    const admin = postgres(connectionString!, { max: 1, prepare: false });
    const suffix = randomUUID().replaceAll('-', '');
    const roleA = `kestrel_rls_a_${suffix}`;
    const roleB = `kestrel_rls_b_${suffix}`;
    const password = `test_${suffix}`;
    const table = `kestrel_rls_probe_${suffix}`;

    try {
      await admin.unsafe(`CREATE ROLE "${roleA}" LOGIN PASSWORD '${password}'`);
      await admin.unsafe(`CREATE ROLE "${roleB}" LOGIN PASSWORD '${password}'`);
      await admin.unsafe(
        `CREATE TABLE "${table}" (id text primary key, tenant_id text not null, secret text not null)`,
      );
      await admin.unsafe(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
      await admin.unsafe(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
      await admin.unsafe(
        `CREATE POLICY tenant_select ON "${table}" USING (tenant_id = current_setting('kestrel.tenant_id', true))`,
      );
      await admin.unsafe(
        `CREATE POLICY tenant_insert ON "${table}" FOR INSERT WITH CHECK (tenant_id = current_setting('kestrel.tenant_id', true))`,
      );
      await admin.unsafe(`GRANT SELECT, INSERT ON "${table}" TO "${roleA}", "${roleB}"`);
      await admin.unsafe(`SELECT set_config('kestrel.tenant_id', 'tenant-a', false)`);
      await admin.unsafe(
        `INSERT INTO "${table}" (id, tenant_id, secret) VALUES ('a', 'tenant-a', 'a-secret')`,
      );

      const roleAClient = postgres(connectionString!, { max: 1, prepare: false });
      await roleAClient.unsafe(`SET ROLE "${roleA}"`);
      await roleAClient.unsafe(`SELECT set_config('kestrel.tenant_id', 'tenant-a', false)`);
      expect(await roleAClient.unsafe(`SELECT secret FROM "${table}"`)).toHaveLength(1);
      await roleAClient.end({ timeout: 1 });

      const roleBClient = postgres(connectionString!, { max: 1, prepare: false });
      await roleBClient.unsafe(`SET ROLE "${roleB}"`);
      await roleBClient.unsafe(`SELECT set_config('kestrel.tenant_id', 'tenant-b', false)`);
      expect(await roleBClient.unsafe(`SELECT secret FROM "${table}"`)).toHaveLength(0);
      await expect(
        roleBClient.unsafe(
          `INSERT INTO "${table}" (id, tenant_id, secret) VALUES ('b', 'tenant-a', 'leak')`,
        ),
      ).rejects.toThrow();
      await roleBClient.end({ timeout: 1 });
    } finally {
      await admin.unsafe(`DROP TABLE IF EXISTS "${table}"`);
      await admin.unsafe(`DROP ROLE IF EXISTS "${roleA}"`);
      await admin.unsafe(`DROP ROLE IF EXISTS "${roleB}"`);
      await admin.end({ timeout: 1 });
    }
  });
});
