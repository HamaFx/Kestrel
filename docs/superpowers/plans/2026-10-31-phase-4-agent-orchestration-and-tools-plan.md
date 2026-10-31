# Phase 4: AI Agent Orchestration, Routing & Plugin Tool Ergonomics Implementation Plan

> **Status: ✅ COMPLETE — implemented, verified and committed 2026-10-31.**
>
> | Task                                                                                         | Commit     | Verification                                                                    |
> | :------------------------------------------------------------------------------------------- | :--------- | :------------------------------------------------------------------------------ |
> | 1. Plugin-aware system prompt + `canonical-chat` `maxSteps: 10`                              | `2c410e78` | `@kestrel/ai` full suite (1,639 ✔ / 24 skipped)                                 |
> | 2. Intent detection & route overrides (`full` mode, comparisons, Jev false positives)        | `eb1d7f9f` | `@kestrel/ai` router/decision suites ✔                                          |
> | 3. Backtesting sweep lookup + run comparison tools; execution tools only on `canonical-chat` | `b563816f` | `@kestrel/plugin-backtesting` (46 ✔)                                            |
> | 4. `paper_control_strategy_run`, `paper_list_fills`, server-side `strategyId` resolution     | `c9f97040` | `@kestrel/plugin-paper-trading` (44 ✔), typecheck + lint + maintainability PASS |
>
> Downstream regression after completion: full `@kestrel/ai` (1,639 ✔ / 24 skipped), `apps/worker` (168 ✔), `node scripts/check-maintainability.mjs` (0 violations), `node scripts/check-architecture-tree.mjs` PASS.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the system-prompt vs plugin-tool contradiction in `canonical/prompts.ts`, harden `detectInstalledPluginIntent` and `decideMastraExecution` so plugin commands work across `full` mode, multi-symbol prompts, and natural trader phrasing (`move stop`, `breakeven`, `trim`, `flatten`, `test strategy`), prevent committee specialist desks from persisting side-effect backtest runs, raise `canonical-chat` `maxSteps` to `10`, and add the missing agent tools (`paper_control_strategy_run`, `paper_list_fills`, `backtest_list_sweeps`, `backtest_get_sweep`, and `strategyId`/`runId` lookup in `paper_deploy_strategy`).

**Architecture:** Pass `installedPluginIds` into `systemInstructions()` in `packages/ai/src/mastra-v2/agents/canonical/prompts.ts` so the prompt explicitly authorizes virtual paper-trading (`paper_*`) and strategy backtesting (`backtest_*`) when installed while preserving the hard ban on real-money brokerage execution. Expand `detectInstalledPluginIntent` in `packages/ai/src/plugins/intent.ts` and allow `pluginRouteOverride` in `execution-decision.ts` to take precedence over `full` mode and `comparisonActive` whenever the prompt explicitly asks to run a backtest or execute a paper-trading action. Remove `technical` and `risk` from `attachTo` on `backtest_run_strategy` and `backtest_sweep_strategy` (keeping read-only inspection tools on desks), and register the missing management/inspection tools on both plugins.

**Tech Stack:** TypeScript 7 (`tsrs`), Vitest, Mastra (`@mastra/core`), Zod v4, `@kestrel/ai`, `@kestrel/plugin-backtesting`, `@kestrel/plugin-paper-trading`.

**Spec:** `docs/superpowers/plans/2026-10-31-backtesting-paper-trading-master-audit-and-roadmap.md`

## Global Constraints

- `RULE-F01`: Every backend `.ts` file must stay `<= 350 LOC` (`node scripts/check-maintainability.mjs`).
- `RULE-F05`: Keep `<= 10` loose files in package `src/` roots; never add top-level directories to `packages/ai/src/mastra-v2/` without updating `docs/architecture.md` (`node scripts/check-architecture-tree.mjs`).
- `RULE-R01`: No empty `catch {}` blocks.
- Run `pnpm --filter @kestrel/ai test`, `pnpm --filter @kestrel/plugin-backtesting test`, and `pnpm --filter @kestrel/plugin-paper-trading test` after each task.

## Review Focus

- Canonical system prompt when `paper-trading` and `backtesting` are installed: `systemInstructions` must NOT say `"Mutation tools are deliberately not exposed in this agent"` or `"Never place trades"` without qualifying that virtual `paper_*` and `backtest_*` tools are enabled and use confirmation cards when required.
- User prompt `"Backtest an RSI pullback strategy on XAUUSD and EURUSD"` or `"Backtest SMC on XAUUSD"` while thread mode is `'full'`: `decideMastraExecution` must route to `'canonical-chat'`, NOT `'multi-symbol-research'` or `'full-analysis-queue'`.
- Trader phrasing for paper position management: `"Move my XAUUSD stop to breakeven"`, `"Trail my stop on EURUSD by 20 pips"`, `"Trim half of my gold position"`, and `"Flatten my sandbox positions"` must match `detectInstalledPluginIntent` for `'paper-trading'`.
- Deploying a saved strategy or completed backtest run to Paper Trading from chat: `paper_deploy_strategy` must accept `strategyId` (or `backtestRunId`) without requiring the LLM to re-emit the entire JavaScript `source` string.
- Controlling a deployed paper strategy from chat: `paper_control_strategy_run({ strategyRunId, action: 'pause' | 'resume' | 'stop' | 'delete' })` must pause, resume, stop, or delete the run without forcing the user to leave chat.

---

### Task 1: Make `canonical/prompts.ts` Plugin-Aware & Raise `canonical-chat` `maxSteps` to `10`

**Files:**

- Modify: `packages/ai/src/mastra-v2/agents/canonical/prompts.ts:140-175`
- Modify: `packages/ai/src/mastra-v2/agents/canonical/setup.ts:255-268`
- Modify: `packages/ai/src/mastra-v2/capabilities/catalog.ts:110-120`
- Test: `packages/ai/test/mastra-run.test.ts`

**Interfaces:**

- Modifies:
  - `systemInstructions(routing, customInstructions, responseStyle, citeSources, installedPluginIds?: readonly string[]): string` in `packages/ai/src/mastra-v2/agents/canonical/prompts.ts`
  - `MASTRA_CAPABILITIES['canonical-chat'].maxSteps` in `packages/ai/src/mastra-v2/capabilities/catalog.ts`: raised from `6` to `10`.

- [x] **Step 1: Write the failing test in `packages/ai/test/mastra-run.test.ts` (or a dedicated prompt test)**

```ts
it('instructs the canonical agent how to use installed backtesting and paper-trading plugin tools', () => {
  const text = systemInstructions(
    { domain: 'technical', planRequired: true, rationale: 'test' },
    undefined,
    'default',
    false,
    ['backtesting', 'paper-trading'],
  );
  expect(text).toContain('paper-trading');
  expect(text).toContain('backtesting');
  expect(text).not.toContain('Mutation tools are deliberately not exposed in this agent');
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/ai test -- test/mastra-run.test.ts`
Expected: FAIL (`text` contains `'Mutation tools are deliberately not exposed in this agent'`).

- [x] **Step 3: Update `systemInstructions` in `prompts.ts`, pass `pluginRuntime.installedPluginIds` in `setup.ts`, and set `maxSteps: 10` in `catalog.ts`**

In `packages/ai/src/mastra-v2/agents/canonical/prompts.ts`, add `installedPluginIds: readonly string[] = []` as the 5th parameter of `systemInstructions`.

- When `installedPluginIds.length === 0`, keep the existing read-only mutation message.
- When `installedPluginIds` includes `'paper-trading'` or `'backtesting'` (or other plugins), replace the `"Never place trades... Mutation tools are deliberately not exposed"` sentences with:
  `"Never place real-money brokerage trades. Installed plugin tools (${installedPluginIds.join(', ')}) ARE available in this agent: use backtest_* tools to design, run, sweep, and save strategies, and use paper_* tools to manage virtual paper-trading accounts, orders, positions, and strategy deployments. When a plugin tool returns status 'confirmation_required', ask the user to click Confirm on the confirmation card."`
  In `packages/ai/src/mastra-v2/agents/canonical/setup.ts`, pass `pluginRuntime.installedPluginIds` into `systemInstructions(...)`.
  In `packages/ai/src/mastra-v2/capabilities/catalog.ts`, update `MASTRA_CAPABILITIES['canonical-chat'].maxSteps` to `10`.

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kestrel/ai test -- test/mastra-run.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/ai/src/mastra-v2/agents/canonical/prompts.ts packages/ai/src/mastra-v2/agents/canonical/setup.ts packages/ai/src/mastra-v2/capabilities/catalog.ts packages/ai/test/mastra-run.test.ts
git commit -m "fix(ai): make canonical system prompt plugin-aware and raise maxSteps to 10"
```

---

### Task 2: Harden Plugin Intent Detection & Route Overrides (`intent.ts`, `execution-decision.ts`, `router.ts`)

**Files:**

- Modify: `packages/ai/src/plugins/intent.ts:40-95`
- Modify: `packages/ai/src/mastra-v2/planning/execution-decision.ts:170-185`
- Modify: `packages/ai/src/mastra-v2/planning/router.ts:125-145`
- Test: `packages/ai/test/plugins-intent.test.ts`
- Test: `packages/ai/test/execution-decision-plugins.test.ts`

**Interfaces:**

- Modifies:
  - `BACKTEST_INTENT_RE` in `packages/ai/src/plugins/intent.ts`: adds `test\s+(?:a\s+|this\s+|my\s+)?strategy`, `simulate\s+(?:a\s+|this\s+)?strategy`, `getSignal`, `expectancy\s*r`, `profit\s+factor`.
  - `PAPER_TRADE_ACTION_RE` in `packages/ai/src/plugins/intent.ts`: adds `(?:move|trail|tighten|update)\s+(?:my\s+|the\s+)?(?:[a-z0-9/_-]+\s+)?stop(?:\s+loss)?`, `breakeven`, `(?:trim|flatten|exit)\s+(?:my\s+|the\s+|half\s+)?(?:[a-z0-9/_-]+\s+)?(?:position|positions|trade|trades)`, `(?:pause|resume|stop)\s+(?:my\s+|the\s+)?(?:deployed\s+|paper\s+)?strategy`.
  - `pluginRouteOverride` in `packages/ai/src/mastra-v2/planning/execution-decision.ts`: removes the `input.mode === 'single'` and `!comparisonActive` restrictions when `pluginIntent !== null` so explicit plugin commands always route to `'canonical-chat'`.
  - `routeUnified` in `packages/ai/src/mastra-v2/planning/router.ts`: when `pluginIntent !== null`, suppresses `jevDecision?.injectionBlocked` false positives (while still enforcing the deterministic `isInjectionAttempt(promptText)` lexical guard) and suppresses `mutationKind = 'log_journal'` hijacks for `'paper-trading'` intents.

- [x] **Step 1: Write the failing tests in `packages/ai/test/plugins-intent.test.ts` and `packages/ai/test/execution-decision-plugins.test.ts`**

```ts
// In packages/ai/test/plugins-intent.test.ts:
it('matches natural trader phrasing for stop management, trimming, and strategy testing', () => {
  expect(
    detectInstalledPluginIntent('Move my XAUUSD stop to breakeven', ['paper-trading']),
  ).toMatchObject({ pluginId: 'paper-trading' });
  expect(
    detectInstalledPluginIntent('Trail my stop on EURUSD by 15 pips', ['paper-trading']),
  ).toMatchObject({ pluginId: 'paper-trading' });
  expect(
    detectInstalledPluginIntent('Trim half of my gold position', ['paper-trading']),
  ).toMatchObject({ pluginId: 'paper-trading' });
  expect(
    detectInstalledPluginIntent('Test a strategy on XAUUSD 15m using FVG', ['backtesting']),
  ).toMatchObject({ pluginId: 'backtesting' });
});

// In packages/ai/test/execution-decision-plugins.test.ts:
it('routes backtest and paper-trading commands to canonical-chat even in full mode or with two symbols', async () => {
  const fullModeBacktest = await decideMastraExecution({
    userMessage: msg('Backtest an RSI pullback strategy on XAUUSD 1h'),
    mode: 'full',
    settings: { aiApiKeys: {}, chatModel: null },
    env: {},
    installedPluginIds: ['backtesting'],
  });
  expect(fullModeBacktest.route).toBe('canonical-chat');

  const multiSymbolBacktest = await decideMastraExecution({
    userMessage: msg('Backtest RSI on XAUUSD and EURUSD'),
    mode: 'single',
    settings: { aiApiKeys: {}, chatModel: null },
    env: {},
    installedPluginIds: ['backtesting'],
  });
  expect(multiSymbolBacktest.route).toBe('canonical-chat');
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @kestrel/ai test -- test/plugins-intent.test.ts test/execution-decision-plugins.test.ts`
Expected: FAIL on both test files.

- [x] **Step 3: Update `intent.ts`, `execution-decision.ts`, and `router.ts`**

1. Expand `BACKTEST_INTENT_RE` and `PAPER_TRADE_ACTION_RE` in `packages/ai/src/plugins/intent.ts`.
2. In `packages/ai/src/mastra-v2/planning/execution-decision.ts`:
   ```ts
   const pluginRouteOverride =
     pluginIntent !== null && input.capabilityId === undefined && !mutationRequested;
   ```
   And in `routeFor` (`packages/ai/src/mastra-v2/planning/execution-routes.ts`), check `if (pluginRouteOverride) return 'canonical-chat';` BEFORE `if (mode === 'full')` and `if (comparisonActive)`.
3. In `packages/ai/src/mastra-v2/planning/router.ts`:
   ```ts
   const pluginIntent = detectInstalledPluginIntent(promptText, input.installedPluginIds ?? []);
   const injectionBlocked =
     isInjectionAttempt(promptText) ||
     (pluginIntent === null && jevDecision?.injectionBlocked === true);
   const rawMutationKind =
     input.classifiedMutationKind ?? classifyMutationRequestWithJev(promptText, jevDecision);
   const mutationKind =
     pluginIntent?.pluginId === 'paper-trading' && rawMutationKind === 'log_journal'
       ? null
       : rawMutationKind;
   ```

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kestrel/ai test -- test/plugins-intent.test.ts test/execution-decision-plugins.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/ai/src/plugins/intent.ts packages/ai/src/mastra-v2/planning/execution-decision.ts packages/ai/src/mastra-v2/planning/execution-routes.ts packages/ai/src/mastra-v2/planning/router.ts packages/ai/test/plugins-intent.test.ts packages/ai/test/execution-decision-plugins.test.ts
git commit -m "fix(ai): route plugin intents to canonical-chat across full mode and multi-symbol prompts"
```

---

### Task 3: Add Missing Backtesting Tools (`backtest_list_sweeps`, `backtest_get_sweep`, `backtest_compare_runs`) & Guard Committee Desks

**Files:**

- Modify: `plugins/backtesting/src/tools/runs.ts:46-52`
- Modify: `plugins/backtesting/src/tools/sweeps.ts:20-58`
- Modify: `plugins/backtesting/src/schemas/sweep.ts:80-135`
- Modify: `plugins/backtesting/test/plugin.test.ts`

**Interfaces:**

- Produces:
  - `backtest_list_sweeps`: lists recent parameter sweeps (`listSweepViews(ctx.userId, input.limit)`).
  - `backtest_get_sweep`: fetches a sweep's ranked combinations, `bestParams`, `bestMetrics`, and `oosMetrics` by `sweepId` (`getSweepDetail(ctx.userId, input.sweepId)`).
  - `backtest_compare_runs`: compares 2–4 saved backtest `runId`s side-by-side (`metrics`, `params`, `symbol`, `timeframe`, delta in `expectancyR`, `profitFactor`, `maxDrawdownPct`, `netPnl`).
  - `backtest_run_strategy` and `backtest_sweep_strategy`: set `attachTo: ['canonical-chat']` so committee specialist desks (`technical`, `risk`) only receive read-only lookup tools (`backtest_list_runs`, `backtest_get_run`, `backtest_list_strategies`, `backtest_read_strategy`, `backtest_list_sweeps`, `backtest_get_sweep`) and cannot trigger heavy sandbox runs or DB writes during a committee pass.

- [x] **Step 1: Write the failing test in `plugins/backtesting/test/plugin.test.ts`**

```ts
it('exposes sweep inspection and run comparison tools and keeps execution tools on canonical-chat only', () => {
  const canonicalTools = host.resolveToolsForUser(['backtesting'], { target: 'canonical-chat' });
  expect(canonicalTools.map((t) => t.name)).toEqual(
    expect.arrayContaining(['backtest_list_sweeps', 'backtest_get_sweep', 'backtest_compare_runs']),
  );

  const technicalDeskTools = host.resolveToolsForUser(['backtesting'], { target: 'technical' });
  expect(technicalDeskTools.map((t) => t.name)).not.toContain('backtest_run_strategy');
  expect(technicalDeskTools.map((t) => t.name)).not.toContain('backtest_sweep_strategy');
  expect(technicalDeskTools.map((t) => t.name)).toContain('backtest_list_runs');
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/plugin-backtesting test -- test/plugin.test.ts`
Expected: FAIL (`backtest_list_sweeps` missing; `backtest_run_strategy` attached to `technical`).

- [x] **Step 3: Implement `backtest_list_sweeps`, `backtest_get_sweep`, `backtest_compare_runs`, and update `attachTo`**

1. In `plugins/backtesting/src/tools/runs.ts`:
   - Change `runTool.attachTo` to `['canonical-chat']`.
   - Add `compareRunsTool` (`name: 'backtest_compare_runs'`, `attachTo: ['canonical-chat', 'technical', 'risk']`, input `{ runIds: z.array(z.string().min(1)).min(2).max(4) }`) that loads each run via `getRunDetail` and returns a structured comparison table.
2. In `plugins/backtesting/src/tools/sweeps.ts`:
   - Change `sweepTool.attachTo` to `['canonical-chat']`.
   - Add `listSweepsTool` (`name: 'backtest_list_sweeps'`, `attachTo: ['canonical-chat', 'technical', 'risk']`) and `getSweepTool` (`name: 'backtest_get_sweep'`, `attachTo: ['canonical-chat', 'technical', 'risk']`).

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/plugin-backtesting test -- test/plugin.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add plugins/backtesting/src/tools/runs.ts plugins/backtesting/src/tools/sweeps.ts plugins/backtesting/src/schemas/sweep.ts plugins/backtesting/test/plugin.test.ts
git commit -m "feat(backtesting): add sweep lookup and run comparison tools and scope execution tools to canonical-chat"
```

---

### Task 4: Add `paper_control_strategy_run`, `paper_list_fills`, & Server-Side `strategyId`/`runId` Lookup in `paper_deploy_strategy`

**Files:**

- Modify: `plugins/paper-trading/src/schemas/strategy-runs.ts:20-75`
- Modify: `plugins/paper-trading/src/schemas/fills.ts:20-55`
- Modify: `plugins/paper-trading/src/services/strategy-runs.ts:20-85`
- Modify: `plugins/paper-trading/src/tools/strategy-runs.ts:20-85`
- Modify: `plugins/paper-trading/src/tools/orders.ts:95-145`
- Modify: `plugins/paper-trading/src/tools/index.ts:20-48`
- Test: `plugins/paper-trading/test/plugin.test.ts`

**Interfaces:**

- Produces:
  - `DeployStrategyRunInputSchema`: makes `source` optional when `strategyId` (saved strategy slug/id or backtest `runId`) is provided; `deployStrategyRunForUser` resolves `source`, `params`, `name`, `symbol`, and `timeframe` from `plg_backtesting_strategies` or `plg_backtesting_runs` when `source` is omitted.
  - `paper_control_strategy_run`: pauses, resumes, stops, or deletes a deployed paper strategy (`action: 'pause' | 'resume' | 'stop' | 'delete'`). `pause` and `stop` are risk-reducing (`requiresConfirmation: false`); `resume` and `delete` require confirmation.
  - `paper_list_fills`: lists recent execution fills (`open`, `close`, `partial_close`, `stop_loss`, `take_profit`, `trailing_stop`) with realized P&L and fees.

- [x] **Step 1: Write the failing test in `plugins/paper-trading/test/plugin.test.ts`**

```ts
it('registers paper_control_strategy_run and paper_list_fills and allows pause/stop without confirmation', async () => {
  const tools = host.resolveToolsForUser(['paper-trading']);
  const names = tools.map((t) => t.name);
  expect(names).toContain('paper_control_strategy_run');
  expect(names).toContain('paper_list_fills');

  const controlTool = host.getTool('paper_control_strategy_run')!;
  expect(typeof controlTool.requiresConfirmation).toBe('function');
  if (typeof controlTool.requiresConfirmation === 'function') {
    expect(
      await controlTool.requiresConfirmation({ strategyRunId: '1', action: 'pause' }, {} as never),
    ).toBe(false);
    expect(
      await controlTool.requiresConfirmation({ strategyRunId: '1', action: 'stop' }, {} as never),
    ).toBe(false);
    expect(
      await controlTool.requiresConfirmation({ strategyRunId: '1', action: 'resume' }, {} as never),
    ).toBe(true);
  }
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/plugin-paper-trading test -- test/plugin.test.ts`
Expected: FAIL (`paper_control_strategy_run` and `paper_list_fills` missing).

- [x] **Step 3: Implement `paper_control_strategy_run`, `paper_list_fills`, and server-side `strategyId` resolution in `deployStrategyRunForUser`**

1. In `plugins/paper-trading/src/schemas/strategy-runs.ts`:
   - Allow `DeployStrategyRunInputSchema` to accept either `source` (`min(20)`) OR `strategyId` (`min(1)`), with `.refine((v) => Boolean(v.source) || Boolean(v.strategyId))`.
   - Add `ControlStrategyRunInputSchema = z.object({ strategyRunId: z.string().min(1), action: z.enum(['pause', 'resume', 'stop', 'delete']) })` and `ControlStrategyRunOutputSchema`.
2. In `plugins/paper-trading/src/services/strategy-runs.ts`:
   - In `deployStrategyRunForUser`, when `!args.input.source && args.input.strategyId`, look up the strategy in `backtestStrategies` (by id or slug) or `backtestRuns` (by id) for `args.userId` and populate `source`, `params`, `name`, `symbol`, and `timeframe`.
3. In `plugins/paper-trading/src/tools/strategy-runs.ts`:
   - Export `controlStrategyRunTool` (`name: 'paper_control_strategy_run'`, `requiresConfirmation: (input) => input.action === 'resume' || input.action === 'delete'`).
4. In `plugins/paper-trading/src/tools/orders.ts` (or `accounts.ts`) and `tools/index.ts`:
   - Export `listFillsTool` (`name: 'paper_list_fills'`, `access: 'read-only'`, `attachTo: ['canonical-chat', 'technical', 'risk']`).

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/plugin-paper-trading test -- test/plugin.test.ts`
Expected: PASS

- [x] **Step 5: Run full repo maintainability & typecheck verification and commit**

Run: `node scripts/check-maintainability.mjs && node scripts/check-architecture-tree.mjs && pnpm turbo run typecheck --filter=@kestrel/shared --filter=@kestrel/data --filter=@kestrel/indicators --filter=@kestrel/plugin-backtesting --filter=@kestrel/plugin-paper-trading --filter=@kestrel/ai`
Expected: PASS with 0 violations and 0 type errors.

```bash
git add plugins/paper-trading/src/schemas/strategy-runs.ts plugins/paper-trading/src/schemas/fills.ts plugins/paper-trading/src/services/strategy-runs.ts plugins/paper-trading/src/tools/strategy-runs.ts plugins/paper-trading/src/tools/orders.ts plugins/paper-trading/src/tools/index.ts plugins/paper-trading/test/plugin.test.ts
git commit -m "feat(paper-trading): add strategy control and fill history tools and resolve strategyId server-side"
```
