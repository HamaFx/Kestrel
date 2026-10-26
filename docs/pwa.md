# PWA, install & home-screen behaviour

Kestrel ships as an installable Progressive Web App. This document is the
reference for the browser-facing surface: the manifest, the generated assets,
the service worker, the install nudge, offline behaviour and push.

Everything here is testable from the repository:

| Concern                   | Guard                                                                        |
| ------------------------- | ---------------------------------------------------------------------------- |
| Manifest + asset contract | `apps/web/test/pwa-manifest.test.ts`                                         |
| Brand-colour drift        | `apps/web/test/pwa-brand-contract.test.ts`                                   |
| Service worker + precache | `apps/web/test/service-worker.test.ts`                                       |
| Install nudge preferences | `apps/web/test/pwa-install-preference.test.ts`                               |
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
  from `public/brand/kestrel-logo.png`: 192/512/1024 (`purpose: any`), a 512
  maskable icon, three `apple-touch-icon` sizes, and **one launch image per
  device and orientation** from the splash matrix. Splashes are PNG-8 (flat
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

`scripts/sw.template.js` is stamped by `scripts/generate-sw.mjs` (build id +
VAPID public key) into `public/sw.js`; the precache list lands in
`public/sw-precache.json`. `/sw.js` is served `no-store`.

Install / activate:

- Each precache URL is fetched **individually** (`Promise.allSettled`).
  `cache.addAll` is atomic — it rejected on the first missing URL (there used to
  be no `/favicon.ico` at all), which silently left the app with _no_ offline
  shell.
- A redirected response (login bounce for `/chat` when the session expired) is
  never cached as the shell.
- `activate` drops caches from older build ids, enables **navigation preload**,
  and claims clients.
- Updates deliberately **wait**: the app sends `SKIP_WAITING` only when the user
  accepts the reload (see below). This prevents a deploy from swapping JS chunks
  underneath a half-typed prompt.

Fetch strategies:

| Request                                                                         | Strategy                              |
| ------------------------------------------------------------------------------- | ------------------------------------- |
| `/_next/static/`, `/icons/`, `/fonts/`, `/brand/`, favicon, manifest            | cache-first (runtime fill)            |
| Navigations (`mode: navigate`)                                                  | network-first (preload + 3 s timeout) |
| `/api/auth`, `/api/cron`, `/api/admin`, `/api/chat`, `/api/market`, `/api/push` | bypass (no SW handling)               |
| everything else (RSC payloads, remaining APIs)                                  | network-only                          |

Failed navigations resolve to an exact cache match, then to the precached
**`/offline`** page, then to a minimal inline document.

Two deliberate decisions:

1. **No runtime navigation cache.** The app is an authenticated trading
   terminal; page HTML contains account and journal data and Next marks those
   responses `no-store`. Caching them in a service worker cache would leak
   personalised data to the next person who opens the installed app.
2. **`/offline` lives outside the `(app)` route group** so it is public and
   static. The authenticated shell needs a session and database round-trips,
   which do not exist offline. `/offline` is excluded in `src/proxy.ts` and
   `src/auth.config.ts` and precached like any other asset.

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

- iOS 26 opens every Home Screen entry as a web app by default, so the copy must
  not instruct users to enable "Open as Web App".
- Home Screen web apps use their own storage container: expect one extra sign-in
  after installing.
- Web push on iPhone/iPad only works for Home Screen apps;
  `EnableWebPushButton` says so and links to `/settings/install` instead of
  showing a bare "not supported".

## 6. Push notifications

- Payload contract (sent from `packages/ai/src/alerts/delivery/adapters.ts`):
  `{ title, body, url, tag?, badge?, icon? }`.
- `url` is normalized to a same-origin path before a notification is created —
  a push payload can never open an arbitrary origin.
- `badge` sets the app-icon badge (Badging API); tapping a notification clears it
  and `PwaSignals` clears it again whenever the app becomes visible.
- `pushsubscriptionchange` (Safari/iOS rotate silently): the worker
  re-subscribes, parks the new subscription in IndexedDB
  (`kestrel-pwa` / `push-state`), and notifies open clients. `src/lib/pwa/push-store.ts`
  POSTs it to `/api/push/subscribe` on the next foreground visit, because the
  endpoint needs the session cookie **and** the CSRF token, neither of which a
  service worker can read.

## 7. Manual verification

```bash
# Regenerate assets after a brand or device-matrix change
pnpm --filter @kestrel/web generate:icons --force
pnpm --filter @kestrel/web generate:screenshots --force

# Contract + generator tests
pnpm --filter @kestrel/web test -- pwa-manifest pwa-brand-contract service-worker

# Browser behaviour (needs the local stack)
pnpm test:e2e -- --grep "PWA|Install nudge"
```

Chrome DevTools → **Application → Manifest** shows installability errors, and
ticks in **Application → Service Workers** plus _Update on reload_ are the
fastest way to exercise the update flow.
