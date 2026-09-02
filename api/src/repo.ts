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
  UsedCount
} from "@guestroll/contracts"
import { PhotoLimitExceeded } from "@guestroll/domain"
import { randomId } from "./ids.ts"

export class EventNotFound extends Schema.TaggedError<EventNotFound>()(
  "EventNotFound",
  { slug: Schema.String }
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
  readonly filterPack: string
  readonly photoLimit: number
  readonly status: EventStatus
  readonly createdAt: string
  readonly updatedAt: string
}

const eventColumns = `id, ownerId, slug, title, filterPack, photoLimit, status, createdAt, updatedAt`
const photoColumns = `id, eventId, cameraId, objectKey, thumbKey, takenAt`

const _toEvent = (row: EventRow): Event =>
  new Event({
    id: EventId.make(row.id),
    ownerId: OwnerId.make(row.ownerId),
    slug: EventSlug.make(row.slug),
    title: row.title,
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
): Effect.Effect<Event, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const id = yield* randomId
    const slug = yield* randomId
    const event = new Event({
      id: EventId.make(id),
      ownerId,
      slug: EventSlug.make(slug),
      title: input.title,
      filterPack: input.filterPack,
      photoLimit: input.photoLimit,
      status: "draft",
      createdAt: now,
      updatedAt: now
    })
    yield* _run(client`
      INSERT INTO events (id, ownerId, slug, title, filterPack, photoLimit, status, createdAt, updatedAt)
      VALUES (${event.id}, ${event.ownerId}, ${event.slug}, ${event.title}, ${event.filterPack}, ${event.photoLimit}, ${event.status}, ${event.createdAt.toISOString()}, ${event.updatedAt.toISOString()})`)
    return event
  })

export const updateEventStatus = (
  id: EventId,
  status: EventStatus,
  now: Date
): Effect.Effect<Option.Option<Event>, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    yield* _run(client`
      UPDATE events SET status = ${status}, updatedAt = ${now.toISOString()}
      WHERE id = ${id}`)
    return yield* getEventById(id)
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
): Effect.Effect<Camera, never, Sql> =>
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

/**
 * Atomically enforces the per-camera photo limit, inserts the photo, and
 * increments the camera's usedCount in a single D1 `batch`.
 */
export const uploadPhoto = (params: {
  readonly eventId: EventId
  readonly cameraId: CameraId
  readonly objectKey: ObjectKey
  readonly thumbKey: ObjectKey
  readonly takenAt: Date
}): Effect.Effect<
  { readonly photo: Photo; readonly usedCount: UsedCount },
  EventNotFound | CameraNotFound | PhotoLimitExceeded,
  Sql
> =>
  Effect.gen(function* () {
    const eventOpt = yield* getEventById(params.eventId)
    if (Option.isNone(eventOpt)) {
      return yield* Effect.fail(new EventNotFound({ slug: "" }))
    }
    const cameraOpt = yield* getCamera(params.cameraId)
    if (Option.isNone(cameraOpt)) {
      return yield* Effect.fail(new CameraNotFound({ id: params.cameraId }))
    }

    const client = yield* D1Client.D1Client
    const id = yield* randomId
    const takenAtIso = params.takenAt.toISOString()

    const insert = client<{ readonly id: string }>`
      INSERT INTO photos (id, eventId, cameraId, objectKey, thumbKey, takenAt)
      SELECT ${id}, ${params.eventId}, ${params.cameraId}, ${params.objectKey}, ${params.thumbKey},
             ${takenAtIso}
      FROM cameras c
      JOIN events e ON e.id = c.eventId
      WHERE c.id = ${params.cameraId}
        AND c.usedCount < e.photoLimit
      RETURNING id AS "id"`

    const increment = client`
      UPDATE cameras SET usedCount = usedCount + 1
      WHERE id = ${params.cameraId}
        AND usedCount < (SELECT photoLimit FROM events WHERE id = ${params.eventId})`

    const [inserted] = yield* Effect.orDie(client.batch([insert, increment]))

    const row = inserted[0]
    if (row === undefined) {
      return yield* Effect.fail(
        new PhotoLimitExceeded({
          limit: eventOpt.value.photoLimit,
          used: cameraOpt.value.usedCount
        })
      )
    }

    const photo = new Photo({
      id: PhotoId.make(row.id),
      eventId: params.eventId,
      cameraId: params.cameraId,
      objectKey: params.objectKey,
      thumbKey: params.thumbKey,
      takenAt: params.takenAt
    })
    return { photo, usedCount: cameraOpt.value.usedCount + 1 }
  })

export const listEventPhotos = (
  eventId: EventId
): Effect.Effect<ReadonlyArray<Photo>, never, Sql> =>
  Effect.gen(function* () {
    const client = yield* D1Client.D1Client
    const rows = yield* _run(client<{
      readonly id: string
      readonly eventId: string
      readonly cameraId: string
      readonly objectKey: string
      readonly thumbKey: string
      readonly takenAt: string
    }>`
      SELECT ${client.literal(photoColumns)}
      FROM photos WHERE eventId = ${eventId}
      ORDER BY takenAt DESC`)
    return rows.map((row) =>
      new Photo({
        id: PhotoId.make(row.id),
        eventId: EventId.make(row.eventId),
        cameraId: CameraId.make(row.cameraId),
        objectKey: ObjectKey.make(row.objectKey),
        thumbKey: ObjectKey.make(row.thumbKey),
        takenAt: new Date(row.takenAt)
      })
    )
  })

export const makeObjectKey = (
  eventId: EventId,
  cameraId: CameraId,
  suffix: string
): Effect.Effect<ObjectKey> =>
  Effect.succeed(ObjectKey.make(`${eventId}-${cameraId}-${suffix}.jpg`))
