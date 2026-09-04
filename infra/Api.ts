import * as Cloudflare from "alchemy/Cloudflare"
import * as Alchemy from "alchemy"
import type { HttpEffect } from "alchemy/Http"
import { AppLive, ApiApp, Background, type BackgroundDeps, WorkerEnv } from "@guestroll/api"
import * as Effect from "effect/Effect"
import * as Config from "effect/Config"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Etag from "effect/unstable/http/Etag"
import * as HttpPlatform from "effect/unstable/http/HttpPlatform"
import * as HttpMiddleware from "effect/unstable/http/HttpMiddleware"
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

const isWorkersDevOrigin = (origin: string) => {
  return /^https:\/\/[^/]+\.workers\.dev$/.test(origin)
}

export default (
  apiDomain: string | undefined,
  hostOrigin: string | undefined,
  guestOrigin: string | undefined,
  zoneName: string | undefined
) => Cloudflare.Worker(
  "Api",
  {
    main: import.meta.url,
    domain: apiDomain === undefined
      ? undefined
      : { name: apiDomain, zoneName },
    env: {
      HOST_PASSCODE: Config.redacted("HOST_PASSCODE"),
      HOST_SESSION_SECRET: Alchemy.makeRandom("HostSessionSecret"),
      HOST_ALLOWED_ORIGIN: hostOrigin ?? "",
      GUEST_ALLOWED_ORIGIN: guestOrigin ?? "",
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
    const exec = yield* Cloudflare.WorkerExecutionContext

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

    // Backs the API's `Background` service with the per-event execution
    // context: the deferred context yielded here defers its `waitUntil` to
    // the live per-event one the bridge provides at request time.
    const _runInBackground = (effect: Effect.Effect<never, never, never>) => exec.waitUntil(effect)
    // SAFETY: `exec.waitUntil(effect)` runs `effect` with the caller's full
    // per-event context (services, tracing) and registers the promise with
    // workerd's `ctx.waitUntil`. Its declared extra `RuntimeContext` requirement
    // is always satisfied inside a handler (the bridge provides it per event),
    // so the assertion to the `Background` contract is sound.
    const BackgroundLive = Layer.succeed(Background, {
      waitUntil: _runInBackground as BackgroundDeps["waitUntil"]
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
          HttpRouter.middleware(
            HttpMiddleware.cors({
              allowedOrigins: (origin) =>
                isWorkersDevOrigin(origin) ||
                origin === env["HOST_ALLOWED_ORIGIN"] ||
                origin === env["GUEST_ALLOWED_ORIGIN"],
            allowedMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
            allowedHeaders: ["Content-Type", "b3", "traceparent", "tracestate", "baggage"],
              credentials: true,
              maxAge: 86400
            }),
            { global: true }
          )
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
        Layer.provideMerge(
          Layer.mergeAll(AppLive, BackgroundLive),
          WorkerEnvLive
        )
      ) as HttpEffect
    }
  }).pipe(
    Effect.provide([
      Cloudflare.D1.QueryDatabaseBinding,
      Cloudflare.R2.ReadWriteBucketBinding
    ])
  )
)
