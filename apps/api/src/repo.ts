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
const photoColumns = `id, uploadId, eventId, cameraId, objectKey, thumbKey, takenAt, uploadedAt`

interface PhotoRow {
  readonly id: string
  readonly uploadId: string
  readonly eventId: string
  readonly cameraId: string
  readonly objectKey: string
  readonly thumbKey: string
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

const _toPhoto = (row: PhotoRow): Photo =>
  new Photo({
    id: PhotoId.make(row.id),
    uploadId: UploadId.make(row.uploadId),
    eventId: EventId.make(row.eventId),
    cameraId: CameraId.make(row.cameraId),
    objectKey: ObjectKey.make(row.objectKey),
    thumbKey: ObjectKey.make(row.thumbKey),
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

export const getCamera = (id: CameraId): Effect.Effect<Option.Option<Camera>, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const rows = yield* _run(client<{
      readonly id: string
      readonly eventId: string
      readonly guestName: string | null
      readonly usedCount: number
      readonly createdAt: string
    }>`
      SELECT id, eventId, guestName, usedCount, createdAt
      FROM cameras WHERE id = ${id}`)
    return Option.map(Option.fromNullishOr(rows[0]), (row) =>
      new Camera({
        id: CameraId.make(row.id),
        eventId: EventId.make(row.eventId),
        guestName: row.guestName ?? undefined,
        usedCount: row.usedCount,
        createdAt: new Date(row.createdAt)
      })
    )
  })

export const createCamera = (
  eventId: EventId,
  guestName: Option.Option<string>,
  now: Date
): Effect.Effect<Camera, never, Sql | import("./env.ts").WorkerEnv> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const id = yield* randomId
    const camera = new Camera({
      id: CameraId.make(id),
      eventId,
      guestName: Option.getOrUndefined(guestName),
      usedCount: 0,
      createdAt: now
    })
    yield* _run(client`
      INSERT INTO cameras (id, eventId, guestName, usedCount, createdAt)
      VALUES (${camera.id}, ${camera.eventId}, ${camera.guestName}, ${camera.usedCount}, ${camera.createdAt.toISOString()})`)
    return camera
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
    const cameraRows = yield* _run(client<{ readonly status: EventStatus; readonly photoLimit: number }>`
      SELECT e.status, e.photoLimit FROM cameras c JOIN events e ON e.id = c.eventId
      WHERE c.id = ${params.cameraId} AND c.eventId = ${params.eventId}`)
    const camera = cameraRows[0]
    if (camera === undefined) return yield* new CameraNotFound({ id: params.cameraId })
    if (camera.status !== "live") return yield* new EventNotLive({ id: params.eventId, status: camera.status })

    const objectKey = ObjectKey.make(`${params.eventId}-${params.cameraId}-${params.uploadId}`)
    yield* _run(client`
      INSERT OR IGNORE INTO photos (id, uploadId, eventId, cameraId, objectKey, thumbKey, contentDigest, takenAt, uploadedAt, status)
      SELECT ${params.photoId}, ${params.uploadId}, ${params.eventId}, ${params.cameraId}, ${objectKey}, ${objectKey},
        ${params.contentDigest}, ${params.takenAt.toISOString()}, ${params.uploadedAt.toISOString()}, 'pending'
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
      readonly id: string; readonly objectKey: string; readonly thumbKey: string; readonly takenAt: string; readonly uploadedAt: string; readonly status: "pending" | "uploaded"; readonly contentDigest: string | null
    }>`SELECT id, objectKey, thumbKey, takenAt, uploadedAt, status, contentDigest FROM photos
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
      objectKey: ObjectKey.make(row.objectKey), thumbKey: ObjectKey.make(row.thumbKey), takenAt: new Date(row.takenAt), uploadedAt: new Date(row.uploadedAt) }),
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
): Effect.Effect<ReadonlyArray<Photo>, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const rows = yield* Option.match(cursor, {
      onNone: () => _run(client<PhotoRow>`
        SELECT ${client.literal(`p.${photoColumns.replaceAll(", ", ", p.")}`)}
        FROM photos p JOIN events e ON e.id = p.eventId
        WHERE p.eventId = ${eventId} AND e.ownerId = ${ownerId} AND p.status = 'uploaded'
        ORDER BY p.uploadedAt DESC, p.id DESC LIMIT ${limit}`),
      onSome: (value) => _run(client<PhotoRow>`
        SELECT ${client.literal(`p.${photoColumns.replaceAll(", ", ", p.")}`)}
        FROM photos p JOIN events e ON e.id = p.eventId
        WHERE p.eventId = ${eventId} AND e.ownerId = ${ownerId} AND p.status = 'uploaded'
          AND (p.uploadedAt < ${value.uploadedAt.toISOString()}
            OR (p.uploadedAt = ${value.uploadedAt.toISOString()} AND p.id < ${value.id}))
        ORDER BY p.uploadedAt DESC, p.id DESC LIMIT ${limit}`)
    })
    return rows.map(_toPhoto)
  })

/** Fetches one uploaded photo owned by the caller, scoped to an event. */
export const getEventPhoto = (
  eventId: EventId,
  photoId: PhotoId,
  ownerId: OwnerId
): Effect.Effect<Option.Option<Photo>, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const rows = yield* _run(client<PhotoRow>`
      SELECT ${client.literal(`p.${photoColumns.replaceAll(", ", ", p.")}`)}
      FROM photos p JOIN events e ON e.id = p.eventId
      WHERE p.id = ${photoId} AND p.eventId = ${eventId} AND e.ownerId = ${ownerId} AND p.status = 'uploaded'`)
    return Option.map(Option.fromNullishOr(rows[0]), _toPhoto)
  })
