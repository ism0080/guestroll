import { ApiError, createGuestClient, type GuestClient } from "@guestroll/sdk"
import type { CameraCreateResult, EventPublic, UploadResult } from "@guestroll/contracts"

const envApiBase: string | undefined = import.meta.env.VITE_API_BASE

/**
 * Base URL of the GuestRoll API Worker. Inlined at build time by Alchemy
 * (`VITE_API_BASE`); falls back to the local Worker dev server for
 * standalone `vite dev`.
 */
export const apiBase: string = envApiBase ?? "http://localhost:8787"

export { ApiError }

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

let _client: Promise<GuestClient> | undefined

/** Lazily builds the type-safe guest client from the SDK. */
export const guestClient = (): Promise<GuestClient> =>
  (_client ??= createGuestClient({ baseUrl: apiBase }))

export interface UploadPhotoInput {
  readonly slug: string
  readonly cameraId: string
  readonly takenAt: Date
  readonly uploadId: string
  readonly file: Blob
  readonly thumb?: Blob
}

/** Fetches the public event card. 404 also covers draft (not-yet-live) events. */
export const getEvent = (slug: string): Promise<EventPublic> =>
  guestClient().then((client) => client.getEvent(slug))

/**
 * Creates (or resumes) the guest's camera for the event. `guestId` ties the
 * device to a single roll per event; the required `guestName` is persisted
 * with the device so a reset roll keeps the same name. The API rejects with
 * 409 once that roll is full, so a guest can't start a new set of photos
 * unless the host resets the device.
 */
export const createCamera = (slug: string, guestId: string, guestName: string): Promise<CameraCreateResult> =>
  guestClient().then((client) => client.createCamera(slug, guestId, guestName))

/**
 * Uploads one compressed photo. `uploadId` is a client UUID that makes
 * retries idempotent per camera; `takenAt` is when the shutter fired.
 */
export const uploadPhoto = (input: UploadPhotoInput): Promise<UploadResult> =>
  guestClient().then((client) => client.uploadPhoto(input))
