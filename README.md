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
HOST_ALLOWED_ORIGIN=https://host.example.com
GUEST_ALLOWED_ORIGIN=https://guest.example.com
```

`HOST_PASSCODE` is stored as a Cloudflare secret binding. Alchemy generates and stores
a separate stable session-signing secret. Both origin variables are required and must
be exact frontend origins; the host origin controls credentialed host API requests.
Host requests must use `credentials: "include"`; the secure cross-site cookie uses
`SameSite=None` and requires HTTPS outside local test clients.

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

## Guest app

The guest PWA lives in `apps/guest` (SolidStart v2, client-side rendering only, Tailwind +
daisyUI). Run it standalone against a local API:

```bash
VITE_API_BASE=http://localhost:8787 bun run --cwd apps/guest dev
```

Camera access (`getUserMedia`) requires a secure context — use `http://localhost:5174`
on a machine with a webcam, or an HTTPS tunnel (e.g. `cloudflared tunnel --url
http://localhost:5174`) to test on a phone. Plain-HTTP LAN URLs will not prompt for
camera permission. In production the site is served over HTTPS (`.workers.dev`), so
the prompt appears normally.

## API Notes

- `POST /host/login` accepts the owner passcode and sets a 30-day `HttpOnly`, `Secure`,
  `SameSite=None` cookie. All host mutations, including logout, require the exact host
  origin and a valid session.
- Guest camera creation and photo uploads are rate limited by Cloudflare.
- Uploads accept one JPEG, PNG, or WebP file up to 2 MiB plus an optional thumbnail,
  `cameraId`, `takenAt`, and a client-generated UUID `uploadId`. Retrying the same
  `uploadId` is idempotent. A content mismatch returns 422; a full roll returns 409.
- Host photo listing uses cursor pagination with a maximum page size of 100.

D1 and R2 cannot participate in one transaction. The upload flow creates a durable,
idempotent pending database claim before the R2 write, then exposes the photo only
after it is marked uploaded. Each claim is bound to its SHA-256 digest, so retries with
different bytes are rejected. Pending claims remain retryable, preventing an
  interrupted Worker request from deleting or replacing its durable claim. Pending claims
  older than 24 hours no longer consume a roll slot while remaining retryable.
