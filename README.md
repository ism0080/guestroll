# Guestroll

Guestroll is a personal wedding photo collector built with Effect, Cloudflare Workers,
D1, R2, and Alchemy. Guests receive an event link, create an anonymous camera, and
upload a limited number of photos. Host endpoints use a signed, HTTP-only session
cookie and never expose a public gallery.

## Setup

```bash
bun install
```

Set deployment configuration in the environment:

```bash
HOST_PASSCODE=replace-with-a-long-random-passcode
ALLOWED_ORIGIN=http://localhost:5173
```

`HOST_PASSCODE` is stored as a Cloudflare secret binding. Alchemy generates and stores
a separate stable session-signing secret. `ALLOWED_ORIGIN` must be the exact host app
origin in production. Host requests must use `credentials: "include"`; the secure
cross-site cookie requires HTTPS outside local test clients.

## Checks

```bash
bun run typecheck
bun run lint
bun test
```

## Deploy

```bash
bun alchemy deploy
```

The initial D1 migration is committed under `migrations/`. Review generated migrations
before later deployments.

## API Notes

- `POST /host/login` accepts the owner passcode and sets a 30-day `HttpOnly`, `Secure`,
  `SameSite=Strict` cookie.
- Guest camera creation and photo uploads are rate limited by Cloudflare.
- Uploads accept one JPEG, PNG, or WebP file up to 2 MiB plus `cameraId`, `takenAt`,
  and a client-generated UUID `uploadId`. Retrying the same `uploadId` is idempotent.
- Host photo listing uses cursor pagination with a maximum page size of 100.

D1 and R2 cannot participate in one transaction. The upload flow reserves quota before
storage and compensates D1 and R2 after observable failures or interruption. A Worker
isolate terminated between services can still leave a stale reservation or object; add
a durable upload-state table and scheduled reconciler if that operational guarantee is
needed.
