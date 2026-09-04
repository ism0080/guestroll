import { Effect } from "effect"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest"
import * as HttpApiClient from "effect/unstable/httpapi/HttpApiClient"
import { EventsApi } from "@guestroll/api/api"

export { LocalApiBase, LocalGuestBase } from "@guestroll/api/local"

export interface ApiClientOptions {
  readonly baseUrl: string
  readonly credentials?: "omit" | "same-origin" | "include"
  /** Supplies a header (e.g. an auth bearer) merged into every request. */
  readonly getHeader?: () => readonly [name: string, value: string] | undefined
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
    baseUrl: options.baseUrl,
    transformClient:
      options.getHeader === undefined
        ? undefined
        : HttpClient.mapRequest((request) => {
            const header = options.getHeader?.()
            return header === undefined
              ? request
              : HttpClientRequest.setHeader(request, header[0], header[1])
          })
  }).pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.RequestInit, {
      credentials: options.credentials ?? "same-origin"
    })
  )
