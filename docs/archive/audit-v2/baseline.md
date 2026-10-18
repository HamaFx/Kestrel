# Audit v2 — Pre-Change Baseline (Plan §0.3)

Captured 2026-10-12 at the start of `docs/plans/kestrel-ai-agentic-audit-v2.md`
implementation. Head commit: `bb2cb51e` ("feat(ai): implement agentic audit
upgrade plan (phases 0-5)" — the v1 upgrade the v2 audit re-verifies).

## Reference points

| Snapshot                                   | Test files | Tests                           | Source                                                      |
| ------------------------------------------ | ---------- | ------------------------------- | ----------------------------------------------------------- |
| Pre-v1 (2026-10-10)                        | 161        | 1357 green                      | `docs/archive/audit-2026-q1/baseline.md`                    |
| Post-v1 / pre-v2 (`bb2cb51e`)              | 170+       | 1400+ green                     | `docs/plans/decisions.log.md` 2026-10-11 verification entry |
| v2 start-of-work (`packages/ai`)           | 171        | 1440 total (1417 pass, 22 skip) | `/tmp/baseline-ai-test.log` (see caveat)                    |
| v2 start-of-work typecheck (`packages/ai`) | —          | `tsc --noEmit` exit 0           | `/tmp/baseline-ai-tsc.log`                                  |

Caveat on the v2 start-of-work row: the log was captured while Phase 1 task
1.2 (committee numeric grounding) was mid-implementation, so it shows one
transient failure in `opinion-verifier.test.ts` that was fixed minutes later
(the post-1.2 run was 1420 tests passing). The authoritative pre-v2 green
reference is the `bb2cb51e` row. The 22 skips are the Postgres-gated suites
(`test:postgres-rls` territory) plus one queue test needing a live DB.

## What the v2 plan changes relative to this baseline

Phase 1 (correctness): durable Full progress payload (P0-1), real committee
numeric grounding (P0-2), canonical evidence hard-block (P0-3), circuit-breaker
wiring (P0-4), cost-table precedence (P0-5), XAUUSD label-bypass removal
(P0-6), cross-critique own-opinion, structured-fusion repair render, guardrail
consistency, robustness batch, trust/billing batch. Phases 2–5: performance,
multi-agent, cleanup, evals.

## Quantitative Definition-of-Done metrics

Latency (p95 `full`/`single`), cost per turn, grounding-rejection counts, and
packet-cache hit rate all require a live deployment run; none are recorded
here (same status as the v1 baseline — "not yet measured"). Checkpoint 1 of
the v2 plan compares `pnpm typecheck` + `pnpm test` green plus the new
per-task unit tests, not live latency numbers.
