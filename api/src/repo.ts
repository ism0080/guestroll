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
import { PhotoLimitExceeded } from "@guestroll/domain"
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
  status: EventStatus,
  now: Date
): Effect.Effect<Option.Option<Event>, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    yield* _run(client`
      UPDATE events SET status = ${status}, updatedAt = ${now.toISOString()}
      WHERE id = ${id} AND ownerId = ${ownerId}`)
    const rows = yield* _run(client<EventRow>`
      SELECT ${client.literal(eventColumns)} FROM events
      WHERE id = ${id} AND ownerId = ${ownerId}`)
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

export interface PhotoReservation {
  readonly _tag: "PhotoReservation"
  readonly photoId: PhotoId
  readonly eventId: EventId
  readonly cameraId: CameraId
  readonly photoLimit: number
  readonly usedCount: UsedCount
}

export interface ExistingPhoto {
  readonly _tag: "ExistingPhoto"
  readonly photo: Photo
  readonly photoLimit: number
  readonly usedCount: UsedCount
}

/** Atomically validates an event camera and reserves one photo quota slot. */
export const reservePhotoSlot = (params: {
  readonly eventId: EventId
  readonly cameraId: CameraId
  readonly uploadId: UploadId
}): Effect.Effect<
  PhotoReservation | ExistingPhoto,
  EventNotFound | EventNotLive | CameraNotFound | PhotoLimitExceeded,
  Sql | import("./env.ts").WorkerEnv
> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const photoId = PhotoId.make(yield* randomId)
    const inspect = client<{
      readonly eventId: string
      readonly status: EventStatus
      readonly photoLimit: number
      readonly cameraId: string | null
      readonly usedCount: number | null
      readonly photoId: string | null
      readonly uploadId: string | null
      readonly objectKey: string | null
      readonly thumbKey: string | null
      readonly takenAt: string | null
      readonly uploadedAt: string | null
    }>`
      SELECT e.id AS eventId, e.status AS status, e.photoLimit AS photoLimit,
             c.id AS cameraId, c.usedCount AS usedCount,
             p.id AS photoId, p.uploadId AS uploadId, p.objectKey AS objectKey,
             p.thumbKey AS thumbKey, p.takenAt AS takenAt, p.uploadedAt AS uploadedAt
      FROM events e
      LEFT JOIN cameras c ON c.id = ${params.cameraId} AND c.eventId = e.id
      LEFT JOIN photos p ON p.eventId = e.id AND p.cameraId = c.id
        AND p.uploadId = ${params.uploadId}
      WHERE e.id = ${params.eventId}`
    const reserve = client<{ readonly usedCount: number }>`
      UPDATE cameras SET usedCount = usedCount + 1
      WHERE id = ${params.cameraId}
        AND eventId = ${params.eventId}
        AND NOT EXISTS (
          SELECT 1 FROM photos p
          WHERE p.eventId = ${params.eventId}
            AND p.cameraId = ${params.cameraId}
            AND p.uploadId = ${params.uploadId}
        )
        AND EXISTS (
          SELECT 1 FROM events e
          WHERE e.id = cameras.eventId
            AND e.status = 'live'
            AND cameras.usedCount < e.photoLimit
        )
      RETURNING usedCount AS usedCount`
    const [inspected, reserved] = yield* Effect.orDie(client.batch([inspect, reserve]))
    const state = inspected[0]
    if (state === undefined) return yield* new EventNotFound({ id: params.eventId })
    if (state.status !== "live") {
      return yield* new EventNotLive({ id: params.eventId, status: state.status })
    }
    if (state.cameraId === null) return yield* new CameraNotFound({ id: params.cameraId })
    if (state.photoId !== null && state.uploadId !== null && state.objectKey !== null &&
      state.thumbKey !== null && state.takenAt !== null && state.uploadedAt !== null) {
      return {
        _tag: "ExistingPhoto" as const,
        photo: new Photo({
          id: PhotoId.make(state.photoId),
          uploadId: UploadId.make(state.uploadId),
          eventId: params.eventId,
          cameraId: params.cameraId,
          objectKey: ObjectKey.make(state.objectKey),
          thumbKey: ObjectKey.make(state.thumbKey),
          takenAt: new Date(state.takenAt),
          uploadedAt: new Date(state.uploadedAt)
        }),
        photoLimit: state.photoLimit,
        usedCount: UsedCount.make(state.usedCount ?? 0)
      }
    }
    const result = reserved[0]
    if (result === undefined) {
      return yield* new PhotoLimitExceeded({
        limit: state.photoLimit,
        used: state.usedCount ?? state.photoLimit
      })
    }
    return {
      _tag: "PhotoReservation" as const,
      photoId,
      eventId: params.eventId,
      cameraId: params.cameraId,
      photoLimit: state.photoLimit,
      usedCount: UsedCount.make(result.usedCount)
    }
  })

/** Inserts the photo associated with an already acquired quota reservation. */
export const insertReservedPhoto = (params: {
  readonly reservation: PhotoReservation
  readonly uploadId: UploadId
  readonly objectKey: ObjectKey
  readonly thumbKey: ObjectKey
  readonly takenAt: Date
  readonly uploadedAt: Date
}): Effect.Effect<Photo, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const reservation = params.reservation
    yield* _run(client`
      INSERT INTO photos (id, uploadId, eventId, cameraId, objectKey, thumbKey, takenAt, uploadedAt)
      VALUES (${reservation.photoId}, ${params.uploadId}, ${reservation.eventId}, ${reservation.cameraId},
              ${params.objectKey}, ${params.thumbKey}, ${params.takenAt.toISOString()},
              ${params.uploadedAt.toISOString()})`)
    return new Photo({
      id: reservation.photoId,
      uploadId: params.uploadId,
      eventId: reservation.eventId,
      cameraId: reservation.cameraId,
      objectKey: params.objectKey,
      thumbKey: params.thumbKey,
      takenAt: params.takenAt,
      uploadedAt: params.uploadedAt
    })
  })

/** Removes a partial photo and releases exactly one previously reserved quota slot. */
export const compensatePhotoUpload = (
  reservation: PhotoReservation
): Effect.Effect<void, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    yield* Effect.orDie(client.batch([
      client`
        DELETE FROM photos
        WHERE id = ${reservation.photoId}
          AND eventId = ${reservation.eventId}
          AND cameraId = ${reservation.cameraId}`,
      client`
        UPDATE cameras SET usedCount = usedCount - 1
        WHERE id = ${reservation.cameraId}
          AND eventId = ${reservation.eventId}
          AND usedCount > 0`
    ]))
  })

export const listEventPhotos = (
  eventId: EventId,
  ownerId: OwnerId,
  limit: number,
  cursor: Option.Option<{ readonly uploadedAt: Date; readonly id: PhotoId }>
): Effect.Effect<ReadonlyArray<Photo>, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    type PhotoRow = {
      readonly id: string
      readonly uploadId: string
      readonly eventId: string
      readonly cameraId: string
      readonly objectKey: string
      readonly thumbKey: string
      readonly takenAt: string
      readonly uploadedAt: string
    }
    const rows = yield* Option.match(cursor, {
      onNone: () => _run(client<PhotoRow>`
        SELECT ${client.literal(`p.${photoColumns.replaceAll(", ", ", p.")}`)}
        FROM photos p JOIN events e ON e.id = p.eventId
        WHERE p.eventId = ${eventId} AND e.ownerId = ${ownerId}
        ORDER BY p.uploadedAt DESC, p.id DESC LIMIT ${limit}`),
      onSome: (value) => _run(client<PhotoRow>`
        SELECT ${client.literal(`p.${photoColumns.replaceAll(", ", ", p.")}`)}
        FROM photos p JOIN events e ON e.id = p.eventId
        WHERE p.eventId = ${eventId} AND e.ownerId = ${ownerId}
          AND (p.uploadedAt < ${value.uploadedAt.toISOString()}
            OR (p.uploadedAt = ${value.uploadedAt.toISOString()} AND p.id < ${value.id}))
        ORDER BY p.uploadedAt DESC, p.id DESC LIMIT ${limit}`)
    })
    return rows.map((row) =>
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
    )
  })

export const makeObjectKey = (
  eventId: EventId,
  cameraId: CameraId,
  suffix: string,
  extension: "jpg" | "png" | "webp"
): Effect.Effect<ObjectKey> =>
  Effect.succeed(ObjectKey.make(`${eventId}-${cameraId}-${suffix}.${extension}`))
