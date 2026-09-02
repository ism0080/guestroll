import { Context, Effect, Layer } from "effect"
import * as D1Client from "@effect/sql-d1/D1Client"
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import { EventsApi } from "./api.ts"
import { HostAuth, HostAuthLive } from "./host-auth.ts"
import { WorkerEnv } from "./env.ts"
import { GuestLive, HostLive } from "./handlers.ts"
import { R2, R2Live } from "./storage.ts"

/**
 * D1 client layer constructed from the Worker bindings. Provides both
 * `D1Client` and the generic `SqlClient` tag, mirroring `D1Client.layer` but
 * sourcing the database from `WorkerEnv` instead of a fixed config.
 */
const D1Live: Layer.Layer<D1Client.D1Client | SqlClient.SqlClient, never, WorkerEnv> =
  Layer.effectContext(
    Effect.gen(function* () {
      const env = yield* WorkerEnv
      const client = yield* D1Client.make({ db: env.DB })
      return Context.make(D1Client.D1Client, client).pipe(
        Context.add(SqlClient.SqlClient, client)
      )
    })
  ).pipe(Layer.provide(Reactivity.layer))

/**
 * Provides the app's services (D1 client, R2, owner scope) from the Worker
 * bindings. The HTTP runtime glue — Etag, HttpPlatform, Path, FileSystem,
 * HttpRouter and the final `toHttpEffect` bridge — is owned by the infra
 * composition (alchemy Worker), not the API package.
 */
export const AppLive: Layer.Layer<
  D1Client.D1Client | SqlClient.SqlClient | R2 | HostAuth,
  never,
  WorkerEnv
> = Layer.mergeAll(
  D1Live,
  R2Live,
  HostAuthLive
)

/**
 * The HttpApi app: `HttpApiBuilder.layer` + the two group implementations.
 * Its requirements are the group services (provided by `AppLive`) plus the
 * HTTP runtime services the infra layer supplies.
 */
export const ApiApp = HttpApiBuilder.layer(EventsApi).pipe(
  Layer.provide([GuestLive, HostLive])
)
