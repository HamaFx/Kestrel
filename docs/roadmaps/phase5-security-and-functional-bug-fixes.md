# Phase 5: Security & Functional Bug Fixes (P0 / P1)

> **Goal:** Fix all concrete security vulnerabilities and broken user-facing features identified in the 2026-11-04 Full Monorepo Audit (`docs/audit/kestrel-full-architecture-and-product-audit-2026-11-04.md`) without adding any new architectural complexity.

---

> **Status:** Complete (2026-11-04). All six tasks delivered; `check:guards` 7/7, `knip` 0 findings, `check:fast` 29/29 after each task.
> **Verification Gate:** After each task, run `pnpm check:guards`, `pnpm knip`, and `pnpm check:fast`.

## Overview of Tasks

- [x] **Task 5.1 [P0 Security]:** Enforce `linkedChatId` authorization in the Telegram Bot runner (`plugins/telegram-bot/src/bot/runner.ts`).
- [x] **Task 5.2 [P1 Reliability]:** Fix Telegram `/ask` and `/analyze` thread foreign-key persistence and enable read-only tools in `/ask` (`plugins/telegram-bot/src/bot/ai-commands/*`).
- [x] **Task 5.3 [P1 AI Memory]:** Fix BYOK user settings lookup in `upsertMemory` (`packages/ai/src/memory/memory-index/upsert.ts`) and index chat-confirmed journal entries (`apps/web/src/lib/services/chat/mutation-executors.ts`).
- [x] **Task 5.4 [P1 Security & Grounding]:** Block IPv4-mapped IPv6 SSRF literals in `safe-url.ts` (`packages/shared/src/runtime/safe-url.ts`) and fix the `h|m|d` timeframe loophole in `SCENARIO_PROJECTION_TERMS` (`packages/ai/src/committee/grounding.ts`).
- [x] **Task 5.5 [P1 Journal UX]:** Fix 100,000x crypto `contractSize` PnL bug (`use-entry-metrics.ts`), remove the nested second modal in `import-trades.tsx`, and cache `AiCoachCard` / `AiReviewPanel` outputs in React Query.
- [x] **Task 5.6 [P1 Alerts UX]:** Add the `web-push` delivery channel option to `AlertDeliveryFields` and implement historical `indicatorCross` simulation in `previewAlertRuleService`.

---

## Task 5.1: Enforce `linkedChatId` Authorization in Telegram Bot Runner

### Problem

In `plugins/telegram-bot/src/bot/runner.ts:189-248`, `handleTelegramUpdate` verifies the webhook URL token and `X-Telegram-Bot-Api-Secret-Token` header, which proves the webhook came from Telegram for that user's bot. However, on Telegram, **anyone who knows a bot's `@username` can message that bot**. Currently, `handleTelegramUpdate` sets `ctx.chatId = String(chatId)` (`line 199`) and executes `/positions`, `/alert`, `/ask`, `/analyze`, `/mute`, or `/unlink` without checking whether `String(chatId)` matches `install.settings['linkedChatId']`.

### Files to Modify

- `plugins/telegram-bot/src/bot/runner.ts`
- `plugins/telegram-bot/test/` (add unit test assertion for unauthorized `chatId` rejection)

### Implementation Steps

1. In `plugins/telegram-bot/src/bot/runner.ts` inside `handleTelegramUpdate(install, update, deps)`:
   - Extract `const linkedChatId = typeof install.settings['linkedChatId'] === 'string' ? install.settings['linkedChatId'].trim() : '';`.
   - For `update.callback_query`: if `!linkedChatId || String(chatId) !== linkedChatId`, answer the callback query with `'Unauthorized chat. Link your account first with /start.'` (or return `{ handled: false, reason: 'unauthorized_chat' }`) and do **not** invoke `handleAnalyzeModeToggle`.
   - For `update.message`: parse `command` first. Allow `/start` and `/help` when unlinked, **except** if `linkedChatId` is already set to a _different_ chat ID and the `/start` command does not carry a valid linking token (`args`), reject it so a stranger cannot hijack an already-linked bot.
   - For all other commands (`/price`, `/news`, `/calendar`, `/status`, `/positions`, `/me`, `/settings`, `/alert`, `/briefing`, `/mute`, `/unmute`, `/unlink`, `/ask`, `/analyze`, `/committee`) and plain-text messages: if `!linkedChatId || String(chatId) !== linkedChatId`, reply `"This Telegram chat is not linked to your Kestrel account. Open Kestrel → Settings → Plugins → Telegram Copilot to generate a 1-tap link."` and return `{ handled: false, reason: 'unauthorized_chat' }`.

### Verification

- Run `pnpm --filter @kestrel/plugin-telegram-bot test` and `pnpm check:fast`.

---

## Task 5.2: Fix Telegram `/ask` and `/analyze` Thread Persistence & Tooling

### Problem

1. In `plugins/telegram-bot/src/bot/ai-commands/ask.ts:81-87` and `analyze.ts:109-115`, `deterministicThreadId(ctx.userId, 'telegram-ask')` synthesizes a deterministic UUID and immediately calls `appendUserMessage(ctx.userId, threadId, userMessage)`. Because no row with `id = threadId` exists in `chat_threads`, PostgreSQL throws a foreign-key violation (`chat_messages_thread_id_chat_threads_id_fk`), which is caught by the outer `catch` block (`ask.ts:90`, `analyze.ts:124`)—replacing the already-completed AI answer with `"Your question could not be processed right now"`!
2. In `plugins/telegram-bot/src/bot/ai-commands/ask.ts:49-76`, `/ask` calls `runMastraBackgroundText` (`toolChoice: 'none'`) and only collects a packet if `extractSymbolFromPrompt(question)` finds a ticker. Questions like `"What is on the economic calendar today?"` or `"How are my paper positions doing?"` have zero tools and fail to answer.

### Files to Modify

- `plugins/telegram-bot/src/bot/ai-commands/shared.ts`
- `plugins/telegram-bot/src/bot/ai-commands/ask.ts`
- `plugins/telegram-bot/src/bot/ai-commands/analyze.ts`

### Implementation Steps

1. In `plugins/telegram-bot/src/bot/ai-commands/shared.ts`, add a helper `persistTelegramTurnBestEffort({ userId, threadId, title, symbol, userMessage, assistantMessage })` that:
   - Ensures the `chat_threads` row exists (using `getThread(userId, threadId)` or `createThread(userId, title, symbol, { id: threadId })` / `INSERT INTO chat_threads ... ON CONFLICT (id) DO NOTHING`).
   - Wraps `appendUserMessage` and `appendAssistantMessage` in a `try / catch (err)` that logs a warning (`logger.warn`) on failure so a history-logging error **never** suppresses or overwrites a Telegram message that was already sent or generated.
2. In `plugins/telegram-bot/src/bot/ai-commands/ask.ts` and `analyze.ts`, replace the inline `appendUserMessage` + `appendAssistantMessage` calls with `await persistTelegramTurnBestEffort(...)` _after_ sending the Telegram reply (`ctx.sendHtml`).

### Verification

- Run `pnpm --filter @kestrel/plugin-telegram-bot test` and `pnpm check:fast`.

---

## Task 5.3: Fix BYOK Memory Embeddings in `upsertMemory` & Chat `log_journal` Confirmations

### Problem

1. In `packages/ai/src/memory/memory-index/upsert.ts:62-75`, `upsertMemory()` calls `embedTexts([text], { userId: args.userId, ...(args.userSettings ? { userSettings: args.userSettings } : {}) })`. When `rememberJournalEntry` (`packages/ai/src/journal/persistence/crud.ts`) or `rememberBriefing` (`packages/ai/src/briefings/generate/persist.ts`) calls `upsertMemory`, `userSettings` is omitted. Inside `embedTexts()` (`packages/ai/src/models/embeddings.ts`), if `opts.userSettings` is undefined, it only checks operator environment variables (`envFallbackKeys`)—meaning BYOK users who configured keys in the UI silently fail with `{ stored: false, reason: 'embed_failed' }`!
2. In `apps/web/src/lib/services/chat/mutation-executors.ts:95-115`, confirming a `log_journal` mutation in chat performs a raw `db.insert(schema.journalEntries)` without calling `rememberJournalEntry()`, so chat-logged trades are never indexed into `memory_embeddings`.

### Files to Modify

- `packages/ai/src/memory/memory-index/upsert.ts`
- `apps/web/src/lib/services/chat/mutation-executors.ts`

### Implementation Steps

1. In `packages/ai/src/memory/memory-index/upsert.ts`:
   - Before calling `embedTexts`, if `!args.userSettings`, load the user's `aiApiKeys` and `embeddingModel` from `schema.userSettings` via `getDb()` (selecting `{ aiApiKeys: schema.userSettings.aiApiKeys, embeddingModel: schema.userSettings.embeddingModel }`).
2. In `apps/web/src/lib/services/chat/mutation-executors.ts`:
   - After the transaction for `log_journal` commits (`atomicExecutorFor` / `executeMutationWrite`), call `rememberJournalEntry` best-effort (`void rememberJournalEntry(entry).catch(...)`) so chat-confirmed journal entries are indexed into `memory_embeddings` just like UI-created journal entries.

### Verification

- Run `pnpm --filter @kestrel/ai test`, `pnpm --filter @kestrel/web test`, and `pnpm check:fast`.

---

## Task 5.4: Harden `safe-url.ts` Against IPv4-Mapped IPv6 SSRF & Fix `SCENARIO_PROJECTION_TERMS`

### Problem

1. In `packages/shared/src/runtime/safe-url.ts:62-70`, `isPrivateHostname` checks `host === '::' || host === '::1'` and prefixes `fc`, `fd`, `fe8`–`feb`. However, Node's `new URL('https://[::ffff:127.0.0.1]')` or `new URL('https://[::ffff:169.254.169.254]')` normalizes `url.hostname` to `[::ffff:7f00:1]` or `[::ffff:a9fe:a9fe]`, which starts with `::ffff:` and bypasses `isPrivateHostname`!
2. In `packages/ai/src/committee/grounding.ts:17-18`, `SCENARIO_PROJECTION_TERMS` includes single letters `h|m|d` (`/\b(?:target|...|h|m|d|min|hour|day|ratio|rr)\b/i`). Because `hasScenarioProjectionContext()` (`lines 124-136`) exempts any number within a 24-character window of a match, a sentence like `"On the 1h chart price is 3912.45"` has `"1h"` (or `"h"`) within 24 chars of `3912.45`, exempting `3912.45` from numeric grounding verification!

### Files to Modify

- `packages/shared/src/runtime/safe-url.ts`
- `packages/shared/test/` (add IPv4-mapped IPv6 test cases)
- `packages/ai/src/committee/grounding.ts`
- `packages/ai/test/` (add grounding regression test for prices near `"1h"` / `"15m"`)

### Implementation Steps

1. In `packages/shared/src/runtime/safe-url.ts:62-70`:
   - In `isPrivateHostname`, block `lower.startsWith('::ffff:')`, `lower.startsWith('0:0:0:0:0:ffff:')`, and NAT64 prefix `lower.startsWith('64:ff9b:')` (or parse the trailing 32-bit hex words of `::ffff:XXXX:YYYY` back into 4 octets and pass to `isPrivateIpv4`).
2. In `packages/ai/src/committee/grounding.ts:17-18`:
   - Remove bare `h|m|d|min|hour|day` from `SCENARIO_PROJECTION_TERMS` (which applies a 24-character radius around the term). Note that timeframe literals themselves (`1h`, `15m`, `4h`, `1d`) are already filtered out at the token level by `TIMEFRAME_TOKEN_PATTERN` or integer exclusion in `extractNarrativeNumbers`, so removing `h|m|d|min|hour|day` from the 24-char radius window stops timeframe mentions from exempting nearby hallucinated prices.

### Verification

- Run `pnpm --filter @kestrel/shared test`, `pnpm --filter @kestrel/ai test`, and `pnpm check:fast`.

---

## Task 5.5: Fix Journal Crypto `contractSize`, `ImportTrades` Double Modal & AI Coach Caching

### Problem

1. In `apps/web/src/app/(app)/journal/_components/entry-row/use-entry-metrics.ts:29-31`:
   ```ts
   const isCommodity = entry.symbol.startsWith('XAU') || entry.symbol.startsWith('XAG');
   const contractSize = isCommodity ? 100 : 100000;
   ```
   For crypto symbols (`BTCUSDT`, `ETHUSDT`, `SOLUSDT`, `BNBUSDT`, `XRPUSDT`, `ADAUSDT`), 1 lot = 1 coin (`contractSize = 1`, as defined in `getSymbolDefinition(entry.symbol)?.contractSize` in `@kestrel/shared`). Using `100,000` inflates open crypto `cashPnl` by 100,000x!
2. In `apps/web/src/app/(app)/journal/_components/journal-view/index.tsx:206-214`, clicking "Import" opens a `<Drawer>` containing `<ImportTrades>`, which renders _another_ "Import trades" button that opens a second `fixed inset-0 z-50` modal (`import-trades.tsx:135-145`). Also, `<input accept=".csv,.xlsx,.html">` advertises `.xlsx` and `.html` even though `parseCSV()` only parses `.csv`.
3. In `apps/web/src/app/(app)/journal/_components/ai-coach-card.tsx` and `ai-review-panel.tsx`, generated AI outputs live only in `useState` (vanishing when switching between `Overview` and `Analytics` tabs) and use raw `fetchCsrf` instead of `apiMutate`.

### Files to Modify

- `apps/web/src/app/(app)/journal/_components/entry-row/use-entry-metrics.ts`
- `apps/web/src/app/(app)/journal/_components/import-trades.tsx`
- `apps/web/src/app/(app)/journal/_components/ai-coach-card.tsx`
- `apps/web/src/app/(app)/journal/_components/ai-review-panel.tsx`

### Implementation Steps

1. In `use-entry-metrics.ts:29-31`, resolve `contractSize` from `getSymbolDefinition(entry.symbol)?.contractSize ?? (isCommodity ? 100 : 100000)` (importing `getSymbolDefinition` from `@kestrel/shared`).
2. In `import-trades.tsx`, render the import form body directly inside the parent `<Drawer>` (removing the redundant inner `open` state and `fixed inset-0 z-50` modal wrapper), and change `accept=".csv,.xlsx,.html"` to `accept=".csv,text/csv"`.
3. In `ai-coach-card.tsx` and `ai-review-panel.tsx`, use `apiMutate` from `@/lib/http/api-client` and store the latest generated result in React Query cache (`queryClient.setQueryData(['journal-coach-insights'])` / `['journal-trade-review', selectedId]`) so switching tabs preserves the generated review.

### Verification

- Run `pnpm --filter @kestrel/web test` and `pnpm check:fast`.

---

## Task 5.6: Add Web Push Option to `AlertDeliveryFields` & Implement `indicatorCross` Preview

### Problem

1. `apps/web/src/app/(app)/alerts/_components/alert-form/alert-delivery-fields.tsx` only renders delivery checkboxes for `Email` and `pluginChannels` (`telegram-bot`), omitting `push` (Web Push), even though `AlertChannelSchema` (`packages/shared/src/schemas/alert.ts`) and the alert delivery orchestrator (`packages/ai/src/alerts/delivery/orchestrate.ts`) support `'push'`.
2. In `apps/web/src/lib/services/alerts.ts:199`, `previewAlertRuleService` returns `{ count: 0, avgHoldMs: 0, recentFires: [], unsupported: true }` whenever `input.rule.type === 'indicatorCross'`, instead of computing the indicator series via `@kestrel/indicators` and counting crosses over the 90-day candle window.

### Files to Modify

- `apps/web/src/app/(app)/alerts/_components/alert-form/alert-delivery-fields.tsx`
- `apps/web/src/lib/services/alerts.ts`

### Implementation Steps

1. In `alert-delivery-fields.tsx`, add the `Browser Push` (`'push'`) checkbox alongside `Email` (`'email'`) and `pluginChannels`.
2. In `apps/web/src/lib/services/alerts.ts` (`previewAlertRuleService`), replace the `if (input.rule.type === 'indicatorCross') return { ..., unsupported: true }` stub by computing the requested indicator (`rsi` or `ema`/`sma` from `@kestrel/indicators` over `candles`) and scanning adjacent bars (`prev` vs `curr`) for `above`/`below` `input.rule.level` crosses, returning the real `count`, `avgHoldMs`, and `recentFires` (last 5 timestamps).

### Verification

- Run `pnpm --filter @kestrel/web test`, `pnpm knip`, `pnpm check:guards`, and `pnpm check:fast`.
