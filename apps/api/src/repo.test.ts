import { describe, expect, test } from "bun:test"
import { webcrypto } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import { Context, Effect, Layer, Option, Result } from "effect"
import * as D1Client from "@effect/sql-d1/D1Client"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import { Database as SqliteDatabase } from "bun:sqlite"
import type { D1Database, D1Meta, D1PreparedStatement, D1Result } from "@cloudflare/workers-types"
import {
  EventCreate,
  EventId,
  FilterPack,
  GuestId,
  ObjectKey,
  OwnerId,
  PhotoId,
  UploadId
} from "@guestroll/contracts"
import { WorkerEnv, type GuestrollCrypto } from "./env.ts"
import * as repo from "./repo.ts"

const testCrypto: GuestrollCrypto = {
  getRandomValues: (array) => webcrypto.getRandomValues(array),
  randomUUID: () => webcrypto.randomUUID(),
  subtle: webcrypto.subtle
}

const WorkerEnvTest = Layer.succeed(WorkerEnv, {
  DB:
    // SAFETY: the repo paths under test only read `env.CRYPTO`; the
    // database binding is never touched here.
    {} as never,
  BUCKET:
    // SAFETY: the repo paths under test never touch object storage.
    {} as never,
  HOST_PASSCODE: "test-passcode",
  HOST_SESSION_SECRET: "test-session-secret",
  HOST_ALLOWED_ORIGIN: "",
  GUEST_ALLOWED_ORIGIN: "",
  CRYPTO: testCrypto,
  GUEST_RATE_LIMIT:
    // SAFETY: the repo paths under test never hit the rate limiter.
    {} as never,
  LOGIN_RATE_LIMIT:
    // SAFETY: the repo paths under test never hit the rate limiter.
    {} as never
})

const _run = <A, E>(
  sqlite: SqliteDatabase,
  effect: Effect.Effect<A, E, D1Client.D1Client | WorkerEnv>
): Promise<A> =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(
        Layer.effectContext(
          Effect.gen(function* () {
            const meta: D1Meta = {
              duration: 0,
              size_after: 0,
              rows_read: 0,
              rows_written: 0,
              last_row_id: 0,
              changed_db: false,
              changes: 0
            }
            const prepare = (query: string): D1PreparedStatement => {
              const statement = sqlite.prepare(query)
              // SAFETY: Bun's statement runner accepts the string/number/null
              // primitives the repo binds.
              const runAll = statement.all.bind(statement) as (
                ...params: unknown[]
              ) => unknown[]
              let bound: readonly unknown[] = []
              const handle: D1PreparedStatement = {
                bind: (...values: unknown[]) => {
                  bound = values
                  return handle
                },
                first: async () => null,
                run: async <T = unknown>(): Promise<D1Result<T>> => {
                  const rows = runAll(...bound)
                  // SAFETY: the fake returns real row objects, so narrowing
                  // them is trusted exactly as D1's own results are.
                  return { results: rows as T[], success: true, meta } as D1Result<T>
                },
                all: async <T = unknown>(): Promise<D1Result<T>> => {
                  const rows = runAll(...bound)
                  // SAFETY: the fake returns real row objects, so narrowing
                  // them is trusted exactly as D1's own results are.
                  return { results: rows as T[], success: true, meta } as D1Result<T>
                },
                raw: async () => {
                  throw new Error("raw queries are not supported by the fake D1 binding")
                }
              }
              return handle
            }
            const database: Partial<D1Database> = { prepare }
            // SAFETY: the fake implements the binding surface D1Client
            // exercises (prepare/bind/all); D1 is SQLite, so bun:sqlite runs
            // the same SQL.
            const db = database as D1Database
            const client = yield* D1Client.make({ db })
            return Context.make(D1Client.D1Client, client).pipe(
              Context.add(SqlClient.SqlClient, client)
            )
          })
        ).pipe(Layer.provide(Reactivity.layer))
      ),
      Effect.provide(WorkerEnvTest)
    )
  )

const _newDatabase = (): SqliteDatabase => {
  const sqlite = new SqliteDatabase(":memory:")
  const migrationsDir = new URL("../../../migrations/", import.meta.url)
  for (const entry of readdirSync(migrationsDir).toSorted()) {
    const sql = readFileSync(new URL(`${entry}/migration.sql`, migrationsDir), "utf8")
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim() === "") continue
      sqlite.exec(statement)
    }
  }
  // The host_sessions table arrives with the next generated migration; the
  // test schema mirrors `infra/schema.ts` until then.
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS host_sessions (id text PRIMARY KEY, createdAt text NOT NULL, expiresAt text NOT NULL)"
  )
  sqlite.exec("CREATE INDEX IF NOT EXISTS host_sessions_expires_at_idx ON host_sessions (expiresAt)")
  return sqlite
}

const _now = new Date("2026-06-01T12:00:00.000Z")
const _ownerId = OwnerId.make("test-owner")

const _createLiveEvent = async (
  sqlite: SqliteDatabase,
  photoLimit: number
): Promise<{ readonly eventId: EventId }> => {
  const event = await _run(
    sqlite,
    repo.createEvent(
      new EventCreate({ title: "Test wedding", filterPack: FilterPack.make("film"), photoLimit }),
      _ownerId,
      _now
    )
  )
  await _run(sqlite, repo.updateEventStatus(event.id, _ownerId, "draft", "live", _now))
  return { eventId: event.id }
}

describe("photo upload claims", () => {
  test("claims, completes, and replays the same upload idempotently", async () => {
    const sqlite = _newDatabase()
    const { eventId } = await _createLiveEvent(sqlite, 3)
    const camera = await _run(
      sqlite,
      repo.createCamera(EventId.make(eventId), GuestId.make("guest-1"), "Ada", _now)
    )
    const uploadId = UploadId.make("11111111-1111-4111-8111-111111111111")
    const claimParams = {
      eventId: EventId.make(eventId),
      cameraId: camera.id,
      uploadId,
      photoId: PhotoId.make("photo-1"),
      thumbKey: ObjectKey.make("thumb-1"),
      contentDigest: "digest-a",
      takenAt: _now,
      uploadedAt: _now,
      staleClaimCutoff: new Date(_now.getTime() - repo.StalePendingClaimMs)
    }
    const first = await _run(sqlite, repo.claimPhotoUpload(claimParams))
    expect(first.status).toBe("pending")
    expect(first.usedCount).toBe(1)
    await _run(sqlite, repo.completePhotoUpload(first.photo.id))
    const replay = await _run(sqlite, repo.claimPhotoUpload(claimParams))
    expect(replay.status).toBe("uploaded")
    expect(replay.photo.id).toBe(first.photo.id)
    expect(replay.usedCount).toBe(1)
  })

  test("rejects a retry whose bytes differ from the claimed digest", async () => {
    const sqlite = _newDatabase()
    const { eventId } = await _createLiveEvent(sqlite, 3)
    const camera = await _run(
      sqlite,
      repo.createCamera(EventId.make(eventId), GuestId.make("guest-1"), "Ada", _now)
    )
    const claimParams = {
      eventId: EventId.make(eventId),
      cameraId: camera.id,
      uploadId: UploadId.make("11111111-1111-4111-8111-111111111111"),
      photoId: PhotoId.make("photo-1"),
      thumbKey: ObjectKey.make("thumb-1"),
      contentDigest: "digest-a",
      takenAt: _now,
      uploadedAt: _now,
      staleClaimCutoff: new Date(_now.getTime() - repo.StalePendingClaimMs)
    }
    await _run(sqlite, repo.claimPhotoUpload(claimParams))
    const mismatch = await _run(sqlite, repo.claimPhotoUpload({
      ...claimParams,
      contentDigest: "digest-b"
    }).pipe(Effect.result))
    expect(Result.isFailure(mismatch)).toBe(true)
    if (Result.isFailure(mismatch)) {
      expect(mismatch.failure._tag).toBe("UploadContentMismatch")
    }
  })

  test("enforces the photo limit and frees slots only for stale pending claims", async () => {
    const sqlite = _newDatabase()
    const { eventId } = await _createLiveEvent(sqlite, 1)
    const camera = await _run(
      sqlite,
      repo.createCamera(EventId.make(eventId), GuestId.make("guest-1"), "Ada", _now)
    )
    const staleAt = new Date(_now.getTime() - repo.StalePendingClaimMs - 1000)
    const staleClaim = await _run(sqlite, repo.claimPhotoUpload({
      eventId: EventId.make(eventId),
      cameraId: camera.id,
      uploadId: UploadId.make("22222222-2222-4222-8222-222222222222"),
      photoId: PhotoId.make("photo-stale"),
      thumbKey: ObjectKey.make("thumb-stale"),
      contentDigest: "digest-stale",
      takenAt: staleAt,
      uploadedAt: staleAt,
      staleClaimCutoff: _now
    }))
    expect(staleClaim.status).toBe("pending")
    // A pending claim older than the cutoff no longer consumes a slot.
    const fresh = await _run(sqlite, repo.claimPhotoUpload({
      eventId: EventId.make(eventId),
      cameraId: camera.id,
      uploadId: UploadId.make("33333333-3333-4333-8333-333333333333"),
      photoId: PhotoId.make("photo-fresh"),
      thumbKey: ObjectKey.make("thumb-fresh"),
      contentDigest: "digest-fresh",
      takenAt: _now,
      uploadedAt: _now,
      staleClaimCutoff: new Date(_now.getTime() - repo.StalePendingClaimMs)
    }))
    expect(fresh.status).toBe("pending")
    // The stale claim stays retryable with its original digest.
    const retryStale = await _run(sqlite, repo.claimPhotoUpload({
      eventId: EventId.make(eventId),
      cameraId: camera.id,
      uploadId: UploadId.make("22222222-2222-4222-8222-222222222222"),
      photoId: PhotoId.make("photo-stale"),
      thumbKey: ObjectKey.make("thumb-stale"),
      contentDigest: "digest-stale",
      takenAt: staleAt,
      uploadedAt: staleAt,
      staleClaimCutoff: _now
    }))
    expect(retryStale.photo.id).toBe(PhotoId.make("photo-stale"))
    // With a slot consumed, the next upload hits the limit.
    await _run(sqlite, repo.completePhotoUpload(fresh.photo.id))
    const limited = await _run(sqlite, repo.claimPhotoUpload({
      eventId: EventId.make(eventId),
      cameraId: camera.id,
      uploadId: UploadId.make("44444444-4444-4444-8444-444444444444"),
      photoId: PhotoId.make("photo-late"),
      thumbKey: ObjectKey.make("thumb-late"),
      contentDigest: "digest-late",
      takenAt: _now,
      uploadedAt: _now,
      staleClaimCutoff: new Date(_now.getTime() - repo.StalePendingClaimMs)
    }).pipe(Effect.result))
    expect(Result.isFailure(limited)).toBe(true)
    if (Result.isFailure(limited)) {
      expect(limited.failure._tag).toBe("PhotoLimitReached")
    }
  })
})

describe("camera lifecycle", () => {
  test("resumes the same roll, refuses a full one, and mints a fresh roll after reset", async () => {
    const sqlite = _newDatabase()
    const { eventId } = await _createLiveEvent(sqlite, 1)
    const guestId = GuestId.make("guest-1")
    const first = await _run(sqlite, repo.createCamera(EventId.make(eventId), guestId, "Ada", _now))
    const resumed = await _run(sqlite, repo.createCamera(EventId.make(eventId), guestId, "Ada", _now))
    expect(resumed.id).toBe(first.id)
    await _run(sqlite, repo.claimPhotoUpload({
      eventId: EventId.make(eventId),
      cameraId: first.id,
      uploadId: UploadId.make("11111111-1111-4111-8111-111111111111"),
      photoId: PhotoId.make("photo-1"),
      thumbKey: ObjectKey.make("thumb-1"),
      contentDigest: "digest-a",
      takenAt: _now,
      uploadedAt: _now,
      staleClaimCutoff: new Date(_now.getTime() - repo.StalePendingClaimMs)
    }).pipe(Effect.flatMap((claim) => repo.completePhotoUpload(claim.photo.id))))
    const full = await _run(sqlite, repo.createCamera(EventId.make(eventId), guestId, "Ada", _now).pipe(Effect.result))
    expect(Result.isFailure(full)).toBe(true)
    if (Result.isFailure(full)) {
      expect(full.failure._tag).toBe("CameraLimitReached")
    }
    const reset = await _run(sqlite, repo.resetCamera(EventId.make(eventId), first.id, _now))
    expect(Option.isSome(reset)).toBe(true)
    const freshRoll = await _run(sqlite, repo.createCamera(EventId.make(eventId), guestId, "Ada", _now))
    expect(freshRoll.id).not.toBe(first.id)
    expect(freshRoll.usedCount).toBe(0)
  })
})

describe("download state machine", () => {
  test("claims builds exclusively and reclaims only stalled builds", async () => {
    const sqlite = _newDatabase()
    const { eventId } = await _createLiveEvent(sqlite, 3)
    expect(await _run(sqlite, repo.insertDownload(EventId.make(eventId), _now))).toBe(true)
    expect(await _run(sqlite, repo.insertDownload(EventId.make(eventId), _now))).toBe(false)
    // A fresh `building` row cannot be reclaimed while it is within the stall window.
    expect(
      await _run(sqlite, repo.beginDownloadBuild(EventId.make(eventId), _now, new Date(_now.getTime() + 1000)))
    ).toBe(false)
    // Once it stalls past the threshold (updatedAt older than the cutoff), a new build wins.
    const stalled = new Date(_now.getTime() + 1000)
    expect(
      await _run(sqlite, repo.beginDownloadBuild(EventId.make(eventId), stalled, new Date(_now.getTime() + 1000)))
    ).toBe(true)
    await _run(sqlite, repo.completeDownload(EventId.make(eventId), "downloads/e/zip", 1234, 2, _now))
    const row = await _run(sqlite, repo.getDownload(EventId.make(eventId)))
    expect(Option.isSome(row)).toBe(true)
    if (Option.isSome(row)) {
      expect(row.value.status).toBe("ready")
      expect(row.value.size).toBe(1234)
      expect(row.value.photoCount).toBe(2)
    }
    // A `ready` row can be reclaimed for a fresh build.
    expect(
      await _run(sqlite, repo.beginDownloadBuild(EventId.make(eventId), _now, new Date(_now.getTime() + 1000)))
    ).toBe(true)
    await _run(sqlite, repo.failDownload(EventId.make(eventId), _now))
    const failed = await _run(sqlite, repo.getDownload(EventId.make(eventId)))
    expect(Option.isSome(failed)).toBe(true)
    if (Option.isSome(failed)) {
      expect(failed.value.status).toBe("error")
    }
  })
})

describe("host sessions", () => {
  test("live sessions verify, and expiry or revocation invalidates them", async () => {
    const sqlite = _newDatabase()
    await _run(sqlite, repo.createHostSession("session-1", _now, new Date(_now.getTime() + 60_000)))
    expect(Option.isSome(await _run(sqlite, repo.getHostSession("session-1", _now)))).toBe(true)
    expect(
      Option.isSome(await _run(sqlite, repo.getHostSession("session-1", new Date(_now.getTime() + 61_000))))
    ).toBe(false)
    await _run(sqlite, repo.createHostSession("session-2", _now, new Date(_now.getTime() + 60_000)))
    await _run(sqlite, repo.revokeHostSession("session-2"))
    expect(Option.isSome(await _run(sqlite, repo.getHostSession("session-2", _now)))).toBe(false)
    await _run(sqlite, repo.purgeExpiredHostSessions(new Date(_now.getTime() + 61_000)))
    expect(Option.isSome(await _run(sqlite, repo.getHostSession("session-1", _now)))).toBe(false)
  })
})
