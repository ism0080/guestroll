import * as Cloudflare from "alchemy/Cloudflare"
import { AppLive, ApiApp, Background, type BackgroundDeps, WorkerEnv } from "@guestroll/api"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Etag from "effect/unstable/http/Etag"
import * as HttpPlatform from "effect/unstable/http/HttpPlatform"
import * as HttpMiddleware from "effect/unstable/http/HttpMiddleware"
import * as HttpRouter from "effect/unstable/http/HttpRouter"

const HttpPlatformStub = Layer.succeed(HttpPlatform.HttpPlatform, {
  platform: "web",
  compression: HttpPlatform.makeCompressionWeb({
    algorithms: [],
    transform: (_algorithm, _options) => (stream) => stream
  }),
  fileResponse: () => Effect.die("HttpPlatform.fileResponse not supported"),
  fileWebResponse: () => Effect.die("HttpPlatform.fileWebResponse not supported")
})

const isWorkersDevOrigin = (origin: string) => /^https:\/\/[^/]+\.workers\.dev$/.test(origin)

/** Runtime Effect entrypoint loaded by Alchemy's generated Worker bridge. */
export const ApiWorkerProgram = Effect.gen(function* () {
  const env = yield* Cloudflare.WorkerEnvironment
  const exec = yield* Cloudflare.WorkerExecutionContext

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

  const BackgroundLive = Layer.succeed(Background, {
    // SAFETY: Alchemy runs the Effect with the active request context before
    // registering its promise with the Worker's native `ctx.waitUntil`. The
    // returned effect's `RuntimeContext` requirement cannot be named here
    // (alchemy-owned service), so the exact `BackgroundDeps` shape is
    // restored at this infra boundary.
    waitUntil: ((effect) => exec.waitUntil(effect)) as BackgroundDeps["waitUntil"]
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
            // `Authorization` carries the host session; requests are never
            // credentialed, so `credentials` stays off and CSRF has no
            // ambient credentials to ride on.
            allowedHeaders: ["Authorization", "Content-Type", "b3", "traceparent", "tracestate", "baggage"],
            credentials: false,
            maxAge: 86400
          }),
          { global: true }
        )
      )
    )
  )

  return {
    fetch: Effect.provide(
      fetchEffect,
      Layer.provideMerge(Layer.mergeAll(AppLive, BackgroundLive), WorkerEnvLive)
    )
  }
})

export default Cloudflare.Worker(
  "Api",
  { main: import.meta.url },
  ApiWorkerProgram
)
