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

## API Notes

- `POST /host/login` accepts the owner passcode and sets a 30-day `HttpOnly`, `Secure`,
  `SameSite=None` cookie. All host mutations, including logout, require the exact host
  origin and a valid session.
- Guest camera creation and photo uploads are rate limited by Cloudflare.
- Uploads accept one JPEG, PNG, or WebP file up to 2 MiB plus `cameraId`, `takenAt`,
  and a client-generated UUID `uploadId`. Retrying the same `uploadId` is idempotent.
- Host photo listing uses cursor pagination with a maximum page size of 100.

D1 and R2 cannot participate in one transaction. The upload flow creates a durable,
idempotent pending database claim before the R2 write, then exposes the photo only
after it is marked uploaded. Retrying the same `uploadId` resumes that claim. Pending
claims must be reconciled operationally if a Worker is terminated before R2 completes.
