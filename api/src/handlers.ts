import { Clock, Effect, Option, Result, Schema } from "effect"
import * as Stream from "effect/Stream"
import * as D1Client from "@effect/sql-d1/D1Client"
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder"
import { HttpApiError } from "effect/unstable/httpapi"
import * as Multipart from "effect/unstable/http/Multipart"
import {
  CameraCreateResult,
  CameraId,
  Event,
  EventPublic,
  EventSlug,
  HostPhoto,
  Photo,
  UploadResult
} from "@guestroll/contracts"
import { transitionEventStatus } from "@guestroll/domain"
import { EventsApi } from "./api.ts"
import { requireOwner } from "./config.ts"
import * as repo from "./repo.ts"
import { R2 } from "./storage.ts"
import { randomId } from "./ids.ts"

export const eventToPublic = (event: Event): EventPublic =>
  new EventPublic({
    id: event.id,
    slug: event.slug,
    title: event.title,
    status: event.status,
    photoLimit: event.photoLimit,
    filterPack: event.filterPack
  })

export const photoToHost = (photo: Photo): HostPhoto =>
  new HostPhoto({
    id: photo.id,
    eventId: photo.eventId,
    cameraId: photo.cameraId,
    objectKey: photo.objectKey,
    thumbKey: photo.thumbKey,
    takenAt: photo.takenAt
  })

const _notFound = () => new HttpApiError.NotFound()
const _badRequest = () => new HttpApiError.BadRequest()

const _requireEvent = (
  slug: EventSlug
): Effect.Effect<Event, HttpApiError.NotFound, D1Client.D1Client> =>
  Effect.flatMap(repo.getEventBySlug(slug), (opt) =>
    Option.match(opt, {
      onNone: () => Effect.fail(_notFound()),
      onSome: (event) => Effect.succeed(event)
    })
  )

const _nowDate: Effect.Effect<Date, never, Clock.Clock> = Effect.map(
  Clock.currentTimeMillis,
  (ms) => new Date(ms)
)

const _requiredField = (
  parts: ReadonlyArray<Multipart.Part>,
  key: string
): Effect.Effect<string, HttpApiError.BadRequest> => {
  const value = ((): Option.Option<string> => {
    for (const part of parts) {
      if (Multipart.isField(part) && part.key === key) return Option.some(part.value)
    }
    return Option.none()
  })()
  return Option.match(value, {
    onNone: () => Effect.fail(_badRequest()),
    onSome: (v) => Effect.succeed(v)
  })
}

export const GuestLive = HttpApiBuilder.group(EventsApi, "guest", (handlers) =>
  handlers
    .handle("getEvent", ({ params }) =>
      _requireEvent(params.slug).pipe(Effect.map(eventToPublic))
    )
    .handle("createCamera", ({ params, payload }) =>
      Effect.gen(function* () {
        const event = yield* _requireEvent(params.slug)
        if (event.status !== "live") return yield* Effect.fail(new HttpApiError.Forbidden())
        const now = yield* _nowDate
        const camera = yield* repo.createCamera(
          event.id,
          Option.fromNullishOr(payload.guestName),
          now
        )
        return new CameraCreateResult({
          cameraId: camera.id,
          usedCount: camera.usedCount,
          photoLimit: event.photoLimit
        })
      })
    )
    .handle("uploadPhoto", ({ params, payload }) =>
      Effect.gen(function* () {
        const event = yield* _requireEvent(params.slug)
        if (event.status !== "live") return yield* Effect.fail(new HttpApiError.Forbidden())

        const parts = Array.from(
          yield* Stream.runCollect(payload).pipe(Effect.mapError(() => _badRequest()))
        )
        const filePart = parts.find(
          (part) => Multipart.isFile(part) && part.key === "photo"
        )
        if (filePart === undefined || !Multipart.isFile(filePart)) {
          return yield* Effect.fail(_badRequest())
        }
        const fileBytes = yield* filePart.contentEffect.pipe(
          Effect.mapError(() => _badRequest())
        )
        const file = { bytes: fileBytes, contentType: filePart.contentType }
        const cameraIdStr = yield* _requiredField(parts, "cameraId")
        const takenAtStr = yield* _requiredField(parts, "takenAt")
        const cameraId = yield* Schema.decodeUnknownEffect(CameraId)(cameraIdStr).pipe(
          Effect.mapError(() => _badRequest())
        )
        const takenAt = yield* Schema.decodeUnknownEffect(Schema.Date)(takenAtStr).pipe(
          Effect.mapError(() => _badRequest())
        )

        const suffix = yield* randomId
        const objectKey = yield* repo.makeObjectKey(event.id, cameraId, suffix)
        const r2 = yield* R2
        yield* r2.put(objectKey, file.bytes, file.contentType)

        const outcome = yield* repo
          .uploadPhoto({
            eventId: event.id,
            cameraId,
            objectKey,
            thumbKey: objectKey,
            takenAt
          })
          .pipe(
            Effect.catchTags({
              PhotoLimitExceeded: () => Effect.fail(new HttpApiError.Conflict()),
              EventNotFound: () => Effect.fail(_notFound()),
              CameraNotFound: () => Effect.fail(_notFound())
            })
          )

        return new UploadResult({
          photoId: outcome.photo.id,
          usedCount: outcome.usedCount,
          photoLimit: event.photoLimit,
          remaining: Math.max(event.photoLimit - outcome.usedCount, 0)
        })
      })
    )
)

export const HostLive = HttpApiBuilder.group(EventsApi, "host", (handlers) =>
  handlers
    .handle("createEvent", ({ payload }) =>
      Effect.gen(function* () {
        const ownerId = yield* requireOwner
        const now = yield* _nowDate
        const event = yield* repo.createEvent(payload, ownerId, now)
        return eventToPublic(event)
      })
    )
    .handle("listEvents", () =>
      Effect.gen(function* () {
        const ownerId = yield* requireOwner
        const events = yield* repo.listEvents(ownerId)
        return events.map(eventToPublic)
      })
    )
    .handle("updateEventStatus", ({ params, payload }) =>
      Effect.gen(function* () {
        const event = yield* _requireEvent(params.slug)
        const now = yield* _nowDate
        const transitioned = transitionEventStatus(event, payload.status, now)
        if (Result.isFailure(transitioned)) return yield* Effect.fail(_badRequest())
        const updated = yield* repo.updateEventStatus(event.id, payload.status, now)
        return yield* Option.match(updated, {
          onNone: () => Effect.fail(_notFound()),
          onSome: (e) => Effect.succeed(eventToPublic(e))
        })
      })
    )
    .handle("listEventPhotos", ({ params }) =>
      Effect.gen(function* () {
        const event = yield* _requireEvent(params.slug)
        const photos = yield* repo.listEventPhotos(event.id)
        return photos.map(photoToHost)
      })
    )
)
