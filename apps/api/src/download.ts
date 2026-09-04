import { Clock, Effect, Exit, Match, Option } from "effect"
import * as D1Client from "@effect/sql-d1/D1Client"
import { Zip, ZipPassThrough } from "fflate"
import { EventId, ObjectKey, Photo } from "@guestroll/contracts"
import { WorkerEnv } from "./env.ts"
import { randomId } from "./ids.ts"
import * as repo from "./repo.ts"
import { R2 } from "./storage.ts"

/** A build that has been running longer than this is treated as stalled. */
export const DownloadBuildTimeoutMs = 10 * 60 * 1000

const _nowDate = Effect.map(Clock.currentTimeMillis, (ms) => new Date(ms))

export interface ZipBuildResult {
  readonly objectKey: ObjectKey
  readonly size: number
  readonly photoCount: number
}

/**
 * Builds the event's "download all" ZIP and stores it in R2. Photo bytes are
 * stored uncompressed (`ZipPassThrough`) — JPEG/WebP/PNG do not deflate, and
 * store mode avoids burning CPU on the build. Originals are archived as-is;
 * the per-photo `filterPack` intent travels in `filters.json` so exports stay
 * reproducible even though the Worker has no image codec to bake pixels.
 */
export const buildEventZip = (
  eventId: EventId,
  photos: ReadonlyArray<Photo>
): Effect.Effect<ZipBuildResult, never, R2 | WorkerEnv> =>
  Effect.gen(function* () {
    const r2 = yield* R2
    const buildId = yield* randomId
    const objectKey = ObjectKey.make(`downloads/${eventId}/${buildId}.zip`)

    const stream = (() => {
      const filename = (photo: Photo, contentType: string): string => {
        const extension = Match.value(contentType).pipe(
          Match.when("image/png", () => "png"),
          Match.when("image/webp", () => "webp"),
          Match.orElse(() => "jpg")
        )
        const stamp = photo.takenAt.toISOString().replaceAll(":", "-").replaceAll(".", "-")
        return `IMG_${stamp}_${photo.id.slice(0, 8)}.${extension}`
      }
      // A push-based ReadableStream that feeds every photo through fflate's
      // streaming ZIP writer as it is fetched from R2, so peak memory is one
      // photo at a time regardless of archive size.
      return new ReadableStream({
        start(controller) {
          void (async () => {
            const zip = new Zip((error, chunk) => {
              if (error !== null) {
                controller.error(error)
                return
              }
              controller.enqueue(chunk)
            })
            for (const photo of photos) {
              const object = await Effect.runPromise(r2.getObject(photo.objectKey))
              const file = new ZipPassThrough(filename(photo, object.contentType))
              zip.add(file)
              file.push(object.bytes)
              file.push(new Uint8Array(0), true)
            }
            const manifest = new ZipPassThrough("filters.json")
            zip.add(manifest)
            // Hand-rolled string-map encoding: photo ids and pack names are
            // short token strings, so a minimal quote-escape suffices and
            // keeps this Effect module off the global JSON API.
            const escapeToken = (token: string): string =>
              `"${token.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`
            const manifestBody =
              `{\n${photos.map((photo) => `  ${escapeToken(photo.id)}: ${escapeToken(photo.filterPack)}`).join(",\n")}\n}`
            manifest.push(new TextEncoder().encode(manifestBody))
            manifest.push(new Uint8Array(0), true)
            zip.end()
            controller.close()
          })().catch((error: Error) => controller.error(error))
        }
      })
    })()

    const size = yield* r2.putStream(objectKey, stream, "application/zip")
    return { objectKey, size, photoCount: photos.length }
  })

/**
 * The background build: snapshots the current photos, writes the ZIP, and
 * records the outcome in the download row. Runs under `waitUntil`, so it
 * outlives the request that triggered it.
 */
export const runDownloadBuild = (
  eventId: EventId
): Effect.Effect<void, never, R2 | WorkerEnv | D1Client.D1Client> =>
  Effect.gen(function* () {
    const photos = yield* repo.listUploadedPhotos(eventId)
    const exit = yield* buildEventZip(eventId, photos).pipe(Effect.sandbox, Effect.exit)
    const now = yield* _nowDate
    if (Exit.isFailure(exit)) {
      yield* repo.failDownload(eventId, now)
      return
    }
    const built = exit.value
    const prunePrevious = (): Effect.Effect<void, never, R2 | D1Client.D1Client> =>
      Effect.gen(function* () {
        const existing = yield* repo.getDownload(eventId)
        const previous = Option.flatMap(existing, (row) => Option.fromNullishOr(row.objectKey))
        if (Option.isSome(previous) && previous.value !== built.objectKey) {
          yield* (yield* R2).delete(previous.value).pipe(Effect.ignore)
        }
      })
    yield* prunePrevious()
    yield* repo.completeDownload(eventId, built.objectKey, built.size, built.photoCount, now)
  })