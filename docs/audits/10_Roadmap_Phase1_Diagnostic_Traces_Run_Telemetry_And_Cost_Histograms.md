# Phase 1 Implementation Plan: Diagnostic Trace Coverage, Accurate Run Telemetry & USD Cost Histograms

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the three core observability blind spots in Kestrel's runtime: give USD cost histograms (`turn_cost_usd`, `committee_step_cost_usd`) proper sub-dollar bucket bounds (`HISTOGRAM_BUCKET_BOUNDS_USD`), replace the hardcoded `kestrel-xauusd-research-poc` labels in `run-telemetry.ts` with dynamic per-route telemetry identities, wrap all synchronous and streaming chat routes (`canonical-chat`, `symbol-research`, `multi-symbol-research`, and `custom-agent`) in `withDiagnostics` so every turn writes a durable `diagnostic_traces` row and correlates `traceId`/`runId`, and report real exporter readiness in `validateTelemetryStartup`.

**Architecture:** Extend `MetricsRegistry` (`packages/shared/src/metrics.ts`) to choose `HISTOGRAM_BUCKET_BOUNDS_USD` whenever the metric name ends with `_usd` (and propagate per-histogram `bounds` into `HistogramSummary` so OTLP and Prometheus Remote-Write export the matching `explicitBounds` / `le` labels). Refactor `beginMastraRun` and `finishMastraRun` (`packages/ai/src/mastra-v2/shared/run-telemetry.ts`) to derive `agentId` and step names from `telemetryKind`. Wrap `runMastraCanonicalChat`, `runMastraCanonicalChatStream`, `runMastraMode`, and `runCustomAgentStreamService` in `withDiagnostics` using `deferCompletion: true` + `persistDiagnosticContext` for streams.

**Tech Stack:** TypeScript, Node.js `AsyncLocalStorage`, Pino, Vitest, OpenTelemetry OTLP JSON, Prometheus Remote-Write (Snappy/Protobuf).

**Spec:** `docs/audits/09_Kestrel_Logging_Debugging_Telemetry_Jev_And_Training_Master_Audit.md` (Phase 1, Phase 2, Phase 5)

## Global Constraints

- **Dependency Direction:** `config → shared → db + indicators → data → ai → web + worker`. Verify with `node scripts/check-architecture-tree.mjs` and `node scripts/check-maintainability.mjs`.
- **Fail-Closed Observability Outages:** Diagnostic trace persistence (`persistDiagnosticContext`), Langfuse flushes, and Grafana metric pushes must never throw into or abort a user-facing chat stream.
- **Backward-Compatible Metric Names:** Keep `turn_cost_usd` and `committee_step_cost_usd` metric names unchanged; only their bucket bounds change to `HISTOGRAM_BUCKET_BOUNDS_USD`.
- **Stream Diagnostic Lifecycle:** For streaming responses (`runMastraCanonicalChatStream` and `runCustomAgentStreamService`), open `withDiagnostics` with `{ deferCompletion: true, traceId: runId, runId, requestId }` and call `await persistDiagnosticContext(diagCtx, outcome === 'success' ? 'completed' : 'failed')` inside the stream's terminal finalizer so the trace captures all tool calls and stream completion duration rather than persisting prematurely when the HTTP `Response` headers return.

## Review Focus

1. `HistogramSummary.bounds` in `packages/shared/src/metrics.ts`: `snapshotToOtlpJson` (`otlp.ts`) and `snapshotToPromRemoteWrite` (`remote-write.ts`) must read `summary.bounds ?? HISTOGRAM_BUCKET_BOUNDS_MS` so cost histograms emit `explicitBounds: [0.0001, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]` while latency histograms continue emitting `HISTOGRAM_BUCKET_BOUNDS_MS`.
2. `run-telemetry.ts` label attribution: `beginMastraRun` and `finishMastraRun` must map `telemetryKind` (`mastra_canonical_chat`, `mastra_mode`, `mastra_full_job`, `mastra_worker_task`, `mastra_custom_agent`, `mastra_xauusd_research`) to a clean agent tag (`canonical-chat`, `committee-mode`, `committee-full-job`, `worker-task`, `custom-agent`, `kestrel-xauusd-research-poc`) while preserving `kestrel-xauusd-research-poc` as the default when `telemetryKind` is omitted or `'mastra_xauusd_research'` so existing XAUUSD telemetry tests pass.
3. `withDiagnostics` in `runMastraCanonicalChatStream` (`packages/ai/src/mastra-v2/agents/canonical/stream.ts`): `getDiagnosticContext()` captured inside the `withDiagnostics` callback must be passed to `persistDiagnosticContext(diagCtx, status)` inside `finishRun` so that `diagnostic_traces` is persisted when the stream finishes (or errors), not when `runMastraCanonicalChatStream` returns its `{ text, completion }` handle.
4. `withDiagnostics` in `runMastraMode` (`packages/ai/src/mastra-v2/planning/mode-runner/run.ts`): if `getDiagnosticContext()` is already active (e.g. when called from `apps/worker/src/jobs/multi-agent-analysis/execute-run.ts` which already wraps `runMastraMode` in `withDiagnostics`), `runMastraMode` must reuse the outer diagnostic scope instead of nesting a second `withDiagnostics` that would double-persist the trace.
5. `langfuseTraceUrl` consistency: `runTracingOptions` (`packages/ai/src/mastra-v2/telemetry.ts`) attaches both `runId` and `traceId` to Mastra traces; `toMastraRunView` (`packages/ai/src/mastra-v2/observability-view/view.ts`) must fall back to `row.traceId ?? row.runId` when constructing `langfuseUrl` so runs always have a working deep link when Langfuse is configured.

---

### Task 1: Add Sub-Dollar `HISTOGRAM_BUCKET_BOUNDS_USD` for Cost Histograms in `@kestrel/shared`

**Files:**
- Modify: `packages/shared/src/metrics.ts:125-245`
- Modify: `packages/shared/src/metrics-export/otlp.ts:70-100`
- Modify: `packages/shared/src/metrics-export/remote-write.ts:90-125`
- Test: `packages/shared/test/metrics.test.ts`
- Test: `packages/shared/test/metrics-export.test.ts`

**Interfaces:**
- Produces:
  - `HISTOGRAM_BUCKET_BOUNDS_USD: readonly number[]` (`[0.0001, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]`) in `packages/shared/src/metrics.ts`
  - `boundsForMetric(name: MetricName): readonly number[]` in `packages/shared/src/metrics.ts`
  - `HistogramSummary.bounds: number[]` on `HistogramSummary` in `packages/shared/src/metrics.ts`

- [x] **Step 1: Write the failing tests in `packages/shared/test/metrics.test.ts` and `packages/shared/test/metrics-export.test.ts`**

```typescript
// In packages/shared/test/metrics.test.ts:
import {
  HISTOGRAM_BUCKET_BOUNDS_MS,
  HISTOGRAM_BUCKET_BOUNDS_USD,
  MetricsRegistry,
} from '../src/metrics';

it('uses HISTOGRAM_BUCKET_BOUNDS_USD for *_usd cost histograms and HISTOGRAM_BUCKET_BOUNDS_MS for latency histograms', () => {
  const reg = new MetricsRegistry();
  reg.observe('turn_cost_usd', 0.004);
  reg.observe('turn_cost_usd', 0.08);
  reg.observe('ttft_ms', 120);

  const snap = reg.snapshot();
  const costHist = snap.histograms['turn_cost_usd']!;
  expect(costHist.bounds).toEqual([...HISTOGRAM_BUCKET_BOUNDS_USD]);
  // 0.004 <= 0.005 (index 4), so buckets[0..3] === 0, buckets[4] === 1
  expect(costHist.buckets[3]).toBe(0); // le=0.0025
  expect(costHist.buckets[4]).toBe(1); // le=0.005
  // 0.08 <= 0.1 (index 8), so buckets[8] === 2
  expect(costHist.buckets[8]).toBe(2); // le=0.1

  const latencyHist = snap.histograms['ttft_ms']!;
  expect(latencyHist.bounds).toEqual([...HISTOGRAM_BUCKET_BOUNDS_MS]);
});
```

```typescript
// In packages/shared/test/metrics-export.test.ts:
it('exports USD explicitBounds for turn_cost_usd in OTLP JSON', () => {
  const reg = new MetricsRegistry();
  reg.observe('turn_cost_usd', 0.012);
  const otlp = snapshotToOtlpJson(reg.snapshot(), 'kestrel', '1000') as {
    resourceMetrics: Array<{
      scopeMetrics: Array<{
        metrics: Array<{
          name: string;
          histogram?: { dataPoints: Array<{ explicitBounds: number[] }> };
        }>;
      }>;
    }>;
  };
  const costMetric = otlp.resourceMetrics[0]!.scopeMetrics[0]!.metrics.find(
    (m) => m.name === 'turn_cost_usd',
  );
  expect(costMetric?.histogram?.dataPoints[0]?.explicitBounds).toEqual([
    ...HISTOGRAM_BUCKET_BOUNDS_USD,
  ]);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/shared test test/metrics.test.ts test/metrics-export.test.ts`
Expected: FAIL (`HISTOGRAM_BUCKET_BOUNDS_USD is not exported`)

- [x] **Step 3: Implement `HISTOGRAM_BUCKET_BOUNDS_USD` and `boundsForMetric` in `packages/shared/src/metrics.ts`, `otlp.ts`, and `remote-write.ts`**
  - In `packages/shared/src/metrics.ts`:
    - Export `HISTOGRAM_BUCKET_BOUNDS_USD = [0.0001, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5] as const`.
    - Export `function boundsForMetric(name: MetricName): readonly number[] { return name.endsWith('_usd') ? HISTOGRAM_BUCKET_BOUNDS_USD : HISTOGRAM_BUCKET_BOUNDS_MS; }`.
    - Add `bounds: number[];` to `HistogramSummary` and `HistogramAccumulator`, using `boundsForMetric(name)` in `observe()` and copying `bounds: [...acc.bounds]` in `snapshot()`.
  - In `packages/shared/src/metrics-export/otlp.ts`:
    - Use `const bounds = summary.bounds ?? HISTOGRAM_BUCKET_BOUNDS_MS;` for `explicitBounds: [...bounds]`.
  - In `packages/shared/src/metrics-export/remote-write.ts`:
    - Use `const bounds = summary.bounds ?? HISTOGRAM_BUCKET_BOUNDS_MS;` when iterating bucket bounds for `${name}_bucket`.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/shared test test/metrics.test.ts test/metrics-export.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/shared/src/metrics.ts packages/shared/src/metrics-export/otlp.ts packages/shared/src/metrics-export/remote-write.ts packages/shared/test/metrics.test.ts packages/shared/test/metrics-export.test.ts
git commit -m "fix(shared): use sub-dollar histogram buckets for *_usd cost metrics"
```

---

### Task 2: Fix Hardcoded `kestrel-xauusd-research-poc` Attribution in `run-telemetry.ts`

**Files:**
- Modify: `packages/ai/src/mastra-v2/shared/run-telemetry.ts:28-260`
- Modify: `packages/ai/src/mastra-v2/agents/canonical/chat.ts:56-62`
- Modify: `packages/ai/src/mastra-v2/agents/canonical/stream.ts:56-62`
- Modify: `packages/ai/src/mastra-v2/planning/mode-runner/run.ts:68-74`
- Test: `packages/ai/test/mastra-telemetry.test.ts`

**Interfaces:**
- Produces:
  - `agentLabelForTelemetryKind(kind?: MastraRunObservation['telemetryKind']): string` in `packages/ai/src/mastra-v2/shared/run-telemetry.ts`:
    - `'mastra_canonical_chat'` → `'kestrel-mastra-canonical-chat'`
    - `'mastra_mode'` → `'kestrel-committee-mode'`
    - `'mastra_full_job'` → `'kestrel-committee-full-job'`
    - `'mastra_worker_task'` → `'kestrel-worker-task'`
    - `'mastra_custom_agent'` → `'kestrel-custom-agent'`
    - `'mastra_xauusd_research'` | `'mastra_xauusd_poc'` | `undefined` → `MASTRA_XAUUSD_AGENT_ID` (`'kestrel-xauusd-research-poc'`)
  - `beginMastraRun` accepts optional `telemetryKind?: MastraRunObservation['telemetryKind']`

- [x] **Step 1: Write the failing test in `packages/ai/test/mastra-telemetry.test.ts`**

```typescript
it('tags canonical-chat and mode runs with their own agent label instead of kestrel-xauusd-research-poc', async () => {
  metrics.reset();
  await finishMastraRun({
    userId: 'user-1',
    threadId: 'thread-1',
    runId: 'run-canonical-1',
    model: 'google/gemini-2.5-flash',
    providerId: 'google',
    startedAt: Date.now() - 250,
    inputTokens: 100,
    outputTokens: 50,
    toolCalls: 1,
    steps: 1,
    outcome: 'success',
    telemetryKind: 'mastra_canonical_chat',
  });

  const snap = metrics.snapshot();
  expect(
    snap.counters['mastra_run_total{agent=kestrel-mastra-canonical-chat,outcome=success}'],
  ).toBe(1);
  expect(snap.histograms['total_latency_ms{agent=kestrel-mastra-canonical-chat}']?.count).toBe(1);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/ai test test/mastra-telemetry.test.ts`
Expected: FAIL (`expected undefined to be 1` because `agent` was hardcoded to `kestrel-xauusd-research-poc`)

- [x] **Step 3: Update `packages/ai/src/mastra-v2/shared/run-telemetry.ts` and callers**
  - Add `export function agentLabelForTelemetryKind(kind?: MastraRunObservation['telemetryKind']): string` and `function stepNameForTelemetryKind(kind?: MastraRunObservation['telemetryKind']): string` (`'mastra_canonical_chat'` → `'mastra_canonical_chat_run'`, `'mastra_mode'` → `'mastra_mode_run'`, `'mastra_full_job'` → `'mastra_full_job_run'`, `'mastra_custom_agent'` → `'mastra_custom_agent_run'`, default `'mastra_xauusd_run'`).
  - Update `beginMastraRun` to accept `telemetryKind?: MastraRunObservation['telemetryKind']` and use `stepNameForTelemetryKind(args.telemetryKind)` and `agentLabelForTelemetryKind(args.telemetryKind)`.
  - Update `finishMastraRun` to compute `const agentLabel = agentLabelForTelemetryKind(args.telemetryKind)` and `const stepName = stepNameForTelemetryKind(args.telemetryKind)` and pass `agent: agentLabel` to `mastra_run_total`, `total_latency_ms`, `mastra_run_failed_total`, `mastra_unpriced_model_total`, and `turn_cost_usd`.
  - Pass `telemetryKind: 'mastra_canonical_chat'` to `beginMastraRun` in `packages/ai/src/mastra-v2/agents/canonical/chat.ts` and `stream.ts`, and `telemetryKind: args.telemetryKind ?? 'mastra_mode'` in `packages/ai/src/mastra-v2/planning/mode-runner/run.ts`.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/ai test test/mastra-telemetry.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/ai/src/mastra-v2/shared/run-telemetry.ts packages/ai/src/mastra-v2/agents/canonical/chat.ts packages/ai/src/mastra-v2/agents/canonical/stream.ts packages/ai/src/mastra-v2/planning/mode-runner/run.ts packages/ai/test/mastra-telemetry.test.ts
git commit -m "fix(ai): attribute Mastra run metrics and diagnostic steps by telemetryKind"
```

---

### Task 3: Wrap Canonical Chat, Synchronous Mode Runs, and Custom Agents in `withDiagnostics`

**Files:**
- Modify: `packages/ai/src/mastra-v2/agents/canonical/chat.ts:39-225`
- Modify: `packages/ai/src/mastra-v2/agents/canonical/stream.ts:39-245`
- Modify: `packages/ai/src/mastra-v2/planning/mode-runner/run.ts:46-265`
- Modify: `apps/web/src/lib/services/mastra/chat/mastra-custom-agent-stream/service.ts:80-255`
- Test: `packages/ai/test/canonical-diagnostics.test.ts`

**Interfaces:**
- Consumes: `withDiagnostics`, `getDiagnosticContext`, `persistDiagnosticContext` from `@ai/diagnostics` (`@kestrel/ai`)
- Produces:
  - Active `RunDiagnosticContext` + `traceIdStorage` + `runIdStorage` during `runMastraCanonicalChat`, `runMastraCanonicalChatStream`, `runMastraMode`, and `runCustomAgentStreamService`
  - Automatic `persistDiagnosticContext(diagCtx, status)` on stream completion/failure

- [x] **Step 1: Write the failing test in `packages/ai/test/canonical-diagnostics.test.ts`**

```typescript
import { describe, expect, it, vi } from 'vitest';
import { getDiagnosticContext } from '../src/diagnostics';

describe('Diagnostic trace coverage across canonical chat and mode runner', () => {
  it('binds a diagnostic context with traceId and runId inside runMastraCanonicalChatStream and persists on completion', async () => {
    // Verify that getDiagnosticContext() is non-null during setup/stream and
    // persistDiagnosticContext is called when the stream finishes.
    expect(getDiagnosticContext()).toBeNull();
  });
});
```
*(Expand the test in `packages/ai/test/canonical-diagnostics.test.ts` to mock `setupCanonicalChat` and `persistTrace`, invoke `runMastraCanonicalChat` and `runMastraCanonicalChatStream`, consume `text` + `completion`, and assert that `getDiagnosticContext()?.runId` matched `runId` and `persistTrace` was called with `status: 'completed'`.)*

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/ai test test/canonical-diagnostics.test.ts`
Expected: FAIL (`persistTrace` not called during `runMastraCanonicalChat` / `runMastraCanonicalChatStream`)

- [x] **Step 3: Wire `withDiagnostics` into `canonical/chat.ts`, `canonical/stream.ts`, `mode-runner/run.ts`, and `mastra-custom-agent-stream/service.ts`**
  - In `packages/ai/src/mastra-v2/agents/canonical/chat.ts`:
    - If `getDiagnosticContext()` is null, wrap the body of `runMastraCanonicalChat` in `withDiagnostics(args.userId, args.threadId, () => executeCanonicalChat(args, runId), { traceId: runId, runId })`.
  - In `packages/ai/src/mastra-v2/agents/canonical/stream.ts`:
    - Wrap `runMastraCanonicalChatStream` in `withDiagnostics(args.userId, args.threadId, async () => { ... }, { deferCompletion: true, traceId: runId, runId })`.
    - Capture `const diagCtx = getDiagnosticContext();` inside the `withDiagnostics` callback and call `await persistDiagnosticContext(diagCtx, obs.outcome === 'success' ? 'completed' : 'failed');` inside `finishRun` right after `finishMastraRun(obs)`.
  - In `packages/ai/src/mastra-v2/planning/mode-runner/run.ts`:
    - Extract the existing body into `executeMastraMode(args: RunMastraModeArgs): Promise<MastraModeResult>`.
    - In `runMastraMode(args)`: if `getDiagnosticContext()` is already non-null (e.g., worker `execute-run.ts`), call `return executeMastraMode(args);`; otherwise call `return withDiagnostics(args.userId, args.threadId, () => executeMastraMode(args), { traceId: args.runId, runId: args.runId });`.
  - In `apps/web/src/lib/services/mastra/chat/mastra-custom-agent-stream/service.ts`:
    - Import `withDiagnostics, getDiagnosticContext, persistDiagnosticContext` from `@kestrel/ai` and wrap the custom agent stream setup with `{ deferCompletion: true, traceId: runId, runId }`, calling `await persistDiagnosticContext(diagCtx, 'completed' | 'failed')` when the stream completes or errors.

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kestrel/ai test test/canonical-diagnostics.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/ai/src/mastra-v2/agents/canonical/chat.ts packages/ai/src/mastra-v2/agents/canonical/stream.ts packages/ai/src/mastra-v2/planning/mode-runner/run.ts apps/web/src/lib/services/mastra/chat/mastra-custom-agent-stream/service.ts packages/ai/test/canonical-diagnostics.test.ts
git commit -m "fix(ai,web): wrap canonical chat, mode runner, and custom agents in withDiagnostics"
```

---

### Task 4: Fix `validateTelemetryStartup` Readiness Checks & Unify Langfuse Deep Links

**Files:**
- Modify: `packages/ai/src/mastra-v2/shared/telemetry-startup.ts:10-55`
- Modify: `packages/ai/src/mastra-v2/observability-view/view.ts:110-125`
- Modify: `packages/ai/src/diagnostics/trace-persistence.ts:44-52`
- Test: `packages/ai/test/telemetry-startup.test.ts`

**Interfaces:**
- Produces:
  - `TelemetryStartupCheck['exporters']` where `database`, `metrics`, `langfuse`, and `mastra` each resolve to `'configured' | 'disabled'` (preserving `'unknown'` in the union type for backward compatibility)
  - Consistent `langfuseUrl` resolution (`langfuseTraceUrl(row.traceId ?? row.runId)`) in `toMastraRunView` and `traceDocumentWithDeepLinks`

- [x] **Step 1: Write the failing test in `packages/ai/test/telemetry-startup.test.ts`**

```typescript
it('reports database, metrics, langfuse, and mastra as configured when env vars are present', () => {
  const result = validateTelemetryStartup({
    DATABASE_URL: 'postgres://localhost:5432/kestrel',
    GRAFANA_CLOUD_OTLP_ENDPOINT: 'https://otlp.grafana.net/otlp',
    GRAFANA_CLOUD_API_KEY: 'glc_123',
    LANGFUSE_PUBLIC_KEY: 'pk-lf-123',
    LANGFUSE_SECRET_KEY: 'sk-lf-123',
    LANGFUSE_BASE_URL: 'https://cloud.langfuse.com',
  });
  expect(result.exporters).toEqual({
    database: 'configured',
    metrics: 'configured',
    langfuse: 'configured',
    mastra: 'configured',
  });
});

it('reports disabled when optional exporter env vars are absent', () => {
  const result = validateTelemetryStartup({});
  expect(result.exporters.langfuse).toBe('disabled');
  expect(result.exporters.metrics).toBe('disabled');
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/ai test test/telemetry-startup.test.ts`
Expected: FAIL (`expected 'unknown' to deeply equal 'configured'`)

- [x] **Step 3: Implement real readiness checks in `telemetry-startup.ts` and fallback ID in `observability-view/view.ts`**
  - In `packages/ai/src/mastra-v2/shared/telemetry-startup.ts`:
    - Expand `exporters` field types to `'configured' | 'disabled' | 'unknown'`.
    - Compute:
      - `const databaseConfigured = Boolean(env.DATABASE_URL?.trim() || env.POSTGRES_URL?.trim());`
      - `const metricsConfigured = Boolean(grafanaOtlpConfigFromEnv(env) || grafanaRemoteWriteConfigFromEnv(env));` (import from `@kestrel/shared/metrics-export`)
      - `const langfuseConfigured = Boolean(env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY && env.LANGFUSE_BASE_URL);`
      - `const mastraConfigured = databaseConfigured || langfuseConfigured;`
    - Populate `exporters: { database: databaseConfigured ? 'configured' : 'disabled', metrics: metricsConfigured ? 'configured' : 'disabled', langfuse: langfuseConfigured ? 'configured' : 'disabled', mastra: mastraConfigured ? 'configured' : 'disabled' }`.
  - In `packages/ai/src/mastra-v2/observability-view/view.ts`:
    - Change `langfuseUrl: row.traceId ? langfuseTraceUrl(row.traceId) : null` to:
      ```typescript
      const langfuseId = row.traceId ?? (runId.length > 0 ? runId : null);
      // ...
      langfuseUrl: langfuseId ? langfuseTraceUrl(langfuseId) : null,
      ```
  - In `packages/ai/src/diagnostics/trace-persistence.ts`:
    - In `traceDocumentWithDeepLinks`, resolve `const correlationId = (typeof trace.trace['runId'] === 'string' && trace.trace['runId'].length > 0) ? trace.trace['runId'] : trace.traceId;` and pass `correlationId` to `langfuseTraceUrl`.

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kestrel/ai test test/telemetry-startup.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/ai/src/mastra-v2/shared/telemetry-startup.ts packages/ai/src/mastra-v2/observability-view/view.ts packages/ai/src/diagnostics/trace-persistence.ts packages/ai/test/telemetry-startup.test.ts
git commit -m "fix(ai): report real exporter readiness in validateTelemetryStartup and unify Langfuse links"
```
