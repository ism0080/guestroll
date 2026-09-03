import { Effect, Option, Schema } from "effect"
import * as D1Client from "@effect/sql-d1/D1Client"
import type { Statement } from "effect/unstable/sql/Statement"
import {
  Camera,
  CameraId,
  Event,
  EventCreate,
  EventId,
  EventSlug,
  EventStatus,
  FilterPack,
  GuestId,
  HostCamera,
  HostPhoto,
  ObjectKey,
  OwnerId,
  Photo,
  PhotoId,
  UploadId,
  UsedCount
} from "@guestroll/contracts"
import { randomEventSlug, randomId } from "./ids.ts"

export class EventNotFound extends Schema.TaggedError<EventNotFound>()(
  "EventNotFound",
  { id: EventId }
) {}

export class EventNotLive extends Schema.TaggedError<EventNotLive>()(
  "EventNotLive",
  { id: EventId, status: EventStatus }
) {}

export class CameraNotFound extends Schema.TaggedError<CameraNotFound>()(
  "CameraNotFound",
  { id: CameraId }
) {}

export class PhotoLimitReached extends Schema.TaggedError<PhotoLimitReached>()(
  "PhotoLimitReached",
  {}
) {}

export class CameraLimitReached extends Schema.TaggedError<CameraLimitReached>()(
  "CameraLimitReached",
  {}
) {}

export class UploadContentMismatch extends Schema.TaggedError<UploadContentMismatch>()(
  "UploadContentMismatch",
  {}
) {}

type Sql = D1Client.D1Client

const _run = <A>(statement: Statement<A>): Effect.Effect<ReadonlyArray<A>, never, Sql> =>
  Effect.orDie(statement)

interface EventRow {
  readonly id: string
  readonly ownerId: string
  readonly slug: string
  readonly title: string
  readonly coverKey: string | null
  readonly filterPack: string
  readonly photoLimit: number
  readonly status: EventStatus
  readonly createdAt: string
  readonly updatedAt: string
}

const eventColumns = `id, ownerId, slug, title, coverKey, filterPack, photoLimit, status, createdAt, updatedAt`
const photoColumns = `id, uploadId, eventId, cameraId, objectKey, thumbKey, filterPack, takenAt, uploadedAt`

interface PhotoRow {
  readonly id: string
  readonly uploadId: string
  readonly eventId: string
  readonly cameraId: string
  readonly objectKey: string
  readonly thumbKey: string
  readonly filterPack: string | null
  readonly takenAt: string
  readonly uploadedAt: string
}

const _toEvent = (row: EventRow): Event =>
  new Event({
    id: EventId.make(row.id),
    ownerId: OwnerId.make(row.ownerId),
    slug: EventSlug.make(row.slug),
    title: row.title,
    coverKey: row.coverKey === null ? undefined : ObjectKey.make(row.coverKey),
    filterPack: FilterPack.make(row.filterPack),
    photoLimit: row.photoLimit,
    status: row.status,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt)
  })

interface HostPhotoRow extends PhotoRow {
  readonly guestName: string | null
}

const _toHostPhoto = (row: HostPhotoRow): HostPhoto =>
  new HostPhoto({
    id: PhotoId.make(row.id),
    uploadId: UploadId.make(row.uploadId),
    eventId: EventId.make(row.eventId),
    cameraId: CameraId.make(row.cameraId),
    guestName: row.guestName ?? undefined,
    objectKey: ObjectKey.make(row.objectKey),
    thumbKey: ObjectKey.make(row.thumbKey),
    filterPack: row.filterPack ?? "film",
    takenAt: new Date(row.takenAt),
    uploadedAt: new Date(row.uploadedAt)
  })

export const getEventBySlug = (
  slug: EventSlug
): Effect.Effect<Option.Option<Event>, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const rows = yield* _run(client<EventRow>`
      SELECT ${client.literal(eventColumns)}
      FROM events WHERE slug = ${slug}`)
    return Option.fromNullishOr(rows[0]).pipe(Option.map(_toEvent))
  })

export const getEventById = (id: EventId): Effect.Effect<Option.Option<Event>, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const rows = yield* _run(client<EventRow>`
      SELECT ${client.literal(eventColumns)}
      FROM events WHERE id = ${id}`)
    return Option.fromNullishOr(rows[0]).pipe(Option.map(_toEvent))
  })

export const getOwnedEventBySlug = (
  slug: EventSlug,
  ownerId: OwnerId
): Effect.Effect<Option.Option<Event>, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const rows = yield* _run(client<EventRow>`
      SELECT ${client.literal(eventColumns)}
      FROM events WHERE slug = ${slug} AND ownerId = ${ownerId}`)
    return Option.fromNullishOr(rows[0]).pipe(Option.map(_toEvent))
  })

export const listEvents = (
  ownerId: OwnerId
): Effect.Effect<ReadonlyArray<Event>, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const rows = yield* _run(client<EventRow>`
      SELECT ${client.literal(eventColumns)}
      FROM events WHERE ownerId = ${ownerId} ORDER BY createdAt DESC`)
    return rows.map(_toEvent)
  })

export const createEvent = (
  input: EventCreate,
  ownerId: OwnerId,
  now: Date
): Effect.Effect<Event, never, Sql | import("./env.ts").WorkerEnv> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const event = new Event({
        id: EventId.make(yield* randomId),
        ownerId,
        slug: yield* randomEventSlug,
        title: input.title,
        filterPack: input.filterPack,
        photoLimit: input.photoLimit,
        status: "draft",
        createdAt: now,
        updatedAt: now
      })
      const inserted = yield* _run(client<{ readonly id: string }>`
        INSERT OR IGNORE INTO events (id, ownerId, slug, title, filterPack, photoLimit, status, createdAt, updatedAt)
        VALUES (${event.id}, ${event.ownerId}, ${event.slug}, ${event.title}, ${event.filterPack}, ${event.photoLimit}, ${event.status}, ${event.createdAt.toISOString()}, ${event.updatedAt.toISOString()})
        RETURNING id AS id`)
      if (inserted[0] !== undefined) return event
    }
    return yield* Effect.die("Guestroll event identifier allocation failed after three attempts")
  })

export const updateEventStatus = (
  id: EventId,
  ownerId: OwnerId,
  expectedStatus: EventStatus,
  status: EventStatus,
  now: Date
): Effect.Effect<Option.Option<Event>, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const rows = yield* _run(client<EventRow>`
      UPDATE events SET status = ${status}, updatedAt = ${now.toISOString()}
      WHERE id = ${id} AND ownerId = ${ownerId} AND status = ${expectedStatus}
      RETURNING ${client.literal(eventColumns)}`)
    return Option.fromNullishOr(rows[0]).pipe(Option.map(_toEvent))
  })

export const updateEventTitle = (
  id: EventId,
  ownerId: OwnerId,
  title: string,
  now: Date
): Effect.Effect<Option.Option<Event>, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const rows = yield* _run(client<EventRow>`
      UPDATE events SET title = ${title}, updatedAt = ${now.toISOString()}
      WHERE id = ${id} AND ownerId = ${ownerId}
      RETURNING ${client.literal(eventColumns)}`)
    return Option.fromNullishOr(rows[0]).pipe(Option.map(_toEvent))
  })

export const updateEventPhotoLimit = (
  id: EventId,
  ownerId: OwnerId,
  photoLimit: number,
  now: Date
): Effect.Effect<Option.Option<Event>, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const rows = yield* _run(client<EventRow>`
      UPDATE events SET photoLimit = ${photoLimit}, updatedAt = ${now.toISOString()}
      WHERE id = ${id} AND ownerId = ${ownerId}
      RETURNING ${client.literal(eventColumns)}`)
    return Option.fromNullishOr(rows[0]).pipe(Option.map(_toEvent))
  })

interface CameraRow {
  readonly id: string
  readonly eventId: string
  readonly guestName: string | null
  readonly usedCount: number
  readonly createdAt: string
}

const _toCamera = (row: CameraRow): Camera =>
  new Camera({
    id: CameraId.make(row.id),
    eventId: EventId.make(row.eventId),
    guestName: row.guestName ?? undefined,
    usedCount: row.usedCount,
    createdAt: new Date(row.createdAt)
  })

export const getCamera = (id: CameraId): Effect.Effect<Option.Option<Camera>, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const rows = yield* _run(client<CameraRow>`
      SELECT id, eventId, guestName, usedCount, createdAt
      FROM cameras WHERE id = ${id}`)
    return Option.map(Option.fromNullishOr(rows[0]), _toCamera)
  })

/**
 * Creates the guest's camera for an event, or resumes their existing active
 * roll. A guest (identified by the per-device `guestId`) has at most one
 * active camera per event: creating again while one exists returns it (so a
 * reload resumes the same roll), and an active roll that is full refuses a
 * new one with `CameraLimitReached`. A host reset (`resetCamera`) marks the
 * roll as superseded, after which the next `createCamera` starts a fresh
 * roll. The `INSERT … WHERE NOT EXISTS (active roll)` guard keeps concurrent
 * creates race-safe.
 */
export const createCamera = (
  eventId: EventId,
  guestId: GuestId,
  guestName: string,
  now: Date
): Effect.Effect<Camera, CameraLimitReached, Sql | import("./env.ts").WorkerEnv> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const id = yield* randomId
    const camera = new Camera({
      id: CameraId.make(id),
      eventId,
      guestName,
      usedCount: 0,
      createdAt: now
    })
    const inserted = yield* _run(client<{ readonly id: string }>`
      INSERT INTO cameras (id, eventId, guestId, guestName, usedCount, createdAt)
      SELECT ${camera.id}, ${camera.eventId}, ${guestId}, ${guestName}, ${camera.usedCount}, ${camera.createdAt.toISOString()}
      WHERE NOT EXISTS (
        SELECT 1 FROM cameras WHERE eventId = ${eventId} AND guestId = ${guestId} AND resetAt IS NULL
      )
      RETURNING id AS id`)
    if (inserted[0] !== undefined) return camera
    const rows = yield* _run(client<CameraRow & { readonly photoLimit: number }>`
      SELECT c.id, c.eventId, c.guestName, c.usedCount, c.createdAt, e.photoLimit
      FROM cameras c JOIN events e ON e.id = c.eventId
      WHERE c.eventId = ${eventId} AND c.guestId = ${guestId} AND c.resetAt IS NULL
      ORDER BY c.createdAt DESC, c.id DESC LIMIT 1`)
    const row = Option.fromNullishOr(rows[0])
    if (Option.isNone(row)) return yield* Effect.die("Guest camera claim lost after guarded insert")
    if (row.value.usedCount >= row.value.photoLimit) return yield* new CameraLimitReached()
    return _toCamera(row.value)
  })

interface HostCameraRow {
  readonly id: string
  readonly guestName: string | null
  readonly usedCount: number
  readonly photoLimit: number
  readonly resetAt: string | null
  readonly createdAt: string
}

const _toHostCamera = (row: HostCameraRow): HostCamera =>
  new HostCamera({
    id: CameraId.make(row.id),
    guestName: row.guestName ?? undefined,
    usedCount: row.usedCount,
    photoLimit: row.photoLimit,
    resetAt: row.resetAt === null ? undefined : new Date(row.resetAt),
    createdAt: new Date(row.createdAt)
  })

/** Every guest roll on an event, newest first, for the host dashboard. */
export const listEventCameras = (
  eventId: EventId,
  ownerId: OwnerId
): Effect.Effect<ReadonlyArray<HostCamera>, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const rows = yield* _run(client<HostCameraRow>`
      SELECT c.id, c.guestName, c.usedCount, e.photoLimit, c.resetAt, c.createdAt
      FROM cameras c JOIN events e ON e.id = c.eventId
      WHERE c.eventId = ${eventId} AND e.ownerId = ${ownerId}
      ORDER BY c.createdAt DESC, c.id DESC`)
    return rows.map(_toHostCamera)
  })

/**
 * Marks a guest's roll as reset so their device can start a fresh roll. The
 * camera (and the photos taken on it) stay in the event; only its active
 * status is cleared. Returns `None` when the camera isn't part of the event.
 */
export const resetCamera = (
  eventId: EventId,
  cameraId: CameraId,
  now: Date
): Effect.Effect<Option.Option<HostCamera>, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const updated = yield* _run(client<{ readonly id: string }>`
      UPDATE cameras SET resetAt = ${now.toISOString()}
      WHERE id = ${cameraId} AND eventId = ${eventId}
      RETURNING id AS id`)
    if (updated[0] === undefined) return Option.none()
    const rows = yield* _run(client<HostCameraRow>`
      SELECT c.id, c.guestName, c.usedCount, e.photoLimit, c.resetAt, c.createdAt
      FROM cameras c JOIN events e ON e.id = c.eventId
      WHERE c.id = ${cameraId} AND c.eventId = ${eventId}`)
    return Option.map(Option.fromNullishOr(rows[0]), _toHostCamera)
  })

export interface ClaimedPhoto {
  readonly photo: Photo
  readonly photoLimit: number
  readonly usedCount: UsedCount
  readonly status: "pending" | "uploaded"
  readonly contentDigest: string | null
}

/**
 * Atomically claims an upload id while enforcing the per-camera photo limit.
 * Pending claims are intentionally retained: an interrupted R2 write can be
 * retried safely with the same upload ID and cannot be reclaimed by a delayed
 * request holding the original claim.
 */
export const claimPhotoUpload = (params: {
  readonly eventId: EventId
  readonly cameraId: CameraId
  readonly uploadId: UploadId
  readonly photoId: PhotoId
  readonly contentDigest: string
  readonly takenAt: Date
  readonly uploadedAt: Date
}): Effect.Effect<ClaimedPhoto, CameraNotFound | EventNotLive | PhotoLimitReached | UploadContentMismatch, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const cameraRows = yield* _run(client<{ readonly status: EventStatus; readonly photoLimit: number; readonly filterPack: string }>`
      SELECT e.status, e.photoLimit, e.filterPack FROM cameras c JOIN events e ON e.id = c.eventId
      WHERE c.id = ${params.cameraId} AND c.eventId = ${params.eventId}`)
    const camera = cameraRows[0]
    if (camera === undefined) return yield* new CameraNotFound({ id: params.cameraId })
    if (camera.status !== "live") return yield* new EventNotLive({ id: params.eventId, status: camera.status })

    const objectKey = ObjectKey.make(`${params.eventId}-${params.cameraId}-${params.uploadId}`)
    yield* _run(client`
      INSERT OR IGNORE INTO photos (id, uploadId, eventId, cameraId, objectKey, thumbKey, filterPack, contentDigest, takenAt, uploadedAt, status)
      SELECT ${params.photoId}, ${params.uploadId}, ${params.eventId}, ${params.cameraId}, ${objectKey}, ${objectKey},
        ${camera.filterPack}, ${params.contentDigest}, ${params.takenAt.toISOString()}, ${params.uploadedAt.toISOString()}, 'pending'
      WHERE EXISTS (SELECT 1 FROM events WHERE id = ${params.eventId} AND status = 'live')
        AND (SELECT COUNT(*) FROM photos WHERE eventId = ${params.eventId} AND cameraId = ${params.cameraId})
          < ${camera.photoLimit}
      `)
    const claim = yield* getClaimedPhoto(params.eventId, params.cameraId, params.uploadId)
    if (Option.isNone(claim)) return yield* new PhotoLimitReached()
    if (claim.value.contentDigest !== null && claim.value.contentDigest !== params.contentDigest) {
      return yield* new UploadContentMismatch()
    }
    yield* _run(client`
      UPDATE cameras SET usedCount = (SELECT COUNT(*) FROM photos WHERE eventId = ${params.eventId} AND cameraId = ${params.cameraId})
      WHERE id = ${params.cameraId} AND eventId = ${params.eventId}`)
    return claim.value
  })

export const getClaimedPhoto = (eventId: EventId, cameraId: CameraId, uploadId: UploadId): Effect.Effect<Option.Option<ClaimedPhoto>, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const rows = yield* _run(client<{
      readonly id: string; readonly objectKey: string; readonly thumbKey: string; readonly filterPack: string | null; readonly takenAt: string; readonly uploadedAt: string; readonly status: "pending" | "uploaded"; readonly contentDigest: string | null
    }>`SELECT id, objectKey, thumbKey, filterPack, takenAt, uploadedAt, status, contentDigest FROM photos
      WHERE eventId = ${eventId} AND cameraId = ${cameraId} AND uploadId = ${uploadId}`)
    const row = rows[0]
    if (row === undefined) return Option.none()
    const counts = yield* _run(client<{ readonly usedCount: number; readonly photoLimit: number }>`
      SELECT (SELECT COUNT(*) FROM photos WHERE eventId = ${eventId} AND cameraId = ${cameraId}) AS usedCount, e.photoLimit
      FROM cameras c JOIN events e ON e.id = c.eventId
      WHERE c.id = ${cameraId} AND c.eventId = ${eventId}`)
    const count = counts[0]
    if (count === undefined) return Option.none()
    return Option.some({ photo: new Photo({ id: PhotoId.make(row.id), uploadId, eventId, cameraId,
      objectKey: ObjectKey.make(row.objectKey), thumbKey: ObjectKey.make(row.thumbKey), filterPack: FilterPack.make(row.filterPack ?? "film"), takenAt: new Date(row.takenAt), uploadedAt: new Date(row.uploadedAt) }),
       photoLimit: count.photoLimit, usedCount: UsedCount.make(count.usedCount), status: row.status, contentDigest: row.contentDigest })
  })

/** Marks the durable claim uploaded. Repeating this update is intentionally harmless. */
export const completePhotoUpload = (id: PhotoId): Effect.Effect<void, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    yield* _run(client`UPDATE photos SET status = 'uploaded' WHERE id = ${id}`)
  })

export const listEventPhotos = (
  eventId: EventId,
  ownerId: OwnerId,
  limit: number,
  cursor: Option.Option<{ readonly uploadedAt: Date; readonly id: PhotoId }>
): Effect.Effect<ReadonlyArray<HostPhoto>, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const columns = client.literal(`p.${photoColumns.replaceAll(", ", ", p.")}, c.guestName AS guestName`)
    const rows = yield* Option.match(cursor, {
      onNone: () => _run(client<HostPhotoRow>`
        SELECT ${columns}
        FROM photos p JOIN events e ON e.id = p.eventId JOIN cameras c ON c.id = p.cameraId
        WHERE p.eventId = ${eventId} AND e.ownerId = ${ownerId} AND p.status = 'uploaded'
        ORDER BY p.uploadedAt DESC, p.id DESC LIMIT ${limit}`),
      onSome: (value) => _run(client<HostPhotoRow>`
        SELECT ${columns}
        FROM photos p JOIN events e ON e.id = p.eventId JOIN cameras c ON c.id = p.cameraId
        WHERE p.eventId = ${eventId} AND e.ownerId = ${ownerId} AND p.status = 'uploaded'
          AND (p.uploadedAt < ${value.uploadedAt.toISOString()}
            OR (p.uploadedAt = ${value.uploadedAt.toISOString()} AND p.id < ${value.id}))
        ORDER BY p.uploadedAt DESC, p.id DESC LIMIT ${limit}`)
    })
    return rows.map(_toHostPhoto)
  })

/** Fetches one uploaded photo owned by the caller, scoped to an event. */
export const getEventPhoto = (
  eventId: EventId,
  photoId: PhotoId,
  ownerId: OwnerId
): Effect.Effect<Option.Option<HostPhoto>, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const rows = yield* _run(client<HostPhotoRow>`
      SELECT ${client.literal(`p.${photoColumns.replaceAll(", ", ", p.")}, c.guestName AS guestName`)}
      FROM photos p JOIN events e ON e.id = p.eventId JOIN cameras c ON c.id = p.cameraId
      WHERE p.id = ${photoId} AND p.eventId = ${eventId} AND e.ownerId = ${ownerId} AND p.status = 'uploaded'`)
    return Option.map(Option.fromNullishOr(rows[0]), _toHostPhoto)
  })

/** Every uploaded photo for an event, oldest first (ZIP build input). */
export const listUploadedPhotos = (
  eventId: EventId
): Effect.Effect<ReadonlyArray<Photo>, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const rows = yield* _run(client<PhotoRow>`
      SELECT ${client.literal(`p.${photoColumns.replaceAll(", ", ", p.")}`)}
      FROM photos p
      WHERE p.eventId = ${eventId} AND p.status = 'uploaded'
      ORDER BY p.uploadedAt ASC, p.id ASC`)
    return rows.map(
      (row) =>
        new Photo({
          id: PhotoId.make(row.id),
          uploadId: UploadId.make(row.uploadId),
          eventId: EventId.make(row.eventId),
          cameraId: CameraId.make(row.cameraId),
          objectKey: ObjectKey.make(row.objectKey),
          thumbKey: ObjectKey.make(row.thumbKey),
          filterPack: FilterPack.make(row.filterPack ?? "film"),
          takenAt: new Date(row.takenAt),
          uploadedAt: new Date(row.uploadedAt)
        })
    )
  })

export type DownloadState = "building" | "ready" | "error"

export interface DownloadRow {
  readonly eventId: string
  readonly status: DownloadState
  readonly objectKey: string | null
  readonly photoCount: number
  readonly size: number | null
  readonly updatedAt: string
}

export const getDownload = (
  eventId: EventId
): Effect.Effect<Option.Option<DownloadRow>, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const rows = yield* _run(client<DownloadRow>`
      SELECT eventId, status, objectKey, photoCount, size, updatedAt
      FROM downloads WHERE eventId = ${eventId}`)
    return Option.fromNullishOr(rows[0])
  })

/** Number of uploaded photos currently in the event (ZIP staleness check). */
export const countUploadedPhotos = (eventId: EventId): Effect.Effect<number, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const rows = yield* _run(client<{ readonly count: number }>`
      SELECT COUNT(*) AS count FROM photos WHERE eventId = ${eventId} AND status = 'uploaded'`)
    return rows[0]?.count ?? 0
  })

/** Claims a fresh `building` row. True only for the request that won the race. */
export const insertDownload = (
  eventId: EventId,
  now: Date
): Effect.Effect<boolean, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const rows = yield* _run(client<{ readonly eventId: string }>`
      INSERT OR IGNORE INTO downloads (eventId, status, objectKey, photoCount, size, updatedAt)
      VALUES (${eventId}, 'building', NULL, 0, NULL, ${now.toISOString()})
      RETURNING eventId AS eventId`)
    return rows[0] !== undefined
  })

/**
 * Reclaims a non-building row (or a `building` row that has stalled past the
 * threshold) for a new build. True only for the request that won the race.
 */
export const beginDownloadBuild = (
  eventId: EventId,
  stallThreshold: Date,
  now: Date
): Effect.Effect<boolean, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const rows = yield* _run(client<{ readonly eventId: string }>`
      UPDATE downloads SET status = 'building', updatedAt = ${now.toISOString()}
      WHERE eventId = ${eventId}
        AND (status IN ('ready', 'error')
          OR (status = 'building' AND updatedAt < ${stallThreshold.toISOString()}))
      RETURNING eventId AS eventId`)
    return rows[0] !== undefined
  })

export const completeDownload = (
  eventId: EventId,
  objectKey: string,
  size: number,
  photoCount: number,
  now: Date
): Effect.Effect<void, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    yield* _run(client`
      UPDATE downloads SET status = 'ready', objectKey = ${objectKey}, size = ${size},
        photoCount = ${photoCount}, updatedAt = ${now.toISOString()}
      WHERE eventId = ${eventId}`)
  })

export const failDownload = (eventId: EventId, now: Date): Effect.Effect<void, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    yield* _run(client`
      UPDATE downloads SET status = 'error', updatedAt = ${now.toISOString()}
      WHERE eventId = ${eventId}`)
  })

export interface EventCleanupKeys {
  readonly photoKeys: ReadonlyArray<string>
  readonly downloadKey: string | null
}

/**
 * Permanently deletes an owned event and all of its data: photos, cameras,
 * and the download row. Returns the R2 object keys that were associated with
 * the event so the caller can remove the photo bytes and any ZIP archive.
 * D1 and R2 cannot share a transaction, so the database is the source of
 * truth: rows are removed first and object deletion is best-effort after.
 */
export const deleteEvent = (
  eventId: EventId,
  ownerId: OwnerId
): Effect.Effect<Option.Option<EventCleanupKeys>, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const owned = yield* _run(client<{ readonly id: string }>`
      SELECT id FROM events WHERE id = ${eventId} AND ownerId = ${ownerId}`)
    if (owned[0] === undefined) return Option.none()

    const photos = yield* _run(client<{ readonly objectKey: string; readonly thumbKey: string }>`
      SELECT objectKey, thumbKey FROM photos WHERE eventId = ${eventId}`)
    const download = yield* _run(client<{ readonly objectKey: string | null }>`
      SELECT objectKey FROM downloads WHERE eventId = ${eventId}`)

    yield* _run(client`DELETE FROM photos WHERE eventId = ${eventId}`)
    yield* _run(client`DELETE FROM cameras WHERE eventId = ${eventId}`)
    yield* _run(client`DELETE FROM downloads WHERE eventId = ${eventId}`)
    yield* _run(client`DELETE FROM events WHERE id = ${eventId} AND ownerId = ${ownerId}`)

    return Option.some({
      photoKeys: photos.flatMap((row) => [row.objectKey, row.thumbKey]),
      downloadKey: download[0]?.objectKey ?? null
    })
  })
