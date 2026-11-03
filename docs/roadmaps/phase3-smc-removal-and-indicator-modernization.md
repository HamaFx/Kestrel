# Phase 3: Retire Legacy SMC Heuristics & Clean Up Indicator / Structure Tools

> **Goal:** Remove or deprecate noisy, rule-heuristic Smart Money Concepts (`Order Blocks`, `Fair Value Gaps (FVG)`, `BOS/CHoCH`, `Liquidity Sweeps`) that confuse AI models, while preserving clean, objective price levels (`swings.ts` Swing Highs/Lows, `pdh-pdl.ts` Previous Day/Week High/Low, `asian-range.ts` Session Ranges, `pivots.ts`) and core mathematical indicators (`SMA`, `EMA`, `RSI`, `MACD`, `ATR`, `Bollinger`) via `indicatorRegistry` so better quantitative indicators can be plugged in cleanly later.

---

> **Status:** Complete (2026-11-03). Depends on Phase 2.

## Overview of Tasks

- [x] **Task 3.1:** Remove heuristic SMC detectors (`fvg.ts`, `order-blocks.ts`, `liquidity.ts`, `structure.ts`) from `@kestrel/indicators` while keeping objective Swing & Session level math (`swings.ts`, `pdh-pdl.ts`, `asian-range.ts`).
- [x] **Task 3.2:** Simplify `get_market_structure`, `SymbolResearchPacket`, and Backtesting `smc-features.ts` to use clean Swing High/Low + Session Levels instead of OB/FVG/Sweep arrays.
- [x] **Task 3.3:** Update `README.md`, landing page copy, and specialist playbooks to remove SMC marketing/jargon in favor of clean multi-timeframe quantitative & macro structure.

---

## Task 3.1: Prune Heuristic SMC Detectors in `@kestrel/indicators`

### Why

Heuristic ICT/SMC detectors (`detectFvgs`, `detectOrderBlocks`, `detectLiquiditySweeps`, `detectStructure` BOS/CHoCH) generate dozens of overlapping historical zones and subjective labels that degrade LLM reasoning quality. Objective price extremes—**Swing Highs/Lows (`findSwings`)**, **Previous Day/Week Highs & Lows (`computePdhPdl`)**, **Session Ranges (`computeAsianRange`)**, and **Floor Trader Pivots (`pivotsAligned`)**—give LLMs exact, unambiguous support/resistance anchor prices.

### Files to Delete

- `packages/indicators/src/smc/fvg.ts`
- `packages/indicators/src/smc/order-blocks.ts`
- `packages/indicators/src/smc/liquidity.ts`
- `packages/indicators/src/smc/structure.ts`
- Corresponding unit test files in `packages/indicators/test/` for FVG, Order Blocks, Liquidity Sweeps, and BOS/CHoCH.

### Files to Modify

- `packages/indicators/src/smc/index.ts`:
  - Keep `findSwings`, `defaultSwingLookback`, `computePdhPdl`, and `computeAsianRange`.
  - Simplify `computeStructure(args)` so it computes and returns objective `swings` (Swing Highs and Swing Lows with lookback) without `fvg`, `orderBlocks`, `liquidity`, or `bos_choch`.
- `packages/indicators/src/index.ts`:
  - Remove exports of `detectStructure`, `detectFvgs`, `detectOrderBlocks`, and `detectLiquiditySweeps`.
- `packages/shared/src/schemas/` (market structure schemas):
  - Simplify `StructureKindSchema` and `StructureResult` to only carry `swings` (or deprecate unused `fvg`/`orderBlocks`/`liquidity`/`events` fields cleanly).

### Verification

- Run `pnpm --filter @kestrel/indicators test` and `pnpm --filter @kestrel/shared test`.

---

## Task 3.2: Update AI Tools, Research Packet & Backtester Feature Matrix

### Files to Modify

1. **`packages/ai/src/mastra-v2/tools/canonical/market-structure.ts` & `descriptions.ts`:**
   - Update `canonicalMarketStructureTool` (`get_market_structure`) so it returns recent **Swing Highs & Swing Lows**, **Recent Range (`recentSwingHigh`, `recentSwingLow`, `rangeSize`)**, and a clean summary string (`"N swings · recent high X · recent low Y"`), without FVG/OB/Sweep arrays.
2. **`packages/ai/src/tools/` (read-only analysis tools: `analyze-technical`, `replay-setup`, `verify-call`):**
   - Update any callers of `computeStructure` to rely on `swings`, `sessionLevels` (`PDH`/`PDL`, Asian Range), and `indicatorRegistry` indicators (`EMA`, `RSI`, `MACD`, `ATR`, `Bollinger`, `Pivots`).
3. **`packages/ai/src/committee/prompts/specialist.ts`:**
   - Ensure the `technical` specialist goal and `SPECIALIST_SKILL_PLAYBOOKS.technical` focus on multi-timeframe trend alignment (`EMA20`/`EMA50`/`EMA200`), momentum/volatility confluence (`RSI14`, `MACD`, `ATR14`, `Bollinger`), and objective swing/session support & resistance levels (`PDH`/`PDL`, Asian/London/NY highs & lows).
4. **`plugins/backtesting/src/engine/smc-features.ts` & `feature-types.ts`:**
   - Simplify `applySmc` to populate `swingHigh` and `swingLow` (and session levels) from `computeStructure({ kinds: ['swings'] })`, removing the FVG/OB/Sweep zone tracking loops.

### How Future Indicators Should Be Added

- All new mathematical or quantitative indicators (e.g., VWAP, Keltner Channels, Donchian Channels, Supertrend, ADX, Volume Profile) should be registered as self-contained plugins in `packages/indicators/src/registry.ts` via `indicatorRegistry.register({...})`.

### Verification

- Run `pnpm --filter @kestrel/ai test` and `pnpm --filter @kestrel/plugin-backtesting test`.

---

## Task 3.3: Update Documentation & UI Copy

### Files to Modify

- `README.md`:
  - Replace "Smart Money Concepts (SMC) • Order Blocks • Fair Value Gaps" badges and bullet points with **Multi-Timeframe Quantitative Structure, Session Liquidity Levels (PDH/PDL, Asian/London/NY Ranges), & Extensible Indicator Registry**.
  - Confirm **BiQuote** is documented clearly as the default Gold/Forex provider alongside Binance (Crypto), FRED (Macro), and CFTC (COT).
- `apps/web/src/components/landing/` and `apps/web/src/components/onboarding/`:
  - Update any marketing cards or starter prompts that mention Order Blocks or FVGs to reference support/resistance swing structure, session levels, and macro/technical confluence instead.

### Verification

- Run `pnpm check:fast` and `pnpm knip`.

---

## Implementation Notes (2026-11-03)

- **Detectors deleted:** `packages/indicators/src/smc/{fvg,order-blocks,liquidity,structure}.ts` and their four unit suites are gone. The remaining swing/session math now lives in `packages/indicators/src/structure/` (renamed from `smc/`), and `@kestrel/indicators` exports only `computeStructure`, `findSwings`, `defaultSwingLookback`, `computePdhPdl`, and `computeAsianRange` from the structure layer. `detectFvgs`, `detectOrderBlocks`, `detectLiquiditySweeps`, and `detectStructure` no longer exist anywhere in the workspace.
- **One structure shape:** `StructureResultSchema` is now `{ symbol, tf, bars, swings, fetchedAt }` with `swings` required. `StructureKindSchema`, `StructureEventSchema`, `FvgZoneSchema`, `OrderBlockSchema`, and `LiquiditySweepSchema` were removed, so nothing can smuggle the old shape back in. `computeStructure` takes `{ symbol, tf, candles, swings?: { lookback } }` and defaults the lookback per timeframe.
- **`get_market_structure`:** the input lost `kinds`; the output is `swings` (last 15), `recentSwingHigh`, `recentSwingLow`, `rangeSize`, and a `"N swings · recent high X · recent low Y"` summary (singular-aware). The recent range is the band between the strongest of the last `lookback` swing highs and the deepest of the last `lookback` swing lows; both sides must qualify before a range size is reported.
- **`annotate_chart`:** requestable kinds are now `swings`, `pdh_pdl`, and `asian_range`. The SMC marker/zone blocks and the `toStructureKind` bridge were removed.
- **`analyze_technical`:** `structure.latestStructureEvent` (BOS/CHoCH) is gone. `levels` now carries `pdh`, `pdl`, `asianHigh`, and `asianLow` alongside pivot/R1/S1/ATR14, so the tool keeps a full level read without the removed detectors. The chat part renders PDH/PDL instead of the structure tag.
- **Specialist desk:** the technical goal and playbook now name EMA20/50/200 stack alignment, RSI14/MACD/ATR14/Bollinger confluence, and swing/session support & resistance explicitly.
- **Backtester:** `applySwingLevels` only publishes causal swing pivots (`swingHigh` / `swingLow`); the FVG/order-block/sweep/structure arrays and `MAX_ACTIVE_ZONES` are deleted from the matrix. The strategy context renamed `ctx.smc` to `ctx.levels` and now exposes `{ swingHigh, swingLow, pdh, pdl, asianHigh, asianLow }` only, so saved strategies that read `ctx.smc.fvg` / `orderBlock` / `sweep` / `structure` must be updated. The `smc-ict-playbooks` skill was replaced by `session-level-playbooks` (Asian range breakout, previous-day level fade, swing-level trend pullback), and `strategy-architect` / `quant-playbooks` were rewritten against the trimmed `ctx`.
- **Copy:** README, chart OG image, landing desks/architecture/stepper/simulator/hero telemetry, chat empty-state prompts, desk briefs, ARBITER stage captions, and the strategist desk config no longer advertise order blocks, FVGs, sweeps, or BOS/CHoCH. README now names BiQuote (gold/FX), Binance (crypto), FRED (macro), and CFTC (COT) as the default providers.
- **Verification:** `pnpm check:guards` 7/7, `pnpm knip` 0 findings, `pnpm check:fast` 31/31 tasks; shared 459, indicators 84, ai 1639, web 1516, plugin-backtesting 64, plugin-custom-agents 25, plugin-sdk 31 tests pass.
