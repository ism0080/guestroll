import { describe, expect, test } from "bun:test"
import { webcrypto } from "node:crypto"
import { Effect, Layer, Option } from "effect"
import { strFromU8, unzipSync } from "fflate"
import {
  CameraId,
  EventId,
  ObjectKey,
  Photo,
  PhotoId,
  UploadId
} from "@guestroll/contracts"
import { buildEventZip } from "./download.ts"
import { WorkerEnv, type GuestrollCrypto } from "./env.ts"
import { ObjectNotFound, R2, type R2Deps } from "./storage.ts"

// SAFETY: Bun's Web Crypto implements the three methods Guestroll uses.
const testCrypto = webcrypto as GuestrollCrypto

// SAFETY: the test build path only reads `env.CRYPTO`; the remaining bindings
// are placeholders that are never touched.
const WorkerEnvTest = Layer.succeed(WorkerEnv, {
  DB: {} as never,
  BUCKET: {} as never,
  HOST_PASSCODE: "test-passcode",
  HOST_SESSION_SECRET: "test-session-secret",
  HOST_ALLOWED_ORIGIN: "http://host.test",
  GUEST_ALLOWED_ORIGIN: "http://guest.test",
  CRYPTO: testCrypto,
  GUEST_RATE_LIMIT: {} as never,
  LOGIN_RATE_LIMIT: {} as never
})

const _makeMemoryR2 = (): R2Deps & {
  readonly objects: Map<string, Uint8Array>
  readonly contentTypes: Map<string, string>
} => {
  const objects = new Map<string, Uint8Array>()
  const contentTypes = new Map<string, string>()
  const findObject = (key: string) => {
    const bytes = objects.get(key)
    if (bytes === undefined) return Effect.fail(new ObjectNotFound({ key }))
    return Effect.succeed({ bytes, contentType: contentTypes.get(key) ?? "application/octet-stream" })
  }
  return {
    objects,
    contentTypes,
    put: (key, value) => Effect.sync(() => {
      objects.set(key, value)
    }),
    putStream: (key, stream, contentType) =>
      Effect.tryPromise(async () => {
        const reader = stream.getReader()
        const chunks: Uint8Array[] = []
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value !== undefined) chunks.push(value)
        }
        const joined = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0))
        let offset = 0
        for (const chunk of chunks) {
          joined.set(chunk, offset)
          offset += chunk.length
        }
        objects.set(key, joined)
        contentTypes.set(key, contentType)
        return joined.length
      }),
    get: (key) => {
      const value = objects.get(key)
      return value === undefined ? Effect.fail(new ObjectNotFound({ key })) : Effect.succeed(value)
    },
    getObject: (key) => findObject(key),
    getStream: (key) => {
      const bytes = objects.get(key)
      if (bytes === undefined) return Effect.fail(new ObjectNotFound({ key }))
      return Effect.succeed(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes)
          controller.close()
        }
      }))
    },
    head: (key) => {
      const bytes = objects.get(key)
      return bytes === undefined
        ? Effect.succeed(Option.none())
        : Effect.succeed(Option.some({ size: bytes.length }))
    },
    delete: (key) => Effect.sync(() => {
      objects.delete(key)
    })
  }
}

const _makePhoto = (id: string, objectKey: string): Photo =>
  new Photo({
    id: PhotoId.make(id),
    uploadId: UploadId.make("11111111-1111-4111-8111-111111111111"),
    eventId: EventId.make("event-1"),
    cameraId: CameraId.make("camera-1"),
    objectKey: ObjectKey.make(objectKey),
    thumbKey: ObjectKey.make(objectKey),
    takenAt: new Date("2026-05-04T14:30:00.000Z"),
    uploadedAt: new Date("2026-05-04T14:31:00.000Z")
  })

describe("ZIP download build", () => {
  test("produces a valid ZIP containing every uploaded photo", async () => {
    const r2 = _makeMemoryR2()
    const photoBytes = {
      "photos/p1.jpg": "jpeg-bytes-one",
      "photos/p2.png": "png-bytes-two",
      "photos/p3.webp": "webp-bytes-three"
    }
    const photos = Object.keys(photoBytes).map((key, index) => _makePhoto(`photo-${index}`, key))
    for (const [key, content] of Object.entries(photoBytes)) {
      r2.objects.set(key, new TextEncoder().encode(content))
      r2.contentTypes.set(key, key.endsWith(".png") ? "image/png" : key.endsWith(".webp") ? "image/webp" : "image/jpeg")
    }

    const result = await Effect.runPromise(
      buildEventZip(EventId.make("event-1"), photos).pipe(
        Effect.provide(Layer.succeed(R2, r2)),
        Effect.provide(WorkerEnvTest)
      )
    )

    const zipBytes = r2.objects.get(result.objectKey)
    expect(zipBytes).toBeDefined()
    expect(result.size).toBe(zipBytes!.length)
    expect(result.photoCount).toBe(3)

    const unzipped = unzipSync(zipBytes!)
    const entries = Object.entries(unzipped)
    expect(entries.length).toBe(3)
    expect(entries.some(([name]) => name.endsWith(".jpg"))).toBe(true)
    expect(entries.some(([name]) => name.endsWith(".png"))).toBe(true)
    expect(entries.some(([name]) => name.endsWith(".webp"))).toBe(true)
    for (const [, bytes] of entries) {
      const content = strFromU8(bytes)
      expect(Object.values(photoBytes)).toContain(content)
    }
  })

  test("gives each build a fresh object key", async () => {
    const r2 = _makeMemoryR2()
    const photo = _makePhoto("photo-0", "photos/p1.jpg")
    r2.objects.set("photos/p1.jpg", new TextEncoder().encode("jpeg-bytes-one"))
    r2.contentTypes.set("photos/p1.jpg", "image/jpeg")

    const first = await Effect.runPromise(
      buildEventZip(EventId.make("event-1"), [photo]).pipe(
        Effect.provide(Layer.succeed(R2, r2)),
        Effect.provide(WorkerEnvTest)
      )
    )
    const second = await Effect.runPromise(
      buildEventZip(EventId.make("event-1"), [photo]).pipe(
        Effect.provide(Layer.succeed(R2, r2)),
        Effect.provide(WorkerEnvTest)
      )
    )
    expect(second.objectKey).not.toBe(first.objectKey)
    expect(r2.objects.has(first.objectKey)).toBe(true)
    expect(r2.objects.has(second.objectKey)).toBe(true)
  })
})