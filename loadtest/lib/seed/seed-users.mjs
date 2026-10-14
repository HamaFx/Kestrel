#!/usr/bin/env node
/**
 * Seed script for k6 load testing (Strategy B — real NextAuth sessions).
 *
 * Run from repo root:
 *   K6_ALLOW_SEED=true K6_USER_COUNT=25 K6_TEST_PASSWORD=LoadTest!123 \
 *     node loadtest/lib/seed/seed-users.mjs
 *
 * What it does:
 *   1. Upserts N users `loadtest+000@kestrel.ai` … `loadtest+NNN@kestrel.ai`
 *      with a shared bcrypt password.
 *   2. Provisions organization + organizationMember tenant rows.
 *   3. Upserts userSettings (onboardingCompleted: true, defaultSymbol: 'XAUUSD').
 *   4. Creates one chat thread per user with tenantId.
 *   5. Writes loadtest/lib/data/seeded-users.json manifest.
 *
 * Safety: refuses to run unless K6_ALLOW_SEED=true is set AND DATABASE_URL
 * is clearly not a production DB (no strict check; just a warning).
 */

import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

const SCRIPT_DIR = new URL('.', import.meta.url).pathname;

async function main() {
  // ── Safety gate ──
  if (process.env.K6_ALLOW_SEED !== 'true') {
    console.error('ABORTED: K6_ALLOW_SEED must be "true" to run this script.');
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL ?? '';
  if (dbUrl.includes('prod') || dbUrl.includes('production')) {
    console.warn(
      'WARNING: DATABASE_URL contains "prod"/"production". ' +
        'Are you sure this is a load-test DB?',
    );
  }

  const userCount = parseInt(process.env.K6_USER_COUNT ?? '10', 10);
  const password = process.env.K6_TEST_PASSWORD ?? 'LoadTest!123';

  if (Number.isNaN(userCount) || userCount < 1 || userCount > 1000) {
    console.error('ABORTED: K6_USER_COUNT must be between 1 and 1000.');
    process.exit(1);
  }

  // ── Import workspace deps ──
  const { getDb } = await import('@kestrel/db');
  const schema = await import('@kestrel/db/schema');
  const { eq, and, isNull } = await import('drizzle-orm');

  const db = getDb();

  const users_ = [];
  const start = Date.now();
  const hashedPassword = await bcrypt.hash(password, 12);

  for (let i = 0; i < userCount; i++) {
    const email = `loadtest+${String(i).padStart(3, '0')}@kestrel.ai`;

    // Check existing user
    const [existing] = await db
      .select({ id: schema.users.id, email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    const userId = existing?.id ?? randomUUID();

    if (!existing) {
      await db.insert(schema.users).values({
        id: userId,
        email,
        name: `LoadTest ${i}`,
        hashedPassword,
      });
      console.log(`Created user: ${email}`);
    } else {
      console.log(`User already exists: ${email}`);
    }

    // Check or create tenant (organization + member)
    const [existingMember] = await db
      .select({ orgId: schema.organizationMember.orgId })
      .from(schema.organizationMember)
      .innerJoin(
        schema.organization,
        and(
          eq(schema.organization.id, schema.organizationMember.orgId),
          eq(schema.organizationMember.userId, userId),
          isNull(schema.organization.deletedAt),
        ),
      )
      .where(eq(schema.organizationMember.userId, userId))
      .limit(1);

    let orgId = existingMember?.orgId;
    if (!orgId) {
      orgId = `org-${userId}`;
      await db
        .insert(schema.organization)
        .values({
          id: orgId,
          name: `Org ${email}`,
          plan: 'pro',
        })
        .onConflictDoNothing();

      await db
        .insert(schema.organizationMember)
        .values({
          orgId,
          userId,
          role: 'owner',
        })
        .onConflictDoNothing();
    }

    // Upsert userSettings
    await db
      .insert(schema.userSettings)
      .values({
        userId,
        tenantId: orgId,
        onboardingCompleted: true,
        defaultSymbol: 'XAUUSD',
      })
      .onConflictDoUpdate({
        target: schema.userSettings.userId,
        set: {
          tenantId: orgId,
          onboardingCompleted: true,
          defaultSymbol: 'XAUUSD',
        },
      });

    // Create or check chat thread
    const [existingThread] = await db
      .select({ id: schema.chatThreads.id })
      .from(schema.chatThreads)
      .where(and(eq(schema.chatThreads.userId, userId), eq(schema.chatThreads.tenantId, orgId)))
      .limit(1);

    let threadId = existingThread?.id;
    if (!threadId) {
      threadId = randomUUID();
      try {
        await db.insert(schema.chatThreads).values({
          id: threadId,
          userId,
          tenantId: orgId,
          title: `Load test thread`,
          pinnedSymbol: 'XAUUSD',
        });
      } catch {
        // Thread might already exist
      }
    }

    users_.push({
      email,
      userId,
      tenantId: orgId,
      threadId,
    });
  }

  // ── Write manifest ──
  const manifestPath = `${SCRIPT_DIR}/../data/seeded-users.json`;
  const fs = await import('node:fs');
  fs.writeFileSync(manifestPath, JSON.stringify(users_, null, 2) + '\n');

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `Seeded ${userCount} users in ${elapsed}s. Manifest written to ${manifestPath}`,
  );
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
