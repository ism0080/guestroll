import { Effect, Option, Schema } from "effect"
import * as HttpClientError from "effect/unstable/http/HttpClientError"
import * as HttpApiError from "effect/unstable/httpapi/HttpApiError"
import { RateLimitExceeded, UploadContentMismatchError } from "@guestroll/contracts"

export type ApiErrorKind =
  | "not-found"
  | "forbidden"
  | "conflict"
  | "rate-limited"
  | "bad-request"
  | "content-mismatch"
  | "unauthorized"
  | "network"
  | "bad-response"
  | "unknown"

/** Error surfaced by the SDK facades, mapping Effect failures to app-friendly kinds. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | undefined

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message)
    this.name = "ApiError"
    this.kind = kind
    this.status = status
  }
}

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
      return new ApiError("network", "Could not reach the GuestRoll service")
    }
    if (reason instanceof HttpClientError.StatusCodeError) {
      const status = reason.response.status
      return new ApiError(_kindForStatus(status), `Request failed with status ${status}`, status)
    }
    return new ApiError("bad-response", "The GuestRoll service returned an unexpected response")
  }
  if (error instanceof Schema.SchemaError) {
    return new ApiError("bad-request", "Invalid value for the GuestRoll service")
  }
  if (Schema.is(RateLimitExceeded)(error)) return new ApiError("rate-limited", "Too many requests. Please try again in a moment.", 429)
  if (Schema.is(UploadContentMismatchError)(error)) return new ApiError("content-mismatch", "That photo could not be saved. Please retake it.", 422)
  if (Schema.is(HttpApiError.Unauthorized)(error)) return new ApiError("unauthorized", "Not signed in", 401)
  if (Schema.is(HttpApiError.Forbidden)(error)) return new ApiError("forbidden", "Not allowed", 403)
  if (Schema.is(HttpApiError.NotFound)(error)) return new ApiError("not-found", "Not found", 404)
  if (Schema.is(HttpApiError.BadRequest)(error)) return new ApiError("bad-request", "Bad request", 400)
  if (Schema.is(HttpApiError.Conflict)(error)) return new ApiError("conflict", "Already handled", 409)
  return new ApiError("unknown", "An unexpected error occurred")
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
    () => new ApiError("bad-request", message)
  )
