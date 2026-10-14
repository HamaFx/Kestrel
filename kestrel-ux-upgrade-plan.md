# Kestrel End-to-End UX, SaaS Transition & Plain-Language Upgrade Plan

> **Status:** 100% Completed (`[x]`) across all 6 Phases + Global Admin Control Plane (`/admin`).

**Goal:** Transform Kestrel from an open-source, developer-centric BYOK prototype into a cohesive, closed-source, hosted subscription SaaS trading copilot (`Hoplite Dark Precision` aesthetic) where everyday gold, forex, and crypto traders experience zero API-key friction, crystal-clear trader language, rock-solid navigation, and institutional visual consistency end to end—while giving Admins complete platform control inside `/admin`.

**Locked Product Decisions (Confirmed by Hama):**
1. **Closed-Source Hosted Subscription SaaS (Remove User-Facing BYOK)**:
   - Kestrel is no longer an open-source or Bring-Your-Own-Key (BYOK) product. All AI models and market data feeds are hosted and managed by Kestrel under a paid subscription model.
   - Remove the BYOK API key step from Onboarding (making Onboarding a fast 4-step flow).
   - Remove the BYOK redirect wall on `/chat` (`apps/web/src/app/(app)/chat/page.tsx`) so authenticated users can open `/chat` immediately using platform-configured keys.
   - Remove all BYOK, self-hosting, and raw API token cost (`$0.0034`) references from user-facing pages; restrict provider key / market feed adapter / tool latency configuration strictly to Admins (`/admin`).
2. **In-Place Cleanup & Plain-Language Trader UX**:
   - Preserve Kestrel's existing layout and components while translating all internal Mastra, DAG, `packetId`, wholesale `$0.0034` LLM token spend, `semantic recall`, and `tool source` jargon into clear trader language.
3. **Landing Simulator — Honest Risk & Journal Workflow + Future Broker Bridge Roadmap Badge**:
   - Reframe `LandingSimulator` (`landing-simulator.tsx`) around real capabilities today (**Interactive Position Size & Risk Calculator → Save to Journal & Arm Alerts**) while displaying a tasteful **"Direct Broker Bridge (MT5 / cTrader) — Planned on Roadmap"** note instead of streaming a fake FIX 4.4 webhook string.
4. **Clean Navigation & Default Home (`/dashboard`)**:
   - Remove `<HangingPendant />` and the `"Showcase"` link from the authenticated sidebar/drawer.
   - Route `/` and the app logo for authenticated users to `/dashboard` (while `/chat` is 1 click away with zero BYOK redirect wall).
   - Add a persistent 5-tab `MobileBottomNav` (`Dashboard`, `Chat`, `Chart`, `Alerts`, `More`) and fix all 3 Command Palette (`⌘K`) bugs (`Dashboard` missing, `Appearance` wrong URL, `New chat` no-op).
5. **SaaS Settings Overhaul & Full Admin Control Plane (`/admin`)**:
   - Consolidate user-facing Settings into clean subscriber categories (`General`, `Subscription & Billing`, `Watchlist Symbols`, `Portfolio & Risk Rules`, `Notifications & Telegram`, `Profile & Security`, `Appearance & Data`, `Activity & Quota`).
   - Gate `/settings/api-keys`, `/settings/agent`, and `/settings/models` to Admins only, and add a comprehensive **`AI & Platform`** tab (`AdminPlatformConfig` + `/api/admin/platform-config`) directly inside `/admin` so Admins can manage provider keys, global model routing, fallback chains, per-desk model overrides, market data feed adapters, spend guardrails, and agent tool switches in one place.
   - Wire `getUserWithSettings` (`packages/db/src/queries/user-settings.ts`) and `getUserApiKeys` (`packages/db/src/queries/provider-tests.ts`) so non-admin subscribers automatically inherit the primary Admin's configured AI keys, model routing, fallback chain, market data provider, and disabled tool settings.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript, Tailwind CSS v4 (Hoplite tokens in `apps/web/src/app/globals.css`), Drizzle ORM (`@kestrel/db`), Vitest + Testing Library (`pnpm --filter @kestrel/web test`).

---

## File Map Overview

| Phase | Files Modified / Created | Responsibility |
| :--- | :--- | :--- |
| **Phase 1: Landing Page & SaaS Acquisition Funnel** | `apps/web/src/components/landing/landing-nav.tsx`<br>`apps/web/src/components/landing/landing-hero.tsx`<br>`apps/web/src/components/landing/landing-stepper.tsx`<br>`apps/web/src/components/landing/landing-architecture.tsx`<br>`apps/web/src/components/landing/landing-simulator.tsx`<br>`apps/web/src/components/landing/landing-faq.tsx`<br>`apps/web/src/components/landing/landing-footer.tsx`<br>`apps/web/src/__tests__/ux/landing-motion-empirical.test.tsx` | Add direct `/register` CTAs, remove open-source/self-hosted/BYOK copy, replace fake `.ts` IDE code and WebGL/wafer physics jargon with trader workflow previews, update `LandingSimulator` with honest Journal/Alert action + `"MT5 / cTrader Bridge — Planned on Roadmap"` note, and update landing tests. |
| **Phase 2: Auth, 4-Step SaaS Onboarding & Zero-BYOK Chat Entry** | `apps/web/src/app/(auth)/layout.tsx`<br>`apps/web/src/app/(auth)/login/page.tsx`<br>`apps/web/src/app/(auth)/_components/oauth-buttons.tsx`<br>`apps/web/src/app/(auth)/actions.ts`<br>`apps/web/src/components/onboarding/wizard.tsx`<br>`apps/web/src/components/onboarding/_components/wizard-stepper.tsx`<br>`apps/web/src/components/onboarding/_components/wizard-step-review.tsx`<br>`apps/web/src/app/onboarding/page.tsx`<br>`apps/web/src/app/(app)/chat/page.tsx`<br>`apps/web/src/app/page.tsx` | Clean up auth header (`← Back to Kestrel`) and hide `<ResendVerification />` until needed; remove Step 4 (BYOK Provider) from Onboarding so it is a fast 4-step wizard with visible desktop labels; remove the BYOK redirect check in `/chat/page.tsx`; route authenticated `/` to `/dashboard`. |
| **Phase 3: Navigation, App Shell & Command Palette** | `apps/web/src/components/layout/desktop-sidebar.tsx`<br>`apps/web/src/components/layout/nav-drawer.tsx`<br>`apps/web/src/components/layout/mobile-bottom-nav.tsx` *(new)*<br>`apps/web/src/app/(app)/layout.tsx`<br>`apps/web/src/lib/commands.ts`<br>`apps/web/src/components/layout/command-palette.tsx` | Remove `"Showcase"` link and `HangingPendant` from sidebar/drawer, point logo to `/dashboard`, add persistent 5-tab `MobileBottomNav` on `< md` viewports, add `Dashboard` to `⌘K` commands, fix `set-appearance` route (`/settings/appearance`), and wire `create-chat` in `CommandPalette`. |
| **Phase 4: Chat Workspace De-Jargoning & In-Place Cleanup** | `apps/web/src/components/chat/chat-top-bar.tsx`<br>`apps/web/src/components/chat/composer.tsx`<br>`apps/web/src/components/chat/chat-screen.tsx`<br>`apps/web/src/components/chat/parts/pixel-desk/pixel-desk.tsx`<br>`apps/web/src/components/chat/parts/agent-deliberation.tsx`<br>`apps/web/src/components/chat/parts/mastra-report.tsx`<br>`apps/web/src/components/chat/thread-views-dock.tsx`<br>`apps/web/src/components/chat/parts/memory-degraded.tsx`<br>`apps/web/src/components/chat/parts/citation-warning.tsx`<br>`apps/web/src/components/chat/parts/fallback.tsx`<br>`apps/web/src/components/chat/parts/activity-rollup.tsx` | Rename `Single / Full` to `Quick Read / Full Committee`, deduplicate mode selector, remove hardcoded `6%` context window meter, and rewrite all internal Mastra/DAG/packetId/memory/cost strings in clear trader language. |
| **Phase 5: Pro Chart Toolbar, Curated Dashboard & Safe Alerts** | `apps/web/src/app/(app)/chart/[symbol]/_components/pro-chart-view.tsx`<br>`apps/web/src/app/(app)/dashboard/_components/widget-types.ts`<br>`apps/web/src/app/(app)/dashboard/_components/dashboard-canvas.tsx`<br>`apps/web/src/app/(app)/news/page.tsx`<br>`apps/web/src/app/(app)/alerts/page.tsx`<br>`apps/web/src/app/(app)/alerts/_components/alert-form.tsx`<br>`apps/web/src/app/(app)/alerts/_components/alert-list.tsx` | Mount `SymbolPicker`, `TimeframePicker`, and `Analyze in Chat` button in `ProChartView`; trim default dashboard from 11 to 6 core widgets with friendly size labels (`Compact / Wide / Full Width`); remove `Resend` / cron developer copy; add 9 preset indicator pills in `AlertForm` and replace accidental horizontal scroll-snap deletion in `AlertList` with explicit action buttons. |
| **Phase 6: SaaS Settings Overhaul & Global Admin Control Plane** | `apps/web/src/app/(app)/settings/_components/settings-nav.tsx`<br>`apps/web/src/app/(app)/settings/page.tsx`<br>`apps/web/src/app/(app)/settings/profile/page.tsx`<br>`apps/web/src/app/(app)/settings/security/page.tsx`<br>`apps/web/src/app/(app)/settings/billing/page.tsx`<br>`apps/web/src/app/(app)/settings/notifications/page.tsx`<br>`apps/web/src/app/(app)/settings/telegram/page.tsx`<br>`apps/web/src/app/(app)/settings/appearance/page.tsx`<br>`apps/web/src/app/(app)/settings/data/page.tsx`<br>`apps/web/src/app/(app)/settings/api-keys/page.tsx`<br>`apps/web/src/app/(app)/settings/models/page.tsx`<br>`apps/web/src/app/(app)/settings/agent/page.tsx`<br>`apps/web/src/app/(app)/settings/usage/page.tsx`<br>`apps/web/src/app/(app)/settings/_components/usage-glance.tsx`<br>`apps/web/src/app/(app)/settings/_components/about-card.tsx`<br>`apps/web/src/app/(app)/admin/page.tsx`<br>`apps/web/src/app/(app)/admin/layout.tsx`<br>`apps/web/src/app/(app)/admin/_components/admin-platform-config.tsx` *(new)*<br>`apps/web/src/app/api/admin/platform-config/route.ts` *(new)*<br>`packages/db/src/queries/user-settings.ts`<br>`packages/db/src/queries/provider-tests.ts`<br>`packages/db/src/index.ts`<br>`apps/web/src/lib/services/api-boundary.ts` | Consolidate subscriber Settings, eliminate duplicated forms, replace raw API `$` cost telemetry with subscriber research activity counters, gate `/settings/api-keys`, `/settings/models`, and `/settings/agent` to Admins, mount a unified `AI & Platform` control tab inside `/admin`, and propagate Admin AI/model/feed/tool settings to all subscribers in `@kestrel/db`. |

---

## Phase 1: Landing Page & SaaS Acquisition Funnel

- [x] **Step 1: Update `LandingNav` links and primary CTA (`apps/web/src/components/landing/landing-nav.tsx`)**
- [x] **Step 2: Rewrite `LandingHero` copy & telemetry badges (`apps/web/src/components/landing/landing-hero.tsx`)**
- [x] **Step 3: Update `LandingFooter` (`apps/web/src/components/landing/landing-footer.tsx`)**
- [x] **Step 4: Replace developer code snippets in `STEPS` (`apps/web/src/components/landing/landing-stepper.tsx`) with structured trader output cards**
- [x] **Step 5: Update `landing-motion-empirical.test.tsx` to match the new trader-friendly `LandingStepper` labels**
- [x] **Step 6: Clean up `LandingArchitecture` (`apps/web/src/components/landing/landing-architecture.tsx`)**
- [x] **Step 7: Reframe `LandingSimulator` as Position Size & Risk Calculator + Future Broker Roadmap Note (`apps/web/src/components/landing/landing-simulator.tsx`)**
- [x] **Step 8: Rewrite developer jargon and add SaaS subscription FAQ in `LandingFaq` (`apps/web/src/components/landing/landing-faq.tsx`)**

---

## Phase 2: Auth, 4-Step SaaS Onboarding & Zero-BYOK Chat Entry

- [x] **Step 1: Update `(auth)/layout.tsx` header copy (`← Back to Kestrel` / `AI Market Copilot`)**
- [x] **Step 2: Collapse `<ResendVerification />` behind a toggle link unless needed (`apps/web/src/app/(auth)/login/page.tsx`)**
- [x] **Step 3: Convert `WizardStepper` (`apps/web/src/components/onboarding/_components/wizard-stepper.tsx`) to 4 steps with visible desktop labels**
- [x] **Step 4: Remove Step 4 (`WizardStepProvider`) from `OnboardingWizard` (`apps/web/src/components/onboarding/wizard.tsx`)**
- [x] **Step 5: Remove the BYOK redirect gate in `apps/web/src/app/(app)/chat/page.tsx` and support `?new=1`**
- [x] **Step 6: Route authenticated root `/` and post-login default to `/dashboard` (`apps/web/src/app/page.tsx`, `apps/web/src/app/(auth)/actions.ts`)**

---

## Phase 3: Navigation, App Shell & Command Palette

- [x] **Step 1: Clean up `DesktopSidebar` (`apps/web/src/components/layout/desktop-sidebar.tsx`)**
- [x] **Step 2: Clean up `NavDrawer` (`apps/web/src/components/layout/nav-drawer.tsx`)**
- [x] **Step 3: Create `MobileBottomNav` (`apps/web/src/components/layout/mobile-bottom-nav.tsx`) and mount in `AppLayout` (`apps/web/src/app/(app)/layout.tsx`)**
- [x] **Step 4: Update `COMMANDS` in `apps/web/src/lib/commands.ts` (`Dashboard`, `/settings/appearance`, subscriber settings shortcuts)**
- [x] **Step 5: Fix `create-chat` action fallback in `apps/web/src/components/layout/command-palette.tsx`**

---

## Phase 4: Chat Workspace De-Jargoning & In-Place Cleanup

- [x] **Step 1: Rename `Single / Full` to `Quick Read / Full Committee` and deduplicate header controls (`chat-top-bar.tsx`, `composer.tsx`, `chat-screen.tsx`)**
- [x] **Step 2: Remove the hardcoded `6%` context meter (`composer.tsx`)**
- [x] **Step 3: De-jargon `PixelDesk`, `AgentDeliberation`, `MastraReportPart`, and `ThreadViewsDock`**
- [x] **Step 4: Translate Chat Warning & Activity Banners (`parts/memory-degraded.tsx`, `parts/citation-warning.tsx`, `parts/fallback.tsx`, `parts/activity-rollup.tsx`)**

---

## Phase 5: Pro Chart Toolbar, Curated Dashboard & Safe Alerts

- [x] **Step 1: Add interactive Chart Toolbar (`SymbolPicker`, `TimeframePicker`, `Analyze in Chat`) to `ProChartView` (`apps/web/src/app/(app)/chart/[symbol]/_components/pro-chart-view.tsx`)**
- [x] **Step 2: Streamline `DEFAULT_LAYOUT` to the 6 highest-signal widgets and replace `{w.span}/3 col` with `Compact / Wide / Full Width` (`widget-types.ts`, `dashboard-canvas.tsx`)**
- [x] **Step 3: Clean up `alerts/page.tsx` and `news/page.tsx` copy**
- [x] **Step 4: Add 9 visual Indicator Presets and plain-English preview to `AlertForm` (`apps/web/src/app/(app)/alerts/_components/alert-form.tsx`)**
- [x] **Step 5: Remove accidental horizontal scroll-snap auto-delete from `AlertList` (`apps/web/src/app/(app)/alerts/_components/alert-list.tsx`)**

---

## Phase 6: SaaS Settings Overhaul & Global Admin Control Plane

- [x] **Step 1: Update `SettingsNav` (`apps/web/src/app/(app)/settings/_components/settings-nav.tsx`) to clean Subscriber Categories**
- [x] **Step 2: Gate `/settings/api-keys`, `/settings/models`, and `/settings/agent` to Admins Only (`checkIsAdmin()`)**
- [x] **Step 3: Consolidate Duplicated Settings Pages (`profile` + `security`, `notifications` + `telegram`, `appearance` + `data`)**
- [x] **Step 4: Replace Raw API Cost (`$0.0034`) & `SystemStatusCard` with SaaS Subscription & Activity Metrics (`settings/page.tsx`, `usage-glance.tsx`, `usage/page.tsx`, `billing/page.tsx`, `about-card.tsx`)**
- [x] **Step 5: Build Unified Admin Platform Control Plane (`/api/admin/platform-config/route.ts` & `admin-platform-config.tsx`) and mount as the primary `AI & Platform` tab in `/admin/page.tsx`**
- [x] **Step 6: Propagate Admin Platform Settings (`aiApiKeys`, `chatModel`, `visionModel`, `embeddingModel`, `aiFallbackChain`, `agentModelOverrides`, `disabledTools`, `marketDataProvider`, `maxDailyUsd`) to all subscribers in `packages/db/src/queries/user-settings.ts` and `packages/db/src/queries/provider-tests.ts`**
