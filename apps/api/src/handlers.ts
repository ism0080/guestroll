import { Clock, Effect, Match, Option, Result, Schema } from "effect"
import * as Stream from "effect/Stream"
import * as D1Client from "@effect/sql-d1/D1Client"
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder"
import { HttpApiError } from "effect/unstable/httpapi"
import * as Multipart from "effect/unstable/http/Multipart"
import * as HttpEffect from "effect/unstable/http/HttpEffect"
import type * as HttpServerRequest from "effect/unstable/http/HttpServerRequest"
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse"
import {
  CameraCreateResult,
  CameraId,
  DownloadStatus,
  Event,
  EventCreate,
  EventPublic,
  EventSlug,
  HostPhotoPage,
  HostSession,
  PhotoCursor,
  PhotoId,
  RateLimitExceeded,
  HostPhoto,
  Photo,
  UploadId,
  UploadResult
} from "@guestroll/contracts"
import { transitionEventStatus } from "@guestroll/domain"
import { EventsApi } from "./api.ts"
import { Background } from "./background.ts"
import { DownloadBuildTimeoutMs, runDownloadBuild } from "./download.ts"
import { WorkerEnv } from "./env.ts"
import { HostAuth, HostSessionCookie } from "./host-auth.ts"
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
    uploadId: photo.uploadId,
    eventId: photo.eventId,
    cameraId: photo.cameraId,
    objectKey: photo.objectKey,
    thumbKey: photo.thumbKey,
    takenAt: photo.takenAt,
    uploadedAt: photo.uploadedAt
  })

const _notFound = () => new HttpApiError.NotFound()
const _badRequest = () => new HttpApiError.BadRequest()
const _unauthorized = () => new HttpApiError.Unauthorized()

const _requireRateLimit = (
  request: HttpServerRequest.HttpServerRequest,
  scope: string,
  limiter: { readonly limit: (options: { readonly key: string }) => Promise<{ readonly success: boolean }> }
) =>
  Effect.tryPromise(() => limiter.limit({
    key: `${scope}:${request.headers["cf-connecting-ip"] ?? "unknown"}`
  })).pipe(
    Effect.orDie,
    Effect.filterOrFail((result) => result.success, () => new RateLimitExceeded())
  )

const _requireHost = (request: HttpServerRequest.HttpServerRequest) =>
  Effect.gen(function* () {
    const env = yield* WorkerEnv
    if (request.headers.origin !== env.HOST_ALLOWED_ORIGIN) return yield* _unauthorized()
    const auth = yield* HostAuth
    const ownerId = yield* auth.authorize(request)
    if (Option.isNone(ownerId)) return yield* _unauthorized()
    return ownerId.value
  })

const _requireGuestOrigin = (request: HttpServerRequest.HttpServerRequest) =>
  Effect.gen(function* () {
    const env = yield* WorkerEnv
    if (request.headers.origin !== env.GUEST_ALLOWED_ORIGIN) return yield* _unauthorized()
    return undefined
  })

const _requireEvent = (
  slug: EventSlug
): Effect.Effect<Event, HttpApiError.NotFound, D1Client.D1Client> =>
  repo.getEventBySlug(slug).pipe(Effect.flatMap(Effect.fromOption(() => _notFound())))

const _downloadStatus = (row: repo.DownloadRow, photoCount: number): DownloadStatus =>
  new DownloadStatus({
    status: row.status,
    photoCount,
    size: row.size ?? undefined,
    updatedAt: new Date(row.updatedAt)
  })

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
  return Effect.fromOption(value, () => _badRequest())
}

const _singlePart = (
  parts: ReadonlyArray<Multipart.Part>,
  key: string,
  predicate: (part: Multipart.Part) => boolean
): Effect.Effect<Multipart.Part, HttpApiError.BadRequest> => {
  const matches = parts.filter((part) => part.key === key && predicate(part))
  return matches.length === 1 ? Effect.succeed(matches[0]!) : Effect.fail(_badRequest())
}

export const GuestLive = HttpApiBuilder.group(EventsApi, "guest", (handlers) =>
  handlers
    .handle("getEvent", ({ params }) =>
       _requireEvent(params.slug).pipe(Effect.flatMap((event) =>
         event.status === "live" ? Effect.succeed(eventToPublic(event)) : Effect.fail(_notFound())
       ))
    )
    .handle("createCamera", ({ params, payload, request }) =>
      Effect.gen(function* () {
        yield* _requireGuestOrigin(request)
        const env = yield* WorkerEnv
        yield* _requireRateLimit(request, `camera:${params.slug}`, env.GUEST_RATE_LIMIT)
        const event = yield* _requireEvent(params.slug)
        if (event.status !== "live") return yield* new HttpApiError.Forbidden()
        const now = yield* _nowDate
        const camera = yield* repo.createCamera(
          event.id,
          payload.guestId,
          Option.fromNullishOr(payload.guestName),
          now
        ).pipe(Effect.catchTags({
          CameraLimitReached: () => Effect.fail(new HttpApiError.Conflict())
        }))
        return new CameraCreateResult({
          cameraId: camera.id,
          usedCount: camera.usedCount,
          photoLimit: event.photoLimit
        })
      })
    )
    .handle("uploadPhoto", ({ params, payload, request }) =>
      Effect.gen(function* () {
        yield* _requireGuestOrigin(request)
        const env = yield* WorkerEnv
        yield* _requireRateLimit(request, `upload:${params.slug}`, env.GUEST_RATE_LIMIT)
        const event = yield* _requireEvent(params.slug)
        if (event.status !== "live") return yield* new HttpApiError.Forbidden()

        const parts = Array.from(
          yield* Stream.runCollect(payload).pipe(Effect.mapError(() => _badRequest()))
        )
        if (parts.length !== 4) return yield* _badRequest()
        const filePart = yield* _singlePart(parts, "photo", Multipart.isFile)
        if (!Multipart.isFile(filePart) || !["image/jpeg", "image/png", "image/webp"].includes(filePart.contentType)) {
          return yield* _badRequest()
        }
        const fileBytes = yield* filePart.contentEffect.pipe(
          Effect.mapError(() => _badRequest())
        )
        const hasImageSignature = Match.value(filePart.contentType).pipe(
          Match.when("image/jpeg", () => fileBytes[0] === 0xff && fileBytes[1] === 0xd8),
          Match.when("image/png", () =>
            fileBytes[0] === 0x89 && fileBytes[1] === 0x50 &&
            fileBytes[2] === 0x4e && fileBytes[3] === 0x47),
          Match.when("image/webp", () =>
            fileBytes[0] === 0x52 && fileBytes[1] === 0x49 &&
            fileBytes[2] === 0x46 && fileBytes[3] === 0x46 &&
            fileBytes[8] === 0x57 && fileBytes[9] === 0x45 &&
            fileBytes[10] === 0x42 && fileBytes[11] === 0x50),
          Match.orElse(() => false)
        )
        if (!hasImageSignature) return yield* _badRequest()
        const file = { bytes: fileBytes, contentType: filePart.contentType }
        yield* _singlePart(parts, "cameraId", Multipart.isField)
        yield* _singlePart(parts, "takenAt", Multipart.isField)
        yield* _singlePart(parts, "uploadId", Multipart.isField)
        const cameraIdStr = yield* _requiredField(parts, "cameraId")
        const takenAtStr = yield* _requiredField(parts, "takenAt")
        const uploadIdStr = yield* _requiredField(parts, "uploadId")
        const cameraId = yield* Schema.decodeEffect(CameraId)(cameraIdStr).pipe(
          Effect.mapError(() => _badRequest())
        )
        const takenAt = yield* Schema.decodeUnknownEffect(Schema.DateFromString)(takenAtStr).pipe(
          Effect.mapError(() => _badRequest())
        )
        const uploadId = yield* Schema.decodeEffect(UploadId)(uploadIdStr).pipe(
          Effect.mapError(() => _badRequest())
        )
        const uploadedAt = yield* _nowDate
        const crypto = (yield* WorkerEnv).CRYPTO
        const digest = yield* Effect.tryPromise(() => crypto.subtle.digest("SHA-256", file.bytes.slice().buffer)).pipe(Effect.orDie)
        const contentDigest = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")

        const r2 = yield* R2
        const claimed = yield* repo.claimPhotoUpload({
          eventId: event.id,
          cameraId,
          uploadId,
          photoId: PhotoId.make(yield* randomId),
          contentDigest,
          takenAt,
          uploadedAt
        }).pipe(Effect.catchTags({
          CameraNotFound: () => Effect.fail(_notFound()),
          EventNotLive: () => Effect.fail(new HttpApiError.Forbidden()),
          PhotoLimitReached: () => Effect.fail(new HttpApiError.Conflict()),
          UploadContentMismatch: () => Effect.fail(new HttpApiError.Conflict())
        }))
        // Only the original pending claim writes; uploaded retries are read-only.
        if (claimed.status === "pending") {
          yield* r2.put(claimed.photo.objectKey, file.bytes, file.contentType)
          yield* repo.completePhotoUpload(claimed.photo.id)
        }
        return new UploadResult({
          photoId: claimed.photo.id,
          usedCount: claimed.usedCount,
          photoLimit: claimed.photoLimit,
          remaining: Math.max(claimed.photoLimit - claimed.usedCount, 0)
        })
      })
    )
)

export const HostLive = HttpApiBuilder.group(EventsApi, "host", (handlers) =>
  handlers
    .handle("loginHost", ({ payload, request }) =>
      Effect.gen(function* () {
        const env = yield* WorkerEnv
        yield* _requireRateLimit(request, "host-login", env.LOGIN_RATE_LIMIT)
        const auth = yield* HostAuth
        const token = yield* auth.authenticate(payload.passcode)
        if (Option.isNone(token)) return yield* _unauthorized()
        yield* HttpEffect.appendPreResponseHandler((_request, response) =>
          HttpServerResponse.setCookie(response, HostSessionCookie, token.value, {
            path: "/",
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: "30 days"
          }).pipe(Effect.orDie)
        )
        return new HostSession({ authenticated: true })
      })
    )
    .handle("logoutHost", ({ request }) =>
      Effect.gen(function* () {
        yield* _requireHost(request)
        yield* HttpEffect.appendPreResponseHandler((_request, response) =>
          HttpServerResponse.setCookie(response, HostSessionCookie, "", {
            path: "/",
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 0
          }).pipe(Effect.orDie)
        )
        return new HostSession({ authenticated: false })
      })
    )
    .handle("createEvent", ({ payload, request }) =>
      Effect.gen(function* () {
        const ownerId = yield* _requireHost(request)
        const now = yield* _nowDate
        const event = yield* repo.createEvent(payload, ownerId, now)
        return eventToPublic(event)
      })
    )
    .handle("listEvents", ({ request }) =>
      Effect.gen(function* () {
        const ownerId = yield* _requireHost(request)
        const events = yield* repo.listEvents(ownerId)
        return events.map(eventToPublic)
      })
    )
    .handle("updateEventStatus", ({ params, payload, request }) =>
      Effect.gen(function* () {
        const ownerId = yield* _requireHost(request)
        const event = yield* repo.getOwnedEventBySlug(params.slug, ownerId).pipe(
          Effect.flatMap(Effect.fromOption(() => _notFound()))
        )
        const now = yield* _nowDate
        const transitioned = transitionEventStatus(event, payload.status, now)
        if (Result.isFailure(transitioned)) return yield* _badRequest()
        const updated = yield* repo.updateEventStatus(event.id, ownerId, event.status, payload.status, now)
        return yield* Option.match(updated, {
          onNone: () => Effect.fail(_badRequest()),
          onSome: (e) => Effect.succeed(eventToPublic(e))
        })
      })
    )
    .handle("renameEvent", ({ params, payload, request }) =>
      Effect.gen(function* () {
        const ownerId = yield* _requireHost(request)
        const event = yield* repo.getOwnedEventBySlug(params.slug, ownerId).pipe(
          Effect.flatMap(Effect.fromOption(() => _notFound()))
        )
        const now = yield* _nowDate
        const updated = yield* repo.updateEventTitle(event.id, ownerId, payload.title, now)
        return yield* Option.match(updated, {
          onNone: () => Effect.fail(_badRequest()),
          onSome: (renamed) => Effect.succeed(eventToPublic(renamed))
        })
      })
    )
    .handle("duplicateEvent", ({ params, request }) =>
      Effect.gen(function* () {
        const ownerId = yield* _requireHost(request)
        const event = yield* repo.getOwnedEventBySlug(params.slug, ownerId).pipe(
          Effect.flatMap(Effect.fromOption(() => _notFound()))
        )
        const now = yield* _nowDate
        const created = yield* repo.createEvent(
          new EventCreate({
            title: event.title,
            filterPack: event.filterPack,
            photoLimit: event.photoLimit
          }),
          ownerId,
          now
        )
        return eventToPublic(created)
      })
    )
    .handle("deleteEvent", ({ params, request }) =>
      Effect.gen(function* () {
        const ownerId = yield* _requireHost(request)
        const event = yield* repo.getOwnedEventBySlug(params.slug, ownerId).pipe(
          Effect.flatMap(Effect.fromOption(() => _notFound()))
        )
        const cleanup = yield* repo.deleteEvent(event.id, ownerId).pipe(
          Effect.flatMap(Effect.fromOption(() => _notFound()))
        )
        const r2 = yield* R2
        const keys = new Set([...cleanup.photoKeys, ...(cleanup.downloadKey === null ? [] : [cleanup.downloadKey])])
        for (const key of keys) {
          yield* r2.delete(key).pipe(Effect.ignore)
        }
        return HttpServerResponse.empty({ status: 204 })
      })
    )
    .handle("listEventPhotos", ({ params, query, request }) =>
      Effect.gen(function* () {
        const ownerId = yield* _requireHost(request)
        const event = yield* repo.getOwnedEventBySlug(params.slug, ownerId).pipe(
          Effect.flatMap(Effect.fromOption(() => _notFound()))
        )
        const hasCursorDate = query.cursorUploadedAt !== undefined
        const hasCursorId = query.cursorId !== undefined
        if (hasCursorDate !== hasCursorId) return yield* _badRequest()
        const pageSize = query.limit ?? 50
        const cursor = hasCursorDate && hasCursorId
          ? Option.some({ uploadedAt: query.cursorUploadedAt, id: query.cursorId })
          : Option.none()
        const rows = yield* repo.listEventPhotos(event.id, ownerId, pageSize + 1, cursor)
        const photos = rows.slice(0, pageSize)
        const last = photos.at(-1)
        return new HostPhotoPage({
          photos: photos.map(photoToHost),
          nextCursor: rows.length > pageSize && last !== undefined
            ? new PhotoCursor({ uploadedAt: last.uploadedAt, id: last.id })
            : undefined
        })
      })
    )
    .handle("listEventCameras", ({ params, request }) =>
      Effect.gen(function* () {
        const ownerId = yield* _requireHost(request)
        const event = yield* repo.getOwnedEventBySlug(params.slug, ownerId).pipe(
          Effect.flatMap(Effect.fromOption(() => _notFound()))
        )
        return yield* repo.listEventCameras(event.id, ownerId)
      })
    )
    .handle("resetCamera", ({ params, request }) =>
      Effect.gen(function* () {
        const ownerId = yield* _requireHost(request)
        const event = yield* repo.getOwnedEventBySlug(params.slug, ownerId).pipe(
          Effect.flatMap(Effect.fromOption(() => _notFound()))
        )
        const now = yield* _nowDate
        return yield* repo.resetCamera(event.id, params.cameraId, now).pipe(
          Effect.flatMap(Effect.fromOption(() => _notFound()))
        )
      })
    )
    .handle("getHostPhoto", ({ params, request }) =>
      Effect.gen(function* () {
        const ownerId = yield* _requireHost(request)
        const event = yield* repo.getOwnedEventBySlug(params.slug, ownerId).pipe(
          Effect.flatMap(Effect.fromOption(() => _notFound()))
        )
        const photo = yield* repo.getEventPhoto(event.id, params.photoId, ownerId).pipe(
          Effect.flatMap(Effect.fromOption(() => _notFound()))
        )
        const r2 = yield* R2
        const object = yield* r2.getObject(photo.objectKey).pipe(
          Effect.mapError(() => _notFound())
        )
        return HttpServerResponse.raw(object.bytes, {
          status: 200,
          headers: {
            "Content-Type": object.contentType,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff"
          }
        })
      })
    )
    .handle("requestDownload", ({ params, request }) =>
      Effect.gen(function* () {
        const ownerId = yield* _requireHost(request)
        const event = yield* repo.getOwnedEventBySlug(params.slug, ownerId).pipe(
          Effect.flatMap(Effect.fromOption(() => _notFound()))
        )
        const now = yield* _nowDate
        const photoCount = yield* repo.countUploadedPhotos(event.id)
        const existing = yield* repo.getDownload(event.id)
        const isFreshReady = Option.isSome(existing) &&
          existing.value.status === "ready" &&
          existing.value.objectKey !== null &&
          existing.value.photoCount === photoCount
        if (isFreshReady) return _downloadStatus(existing.value, photoCount)

        const stallThreshold = new Date(now.getTime() - DownloadBuildTimeoutMs)
        const started = yield* Option.match(existing, {
          onNone: () => repo.insertDownload(event.id, now),
          onSome: () => repo.beginDownloadBuild(event.id, stallThreshold, now)
        })
        if (started) {
          const background = yield* Background
          yield* background.waitUntil(
            runDownloadBuild(event.id).pipe(
              Effect.sandbox,
              Effect.catch((cause) => Effect.logError("ZIP download build failed unexpectedly", cause))
            )
          )
        }
        const row = yield* repo.getDownload(event.id)
        return Option.match(row, {
          onNone: () => new DownloadStatus({ status: "error", photoCount }),
          onSome: (value) => _downloadStatus(value, photoCount)
        })
      })
    )
    .handle("getDownloadStatus", ({ params, request }) =>
      Effect.gen(function* () {
        const ownerId = yield* _requireHost(request)
        const event = yield* repo.getOwnedEventBySlug(params.slug, ownerId).pipe(
          Effect.flatMap(Effect.fromOption(() => _notFound()))
        )
        const photoCount = yield* repo.countUploadedPhotos(event.id)
        const row = yield* repo.getDownload(event.id)
        return Option.match(row, {
          onNone: () => new DownloadStatus({ status: "none", photoCount }),
          onSome: (value) => _downloadStatus(value, photoCount)
        })
      })
    )
    .handle("getDownloadFile", ({ params, request }) =>
      Effect.gen(function* () {
        const ownerId = yield* _requireHost(request)
        const event = yield* repo.getOwnedEventBySlug(params.slug, ownerId).pipe(
          Effect.flatMap(Effect.fromOption(() => _notFound()))
        )
        const photoCount = yield* repo.countUploadedPhotos(event.id)
        const row = yield* repo.getDownload(event.id).pipe(
          Effect.flatMap(Effect.fromOption(() => _notFound()))
        )
        if (row.status !== "ready" || row.objectKey === null || row.photoCount !== photoCount) {
          return yield* _notFound()
        }
        const r2 = yield* R2
        const head = yield* r2.head(row.objectKey)
        if (Option.isNone(head)) return yield* _notFound()
        const stream = yield* r2.getStream(row.objectKey).pipe(Effect.mapError(() => _notFound()))
        return HttpServerResponse.raw(stream, {
          status: 200,
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${event.slug}-photos.zip"`,
            "Content-Length": String(head.value.size),
            "Cache-Control": "no-store"
          }
        })
      })
    )
)
