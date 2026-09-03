# Repository Guidance

## Effect Best Practices

**IMPORTANT:** Always consult effect-solutions before writing Effect code.

1. Run `effect-solutions list` to see available guides
2. Run `effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Check `node_modules/effect/AGENTS.md` (the Effect package's own agent
   guidance) for real patterns and type definitions when docs aren't enough

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers,
data-modeling, error-handling, config, testing, cli.

## API ↔ Infra boundary

The `apps/api/` package owns the **API surface and app services only**. It must
not own any Cloudflare/Worker runtime wiring.

**`apps/api/` owns:**
- `EventsApi` — the HttpApi definition (groups/endpoints)
- `GuestLive` / `HostLive` — `HttpApiBuilder.group` implementations
- `AppLive` — the app service layer (D1 client + R2 + owner scope),
  **requiring** `WorkerEnv` as an open dependency
- `ApiApp` — `HttpApiBuilder.layer(EventsApi)` provided with the group layers

**Infra owns (alchemy `alchemy.run.ts`, NOT `apps/api/`):**
- The `Cloudflare.Worker` resource and its typed bindings
- Providing `WorkerEnv` from the Cloudflare environment
- **D1 schema + migrations via Drizzle** (`Drizzle.Schema` + `Cloudflare.D1`
  `migrations` prop, applied on deploy). The `apps/api/` repo SQL assumes the
  migrated table shape (columns: `id`, `ownerId`, `slug`, `title`, `coverKey`,
  `filterPack`, `photoLimit`, `status`, `createdAt`, `updatedAt`; `cameras`:
  `id`, `eventId`, `guestName`, `usedCount`, `createdAt`; `photos`: `id`,
  `uploadId`, `eventId`, `cameraId`, `objectKey`, `thumbKey`, `takenAt`,
  `uploadedAt`).
- The Effect HTTP runtime glue: `Etag.layer`, `HttpPlatform` (stub for
  Workers), `Path.layer`, `FileSystem` (noop), `HttpRouter.layer`
- The final bridge to a Worker fetch: `HttpRouter.toHttpEffect` on the fully
  provided app layer

Do not add `toWebHandler` / `makeFetch` / `createWorker`, DDL / `migrate`, or
any `HttpPlatform` / `FileSystem` / `Etag` / `HttpRouter` / Drizzle wiring
inside `apps/api/`. A new infra slice composes those against `AppLive` +
`ApiApp`.
