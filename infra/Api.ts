import * as Cloudflare from "alchemy/Cloudflare"
import type { HttpEffect } from "alchemy/Http"
import { AppLive, ApiApp, WorkerEnv } from "@guestroll/api"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Etag from "effect/unstable/http/Etag"
import * as HttpPlatform from "effect/unstable/http/HttpPlatform"
import * as HttpRouter from "effect/unstable/http/HttpRouter"
import { Bucket } from "./Bucket.ts"
import { Database } from "./Db.ts"

/**
 * There is no filesystem in a Worker isolate, so the platform file-serving
 * primitives are stubbed out. The `compression` helper is never exercised
 * (the API applies no compression middleware), so an identity transform
 * satisfies the service contract.
 */
const HttpPlatformStub = Layer.succeed(HttpPlatform.HttpPlatform, {
  platform: "web",
  compression: HttpPlatform.makeCompressionWeb({
    algorithms: [],
    transform: (_algorithm, _options) => (stream) => stream
  }),
  fileResponse: () => Effect.die("HttpPlatform.fileResponse not supported"),
  fileWebResponse: () => Effect.die("HttpPlatform.fileWebResponse not supported")
})

export default Cloudflare.Worker(
  "Api",
  { main: import.meta.url },
  Effect.gen(function* () {
    const env = yield* Cloudflare.WorkerEnvironment
    const db = yield* Database
    const bucket = yield* Bucket

    yield* Cloudflare.D1.QueryDatabase(db)
    yield* Cloudflare.R2.ReadWriteBucket(bucket)

    const WorkerEnvLive = Layer.succeed(WorkerEnv, {
      DB: env["DB"],
      BUCKET: env["BUCKET"]
    })

    const fetchEffect = yield* HttpRouter.toHttpEffect(
      ApiApp.pipe(
        Layer.provide([
          Etag.layer,
          HttpPlatformStub,
          Path.layer,
          FileSystem.layerNoop({})
        ]),
        Layer.provide(
          HttpRouter.cors({
            allowedOrigins: ["*"],
            allowedMethods: ["GET", "POST", "PATCH", "OPTIONS"],
            allowedHeaders: ["Content-Type"]
          })
        )
      )
    )

    // SAFETY: `Clock` is a default reference service the Effect runtime always
    // provides to handlers; its `never` identifier cannot be erased by `provide`,
    // but it is never missing at runtime. `HttpServerRequest`/`Scope` come from
    // the Worker runtime. The cast narrows the handler to the Worker's
    // `HttpEffect` contract.
    return {
      fetch: Effect.provide(
        fetchEffect,
        Layer.provide(AppLive, WorkerEnvLive)
      ) as HttpEffect
    }
  }).pipe(
    Effect.provide([
      Cloudflare.D1.QueryDatabaseBinding,
      Cloudflare.R2.ReadWriteBucketBinding
    ])
  )
)