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

export const updateEventPhotoLimit = (slug: string, photoLimit: number): Promise<EventPublic> =>
  hostClient().then((client) => client.updateEventPhotoLimit(slug, photoLimit))

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
export const fetchAllEventPhotos = async (
  slug: string,
  previous: ReadonlyArray<HostPhoto> = []
): Promise<ReadonlyArray<HostPhoto>> => {
  const previousNewest = previous[0]
  const photos: HostPhoto[] = []
  let cursor: PhotoPageQuery | undefined
  for (let page = 0; page < 100; page += 1) {
    const pageData = await listEventPhotos(slug, { limit: 100, ...cursor })
    for (const photo of pageData.photos) {
      if (previousNewest !== undefined && photo.id === previousNewest.id) {
        return [...photos, ...previous]
      }
      photos.push(photo)
    }
    if (pageData.nextCursor === undefined) return photos
    cursor = {
      cursorUploadedAt: pageData.nextCursor.uploadedAt,
      cursorId: pageData.nextCursor.id
    }
  }
  const seen = new Set(photos.map((photo) => photo.id))
  return [...photos, ...previous.filter((photo) => !seen.has(photo.id))]
}

export const photoThumbUrl = (slug: string, photoId: string): string =>
  `${apiBase}/events/${encodeURIComponent(slug)}/photos/${encodeURIComponent(photoId)}/thumb`

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
 * per-photo filename. The archived bytes are originals; when a filter pack
 * is passed the shared ImageData pipeline bakes it into the saved file so
 * the download matches the filtered grid. On mobile the native share sheet
 * is used so the photo can be saved straight to the camera roll; elsewhere
 * an anchor download is used.
 */
export const downloadSinglePhoto = async (
  slug: string,
  photoId: string,
  filterPack?: string
): Promise<void> => {
  const { saveBlob } = await import("./share.ts")
  const response = await fetch(photoImageUrl(slug, photoId), { credentials: "include" })
  if (!response.ok) throw new Error(`Photo download failed with status ${response.status}`)
  const original = await response.blob()
  const filename = `${slug}-${photoId}${filterPack !== undefined && filterPack !== "none" ? "-filtered" : ""}.${_extensionForContentType(original.type)}`
  if (filterPack === undefined || filterPack === "none") {
    await saveBlob(original, filename, { title: filename })
    return
  }
  const { bakeBlobFilter } = await import("./filter-export.ts")
  const baked = await bakeBlobFilter(original, filterPack)
  await saveBlob(baked, filename, { title: filename })
}

/** Guest-facing link for an event (QR target / share). */
export const guestLink = (slug: string): string => `${guestBase}/${slug}`
