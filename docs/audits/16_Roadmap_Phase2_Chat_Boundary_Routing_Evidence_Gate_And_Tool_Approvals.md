# Plugin System Roadmap — Phase 2: Chat Boundary, Router Decision, Evidence Gate & Tool Approvals

> **For Agentic Workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all 4 bundled plugins (`paper-trading`, `backtesting`, `custom-agents`, `telegram-bot`) work seamlessly end-to-end inside Kestrel Chat without false HTTP 422 `READ_ONLY_REQUEST_REQUIRED` blocks, router hijacking to `xauusd-*` / `symbol-research`, false `CanonicalEvidenceBlockedError` rejections on backtest/paper numbers, or hung `requiresConfirmation` tool calls.

**Architecture:**
1. **Plugin-Aware Intent Helper (`detectInstalledPluginIntent`)**: A deterministic, zero-LLM classifier in `@kestrel/ai` that checks whether a prompt targets an installed & enabled plugin (`paper-trading`, `backtesting`, `custom-agents`, `telegram-bot`).
2. **Chat Boundary (`/api/chat/route.ts`)**: Before rejecting a prompt with HTTP 422 `READ_ONLY_REQUEST_REQUIRED` via `isHighConfidenceMutationIntent`, check `detectInstalledPluginIntent(prompt, installedPluginIds)` so paper order placement, paper strategy deployment, and Telegram scheduling prompts proceed to the agent.
3. **Unified Router (`decideMastraExecution`)**: When `detectInstalledPluginIntent` matches an installed plugin action (e.g., *"Backtest RSI on XAUUSD 1h"*, *"Show my XAUUSD paper positions"*, *"Buy 1 lot EURUSD in my paper account"*), route directly to `canonical-chat` (where all `main-chat` plugin tools and custom UI cards are mounted) instead of `xauusd-research`, `xauusd-conversation`, or `symbol-research`.
4. **Canonical Evidence Gate (`checkCanonicalEvidence`)**: Treat any registered plugin tool (`pluginHost.getTool(tool.toolName)`) and plugin tool naming patterns (`backtest|sweep|strategy|paper|account|order|agent|delegate|script|telegram`) as valid tool evidence so numbers returned by `backtest_*` and `paper_*` are never discarded.
5. **Lightweight Tool Confirmation (`requiresConfirmation`)**: Instead of passing `requireApproval` to Mastra's `createTool` (which suspends the stream with an unhandled `tool-call-approval` event), evaluate `shouldRequireApproval(tool, ctx, input)` inside `buildPluginMastraTools`'s `execute` wrapper. When confirmation is required and not yet confirmed, return a structured `{ status: 'confirmation_required', ... }` result with a `_ui` payload rendered as a one-click **Confirm / Cancel** card in chat (`POST /api/plugins/[pluginId]/tools/confirm` or `/api/plugins/manage`), keeping execution stateless and reliable.

**Tech Stack:** TypeScript, Mastra (`@mastra/core`), Next.js App Router (`apps/web`), React 19, Vitest.

---

## Global Constraints (Must Hold Across All Tasks)

- **Maintainability Gate (`pnpm check:maintainability`)**:
  - `.ts` files: **<= 350 LOC**
  - `.tsx` files: **<= 250 LOC**, **<= 4 `useState`**, **<= 2 `useEffect`**
  - Loose `.ts`/`.tsx` files in package/app `src/` roots: **<= 10**
  - Zero empty `catch {}` blocks.
- **Safety Invariant Preserved**: Real-broker live trade execution from chat remains 100% blocked when `paper-trading` is not installed (or when the user explicitly asks for real/live broker execution).
- **High-Value Tests Only**: Test the exact end-to-end routing, 422 boundary, evidence gate, and confirmation card flows.

---

## Task 1: Add Deterministic `detectInstalledPluginIntent` Classifier (`P0-3`, `P0-4`)

**Files:**
- Create: `packages/ai/src/plugins/intent.ts`
- Modify: `packages/ai/src/plugins/index.ts`
- Modify: `packages/ai/src/index.ts`
- Test: `packages/ai/src/plugins/__tests__/intent.test.ts`

### Context
Currently, `isHighConfidenceMutationIntent` (`packages/ai/src/routing/keywords.ts:188`) and `decideMastraExecution` (`packages/ai/src/mastra-v2/planning/execution-decision.ts:253`) have no awareness of which plugins a user has installed. We need a small, pure, deterministic module `packages/ai/src/plugins/intent.ts` (< 120 LOC) that detects when a user prompt is explicitly invoking an installed plugin's capabilities.

### Steps

- [x] **Step 1: Create `packages/ai/src/plugins/intent.ts`**

Implement `detectInstalledPluginIntent(prompt: string, installedPluginIds: readonly string[]): PluginIntentMatch | null`:

```ts
// packages/ai/src/plugins/intent.ts
export interface PluginIntentMatch {
  pluginId: 'paper-trading' | 'backtesting' | 'custom-agents' | 'telegram-bot';
  reason: string;
}

const LIVE_BROKER_EXCLUSION_RE =
  /\b(real\s+money|live\s+account|live\s+broker|mt4|mt5|metatrader|interactive\s+brokers|ibkr|binance\s+live|coinbase\s+live|wire\s+transfer|withdraw\s+funds)\b/i;

const BACKTEST_INTENT_RE =
  /\b(backtest(?:s|ing)?|parameter\s+sweep|grid\s+sweep|run\s+a\s+sweep|walk[-\s]?forward|strategy\s+template|equity\s+curve|sharpe\s+ratio\s+of\s+my\s+strategy|save\s+(?:this\s+)?strategy|list\s+(?:my\s+)?strategies)\b|^\/backtest\b/i;

const PAPER_EXPLICIT_RE =
  /\b(paper\s+(?:trade|trading|account|accounts|order|orders|position|positions|balance|equity|portfolio|sandbox|fill|fills|strategy|runner)|agent\s+sandbox|sandbox\s+account|virtual\s+(?:account|balance|trade|position|order)|simulated\s+(?:account|trade|position|order)|deploy\s+(?:to\s+)?paper)\b|^\/paper\b/i;

const PAPER_TRADE_ACTION_RE =
  /\b(buy|sell|long|short|place\s+(?:a\s+|an\s+)?(?:market|limit|stop)\s+order|close\s+(?:my\s+|the\s+)?(?:open\s+)?position|modify\s+(?:my\s+|the\s+)?position|cancel\s+(?:my\s+|the\s+)?(?:pending\s+)?order|reset\s+(?:my\s+)?(?:paper\s+|sandbox\s+)?account|my\s+open\s+positions|my\s+pending\s+orders)\b/i;

const CUSTOM_AGENTS_INTENT_RE =
  /\b(custom\s+agent(?:s)?|subagent(?:s)?|delegate\s+to\s+agent|agent\s+studio|run\s+script\s+tool)\b|^\/agents\b/i;

const TELEGRAM_INTENT_RE =
  /\b(telegram(?:\s+bot|\s+briefing|\s+recap|\s+alert|\s+digest|\s+notification)?)\b|^\/telegram\b/i;

export function detectInstalledPluginIntent(
  prompt: string,
  installedPluginIds: readonly string[],
): PluginIntentMatch | null {
  const text = prompt.trim();
  if (!text) return null;

  const installed = new Set(installedPluginIds);

  if (installed.has('backtesting') && BACKTEST_INTENT_RE.test(text)) {
    return { pluginId: 'backtesting', reason: 'backtesting-keyword' };
  }

  if (installed.has('paper-trading') && !LIVE_BROKER_EXCLUSION_RE.test(text)) {
    if (PAPER_EXPLICIT_RE.test(text)) {
      return { pluginId: 'paper-trading', reason: 'paper-explicit' };
    }
    if (PAPER_TRADE_ACTION_RE.test(text)) {
      return { pluginId: 'paper-trading', reason: 'paper-trade-action' };
    }
  }

  if (installed.has('custom-agents') && CUSTOM_AGENTS_INTENT_RE.test(text)) {
    return { pluginId: 'custom-agents', reason: 'custom-agents-keyword' };
  }

  if (installed.has('telegram-bot') && TELEGRAM_INTENT_RE.test(text)) {
    return { pluginId: 'telegram-bot', reason: 'telegram-keyword' };
  }

  return null;
}
```

- [x] **Step 2: Re-export `detectInstalledPluginIntent` and `PluginIntentMatch` from `packages/ai/src/plugins/index.ts` and `packages/ai/src/index.ts`**

- [x] **Step 3: Write unit tests in `packages/ai/src/plugins/__tests__/intent.test.ts`**

Verify:
1. Prompts like `"Buy 1 lot XAUUSD with stop at 3300"`, `"Show my XAUUSD paper positions"`, and `"Close my EURUSD position"` match `paper-trading` when `['paper-trading']` is installed, and return `null` when `paper-trading` is NOT installed.
2. Prompts explicitly mentioning `"real money"` or `"live broker"` return `null` even when `paper-trading` is installed.
3. Prompts like `"Backtest an RSI crossover strategy on XAUUSD 1h"` match `backtesting` when `['backtesting']` is installed.
4. Prompts like `"Schedule my daily Telegram briefing"` match `telegram-bot` when `['telegram-bot']` is installed.

---

## Task 2: Make `/api/chat` Boundary & `decideMastraExecution` Respect Installed Plugin Intents (`P0-3`, `P0-4`)

**Files:**
- Modify: `apps/web/src/app/api/chat/route.ts`
- Modify: `packages/ai/src/mastra-v2/planning/execution-decision.ts`
- Modify: `apps/web/src/app/api/chat/_lib/dispatch.ts`
- Test: `packages/ai/src/mastra-v2/planning/__tests__/execution-decision-plugins.test.ts`

### Context
1. In `apps/web/src/app/api/chat/route.ts:183-216`, `highConfidenceMutationIntent` returns HTTP 422 before `dispatchMastraRun` is reached.
2. In `packages/ai/src/mastra-v2/planning/execution-decision.ts:242-286`, any single-mode prompt mentioning `XAUUSD` routes to `xauusd-research` or `xauusd-conversation` (which have zero plugin tools), and any prompt mentioning `EURUSD` routes to `symbol-research` (the multi-desk committee workflow) instead of `canonical-chat`.

### Steps

- [x] **Step 1: Load installed & enabled plugin IDs in `apps/web/src/app/api/chat/route.ts` and bypass 422 when `detectInstalledPluginIntent` matches**

In `apps/web/src/app/api/chat/route.ts`:
- Import `{ getInstalledPluginIdsForUser } from '@kestrel/db';` and `{ detectInstalledPluginIntent } from '@kestrel/ai';`
- Fetch `const installedPluginIds = await getInstalledPluginIdsForUser(user.id, { enabledOnly: true });` alongside `loadChatSetup(user.id, conversationId)`.
- Compute `const pluginIntent = detectInstalledPluginIntent(prompt, installedPluginIds);`.
- Change the `highConfidenceMutationIntent` check (line 186) to:
  ```ts
  const highConfidenceMutationIntent =
    mutationIntent === null &&
    pluginIntent === null &&
    isHighConfidenceMutationIntent(prompt);
  ```
- Pass `installedPluginIds` into `dispatchMastraRun`.

- [x] **Step 2: Route matched plugin intents to `canonical-chat` in `decideMastraExecution` (`packages/ai/src/mastra-v2/planning/execution-decision.ts`)**

In `packages/ai/src/mastra-v2/planning/execution-decision.ts`:
- Add `installedPluginIds?: readonly string[];` to `MastraExecutionDecisionInput`.
- Import `{ detectInstalledPluginIntent } from '../../plugins/intent';`.
- At the top of `decideSingleModeRoute(input)` (around line 242, before the `normalizedTargetSymbol === 'XAUUSD'` check):
  ```ts
  const pluginIntent = detectInstalledPluginIntent(
    input.prompt,
    input.installedPluginIds ?? [],
  );
  if (pluginIntent) {
    return {
      route: 'canonical-chat',
      reason: `plugin-intent:${pluginIntent.pluginId}:${pluginIntent.reason}`,
      targetSymbol: normalizedTargetSymbol,
      comparisonSymbols: [],
      executionPlan,
      routingDecision,
      mutationRequest: null,
    };
  }
  ```
- Forward `installedPluginIds` in `apps/web/src/app/api/chat/_lib/dispatch.ts` into `decideMastraExecution`.

- [x] **Step 3: Write unit tests in `packages/ai/src/mastra-v2/planning/__tests__/execution-decision-plugins.test.ts`**

Verify that:
1. `"Backtest an RSI strategy on XAUUSD 1h"` with `installedPluginIds: ['backtesting']` routes to `'canonical-chat'` (`reason: 'plugin-intent:backtesting:backtesting-keyword'`) instead of `'xauusd-research'`.
2. `"Buy 1 lot XAUUSD in my paper account"` with `installedPluginIds: ['paper-trading']` routes to `'canonical-chat'` instead of `'xauusd-research'`.
3. `"What is the current XAUUSD bias and key levels?"` (no plugin intent) still routes to `'xauusd-research'` even when all plugins are installed.

- [x] **Step 4: Run verification**
Run: `pnpm --filter @kestrel/ai test` and `pnpm typecheck`

---

## Task 3: Recognize Registered Plugin Tools in `checkCanonicalEvidence` (`P0-5`)

**Files:**
- Modify: `packages/ai/src/mastra-v2/agents/canonical/evidence.ts`
- Test: `packages/ai/src/mastra-v2/agents/canonical/__tests__/evidence.test.ts`

### Context
`packages/ai/src/mastra-v2/agents/canonical/evidence.ts:26` defines `MARKET_TOOL_PATTERN`. Because `backtest_run_strategy`, `backtest_get_run`, `backtest_list_runs`, `backtest_run_sweep`, `paper_get_accounts`, `paper_list_orders`, `paper_place_order`, `custom_agent_run_script`, and `delegate_to_agent_*` do not match `MARKET_TOOL_PATTERN`, `checkCanonicalEvidence` throws `CanonicalEvidenceBlockedError` whenever the assistant states account balances (`$100,000`), fill prices (`$3,320.50`), or backtest win rates (`58.3%`).

### Steps

- [x] **Step 1: Update `MARKET_TOOL_PATTERN` and check `pluginHost.getTool` in `packages/ai/src/mastra-v2/agents/canonical/evidence.ts`**

In `packages/ai/src/mastra-v2/agents/canonical/evidence.ts`:
- Import `{ pluginHost } from '@kestrel/plugin-sdk';`.
- Expand `MARKET_TOOL_PATTERN` to include plugin tool namespaces:
  ```ts
  const MARKET_TOOL_PATTERN =
    /(snapshot|quote|price|ohlc|candle|bar|indicator|technical|regime|macro|calendar|event|yield|cot|flow|sentiment|news|headline|correlat|session|level|zone|desk|research|packet|symbol|xau|gold|market|memory|recall|journal|alert|history|watchlist|portfolio|position|backtest|sweep|strategy|paper|account|order|agent|delegate|script|telegram)/i;
  ```
- In `isEvidenceProvidingTool(toolName: string): boolean`, return `MARKET_TOOL_PATTERN.test(toolName) || Boolean(pluginHost.getTool(toolName))`.
- Use `isEvidenceProvidingTool(tool.toolName)` in `checkCanonicalEvidence` (`line 86`).

- [x] **Step 2: Add unit tests in `packages/ai/src/mastra-v2/agents/canonical/__tests__/evidence.test.ts`**

Verify that:
1. Assistant text containing `"Your paper sandbox balance is $100,000.00 (+2.4%)"` with `calledTools: [{ toolName: 'paper_get_accounts', hasOutput: true }]` passes `checkCanonicalEvidence` (`ok: true`).
2. Assistant text containing `"Backtest completed: final equity $11,420.50, win rate 61.5%, max drawdown 4.2%"` with `calledTools: [{ toolName: 'backtest_run_strategy', hasOutput: true }]` passes `checkCanonicalEvidence` (`ok: true`).
3. Assistant text with `$100,000` and `calledTools: []` still fails (`ok: false`).

- [x] **Step 3: Run verification**
Run: `pnpm --filter @kestrel/ai test`

---

## Task 4: Wire Clean Confirmation Handling for `requiresConfirmation` Plugin Write Tools (`P0-6`)

**Files:**
- Modify: `packages/ai/src/plugins/mastra-tools.ts`
- Create: `apps/web/src/app/api/plugins/[pluginId]/tools/[toolId]/confirm/route.ts`
- Create: `apps/web/src/components/chat/parts/plugin-tool-confirm-card.tsx`
- Modify: `apps/web/src/components/chat/parts/registry/dispatch.tsx`
- Modify: `packages/ai/src/mastra-v2/mutation/gates.ts`
- Test: `packages/ai/src/plugins/__tests__/mastra-tools-confirmation.test.ts`

### Context
Currently `packages/ai/src/plugins/mastra-tools.ts:55` passes `requireApproval: shouldRequireApproval(tool, ctx)` to Mastra's `createTool`. When Mastra sees `requireApproval: true`, it suspends the stream and emits a `tool-call-approval` stream chunk that Kestrel's stream adapter ignores, causing personal paper account trades (`accountKind: 'personal'`), account resets (`paper_reset_account`), and custom agent mutations (`custom_agent_create`, `custom_agent_update`, `custom_agent_delete`) to hang silently in chat.

### Steps

- [x] **Step 1: Handle `requiresConfirmation` directly inside `buildPluginMastraTools` (`packages/ai/src/plugins/mastra-tools.ts`)**

In `packages/ai/src/plugins/mastra-tools.ts`:
- Remove `requireApproval: shouldRequireApproval(tool, ctx)` from the `createTool({...})` config so Mastra always runs our `execute` wrapper.
- Write a helper `requiresToolConfirmation(tool: PluginRegisteredTool, ctx: BuildPluginMastraToolsContext, input: unknown): boolean`:
  - If `ctx.agentId !== 'main-chat'`, return `false`.
  - If `typeof tool.requiresConfirmation === 'function'`, call `Boolean(tool.requiresConfirmation(input as never))`.
  - Otherwise return `Boolean(tool.requiresConfirmation)`.
- Inside `execute: async (input) => { ... }`:
  - Check `if (requiresToolConfirmation(tool, ctx, input))`.
  - When `true`, do **not** execute `tool.execute(input, ctx)` yet. Instead, return a structured confirmation-required object:
    ```ts
    if (requiresToolConfirmation(tool, ctx, input)) {
      return {
        status: 'confirmation_required',
        requiresConfirmation: true,
        pluginId: tool.pluginId,
        toolId: tool.id,
        description: tool.description,
        proposedInput: input,
        message:
          'This action requires user confirmation before execution. Ask the user to click Confirm on the confirmation card.',
        _ui: {
          kind: 'plugin-tool-confirm',
          pluginId: tool.pluginId,
          toolId: tool.id,
          description: tool.description,
          proposedInput: input,
        },
      };
    }
    ```
  - Also update `stripUiPayload` so that when `value` has `status: 'confirmation_required'`, the model receives the clear `{ status: 'confirmation_required', toolId, proposedInput, message }` object and tells the user to confirm via the card, while the UI receives `_ui: { kind: 'plugin-tool-confirm', ... }`.

- [x] **Step 2: Create authenticated confirmation endpoint `apps/web/src/app/api/plugins/[pluginId]/tools/[toolId]/confirm/route.ts`**

Create a concise (< 110 LOC) `POST` route wrapped in `withAuth({ csrf: true, rateLimit: { limit: 30, windowSeconds: 60 } })`:
- Calls `ensureWebPluginsRegistered()`.
- Verifies `pluginId` is installed and enabled for `user.id` (`getUserInstalledPlugin(user.id, pluginId)`).
- Looks up `const tool = pluginHost.getTool(toolId)` and verifies `tool && tool.pluginId === pluginId`.
- Parses `body.input` through `tool.inputSchema.safeParse(body.input)`.
- Builds `PluginToolContext` via `loadInstalledPluginContext({ userId: user.id, tenantId, pluginId, correlationId })` (`packages/ai/src/plugins/runtime.ts`).
- Executes `const result = await tool.execute(parsed.data, ctx)` inside `withTenantDb` and returns `Response.json({ data: result })`.

- [x] **Step 3: Create `<PluginToolConfirmCard />` (`apps/web/src/components/chat/parts/plugin-tool-confirm-card.tsx`) and wire it in `dispatch.tsx`**

- In `apps/web/src/components/chat/parts/plugin-tool-confirm-card.tsx` (< 140 LOC, <= 3 `useState`, 0 `useEffect`):
  - Detects `_ui?.kind === 'plugin-tool-confirm'`.
  - Renders the tool name, description, a clean key-value preview of `proposedInput`, and **Confirm** / **Cancel** buttons.
  - On **Confirm**, POSTs `{ input: proposedInput }` with `x-csrf-token` to `/api/plugins/${pluginId}/tools/${toolId}/confirm`.
  - Once confirmed, renders the returned tool result (or delegates to the plugin's registered `toolCard` if the confirmed result contains `_ui`).
- In `apps/web/src/components/chat/parts/registry/dispatch.tsx`:
  - Check if `output` is an object with `_ui?.kind === 'plugin-tool-confirm'` and render `<PluginToolConfirmCard />` before falling back to plugin/core tool card rendering.

- [ ] **Step 4 (SKIPPED — not dead code in this revision): Remove `pluginWriteTool` stub from `packages/ai/src/mastra-v2/mutation/gates.ts`**

> **Implementation note (2026-10-31):** this step's premise does not hold for the current source. `MastraMutationName` is intentionally widened to `CoreMutationName | (string & {})` (`mutation-policy/names.ts`), and `evaluateMastraMutation` / `assertMastraMutationDraftAllowed` verify plugin write tools against `request.installedPlugins` with dedicated `unregistered-mutation` / `plugin-not-installed` reasons covered by `packages/ai/test/mastra-mutation-policy.test.ts`. The plugin branch is a live, tested policy layer, so it was retained; plugin chat writes now additionally confirm through the new stateless envelope.

- [x] **Step 5: Write unit tests in `packages/ai/src/plugins/__tests__/mastra-tools-confirmation.test.ts`**

Verify:
1. A tool with `requiresConfirmation: (input) => input.accountKind === 'personal'` executes immediately when `accountKind === 'agent_sandbox'`, and returns `{ status: 'confirmation_required', _ui: { kind: 'plugin-tool-confirm', ... } }` without calling `tool.execute` when `accountKind === 'personal'`.
2. A tool with `requiresConfirmation: true` returns `confirmation_required` on `main-chat`.

- [x] **Step 6: Run full Phase 2 verification**
Run:
- `pnpm --filter @kestrel/ai test`
- `pnpm --filter @kestrel/web typecheck`
- `pnpm typecheck`
- `pnpm check:maintainability`

---

## Review Focus (Phase 2 Self-Check)

1. Confirm `POST /api/chat` does NOT return 422 `READ_ONLY_REQUEST_REQUIRED` when a user with `paper-trading` installed asks `"Buy 1 lot XAUUSD in my paper account"`.
2. Confirm `POST /api/chat` STILL returns 422 `READ_ONLY_REQUEST_REQUIRED` when `paper-trading` is NOT installed or when the prompt asks for `"live broker"` / `"real money"` execution.
3. Confirm `decideMastraExecution` routes `"Backtest RSI on XAUUSD 1h"` to `canonical-chat` when `backtesting` is installed.
4. Confirm `checkCanonicalEvidence` allows numerical answers backed by `backtest_*` and `paper_*` tools.
5. Confirm all `.ts` files <= 350 LOC and `.tsx` files <= 250 LOC (`pnpm check:maintainability`).
