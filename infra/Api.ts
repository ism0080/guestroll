import * as Cloudflare from "alchemy/Cloudflare"
import * as Alchemy from "alchemy"
import type { HttpEffect } from "alchemy/Http"
import { AppLive, ApiApp, WorkerEnv } from "@guestroll/api"
import * as Effect from "effect/Effect"
import * as Config from "effect/Config"
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
  {
    main: import.meta.url,
    env: {
      HOST_PASSCODE: Config.redacted("HOST_PASSCODE"),
      HOST_SESSION_SECRET: Alchemy.makeRandom("HostSessionSecret"),
      HOST_ALLOWED_ORIGIN: Config.string("HOST_ALLOWED_ORIGIN"),
      GUEST_ALLOWED_ORIGIN: Config.string("GUEST_ALLOWED_ORIGIN"),
      GUEST_RATE_LIMIT: Cloudflare.RateLimit("GUEST_RATE_LIMIT", {
        namespaceId: 1001,
        simple: { limit: 60, period: 60 }
      }),
      LOGIN_RATE_LIMIT: Cloudflare.RateLimit("LOGIN_RATE_LIMIT", {
        namespaceId: 1002,
        simple: { limit: 5, period: 60 }
      })
    }
  },
  Effect.gen(function* () {
    const env = yield* Cloudflare.WorkerEnvironment
    const db = yield* Database
    const bucket = yield* Bucket

    yield* Cloudflare.D1.QueryDatabase(db)
    yield* Cloudflare.R2.ReadWriteBucket(bucket)

    const WorkerEnvLive = Layer.succeed(WorkerEnv, {
      DB: env["DB"],
      BUCKET: env["BUCKET"],
      HOST_PASSCODE: env["HOST_PASSCODE"],
      HOST_SESSION_SECRET: env["HOST_SESSION_SECRET"],
      HOST_ALLOWED_ORIGIN: env["HOST_ALLOWED_ORIGIN"],
      GUEST_ALLOWED_ORIGIN: env["GUEST_ALLOWED_ORIGIN"],
      CRYPTO: crypto,
      GUEST_RATE_LIMIT: env["GUEST_RATE_LIMIT"],
      LOGIN_RATE_LIMIT: env["LOGIN_RATE_LIMIT"]
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
             allowedOrigins: [env["HOST_ALLOWED_ORIGIN"], env["GUEST_ALLOWED_ORIGIN"]],
            allowedMethods: ["GET", "POST", "PATCH", "OPTIONS"],
            allowedHeaders: ["Content-Type"],
            credentials: true
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
