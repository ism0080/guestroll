# Wedding Disposable Camera — Implementation Plan

Personal-use Guestroll-style wedding photo collector: guests scan a QR code, take a
limited number of photos from a PWA camera (no app download), and the couple
sees every photo afterward. Only the couple (hosts) ever views the photos —
there is no public gallery.

## Current status

- **Infra (Alchemy v2):** stack code complete — R2 bucket, D1 database
  (Drizzle schema + migrations applied on deploy), and the API Worker, all
  wired in `alchemy.run.ts`. First `bun alchemy deploy` not yet run.
- **Dev tooling:** done — `@effect/tsgo`, oxlint + custom plugins, `prepare` /
  `typecheck` / `lint` scripts, `AGENTS.md`. `bun run typecheck` and
  `bun run lint` pass.
- **Domain + contracts:** done — `Owner`, `Event`, `Camera`, `Slug` models and
  DTOs. No moderation/approval; photos have no status.
- **API core:** done (except ZIP download) — event create/list/status
  (`draft → live`), camera create, multipart photo upload with atomic per-camera
  limit, host-only photo list. Guests never read photos.
- **Guest PWA:** done — SolidStart v2 SPA (`apps/guest`, `ssr: false`),
  Tailwind 4 + daisyUI 5 (retro theme), camera capture + front/back toggle +
  torch, client-side JPEG compression (<2 MiB), film-filtered review,
  camera-roll import, idempotent multipart upload, shot counter + done state,
  PWA manifest/icons. Deployed via `Cloudflare.Website.Vite` in the same stack.
- **Host dashboard:** not started.

## Goal

Multiple personal events (wedding, shower, bachelor party, etc.), still owned
by one couple. Maximize reliability on the day. Minimize maintenance. Guests
are anonymous (optional name only); only the couple logs in.

## Decisions (locked)

- **Scope:** multi-event, but single-owner personal use (not multi-tenant
  SaaS). Events are scoped to one owner account. Design stays simple: no
  billing, no roles, no cross-owner isolation requirements beyond a single
  owner passcode.
- **Guest app:** SolidJS / SolidStart PWA, TypeScript, Tailwind + daisyUI,
  statically served, no SSR. Use the daisyUI skill for component generation.
- **API:** Cloudflare Workers, **pure Effect v4** end to end.
- **Reveal flow:** no public reveal. Guests upload only while an event is
  `live`; the couple (hosts) are the only viewers, seeing photos as they come
  in. There is no approval step and no guest gallery.
- **Infra:** Alchemy v2 (R2 + D1 + Worker bindings + asset hosting).
- **Package manager:** **bun** (already used to scaffold + install; Alchemy and
  all deps installed via `bun add`; deploy/dev/test via `bun alchemy ...`).
- **No guest auth.** Events reached via unguessable slug/QR link. The owner
  authenticates once to reach the host dashboard (passcode/QR secret for the
  single owner account, not per-event).

## Architecture

```
guest PWA (Solid) ──▶ Workers API (Effect v4) ──▶ R2 (originals/thumbnails)
   (camera/upload)      ─ D1 (event/camera/photos)
                        ─ Cloudflare Image Resizing (thumbnails)
```

- **Client** compresses to ~150–400 KB, multipart uploads to the Worker.
- **API** enforces all business rules (photo limit) in Effect programs against
  D1 — never trust the client counter.
- **No realtime.** Host photo grid refreshes on `visibilitychange`/poll. Escape
  hatch: a Durable Object if we ever need push, not the default.
- **Auth:** no guest accounts. Single owner account; passcode/QR secret only.
  No identity provider.

## Repo layout (bun monorepo)

> Monorepo is **bun-workspaces** based (`bun.lock`). Scaffolded with
> `bun init -y`; all packages installed via `bun add`.

```
guestroll/
  alchemy.run.ts  # Alchemy v2 composition root: R2, D1, Worker, Websites
  apps/
    api/          # Effect v4 Worker (HttpApi endpoints, layers)
    guest/        # SolidStart PWA: camera + upload (static, Website.Vite)
    host/         # passcode dashboard (Solid, reuses shared UI)
  packages/
    contracts/    # effect/Schema DTOs, shared by API + client
    domain/       # pure Effect models: Owner, Event, Camera, rules
  PLAN.md
```

## Data model (D1)

- **Owner** — id, passcode hash (single-owner, personal use), created at.
- **Event** — id, ownerId, slug, title, cover key, filter pack, guest photo
  limit, status (`draft | live`), timestamps.
- **Camera** — id, eventId, guest name (optional), usedCount (server-enforced),
  created at.
- **Photo** — id, client upload id, eventId, cameraId, objectKey, thumbKey,
  taken at, uploaded at. The client upload id makes retries idempotent per
  camera; server upload time drives stable host pagination.
- **Download** — for "download all as ZIP" via R2 (build + cache).

All events/cameras/photos are scoped by `ownerId`; every query enforces the
owner. Guest-facing routes only access events via their unguessable `slug`.

Photo-limit enforcement is an atomic D1 `batch`: verify `usedCount < limit`,
insert photo, increment `usedCount` — all in one round trip (D1 has no
transactions; use native `batch`).

## Feature list

### Guest (PWA)
- Scan QR / open link → welcome → optional name prompt
- Fullscreen camera: capture, flash, front/back toggle (`getUserMedia`)
- Disposable feel: shot counter ("12 of 25"), subtle film filter (canvas)
- Retake; on keep, auto-upload in background
- Upload from camera roll (helps older guests)
- Done/thank-you state
- No gallery: guests never see photos — upload is one-way

### Host (dashboard)
- Login once (passcode/QR) as owner
- Event list: create, rename, duplicate (reuse for a second event)
- Create event: title, cover, filter pack, per-guest photo limit
- Per event: live photo grid (all photos as they upload), flip event
  `draft → live`, downloads
- Share per event: link + QR + printable table-card template

### Non-functional (critical)
- Client-side compression before upload (flaky venue wifi)
- Modest concurrency (dozens–hundreds of guests uploading at once)
- Automatic backup + one-click full download after the wedding

## Stack

| Concern        | Choice                                                        |
|----------------|---------------------------------------------------------------|
| Guest app      | SolidJS / SolidStart PWA, TypeScript, Tailwind, daisyUI        |
| UI components  | daisyUI (via official skill; `@plugin "daisyui"` in app.css)   |
| API            | Cloudflare Workers, **pure Effect v4** (`HttpApi`)            |
| SQL            | `@effect/sql-d1` (D1Client/SqlClient, prepared-statement cache)|
| Storage        | R2 (originals), Cloudflare Image Resizing (thumbnails)        |
| Uploads        | `HttpApiSchema.asMultipartStream` → stream bytes to R2        |
| Client bindings| generated `HttpApiClient` (multipart as `FormData`)           |
| Infra          | Alchemy v2 (`Cloudflare.R2.Bucket`, `D1`, `Worker`, `Website.Vite`) |
| QR / ZIP       | qrcode lib, fflate/jszip                                      |

## Effect v4 constraints (from research)

- **RC software:** v4 is a release candidate (`effect@4.0.0-rc`, `@effect/sql-d1@...rc`);
  `HttpApi*` are marked unstable and churn between releases. Pin exact versions.
  Acceptable for a personal, non-long-lived app.
- **D1 limits:** no transactions, no streaming queries. Use native `batch` for
  atomic multi-write (photo limit + counter). Not supported: `withTransaction`,
  `executeStream`.
- **Cloudflare env binding:** Effect wants layers up-front, Workers give `env`
  per request. The `apps/api/` package requires `WorkerEnv` as an open
  dependency; the infra Worker (`infra/Api.ts`) provides it from the
  Cloudflare environment and bridges to a Worker fetch via
  `HttpRouter.toHttpEffect` on the fully provided app layer (`AppLive` +
  `ApiApp`). No custom `effect-cf` binding layer needed — `@effect/sql-d1` +
  `WorkerEnv` covers D1 and R2.

## Alchemy v2 (IaC — Infrastructure as Effects)

Alchemy models cloud infra and app code in one type-safe Effect program. A
**Stack** declares Resources; deploy computes a plan and provisions them;
bindings wire resources into a Worker and generate typed clients + least-
privilege permissions. Deploys and runtime share the same code.

**Setup status (done):**
- Project scaffolded with `bun init -y`.
- Installed (pinned): `alchemy@2.0.0-beta.76`, `effect@4.0.0-rc.112`,
  `@effect/platform-bun@4.0.0-rc.112`, `@effect/platform-node@4.0.0-rc.112`.
  Alchemy requires `effect >=4.0.0-rc.112`, matching the latest RC.
- Credentials: Alchemy stores Cloudflare creds per profile in
  `~/.alchemy/profiles.json` (OAuth or API token via interactive prompt on
  first deploy). No `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN` env vars.
- Command: `bun alchemy deploy` (interactive plan + approval).

**Stack shape (composition root = `alchemy.run.ts`):**
- Providers: `Cloudflare.providers()`, `Cloudflare.state()`.
- Current (code-complete, not yet deployed): a single
  `Cloudflare.R2.Bucket("BUCKET")` + a `Cloudflare.D1.Database("DB")` with a
  `Drizzle.Schema` migration (applied on deploy) + a `Cloudflare.Worker("Api")`
  running the Effect `HttpApi` app. Deploy with `bun alchemy deploy`, confirm
  live, then add the Websites as the frontends land.

**Resources (built vs planned):**
- `Cloudflare.R2.Bucket` — R2 object storage for photos. **In the stack**
  (`infra/Bucket.ts`).
- `Cloudflare.D1` — serverless SQLite; `Drizzle.Schema` regenerates migration
  SQL on every deploy and the `migrations` wire applies it to D1. **In the
  stack** (`infra/Db.ts` + `infra/schema.ts`).
- `Cloudflare.Worker` — the API runtime; binds R2 + D1 with full type safety.
  **In the stack** (`infra/Api.ts`).
- `Cloudflare.Website.Vite` — deploy the SolidStart PWA as Cloudflare static
  assets in the same Stack (SolidStart frontend guide; Vite resource).
  **In the stack** (`infra/Guest.ts`, `apps/guest`).
- Secrets: `effect/Config` + `Alchemy.Random` for stable tokens; Secrets Store
  if secrets are shared (Secrets & env guide). **Planned** for the owner
  passcode.

**Effect API on Cloudflare (native):**
- The Worker API uses Effect's `HttpApi` module (pure Effect v4) deployed as a
  Cloudflare Worker via the Effect HTTP API guide — schema-validated REST with
  the generated `HttpApiClient` consumed by the Solid PWA. This replaces the
  generic `toWebHandler` manual bridge; Alchemy's Worker resource handles the
  runtime boundary and typed bindings.
- D1 access via `@effect/sql-d1` (`D1Client`/`SqlClient`), prepared-statement
  cache, snake↔camel transforms — same constraint set as earlier.

**Alchemy dev/test/CI (available later, used as needed):**
- `alchemy dev` — hot reload; resources deploy to the cloud, Workers run in a
  local dev runtime (part-4).
- Testing — one Stack deploy per suite, deploy → assert → destroy (part-3).
- GitHub Actions CI with per-PR previews + Cloudflare creds as code (part-5).
- Stages — isolated dev/prod instances with their own state (Stages guide).

**Flow:** guest PWA and host dashboard are SolidStart apps deployed via
`Cloudflare.Website.Vite`; the API is a `Cloudflare.Worker` running Effect
`HttpApi` bound to `Cloudflare.R2.Bucket` + `Cloudflare.D1`. Everything lives
in one `alchemy.run.ts` Stack and deploys with `bun alchemy deploy`.

## Effect dev tools (LSP + linting + agent guidance)

Per the Effect v4 devtools guide, set up the editor language service, the
Effect-aware linter, and agent guidance. Both editor tools integrate via
`@effect/tsgo` (TypeScript-Go + Effect diagnostics). Install at the monorepo
root (recommended for monorepos).

**Schema note:** `@effect/schema` is deprecated since Effect 3.10 — schema
lives in `effect/Schema`. Do **not** install `@effect/schema` as a separate
package; import `Schema` from `effect`.

**Version-pinning divergence:** the Effect setup guide says "don't specify
version, use latest", but we **pin** `effect@4.0.0-rc.112` (and matching
platform packages) because Alchemy requires `effect >=4.0.0-rc.112`. Keep the
pin; re-pin when Alchemy bumps.

**Oxlint ↔ tsgo compatibility (setup constraint, discovered):**
`effect-tsgo` pins the oxlint binding version it can patch. `@effect/tsgo@0.39.0`
supports oxlint binding `1.79.0` / `1.80.0` only. Latest `oxlint@1.81.0` failed
the `prepare` patch with `UnsupportedTargetPackageVersionError`, so **pin
`oxlint` to `1.80.0`** (and `oxlint-tsgolint` to a matching version). If the
patch ever fails, align the oxlint version to what `effect-tsgo` lists.

**Setup status (done):**
- Installed: `@effect/tsgo@0.39.0`, `oxlint@1.80.0` (pinned), `oxlint-tsgolint`,
  `effect-solutions@0.5.3`, `@oxlint/plugins@1.80.0`.
- `.oxlintrc.json` created: extends Effect recommended preset **and** wires the
  custom `anti-slop`, `effect`, `core` plugins from `tools/oxlint/` (copied
  from site-studio). Effect rules scoped to `apps/api/`,
  `packages/domain/`, `packages/contracts/`.
- `package.json` scripts added: `prepare: effect-tsgo patch --oxlint`,
  `typecheck: tsc --noEmit`, `lint: oxlint`.
- `tsconfig.json` LSP plugin added (`@effect/language-service`, `diagnostics:
  false`) + `$schema`.
- `bun install` ran the `prepare` patch successfully (patched typescript,
  oxlint, oxlint-dts, oxlint-tsgolint).
- Verified: `bun run lint` and `bun run typecheck` both pass. (The `index.ts`
  bun-init placeholder flags an `effecttsgo(global-console)` warning — expected,
  it's not real code.) Custom rules confirmed firing via a scratch test (then
  removed).
- Editor: still needs "Use workspace version" of TypeScript (VS Code/Cursor) —
  see LSP notes below.

**Install (bun):**
```
bun add -D @effect/tsgo oxlint oxlint-tsgolint effect-solutions
```
- `@effect/tsgo` requires native TypeScript 7+ (bun init already installed
  `typescript@7.0.2`). For monorepos install at the workspace root.
- `effect-solutions` is the Effect Solutions CLI — the canonical source of
  setup + pattern guidance. Run `effect-solutions list` / `effect-solutions
  show <topic>` (e.g. `show project-setup`, `show tsconfig`, `show
  services-and-layers`) instead of guessing Effect patterns. Follow its
  project-setup instructions for tsconfig, LSP, and scripts; apply what it
  outputs rather than relying solely on this plan.

**Enable the LSP** — `tsconfig.json`:
```json
{
  "compilerOptions": {
    "plugins": [{ "name": "@effect/language-service", "diagnostics": false }]
  }
}
```
- The plugin `name` stays `@effect/language-service` even though the package is
  `@effect/tsgo`.
- `diagnostics: false` so Effect diagnostics are reported only by Oxlint (not
  twice) once the linter is on.
- Editor must use the **workspace TypeScript version** (VS Code/Cursor: status
  bar → "Use Workspace Version") for the plugin to run.

**Lint with Oxlint + tsgo integration** — `package.json` scripts:
```json
{
  "scripts": { "prepare": "effect-tsgo patch --oxlint" }
}
```
plus an `.oxlintrc.json`:
```json
{
  "$schema": "./node_modules/@effect/tsgo/oxlint-schema.json",
  "extends": ["./node_modules/@effect/tsgo/oxlint-presets/recommended.json"]
}
```
Run `bun install` to install deps and run `prepare` (patches Oxlint to use the
Effect TS-Go integration). Effect rules need Oxlint's type-aware mode + the
`effecttsgo` plugin — the recommended preset enables both.

**Custom oxlint plugins (from `~/Developer/site-studio`)** — copied into
`tools/oxlint/` and wired via `jsPlugins`:
- `anti-slop` — 15 generic low-evidence/low-signal patterns (no chained type
  assertions, no runtime typeof, no unsafe dictionary types, no known-value
  widening, require `SAFETY:` comments for assertions, etc.). Enabled globally.
- `effect` — 19 Effect-first rules scoped to Effect code (`apps/api/`,
  `packages/domain/`, `packages/contracts/`): no try/catch, no global JSON, no
  switch (use `Match`), no `in` operator, no silent error swallow, no
  cascading/nested `Layer.provide`, no service-option, no static service
  forwarders, no ambient nondeterminism (use `Clock`/`Random`), no
  disable-validation, prefer `Option.fromNullable`, `pipe-max-arguments`, etc.
- `core` — private function hygiene (`_` prefix, no single-use private
  functions), applied to Effect code paths.
- **Excluded from the copy's config:** `effect/no-direct-browser-storage`
  (our PWA is SolidJS, not Effect) and `effect/no-direct-fetch` (tailored to
  site-studio's internal API client). Kept as files, not enabled.
- **Compatibility:** plugins import `eslintCompatPlugin`/`defineRule` from
  `@oxlint/plugins` (pinned to `1.80.0` to match `oxlint@1.80.0`). The
  `tools/oxlint` dir is in `ignorePatterns` (oxlint doesn't lint its own
  plugins).

**Typecheck script** — add to `package.json` for CLI/CI checking:
```json
{
  "scripts": { "typecheck": "tsc --noEmit" }
}
```
(Monorepos with project references: `tsc --build --noEmit`.)

**Agent instruction file (`AGENTS.md`)** — created at the repo root so AI
assistants know to use the Effect tooling. Insert the `effect-solutions`
guidance block between `<!-- effect-solutions:start -->` and
`<!-- effect-solutions:end -->` (mirroring the official setup guide's
recommended content):
```markdown
## Effect Best Practices

**IMPORTANT:** Always consult effect-solutions before writing Effect code.

1. Run `effect-solutions list` to see available guides
2. Run `effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Check `node_modules/effect/AGENTS.md` (the Effect package's own agent
   guidance) for real patterns and type definitions when docs aren't enough

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers,
data-modeling, error-handling, config, testing, cli.
```
Per the plan decision: only `AGENTS.md` is needed (no `CLAUDE.md`). Have it
**reference the Effect package's own** `node_modules/effect/AGENTS.md` for
source-level patterns, instead of a separate source clone (the old `effect-smol`
source-reference step is obsolete — that source now lives in the effect repo).
Create `AGENTS.md` only after confirming with the user (we ask before creating
agent files).

**What these tools catch (value for this codebase):**
- Floating Effects (Effect values not yielded/assigned) — the single most
  common Effect bug, caught at edit time.
- Layer requirement leaks / scope violations — critical for our Layer-heavy
  Worker wiring (R2/D1/HttpApi layers).
- Unnecessary `Effect.gen` / `pipe()` calls, error-handling misuse, and
  multiple Effect versions present.
- Async→Effect refactors, tagged-error generation, service accessor scaffolds,
  layer composition — speeds up building the domain + API layers.

**Editor extension (optional):** `effect-vscode` (VS Code / Cursor) adds a
debugger panel for Effect (fiber context, span stack, fibers, pause-on-defect).
Note: the extension does **not** bundle the LSP — the LSP install above is the
real editor integration.

## Build order

Status: ✅ done · ◻️ pending

1. **Infra (Alchemy v2):** ✅ stack code complete — `alchemy.run.ts` composes
   R2 bucket, D1 database (Drizzle schema + migrations on deploy), and the API
   Worker. First `bun alchemy deploy` still to run to provision + confirm live.
2. **Dev tooling:** ✅ `@effect/tsgo`, oxlint + custom plugins, `prepare` /
   `typecheck` / `lint` scripts, `AGENTS.md`. `bun run typecheck` + `bun run
   lint` pass.
3. **Domain + contracts:** ✅ Effect models (`Owner`, `Event`, `Camera`,
   `Slug`) + `effect/Schema` DTOs in `packages/contracts`. No moderation
   state machine — photos are status-less.
4. **API core:** ✅ (except ZIP) — event create/list/status
   (`draft → live`), camera create, multipart photo upload (`asMultipartStream`
   → R2 + D1 batch limit), host-only photo list. ◻️ ZIP download.
5. **Guest PWA:** ✅ SolidStart v2 SPA in `apps/guest` (`ssr: false` — client
   rendering only). daisyUI 5 + Tailwind 4 (`retro` theme, `@plugin "daisyui"`).
   Full camera loop: capture (`getUserMedia`, front/back toggle, torch),
   client-side compression to <2 MiB JPEG, film-filtered review with
   retake/keep, camera-roll import fallback, idempotent multipart upload
   (client `uploadId`), shot counter, done state, and localStorage camera
   persistence across reloads. Deployed as `Cloudflare.Website.Vite("Guest")`
   with `VITE_API_BASE` inlined from the API Worker's URL. No gallery —
   upload is one-way.
6. **Host dashboard:** ◻️ passcode → event list → live photo grid → downloads.
   daisyUI dashboard components (tables, modals, toasts, forms).
7. **Polish:** ◻️ QR + printable table cards, filters, PWA install.

## Known risks / open items

- ✅ Multipart-stream handler signature verified against the pinned release —
  upload path is implemented.
- Thumbnails: `thumbKey` currently equals `objectKey` (no resizing). Confirm
  Cloudflare Image Resizing availability on the account/plan (free-tier R2 may
  not include it; fallback: generate a downscaled thumb client-side or in the
  Worker).
- ZIP download not yet built. Verify the bridge (`HttpRouter.toHttpEffect` /
  `waitUntil`) for the ZIP build so large download jobs can outlive the
  request.
- Owner auth uses a configured passcode exchanged for a signed, expiring,
  HTTP-only session cookie. The host dashboard still needs to implement the
  login form and cookie-bearing API client.
