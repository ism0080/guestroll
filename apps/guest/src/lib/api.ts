import { Schema } from "effect"
import { CameraCreateResult, EventPublic, UploadResult } from "@guestroll/contracts"

const envApiBase: string | undefined = import.meta.env.VITE_API_BASE

/**
 * Base URL of the Guestroll API Worker. Inlined at build time by Alchemy
 * (`VITE_API_BASE`); falls back to the local Worker dev server for
 * standalone `vite dev`.
 */
export const apiBase: string = envApiBase ?? "http://localhost:8787"

/**
 * RFC 4122 version 4 UUID from `getRandomValues`. Unlike
 * `crypto.randomUUID`, this works in non-secure contexts (plain-HTTP
 * staging/dev), so upload retries stay idempotent everywhere.
 */
export const randomUUID = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export type ApiErrorKind =
  | "not-found"
  | "forbidden"
  | "conflict"
  | "rate-limited"
  | "bad-request"
  | "network"
  | "bad-response"

export class ApiError extends Error {
  readonly kind: ApiErrorKind

  constructor(kind: ApiErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

const _toKind = (status: number): ApiErrorKind => {
  switch (status) {
    case 400:
      return "bad-request"
    case 403:
      return "forbidden"
    case 404:
      return "not-found"
    case 409:
      return "conflict"
    case 429:
      return "rate-limited"
    default:
      return "bad-response"
  }
}

async function _request<S extends Schema.ConstraintDecoder<unknown>>(
  path: string,
  schema: S,
  init?: RequestInit
): Promise<S["Type"]> {
  let response: Response
  try {
    response = await fetch(`${apiBase}${path}`, init)
  } catch {
    throw new ApiError("network", "Could not reach the Guestroll service")
  }
  if (!response.ok) {
    throw new ApiError(_toKind(response.status), `Request to ${path} failed with ${response.status}`)
  }
  const payload = await response.json()
  return Schema.decodeUnknownSync(schema)(payload)
}

export interface UploadPhotoInput {
  readonly slug: string
  readonly cameraId: string
  readonly takenAt: Date
  readonly uploadId: string
  readonly file: Blob
}

/** Fetches the public event card. 404 also covers draft (not-yet-live) events. */
export const getEvent = (slug: string): Promise<EventPublic> =>
  _request(`/events/${slug}`, EventPublic)

/** Creates a guest camera for the event. Optional guest name. */
export const createCamera = (slug: string, guestName?: string): Promise<CameraCreateResult> =>
  _request(`/events/${slug}/cameras`, CameraCreateResult, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(guestName === undefined ? {} : { guestName })
  })

/**
 * Uploads one compressed photo. `uploadId` is a client UUID that makes
 * retries idempotent per camera; `takenAt` is when the shutter fired.
 */
export const uploadPhoto = (input: UploadPhotoInput): Promise<UploadResult> => {
  const form = new FormData()
  form.append("photo", input.file, "photo.jpg")
  form.append("cameraId", input.cameraId)
  form.append("takenAt", input.takenAt.toISOString())
  form.append("uploadId", input.uploadId)
  return _request(`/events/${input.slug}/photos`, UploadResult, {
    method: "POST",
    body: form
  })
}