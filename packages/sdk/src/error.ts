import { Effect, Option, Schema } from "effect"
import * as HttpClientError from "effect/unstable/http/HttpClientError"
import * as HttpApiError from "effect/unstable/httpapi/HttpApiError"
import { RateLimitExceeded, UploadContentMismatchError } from "@guestroll/contracts"

/**
 * Error surfaced by the SDK facades, mapping Effect failures to app-friendly
 * kinds. Tagged (not a bare `Error`) so it stays distinguishable inside
 * Effect failure channels.
 */
export class ApiError extends Schema.TaggedError<ApiError>()("ApiError", {
  kind: Schema.Literals([
    "not-found",
    "forbidden",
    "conflict",
    "rate-limited",
    "bad-request",
    "content-mismatch",
    "unauthorized",
    "network",
    "bad-response",
    "unknown"
  ]),
  message: Schema.String,
  status: Schema.optional(Schema.Int)
}) {}

export type ApiErrorKind = ApiError["kind"]

/** The union of failures a generated client method can raise for this API. */
export type ApiClientError =
  | HttpClientError.HttpClientError
  | Schema.SchemaError
  | RateLimitExceeded
  | UploadContentMismatchError
  | HttpApiError.Unauthorized
  | HttpApiError.Forbidden
  | HttpApiError.NotFound
  | HttpApiError.BadRequest
  | HttpApiError.Conflict

const _kindForStatus = (status: number): ApiErrorKind => {
  switch (status) {
    case 400:
      return "bad-request"
    case 401:
      return "unauthorized"
    case 403:
      return "forbidden"
    case 404:
      return "not-found"
    case 409:
      return "conflict"
    case 429:
      return "rate-limited"
    case 422:
      return "content-mismatch"
    default:
      return "bad-response"
  }
}

/** Maps any typed failure from a generated client call to an `ApiError`. */
export const toApiError = (error: ApiClientError): ApiError => {
  if (error instanceof HttpClientError.HttpClientError) {
    const reason = error.reason
    if (reason instanceof HttpClientError.TransportError) {
      return new ApiError({ kind: "network", message: "Could not reach the GuestRoll service" })
    }
    if (reason instanceof HttpClientError.StatusCodeError) {
      const status = reason.response.status
      return new ApiError({ kind: _kindForStatus(status), message: `Request failed with status ${status}`, status })
    }
    return new ApiError({ kind: "bad-response", message: "The GuestRoll service returned an unexpected response" })
  }
  if (error instanceof Schema.SchemaError) {
    return new ApiError({ kind: "bad-request", message: "Invalid value for the GuestRoll service" })
  }
  if (Schema.is(RateLimitExceeded)(error)) return new ApiError({ kind: "rate-limited", message: "Too many requests. Please try again in a moment.", status: 429 })
  if (Schema.is(UploadContentMismatchError)(error)) return new ApiError({ kind: "content-mismatch", message: "That photo could not be saved. Please retake it.", status: 422 })
  if (Schema.is(HttpApiError.Unauthorized)(error)) return new ApiError({ kind: "unauthorized", message: "Not signed in", status: 401 })
  if (Schema.is(HttpApiError.Forbidden)(error)) return new ApiError({ kind: "forbidden", message: "Not allowed", status: 403 })
  if (Schema.is(HttpApiError.NotFound)(error)) return new ApiError({ kind: "not-found", message: "Not found", status: 404 })
  if (Schema.is(HttpApiError.BadRequest)(error)) return new ApiError({ kind: "bad-request", message: "Bad request", status: 400 })
  if (Schema.is(HttpApiError.Conflict)(error)) return new ApiError({ kind: "conflict", message: "Already handled", status: 409 })
  return new ApiError({ kind: "unknown", message: "An unexpected error occurred" })
}

/** Runs a typed client effect and rejects with `ApiError` on failure. */
export const runApi = <T, E extends ApiClientError>(
  effect: Effect.Effect<T, E>
): Promise<T> =>
  Effect.runPromise(
    Effect.catchIf(effect, () => true, (error) => Effect.fail(toApiError(error)))
  )

/**
 * Parses external input through an endpoint schema at the SDK boundary,
 * converting validation failures into an `ApiError` instead of a raw throw.
 * The returned value is the schema's exact `Type`, so it can be passed
 * directly to a generated client method with no casts.
 */
export const parse = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: S["Encoded"],
  message: string
): S["Type"] =>
  Option.getOrThrowWith(
    Schema.decodeUnknownOption(schema)(value),
    () => new ApiError({ kind: "bad-request", message })
  )
