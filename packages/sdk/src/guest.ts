import { Effect } from "effect"
import { CameraCreate, EventSlug } from "@guestroll/contracts"
import type { CameraCreateResult, EventPublic, UploadResult } from "@guestroll/contracts"
import { makeApiClient, type ApiClientOptions } from "./client.ts"
import { parse, runApi } from "./error.ts"

export interface UploadPhotoInput {
  readonly slug: string
  readonly cameraId: string
  readonly takenAt: Date
  readonly uploadId: string
  readonly file: Blob
}

/** Promise-based guest API, typesafe and schema-decoded via `HttpApiClient`. */
export interface GuestClient {
  /** Fetches the public event card. 404 also covers draft (not-yet-live) events. */
  readonly getEvent: (slug: string) => Promise<EventPublic>
  /**
   * Creates (or resumes) the guest's camera for the event. `guestId` is the
   * per-device identifier that ties the guest to a single roll per event.
   * Optional guest name. Rejects with `ApiError` kind `conflict` when the
   * device already used up its roll.
   */
  readonly createCamera: (slug: string, guestId: string, guestName?: string) => Promise<CameraCreateResult>
  /**
   * Uploads one compressed photo. `uploadId` is a client UUID that makes
   * retries idempotent per camera; `takenAt` is when the shutter fired.
   */
  readonly uploadPhoto: (input: UploadPhotoInput) => Promise<UploadResult>
}

export const createGuestClient = (options: ApiClientOptions): Promise<GuestClient> =>
  Effect.runPromise(makeApiClient(options)).then((client) => ({
    getEvent: (slug) =>
      runApi(client.guest.getEvent({
        params: { slug: parse(EventSlug, slug, "Invalid event link") }
      })),
    createCamera: (slug, guestId, guestName) =>
      runApi(client.guest.createCamera({
        params: { slug: parse(EventSlug, slug, "Invalid event link") },
        payload: parse(
          CameraCreate,
          guestName === undefined ? { guestId } : { guestId, guestName },
          "Invalid guest camera request"
        )
      })),
    uploadPhoto: ({ slug, cameraId, takenAt, uploadId, file }) => {
      const form = new FormData()
      form.append("photo", file, "photo.jpg")
      form.append("cameraId", cameraId)
      form.append("takenAt", takenAt.toISOString())
      form.append("uploadId", uploadId)
      return runApi(client.guest.uploadPhoto({
        params: { slug: parse(EventSlug, slug, "Invalid event link") },
        payload: form
      }))
    }
  }))