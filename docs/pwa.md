# PWA, install & home-screen behaviour

Kestrel ships as an installable Progressive Web App. This document is the
reference for the browser-facing surface: the manifest, the generated assets,
the service worker, the install nudge, offline behaviour and push.

Everything here is testable from the repository:

| Concern                   | Guard                                                                        |
| ------------------------- | ---------------------------------------------------------------------------- |
| Manifest + asset contract | `apps/web/test/pwa-manifest.test.ts`                                         |
| Brand-colour drift        | `apps/web/test/pwa-brand-contract.test.ts`                                   |
| Service worker behaviour  | `apps/web/test/service-worker-runtime.test.ts` (executes the worker)         |
| Service worker source     | `apps/web/test/service-worker.test.ts` (generator output + invariants)       |
| HTTP + public-path policy | `apps/web/test/pwa-http-contract.test.ts`                                    |
| Platform / display mode   | `apps/web/test/pwa-platform-detect.test.ts`                                  |
| Push handoff              | `apps/web/test/pwa-push-store.test.ts`                                       |
| Share target payload      | `apps/web/test/pwa-share-target.test.ts`                                     |
| Background refresh        | `apps/web/test/pwa-background-sync.test.ts`                                  |
| Stacked tables on phones  | `apps/web/test/mobile-table-stacking.test.ts`                                |
| Bottom bar tab state      | `apps/web/test/mobile-bottom-nav.test.tsx`                                   |
| Install nudge preferences | `apps/web/test/pwa-install-preference.test.ts`, `pwa-install-nudge.test.tsx` |
| Browser behaviour         | `apps/web/tests/e2e/pwa-install.spec.ts`, `tests/e2e/service-worker.spec.ts` |
| Asset regeneration        | `pnpm --filter @kestrel/web generate:icons` / `generate:screenshots`         |

## 1. Manifest

`apps/web/src/app/manifest.ts` is served at `/manifest.webmanifest`. Notes that
are easy to break:

- **`id: '/'`** pins the installed app identity. Without it the browser derives
  the id from `start_url`, so changing `start_url` would register a _second_ app
  (duplicate home-screen entries, orphaned push subscriptions).
- **`display_override: ['window-controls-overlay', 'standalone']`** gets the
  desktop window-controls overlay where it exists and standalone everywhere
  else.
- **`orientation: 'any'`** — the previous `portrait` value locked tablets and
  desktop windows; charts and the journal table are used in landscape.
- **Screenshots must include one `wide` entry** (≥1280×720) or Chrome refuses the
  richer desktop install dialog and logs
  `Richer PWA Install UI won't be available on desktop`.
- **`shortcuts`** need `description` (shown in the long-press menu) and must
  point at real routes; the contract test resolves the first path segment
  against `src/app`.
- Colours come from `src/lib/pwa/pwa-theme.json`, which mirrors `globals.css`.

## 2. Generated assets

`src/lib/pwa/pwa-theme.json` and `src/lib/pwa/splash-devices.json` are the two
inputs shared by the app and the build scripts.

- `scripts/generate-icons.mjs` writes `public/icons/*` and `public/favicon.ico`
  from the vector mark `public/brand/kestrel-falcon.svg`: 192/512/1024
  (`purpose: any`), a 512 maskable icon, three `apple-touch-icon` sizes, and
  **one launch image per device and orientation** from the splash matrix. The
  launcher icons composite the brand glow behind the mark; the favicon frames
  and launch images are a bare mark on a flat plate. Splashes are PNG-8 (flat
  colour + one mark) so the ~34 files stay small.
- `scripts/pwa-screens/` renders the install-dialog screenshots
  (`portrait.mjs` → 1080×1920 narrow, `wide.mjs` → 1920×1080 wide). The artwork
  is deliberately static: it never captures an account, feed, or chat.
- Both scripts are idempotent (`--force` to overwrite) and exit 0 without
  `sharp` so a standard `next build` cannot fail on missing image tooling.

`test/pwa-brand-contract.test.ts` parses `globals.css` and fails if the palette
in `pwa-theme.json` (and therefore the manifest, icons, splashes and OS chrome
colour) drifts from the design tokens. The generators are not allowed to
hardcode a brand colour at all.

### iOS launch images

iOS does not use the manifest for a splash screen: Safari matches
`(device-width) + (device-height) + (-webkit-device-pixel-ratio) + (orientation)`
exactly. The matrix in `splash-devices.json` covers current iPhones and iPads in
both orientations; add a row there and re-run `generate:icons` — the `<link>`
tags in `src/app/layout.tsx` are derived from the same file.

## 3. Service worker

`apps/web/scripts/sw.template.js` is stamped by `apps/web/scripts/generate-sw.mjs`
(build id + precache digest + VAPID public key) into `public/sw.js`; the precache
list lands in `public/sw-precache.json`. `/sw.js` is served `no-store` with
`Service-Worker-Allowed: /` (see `pwa-http-contract.test.ts`). The generator
checks the template exists **before** writing anything, and
`KESTREL_SW_OUT_DIR` redirects its output so tests can exercise it without
touching the served copy. `pnpm dev` runs the generator in its `predev` hook
(epoch fallback when there is no build id), so a fresh clone registers a real
worker instead of 404ing on `/sw.js`.

Cache identity is `kestrel-shell-v<buildId>-<assetRev>`, where `assetRev` is a
digest of the precache list: two deploys of the same commit share a build id, and
a Docker build has no git metadata at all, so the digest is what still rotates
the cache when the precached set changes. Stamp a release with
`--build-arg KESTREL_BUILD_ID=$(git rev-parse --short=7 HEAD)` (Compose reads
`KESTREL_BUILD_ID` from `.env`).

Install / activate:

- Each precache URL is fetched **individually** (`Promise.allSettled`).
  `cache.addAll` is atomic — it rejected on the first missing URL (there used to
  be no `/favicon.ico` at all), which silently left the app with _no_ offline
  shell.
- A redirected response (a login bounce for a private route when the session
  expired) is never cached.
- `activate` drops caches from older identities, enables **navigation preload**,
  repairs the offline document when a partial install left it missing
  (`ensureOfflineShell`), and claims clients.
- Updates deliberately **wait**: the app sends `SKIP_WAITING` only when the user
  accepts the reload (see below). This prevents a deploy from swapping JS chunks
  underneath a half-typed prompt.

Fetch strategies:

| Request                                                                         | Strategy                              |
| ------------------------------------------------------------------------------- | ------------------------------------- |
| `/_next/static/*` (content-hashed)                                              | cache-first                           |
| `/icons/*`, `/fonts/*`, `/brand/*`, `/favicon.ico`, `/manifest.webmanifest`     | stale-while-revalidate                |
| Navigations (`text/html`)                                                       | network-first (preload + 3 s timeout) |
| `/api/auth`, `/api/cron`, `/api/admin`, `/api/chat`, `/api/market`, `/api/push` | bypass (no SW handling)               |
| everything else (RSC payloads, remaining APIs)                                  | network-only                          |

Stale-while-revalidate is what keeps unhashed artwork current: those URLs do not
change between builds, so cache-first would pin the first icon or font a device
ever saw — and when the build id repeats there is no `activate` to purge it.

Failed navigations resolve through the **public allowlist** (`/offline`, `/login`,
`/landing`) to the precached **`/offline`** page, then to a minimal inline
document.

Three deliberate decisions:

1. **No application HTML is ever cached.** The app is an authenticated trading
   terminal; page HTML contains account and journal data. There is deliberately
   no "serve whatever HTML we happen to have for this URL" step — that is how one
   session's journal or research thread ends up on the next person's screen. That
   is why `/chat` is not precached and why the precache list is public-only.
2. **`/offline` lives outside the `(app)` route group** so it is public and
   static. The authenticated shell needs a session and database round-trips,
   which do not exist offline. `/offline` is excluded in `src/proxy.ts` and
   `src/auth.config.ts` and precached like any other asset.
3. **Only `GET` + same-origin requests are handled**; everything else falls
   through to the browser untouched.

## 4. Update flow

`src/components/providers/sw-register.tsx`:

- Registers on idle, then checks for updates at most once every 15 minutes of
  use (a `visibilitychange` on every app focus was chatty).
- Browser tab → `Update available` toast; the reload happens on click.
- Installed app (`display-mode: standalone`, iOS `navigator.standalone`) → no
  reload button exists, so the update is applied when the app resumes from the
  background.
- The first activation never reloads the page: `clients.claim()` fires
  `controllerchange` for an uncontrolled page too, which would otherwise reload
  every first visit.

## 5. Install / add to home screen

`src/components/layout/install-nudge/`:

- `use-install-detection.ts` combines three signals: the deferred
  `beforeinstallprompt` event, standalone/`appinstalled` detection, and the
  preference store.
- `install-cards.tsx` renders either the native prompt button (Chromium) or
  numbered platform instructions (iOS, macOS Safari).
- `platform-instructions.ts` holds the copy so the nudge and
  `/settings/install` cannot disagree.

Rules:

- **Engagement gate** — the nudge waits for a second visit or one minute of use
  (`install-preference.ts`). Prompting on first paint is how PWAs get dismissed
  forever.
- **Progressive snooze** — dismissal 1 snoozes 3 days, dismissal 2 snoozes 14
  days, dismissal 3 stops the passive nudge. `/settings/install` always offers
  the install flow regardless, so a dismissal is never a dead end.
- **No nudge on `/chat`** — the composer owns that screen.
- **Silence over guesswork** — on Chromium, a missing `beforeinstallprompt`
  means the browser does not consider the app installable right now, so the
  nudge stays hidden instead of pointing at a menu item that is not there.
- `appinstalled` records the install and confirms with a toast.

iOS specifics:

- **Status bar: never set `black-translucent`.** iOS 26.1+/27 draws its Liquid
  Glass bar over the top edge of standalone web apps; asking for a translucent
  bar makes that glass smear the header underneath it (the reported "top of the
  app is blurred" on device). Kestrel leaves the style at the default, so iOS
  paints an opaque bar tinted from `theme-color` (#121212) and reserves the strip
  for itself. `viewport-fit=cover` is still declared, and the top bars pad with
  `pt-safe`, so the layout is correct whether iOS extends the viewport under the
  bar or not. `test/pwa-manifest`/`tests/e2e/pwa-install.spec.ts` pin this.
- **Safe areas** are handled on every edge: `pt-safe` + a
  `calc(3rem + env(safe-area-inset-top))` height on both top bars, `pb-safe` plus
  the same trick for the bottom nav (so the home indicator never squeezes the
  icons), `px-safe` on the shell for landscape cutouts, and
  `pb-[max(env(safe-area-inset-bottom),12px)]` under the chat composer.
- **Text fields get a 16px floor on WebKit touch devices** ("iOS zooms the whole
  viewport when a focused field is smaller than 16px and then leaves the page
  stuck at that scale"). The chat composer is deterministic about it:
  `text-[16px] lg:text-body`, so the primary mobile input never triggers the
  zoom regardless of user-agent.
- `-webkit-tap-highlight-color: transparent`, `-webkit-text-size-adjust: 100%`
  and `touch-action: manipulation` remove the grey tap flash, landscape text
  inflation and the 300ms double-tap-zoom delay.
- `interactive-widget=resizes-content` keeps the sticky composer visible when
  the keyboard opens (Chromium; Safari ignores it and scrolls the field into
  view itself).
- iOS 26 opens every Home Screen entry as a web app by default, so the copy must
  not instruct users to enable "Open as Web App".
- Home Screen web apps use their own storage container: expect one extra sign-in
  after installing.
- Web push on iPhone/iPad only works for Home Screen apps;
  `EnableWebPushButton` says so and links to `/settings/install` instead of
  showing a bare "not supported".

## 5b. Mobile shell geometry

One token owns the phone bottom bar, so the bar, the page clearance and the
floating surfaces cannot drift apart (`globals.css`):

| Token                | `< 1024px`                                     | `≥ 1024px`                      |
| -------------------- | ---------------------------------------------- | ------------------------------- |
| `--bottom-nav-h`     | `3.5rem + env(safe-area-inset-bottom)`         | `0px`                           |
| `--shell-bottom-pad` | `--bottom-nav-h + 16px` (page scroll clear)    | `16px`                          |
| `--toast-bottom`     | `--bottom-nav-h + 16px` (toasts above the bar) | `safe-area-inset-bottom + 16px` |

- `mobile-bottom-nav.tsx` is `h-[var(--bottom-nav-h)]`; `AppShellMain` pads with
  `pb-[var(--shell-bottom-pad)]`. Before this, the bar grew to ~90px on a
  home-indicator iPhone while the page cleared only 80px, so the last row of a
  list could sit underneath it.
- The offline banner and the toaster both anchor to `--toast-bottom`, so they rise
  above the bar on phones instead of hiding behind it.
- The bar is `lg:hidden` and the 1024px media query matches it exactly.
- **Touch targets**: drawer rows use `min-h-11` (44px) while the mouse-driven
  desktop rail passes `dense` for its 36px rows; the bottom nav rows are 44px.
  `pwa-ios-shell.test.ts` pins the geometry contract.
- `useCoarsePointer` watches `(pointer: coarse)` for changes, so the command
  launcher appears/disappears when a 2-in-1 is docked or undocked rather than
  only after a reload.

### Data tables

Wide tables opt into the stacked layout with `table-stack` on the `<table>` plus
`data-label` on each `<td>` (`globals.css`). Below 768px the header row is hidden
visually (kept for assistive tech) and every row becomes a labelled card, so a
phone gets the data instead of a horizontal scrollbar inside a page that never
scrolls sideways. `mobile-table-stacking.test.ts` fails if a table is added
without the opt-in or with fewer labels than columns.

The journal's virtualized entry list is bounded by
`max-h-[min(70svh,750px)]` — a fixed 750px was taller than a phone's whole
viewport, and `overscroll-contain` stops the list from rubber-banding the page
underneath it.

## 5c. Share target

The manifest registers `share_target` → `/share/receive` (GET), so another app
on the device can hand Kestrel a `title` / `text` / `url` triple. The receiver is
a pure function of the query string:

- `src/lib/pwa/share-target.ts` sanitises and composes; `src/app/share/receive`
  only redirects to `/chat?new=1&prompt=…`, and the chat landing route creates
  the thread (so an expired session still ends on the login screen).
- **GET, not POST**: a POST target would have to parse `multipart/form-data`
  (the only enctype Chrome accepts) for a text-only hand-off.
- Strip control characters and bidi overrides, collapse blank runs, cap each
  field (title 200 / text 4 000 / url 2 048), and accept **absolute http(s) URLs
  only** — `javascript:`, `data:` and `file:` are dropped.
- The composed prompt is then cut to fit a **percent-encoded** budget of 3 000
  characters (`fitToEncodedBudget`), because it travels through two redirects in
  a query string and CJK/emoji encode to nine bytes per byte of UTF-8.
- `/share` stays outside the auth matcher, and the receiver is `noindex`.

## 5d. Background refresh (periodic sync)

A PWA that is installed but rarely opened never learns about a deploy: the update
check lives in the page and the offline document is only refreshed while the app
runs. On Chromium, `periodicsync` closes that gap:

- `src/lib/pwa/background-sync.ts` registers the `kestrel-shell-refresh` tag
  (6-hour minimum interval) from `sw-register.tsx`; Safari and Firefox lack the
  API and no-op, and a denied permission is not an error.
- The worker's handler calls `registration.update()` (so a changed worker
  installs and waits for the app, exactly like an in-page check) and revalidates
  the offline document plus the manifest. Icons and fonts are **not** in that
  set — stale-while-revalidate already covers them on use.
- A `kestrel-shell-state` IndexedDB stamp rate-limits the work, so repeated
  wake-ups and an open app do not double up.
- The tag, interval and store name are duplicated between the worker and the app
  module (a worker cannot import app code); `service-worker.test.ts`
  (`worker ↔ app contracts`) fails if they drift.

## 6. Push notifications

- Payload contract (sent from `packages/ai/src/alerts/delivery/adapters.ts`):
  `{ title, body, url, tag?, badge?, icon?, actions? }`.
- `url` is normalized to a same-origin path before a notification is created —
  a push payload can never open an arbitrary origin.
- `actions` (optional) renders up to two notification buttons on platforms that
  support them; malformed entries are dropped rather than breaking the
  notification. An action id of `dismiss` closes silently.
- `badge` sets the app-icon badge (Badging API); tapping a notification clears it
  and `PwaSignals` clears it again whenever the app becomes visible.
- `pushsubscriptionchange` (Safari/iOS rotate silently): the worker
  re-subscribes, parks the new subscription in IndexedDB
  (`kestrel-pwa` / `push-state`), and notifies open clients. `src/lib/pwa/push-store.ts`
  POSTs it to `/api/push/subscribe` on the next foreground visit, because the
  endpoint needs the session cookie **and** the CSRF token, neither of which a
  service worker can read. A 401/403 keeps the record so the next signed-in visit
  retries instead of losing the subscription (`pwa-push-store.test.ts`).

## 7. Manual verification

```bash
# Regenerate assets after a brand or device-matrix change
pnpm --filter @kestrel/web generate:icons --force
pnpm --filter @kestrel/web generate:screenshots --force

# Contract, generator and worker-behaviour tests
pnpm --filter @kestrel/web test -- pwa- service-worker

# Browser behaviour (needs the local stack)
pnpm test:e2e -- --grep "PWA|Install nudge"
```

Chrome DevTools → **Application → Manifest** shows installability errors, and
ticks in **Application → Service Workers** plus _Update on reload_ are the
fastest way to exercise the update flow.
