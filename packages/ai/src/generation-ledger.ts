/** Run-scoped generation cost aggregation. */

export type GenerationKind =
  | 'primary'
  | 'auxiliary'
  | 'specialist'
  | 'fusion'
  | 'title'
  | 'semantic-routing';

export interface GenerationLedgerEntry {
  id: string;
  kind: GenerationKind;
  costUsd: number;
}

export interface GenerationLedgerSnapshot {
  entries: readonly GenerationLedgerEntry[];
  totalCostUsd: number;
}

export function restoreGenerationLedger(snapshot: GenerationLedgerSnapshot) {
  const ledger = createGenerationLedger();
  for (const entry of snapshot.entries) ledger.record(entry);
  if (Math.abs(ledger.total() - snapshot.totalCostUsd) > 1e-9) {
    throw new Error('Invalid generation ledger snapshot total.');
  }
  return ledger;
}

/**
 * In-memory ledger used by one execution. Entry IDs are idempotency keys:
 * retries or duplicate callbacks cannot inflate the parent cost.
 */
export function createGenerationLedger() {
  const entries = new Map<string, GenerationLedgerEntry>();

  return {
    record(entry: GenerationLedgerEntry): boolean {
      if (!entry.id || !Number.isFinite(entry.costUsd) || entry.costUsd < 0) {
        throw new Error('Invalid generation ledger entry.');
      }
      if (entries.has(entry.id)) return false;
      entries.set(entry.id, { ...entry });
      return true;
    },
    recordCost(id: string, kind: GenerationKind, costUsd: number): boolean {
      return this.record({ id, kind, costUsd });
    },
    recordUsage(
      id: string,
      kind: GenerationKind,
      model: string,
      inputTokens: number,
      outputTokens: number,
      estimateCost: (model: string, inputTokens: number, outputTokens: number) => number,
    ): boolean {
      return this.recordCost(id, kind, estimateCost(model, inputTokens, outputTokens));
    },
    snapshot(): GenerationLedgerSnapshot {
      const values = [...entries.values()];
      return {
        entries: values,
        totalCostUsd: values.reduce((sum, entry) => sum + entry.costUsd, 0),
      };
    },
    total(): number {
      return [...entries.values()].reduce((sum, entry) => sum + entry.costUsd, 0);
    },
  };
}

export type GenerationLedger = ReturnType<typeof createGenerationLedger>;
