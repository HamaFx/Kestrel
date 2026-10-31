# Plugin System Roadmap — Phase 3: UX Polish, SDK Deduplication & Dead Code Cleanups

> **For Agentic Workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the end-to-end user experience across Kestrel's plugin UI surfaces (chat slash commands, Agent Settings tool toggles, custom-agents 404 elimination, Alert form Telegram deduplication, Backtesting -> Paper Trading install check, and GDPR data export), remove the broken client-side `pluginHost` import in `dispatch.tsx`, deduplicate ~320 lines of repeated API/UI boilerplate into `@kestrel/plugin-sdk`, and prune dead SDK surface area.

**Architecture:**
1. **Client UI Polish**:
   - Remove the server-only `pluginHost` import from `apps/web/src/components/chat/parts/registry/dispatch.tsx`.
   - Wire `pluginUiRegistry.listSlashCommands({ installedOnly: true, installedIds })` into `useComposer` so `/backtest`, `/paper`, `/telegram`, and `/agents` appear in the chat slash-command menu when installed.
   - Pass installed plugin tool IDs into `<DisabledToolsForm />` on `/settings/agent`.
   - Gate `useCustomAgents` in `ChatView` on `installedPluginIds.includes('custom-agents')` so uninstalled users never trigger a `404` on `/api/plugins/custom-agents/agents`.
   - Deduplicate the `Telegram` vs `Telegram (personal bot)` checkboxes in the Alert delivery form.
   - Check if `paper-trading` is installed in `<DeployToPaperButton />` (or surface an "Install Paper Trading" link on 404).
2. **SDK Deduplication & Dead Code Cleanup**:
   - Add `createPluginFetcher(pluginId)` to `@kestrel/plugin-sdk/ui` and replace duplicated `csrfToken()` / `pluginFetch()` across all 4 plugins.
   - Add `resolvePluginSkillDir(importMetaUrl, pluginId, skillDirName)` and shared route helpers (`PluginRouteApiError`, `pluginJson`, `pluginByMethod`, `parsePluginBody`, `pluginQuery`) to `@kestrel/plugin-sdk`.
   - Remove unused SDK methods (`KestrelPlugin.agents`, `PluginStandaloneAgentRegistration`, `pluginHost.listAgents`, `pluginHost.getAgent`, `pluginHost.resolveAgentsForUser`, `pluginHost.resolveJobsForUser`, `packages/ai/src/plugins/agents.ts`, and `setupWizardComponent`).
   - Fix the Paper Trading manifest badge (`'Adds 12 AI tools'`) and include sanitized plugin records in user data export.

**Tech Stack:** TypeScript, React 19, Next.js App Router (`apps/web`), `@kestrel/plugin-sdk`, Vitest.

---

## Global Constraints (Must Hold Across All Tasks)

- **Maintainability Gate (`pnpm check:maintainability`)**:
  - `.ts` files: **<= 350 LOC**
  - `.tsx` files: **<= 250 LOC**, **<= 4 `useState`**, **<= 2 `useEffect`**
  - Loose `.ts`/`.tsx` files in package/app `src/` roots: **<= 10**
  - Zero empty `catch {}` blocks.
- **No Over-Engineering**: Keep helpers tiny, explicit, and backwards-compatible with existing plugin call sites.

---

## Task 1: Remove Server-Empty `pluginHost` Import from Client `dispatch.tsx` (`P1-5`)

**Files:**
- Modify: `apps/web/src/components/chat/parts/registry/dispatch.tsx`

### Context
`apps/web/src/components/chat/parts/registry/dispatch.tsx:8` is a `'use client'` module that imports `{ pluginHost } from '@kestrel/plugin-sdk'` and calls `pluginHost.getTool(name)?.outputSchema` on line 76. In the browser, `registerBundledPlugins` never runs, so `pluginHost` is always empty (`undefined`), and importing the server SDK barrel into a client component is a boundary violation.

### Steps

- [x] **Step 1: Remove `pluginHost` from `apps/web/src/components/chat/parts/registry/dispatch.tsx`**

- Delete `import { pluginHost } from '@kestrel/plugin-sdk';`.
- Change line 76 from `const schema = registration.schema ?? pluginHost.getTool(name)?.outputSchema;` to `const schema = registration.schema;`.
- Verify `pnpm --filter @kestrel/web typecheck` passes.

---

## Task 2: Wire Installed Plugin Slash Commands into Chat Composer (`P2-1`)

**Files:**
- Modify: `apps/web/src/hooks/use-slash-commands.ts`
- Modify: `apps/web/src/components/chat/use-composer.ts`
- Modify: `apps/web/src/components/chat/composer.tsx`
- Modify: `apps/web/src/components/chat/slash-command-menu.tsx`

### Context
All 4 plugins register `slashCommands` (`/backtest`, `/paper`, `/telegram`, `/agents`) in `src/ui/index.tsx`, and `pluginUiRegistry.listSlashCommands({ installedOnly: true, installedIds })` exists in `packages/plugin-sdk/src/ui/registry.ts:154`, but `useComposer` (`apps/web/src/components/chat/use-composer.ts:41`) only filters the hardcoded 4-item `SLASH_COMMANDS` array (`/brief`, `/compare`, `/levels`, `/review`).

### Steps

- [x] **Step 1: Expose a unified slash command list from `apps/web/src/hooks/use-slash-commands.ts` (or `useComposer`)**

> **Implementation note (2026-10-31):** the bundled plugins' `PluginSlashCommand` slots in this revision are `{ id, label, description }` only (no `prompt` template) and every description reads "Open the …" — so the mapper in `useComposer` renders each installed plugin command as a `navigate` action to `/plugins/<pluginId>` (same shape as the existing `/settings` command) instead of inserting prompt text. The composer reads the installed-plugin list from a new `InstalledPluginsProvider` context (`apps/web/src/components/layout/installed-plugins-context.tsx`) populated by the app shell.

In `apps/web/src/components/chat/use-composer.ts`:
- Accept `installedPluginIds?: readonly string[];` in `UseComposerOptions` (or read from `pluginUiRegistry.listSlashCommands({ installedOnly: Boolean(installedPluginIds), installedIds: installedPluginIds ? [...installedPluginIds] : undefined })` after calling `ensurePluginUiRegistered()`).
- Convert each `PluginSlashCommandRegistration` (`command: '/backtest'`, `label`, `description`, `prompt`) into a compatible `SlashCommand` item where selecting a plugin slash command inserts `cmd.prompt` into the composer input and focuses the textarea.

- [x] **Step 2: Run verification**
Run: `pnpm --filter @kestrel/web typecheck` and `pnpm --filter @kestrel/web test`

---

## Task 3: Include Installed Plugin Tools in `/settings/agent` Disabled Tools UI (`P2-2`)

**Files:**
- Modify: `apps/web/src/app/(app)/settings/agent/page.tsx`

### Context
`apps/web/src/app/(app)/settings/agent/page.tsx:125` passes `allTools={TOOL_NAMES}` to `<DisabledToolsForm />`. Meanwhile, `resolvePluginToolsForAgent` (`packages/ai/src/plugins/runtime.ts:346`) respects `settings.disabledTools` for plugin tools too. Users currently have no UI to disable individual plugin tools.

### Steps

- [x] **Step 1: Append installed plugin tool IDs to `allTools` in `apps/web/src/app/(app)/settings/agent/page.tsx`**

> **Implementation note (2026-10-31):** `pluginHost.listTools()` does not exist in this revision; the page uses `pluginHost.getInstalledPlugins(installedPluginIds).flatMap((plugin) => plugin.tools.map((tool) => tool.name))`, which is already fail-closed for uninstalled plugins. `DisabledToolsForm`'s `allTools` prop widened from `ToolName[]` to `readonly string[]` so plugin tool ids can be toggled; the server action stores the raw string list unchanged.

In `apps/web/src/app/(app)/settings/agent/page.tsx`:
- Import `{ getInstalledPluginIdsForUser } from '@kestrel/db';`, `{ pluginHost } from '@kestrel/plugin-sdk';`, and `{ ensureWebPluginsRegistered } from '@/lib/plugins/bootstrap';`.
- In `AgentSettingsPage()`, call `ensureWebPluginsRegistered()` and fetch `installedPluginIds = await getInstalledPluginIdsForUser(user.id, { enabledOnly: true })` inside the `Promise.all` (around line 55).
- Compute:
  ```ts
  const installedSet = new Set(installedPluginIds);
  const pluginToolNames = pluginHost
    .listTools()
    .filter((tool) => installedSet.has(tool.pluginId))
    .map((tool) => tool.id);
  const allAvailableTools = [...TOOL_NAMES, ...pluginToolNames];
  ```
- Pass `allTools={allAvailableTools}` to `<DisabledToolsForm />`.

- [x] **Step 2: Run verification**
Run: `pnpm --filter @kestrel/web typecheck`

---

## Task 4: Prevent Unconditional 404 Fetch in `useCustomAgents` When Plugin Is Not Installed (`P2-3`)

**Files:**
- Modify: `apps/web/src/hooks/use-custom-agents.ts`
- Modify: `apps/web/src/components/chat/chat-view.tsx`

### Context
`apps/web/src/hooks/use-custom-agents.ts:47` fetches `/api/plugins/custom-agents/agents` unconditionally on every `/chat` mount, logging a `404` network error in browser DevTools whenever `custom-agents` is not installed.

### Steps

- [x] **Step 1: Treat `res.status === 404` gracefully and gate on `installedPluginIds` when available**

> **Implementation note (2026-10-31):** the hook gained an `enabled` option and a module-level `customAgentsPluginNotInstalled` memo (the revision has no `reload()` to reset, so the memo lives for the page session). `use-chat-session` (this revision's ChatView equivalent) passes `enabled: installedPluginIds === null || installedPluginIds.includes('custom-agents')` from the new installed-plugins context, so installed users fetch normally, known-uninstalled users never fire the request, and unknown contexts (tests/isolated renders) keep the probing behaviour. Covered by `apps/web/test/hooks-use-custom-agents.test.ts`.

1. In `apps/web/src/hooks/use-custom-agents.ts`:
   - Add a module-level boolean cache `let customAgentsPluginNotInstalled = false;` (reset on `reload()`). If `customAgentsPluginNotInstalled` is true, skip the initial auto-fetch so navigating between chat threads doesn't re-fire 404 requests.
   - When `res.status === 404`, set `customAgentsPluginNotInstalled = true`, set `agents = []`, and return cleanly without throwing.

- [x] **Step 2: Run verification**
Run: `pnpm --filter @kestrel/web typecheck`

---

## Task 5: Fix Duplicate Telegram Checkboxes in Alert Form & Paper Trading Install Check in `DeployToPaperButton` (`P2-4`, `P2-5`, `P2-6`)

**Files:**
- Modify: `apps/web/src/app/(app)/alerts/_components/alert-form/alert-delivery-fields.tsx`
- Modify: `apps/web/src/app/(app)/alerts/_components/alert-form/use-alert-form.ts`
- Modify: `plugins/backtesting/src/ui/deploy-to-paper-button.tsx`
- Modify: `apps/web/src/app/(app)/settings/_actions-data-export-payload.ts`

### Context
1. `alert-delivery-fields.tsx:41-70` always renders a hardcoded `Telegram` (`telegram`) checkbox, and when `telegram-bot` is installed/onboarded, `use-alert-form.ts:53` adds a second `Telegram (personal bot)` (`telegram-bot`) checkbox right next to it. Both route to the exact same `deliverViaPluginChannel('telegram-bot', ...)` in `packages/ai/src/alerts/delivery/orchestrate.ts:56-68`.
2. `plugins/backtesting/src/ui/deploy-to-paper-button.tsx` POSTs to `/api/plugins/paper-trading/strategy-runs` without handling the case where `paper-trading` is not installed.
3. `apps/web/src/app/(app)/settings/_actions-data-export-payload.ts` omits `userInstalledPlugins` (with `encryptedSecrets` excluded) and `pluginStorage`.

### Steps

- [x] **Step 1: Remove duplicate hardcoded `Telegram` checkbox in `apps/web/src/app/(app)/alerts/_components/alert-form/alert-delivery-fields.tsx`**

- Keep `In-app`, `Email`, and `Webhook` as core checkboxes, and render plugin alert channels (`pluginAlertChannels`, e.g. `Telegram (personal bot)`) from `use-alert-form.ts`.
- In `use-alert-form.ts`, normalize any legacy `'telegram'` channel on existing alerts to `'telegram-bot'` when `telegram-bot` is present so editing an existing alert preserves the checked state.

- [x] **Step 2: Improve `DeployToPaperButton` error UX when `paper-trading` is not installed (`plugins/backtesting/src/ui/deploy-to-paper-button.tsx`)**

In `plugins/backtesting/src/ui/deploy-to-paper-button.tsx`:
- When `deployStrategyToPaper` fails with a message containing `'not installed'` or `'PLUGIN_NOT_INSTALLED'`, display a clear message with a clickable `<a href="/settings/plugins" className="underline">Install Paper Trading in Settings → Plugins</a>` action.

- [x] **Step 3: Include sanitized `installedPlugins` and `pluginStorage` in `apps/web/src/app/(app)/settings/_actions-data-export-payload.ts`**

> **Implementation note (2026-10-31):** `user_installed_plugins` in this revision has no separate `version`/`encryptedSecrets` columns (secret fields are AES-256-GCM ciphertext inside `settings`), so the export selects `{ pluginId, enabled, settings, onboardingCompleted, installedAt, updatedAt }` and `plugin_storage` documents `{ pluginId, collection, key, value, createdAt, updatedAt }` — plaintext secrets are never produced by the install ledger, so nothing sensitive leaves in the clear.

In `apps/web/src/app/(app)/settings/_actions-data-export-payload.ts`:
- Query `listUserInstalledPlugins(userId)` and map each row to `{ id, pluginId, enabled, version, settings, installedAt, updatedAt }` (explicitly omitting `encryptedSecrets`).

- [x] **Step 4: Run verification**
Run: `pnpm --filter @kestrel/web typecheck` and `pnpm --filter @kestrel/plugin-backtesting typecheck`

---

## Task 6: Deduplicate Shared Plugin SDK Helpers & Prune Dead SDK Surface (`P2-7`)

**Files:**
- Create: `packages/plugin-sdk/src/route-helpers.ts`
- Create: `packages/plugin-sdk/src/skill-dir.ts`
- Create: `packages/plugin-sdk/src/ui/fetcher.ts`
- Modify: `packages/plugin-sdk/src/index.ts`
- Modify: `packages/plugin-sdk/src/ui/index.tsx`
- Modify: `packages/plugin-sdk/src/types/manifest.ts`
- Modify: `packages/plugin-sdk/src/types/registered.ts`
- Modify: `packages/plugin-sdk/src/host/plugin-host.ts`
- Modify: `packages/plugin-sdk/src/host/collect.ts`
- Modify: `packages/plugin-sdk/src/host/resolution.ts`
- Modify: `packages/plugin-sdk/src/ui/definition.ts`
- Modify: `packages/plugin-sdk/src/ui/registry.ts`
- Delete: `packages/ai/src/plugins/agents.ts`
- Modify: `packages/ai/src/plugins/index.ts`
- Modify: `plugins/paper-trading/src/index.ts`
- Modify: `plugins/backtesting/src/index.ts`, `plugins/backtesting/src/ui/api.ts`, `plugins/backtesting/src/api/routes/shared.ts`
- Modify: `plugins/paper-trading/src/ui/api.ts`, `plugins/paper-trading/src/api/routes/shared.ts`
- Modify: `plugins/custom-agents/src/index.ts`, `plugins/custom-agents/src/ui/api.ts`, `plugins/custom-agents/src/api/routes/shared.ts`
- Modify: `plugins/telegram-bot/src/index.ts`

### Steps

- [x] **Step 1: Add `resolvePluginSkillDir` (`packages/plugin-sdk/src/skill-dir.ts`) and `createPluginFetcher` (`packages/plugin-sdk/src/ui/fetcher.ts`)**

> **Implementation note (2026-10-31):** `resolvePluginSkillDir` is exported from a new node-only `@kestrel/plugin-sdk/skill-dir` subpath rather than the main barrel: several `'use client'` components import the barrel at runtime (e.g. `PLUGIN_SECRET_MASK` in the settings form), and the barrel must stay free of `node:fs`/`node:path` so the browser bundle keeps building. The four plugins import it from the subpath. `createPluginFetcher` (with `readCsrfToken` / `extractPluginErrorMessage` / `pluginErrorMessage`) replaced the duplicated fetch logic in all four plugins, including the Telegram page hook and the cross-plugin Deploy-to-Paper call.

1. In `packages/plugin-sdk/src/skill-dir.ts` (< 45 LOC):
   Export `resolvePluginSkillDir(importMetaUrl: string, pluginDirName: string, skillSubdir: string): string` and replace the 4 identical `resolveSkillDir` functions in `plugins/*/src/index.ts`.
2. In `packages/plugin-sdk/src/ui/fetcher.ts` (< 65 LOC):
   Export `readCsrfToken()`, `extractPluginErrorMessage(payload, status)`, and `createPluginFetcher(pluginId: string)` (`<T>(path: string, init?: RequestInit) => Promise<T>`). Replace the duplicated fetch logic in `plugins/backtesting/src/ui/api.ts`, `plugins/paper-trading/src/ui/api.ts`, and `plugins/custom-agents/src/ui/api.ts`.
3. In `packages/plugin-sdk/src/route-helpers.ts` (< 90 LOC):
   Export `PluginRouteApiError`, `pluginJson`, `pluginByMethod`, `parsePluginBody`, and `pluginQuery`, and reuse them across `plugins/backtesting/src/api/routes/shared.ts`, `plugins/paper-trading/src/api/routes/shared.ts`, and `plugins/custom-agents/src/api/routes/shared.ts`.

- [x] **Step 2: Fix Paper Trading badge count (`plugins/paper-trading/src/index.ts:74`)**

Change `'Adds 10 AI tools'` to `'Adds 12 AI tools'` in `plugins/paper-trading/src/index.ts:74`.

- [x] **Step 3: Remove dead `KestrelPlugin.agents`, `resolveJobsForUser`, and `setupWizardComponent`** (and keep `packages/ai/src/plugins/agents.ts`)

> **Implementation note (2026-10-31):** the static `agents` capability was removed end-to-end (`KestrelPlugin.agents`, `PluginStandaloneAgentRegistration`, `RegisteredPluginAgent`, the host's agents map/`resolveAgentsForUser`, collect/resolution wiring, and the `store-metadata` capability count now sources `agentCatalogs.length`). `resolveJobsForUser` + the unused `resolveJobs` helper and the `setupWizardComponent`/`getSetupWizard`/`PluginSetupWizardProps` surface were removed too, with `packages/plugin-sdk/test/host.test.ts` updated. **Deviation:** `packages/ai/src/plugins/agents.ts` was intentionally kept — in this revision it is not the legacy standalone-agent module but the live barrel re-exporting `agent-catalog` / `agent-builder` / `agent-runtime` / `agent-text-runtime` / `subagent-delegator` for `plugins/index.ts`; deleting it would only reshuffle re-exports.

- Remove unused static `agents?: PluginStandaloneAgentRegistration[]` (superseded by `agentCatalogs`), `pluginHost.listAgents()`, `pluginHost.getAgent()`, `pluginHost.resolveAgentsForUser()`, and `packages/ai/src/plugins/agents.ts`.
- Remove unused `pluginHost.resolveJobsForUser()` from `packages/plugin-sdk/src/host/resolution.ts` and `plugin-host.ts`.
- Remove unused `setupWizardComponent` / `getSetupWizard` from `packages/plugin-sdk/src/ui/definition.ts` and `registry.ts`.

- [x] **Step 4: Run full workspace verification**
Run:
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm check:maintainability`

---

## Review Focus (Phase 3 Self-Check)

1. Confirm `apps/web/src/components/chat/parts/registry/dispatch.tsx` has zero imports from `@kestrel/plugin-sdk` (only `@kestrel/plugin-sdk/ui` via `register-ui`).
2. Confirm typing `/` in chat shows `/backtest`, `/paper`, `/telegram`, and `/agents` for installed plugins.
3. Confirm `/settings/agent` displays installed plugin tools in the "Disabled Tools" card.
4. Confirm opening `/chat` without `custom-agents` installed produces zero 404 requests after the initial check.
5. Confirm `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm check:maintainability` all pass cleanly.
