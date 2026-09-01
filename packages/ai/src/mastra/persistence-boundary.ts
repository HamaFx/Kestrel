/*
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

/**
 * Persistence ownership contract for the staged Mastra migration.
 *
 * Drizzle is authoritative for user-visible application data. Mastra is
 * authoritative for runtime-only execution state. Projection is explicit and
 * one-way at the boundary; callers must not treat a Mastra snapshot as a
 * replacement for a persisted chat message.
 */
export const PERSISTENCE_OWNERSHIP = {
  drizzle: [
    'chat threads and messages',
    'user settings and tenant ownership',
    'budgets, telemetry, audit records, and mutation ledgers',
    'durable Full-analysis queue rows',
  ],
  mastra: [
    'agent memory and semantic recall',
    'workflow snapshots and suspended runs',
    'runtime execution context',
  ],
  projection: [
    'queue status/progress/result to Mastra workflow snapshots',
    'legacy Drizzle chat history into Mastra memory during migration',
  ],
} as const;

export type DrizzlePersistenceOwner = (typeof PERSISTENCE_OWNERSHIP.drizzle)[number];
export type MastraPersistenceOwner = (typeof PERSISTENCE_OWNERSHIP.mastra)[number];

export function persistenceOwnerFor(
  area: 'chat' | 'workflow' | 'memory' | 'queue' | 'audit' | 'settings',
): 'drizzle' | 'mastra' {
  switch (area) {
    case 'workflow':
    case 'memory':
      return 'mastra';
    default:
      return 'drizzle';
  }
}
