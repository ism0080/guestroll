import {
  ApiError,
  createHostClient,
  type CreateEventInput,
  type HostClient,
  type PhotoPageQuery
} from "@guestroll/sdk"
import type {
  DownloadStatus,
  EventPublic,
  EventStatus,
  HostCamera,
  HostPhoto,
  HostPhotoPage,
  HostSession
} from "@guestroll/contracts"

const envApiBase: string | undefined = import.meta.env.VITE_API_BASE
const envGuestBase: string | undefined = import.meta.env.VITE_GUEST_BASE

/**
 * Base URLs of the API Worker and the guest PWA. Inlined at build time by
 * Alchemy (`VITE_API_BASE`, `VITE_GUEST_BASE`); falls back to local dev
 * servers for standalone `vite dev`.
 */
export const apiBase: string = envApiBase ?? "http://localhost:8787"
export const guestBase: string = envGuestBase ?? "http://localhost:5174"

export { ApiError }

let _client: Promise<HostClient> | undefined

/**
 * Lazily builds the type-safe host client from the SDK. The session cookie
 * is sent with every call (`credentials: "include"`).
 */
export const hostClient = (): Promise<HostClient> =>
  (_client ??= createHostClient({ baseUrl: apiBase, credentials: "include" }))

export const login = (passcode: string): Promise<HostSession> =>
  hostClient().then((client) => client.login(passcode))

export const logout = (): Promise<HostSession> =>
  hostClient().then((client) => client.logout())

export const createEvent = (input: CreateEventInput): Promise<EventPublic> =>
  hostClient().then((client) => client.createEvent(input))

export const listEvents = (): Promise<ReadonlyArray<EventPublic>> =>
  hostClient().then((client) => client.listEvents())

export const updateEventStatus = (slug: string, status: EventStatus): Promise<EventPublic> =>
  hostClient().then((client) => client.updateEventStatus(slug, status))

export const renameEvent = (slug: string, title: string): Promise<EventPublic> =>
  hostClient().then((client) => client.renameEvent(slug, title))

export const duplicateEvent = (slug: string): Promise<EventPublic> =>
  hostClient().then((client) => client.duplicateEvent(slug))

export const deleteEvent = (slug: string): Promise<void> =>
  hostClient().then((client) => client.deleteEvent(slug))

export const listEventPhotos = (slug: string, query?: PhotoPageQuery): Promise<HostPhotoPage> =>
  hostClient().then((client) => client.listEventPhotos(slug, query))

/** Every guest roll on the event (name, shots taken, reset status). */
export const listEventCameras = (slug: string): Promise<ReadonlyArray<HostCamera>> =>
  hostClient().then((client) => client.listEventCameras(slug))

/**
 * Resets a guest's roll so that device can start a new set of photos for the
 * event. The photos already taken stay in the event.
 */
export const resetCamera = (slug: string, cameraId: string): Promise<HostCamera> =>
  hostClient().then((client) => client.resetCamera(slug, cameraId))

/** Requests the "download all" ZIP build and returns the current status. */
export const requestDownload = (slug: string): Promise<DownloadStatus> =>
  hostClient().then((client) => client.requestDownload(slug))

/** Current ZIP build status (poll target while building). */
export const getDownloadStatus = (slug: string): Promise<DownloadStatus> =>
  hostClient().then((client) => client.getDownloadStatus(slug))

/** URL of the event's "download all" ZIP. Host-only; requires the session cookie. */
export const downloadFileUrl = (slug: string): string =>
  `${apiBase}/events/${encodeURIComponent(slug)}/download`

/** Shared TanStack query key for the session snapshot (auth probe + events). */
export const SESSION_QUERY_KEY = ["host", "session"] as const

export interface SessionSnapshot {
  readonly authenticated: boolean
  readonly events: ReadonlyArray<EventPublic>
}

/** Probes the session by listing events; a 401 means "not signed in". */
export const loadSession = async (): Promise<SessionSnapshot> => {
  try {
    const events = await listEvents()
    return { authenticated: true, events }
  } catch (error) {
    if (error instanceof ApiError && error.kind === "unauthorized") {
      return { authenticated: false, events: [] }
    }
    throw error
  }
}

/** Walks the photo cursor to load every photo for an event (newest first). */
export const fetchAllEventPhotos = async (slug: string): Promise<ReadonlyArray<HostPhoto>> => {
  const photos: HostPhoto[] = []
  let cursor: PhotoPageQuery | undefined
  for (let page = 0; page < 20; page += 1) {
    const pageData = await listEventPhotos(slug, { limit: 100, ...cursor })
    photos.push(...pageData.photos)
    if (pageData.nextCursor === undefined) return photos
    cursor = {
      cursorUploadedAt: pageData.nextCursor.uploadedAt,
      cursorId: pageData.nextCursor.id
    }
  }
  return photos
}

/** URL of a photo's bytes for the dashboard. Host-only; requires the session cookie. */
export const photoImageUrl = (slug: string, photoId: string): string =>
  `${apiBase}/events/${encodeURIComponent(slug)}/photos/${encodeURIComponent(photoId)}`

const _extensionForContentType = (contentType: string): string => {
  if (contentType === "image/png") return "png"
  if (contentType === "image/webp") return "webp"
  return "jpg"
}

/**
 * Downloads a single photo's bytes via the host-only photo endpoint
 * (session cookie via `credentials: "include"`) and saves it with a
 * per-photo filename.
 */
export const downloadSinglePhoto = async (slug: string, photoId: string): Promise<void> => {
  const response = await fetch(photoImageUrl(slug, photoId), { credentials: "include" })
  if (!response.ok) throw new Error(`Photo download failed with status ${response.status}`)
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${slug}-${photoId}.${_extensionForContentType(blob.type)}`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    // Let the browser start the download before revoking.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

/** Guest-facing link for an event (QR target / share). */
export const guestLink = (slug: string): string => `${guestBase}/${slug}`