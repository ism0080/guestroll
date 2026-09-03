import { Context, Effect, Layer, Option, Schema } from "effect"
import type { R2Bucket, ReadableStream as WorkersReadableStream } from "@cloudflare/workers-types"
import { WorkerEnv } from "./env.ts"

export class ObjectNotFound extends Schema.TaggedError<ObjectNotFound>()(
  "ObjectNotFound",
  { key: Schema.String }
) {}

export interface R2Object {
  readonly bytes: Uint8Array
  readonly contentType: string
}

export interface R2Deps {
  readonly put: (key: string, value: Uint8Array, contentType: string) => Effect.Effect<void>
  readonly putStream: (key: string, stream: ReadableStream<Uint8Array>, contentType: string) => Effect.Effect<number>
  readonly get: (key: string) => Effect.Effect<Uint8Array, ObjectNotFound>
  readonly getObject: (key: string) => Effect.Effect<R2Object, ObjectNotFound>
  readonly getStream: (key: string) => Effect.Effect<ReadableStream<Uint8Array>, ObjectNotFound>
  readonly head: (key: string) => Effect.Effect<Option.Option<{ readonly size: number }>>
  readonly delete: (key: string) => Effect.Effect<void>
}

export class R2 extends Context.Service<R2, R2Deps>()("guestroll/R2") {}

export const R2Live = Layer.effect(
  R2,
  Effect.gen(function* () {
    const env = yield* WorkerEnv
    const bucket: R2Bucket = env.BUCKET
    const put: R2Deps["put"] = (key, value, contentType) =>
      Effect.tryPromise(() => bucket.put(key, value, { httpMetadata: { contentType } })).pipe(
        Effect.orDie,
        Effect.andThen(Effect.void)
      )
    const putStream: R2Deps["putStream"] = (key, stream, contentType) =>
      Effect.tryPromise(() => {
        const workersStream: unknown = stream
        // SAFETY: the ESNext `ReadableStream<Uint8Array>` we carry and the
        // workers `ReadableStream` are the same object at runtime — only the
        // BYOB `getReader` overloads differ across the type declarations.
        return bucket.put(key, workersStream as WorkersReadableStream, { httpMetadata: { contentType } })
      }).pipe(
        Effect.orDie,
        Effect.map((object) => object.size)
      )
    const get: R2Deps["get"] = (key) =>
      Effect.tryPromise(() => bucket.get(key)).pipe(
        Effect.orDie,
        Effect.flatMap((obj) =>
          obj === null
            ? Effect.fail(new ObjectNotFound({ key }))
            : Effect.tryPromise(() => obj.arrayBuffer()).pipe(
                Effect.orDie,
                Effect.map((buf) => new Uint8Array(buf))
              )
        )
      )
    const getObject: R2Deps["getObject"] = (key) =>
      Effect.tryPromise(() => bucket.get(key)).pipe(
        Effect.orDie,
        Effect.flatMap((obj) =>
          obj === null
            ? Effect.fail(new ObjectNotFound({ key }))
            : Effect.tryPromise(() => obj.arrayBuffer()).pipe(
                Effect.orDie,
                Effect.map((buf) => ({
                  bytes: new Uint8Array(buf),
                  contentType: obj.httpMetadata?.contentType ?? "application/octet-stream"
                }))
              )
        )
      )
    const getStream: R2Deps["getStream"] = (key) =>
      Effect.tryPromise(() => bucket.get(key)).pipe(
        Effect.orDie,
        Effect.flatMap((obj) => {
          if (obj === null) return Effect.fail(new ObjectNotFound({ key }))
          const uint8Stream: unknown = obj.body
          // SAFETY: `obj.body` streams the object's bytes, so exposing it as a
          // `ReadableStream<Uint8Array>` matches the API surface at runtime.
          return Effect.succeed(uint8Stream as ReadableStream<Uint8Array>)
        })
      )
    const head: R2Deps["head"] = (key) =>
      Effect.tryPromise(() => bucket.head(key)).pipe(
        Effect.orDie,
        Effect.map((obj) => obj === null ? Option.none() : Option.some({ size: obj.size }))
      )
    const remove: R2Deps["delete"] = (key) =>
      Effect.tryPromise(() => bucket.delete(key)).pipe(Effect.orDie, Effect.andThen(Effect.void))
    return R2.of({ put, putStream, get, getObject, getStream, head, delete: remove })
  })
)
