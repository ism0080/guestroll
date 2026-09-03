import { Effect } from "effect"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import * as HttpApiClient from "effect/unstable/httpapi/HttpApiClient"
import { EventsApi } from "@guestroll/api/api"

export interface ApiClientOptions {
  readonly baseUrl: string
  readonly credentials?: "omit" | "same-origin" | "include"
}

/** The full typed client generated from `EventsApi` (guest + host groups). */
export type ApiClient = HttpApiClient.ForApi<typeof EventsApi>

/** The raw typed guest client (`getEvent`, `createCamera`, `uploadPhoto`). */
export type GuestApi = ApiClient["guest"]

/** The raw typed host client (`loginHost`, `logoutHost`, events, photos). */
export type HostApi = ApiClient["host"]

/**
 * Builds the type-safe HTTP client for `EventsApi` backed by the Web `fetch`
 * transport. Requires no runtime services once built — the returned client
 * methods are plain `Effect`s that can be run with `Effect.runPromise`.
 */
export const makeApiClient = (options: ApiClientOptions): Effect.Effect<ApiClient> =>
  HttpApiClient.make(EventsApi, {
    baseUrl: options.baseUrl
  }).pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.RequestInit, {
      credentials: options.credentials ?? "same-origin"
    })
  )
