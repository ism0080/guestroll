import { Context, Effect, Layer, Schema } from "effect"
import type { R2Bucket } from "@cloudflare/workers-types"
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
  readonly get: (key: string) => Effect.Effect<Uint8Array, ObjectNotFound>
  readonly getObject: (key: string) => Effect.Effect<R2Object, ObjectNotFound>
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
    const remove: R2Deps["delete"] = (key) =>
      Effect.tryPromise(() => bucket.delete(key)).pipe(Effect.orDie, Effect.andThen(Effect.void))
    return R2.of({ put, get, getObject, delete: remove })
  })
)
