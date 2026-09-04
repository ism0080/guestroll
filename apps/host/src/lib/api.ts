import {
  ApiError,
  createHostClient,
  LocalApiBase,
  LocalGuestBase,
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
export const apiBase: string = envApiBase ?? LocalApiBase
export const guestBase: string = envGuestBase ?? LocalGuestBase

export { ApiError }

/**
 * The host session lives in `sessionStorage` and travels as an
 * `Authorization: Bearer` header on every request. Cookies are not used at
 * all, so the dashboard keeps working when third-party cookies are blocked
 * (Safari ITP and friends) and CSRF has no ambient credentials to ride on.
 */
const SessionTokenKey = "guestroll.hostToken"

const _readToken = (): string | undefined => {
  try {
    return window.sessionStorage.getItem(SessionTokenKey) ?? undefined
  } catch {
    return undefined
  }
}

/** Persists the host session token for the current tab. */
export const storeSessionToken = (token: string): void => {
  try {
    window.sessionStorage.setItem(SessionTokenKey, token)
  } catch {
    // Storage unavailable: the session simply lasts until the next login.
  }
}

/** Drops the local session token (after login failure or logout). */
export const clearSessionToken = (): void => {
  try {
    window.sessionStorage.removeItem(SessionTokenKey)
  } catch {
    // Nothing to clean up.
  }
}

export const hasSessionToken = (): boolean => _readToken() !== undefined

/** Headers that authenticate host requests (empty when signed out). */
export const authHeaders = (): Record<string, string> => {
  const token = _readToken()
  return token === undefined ? {} : { authorization: `Bearer ${token}` }
}

let _client: Promise<HostClient> | undefined

/** Lazily builds the type-safe host client, attaching the bearer header. */
export const hostClient = (): Promise<HostClient> =>
  (_client ??= createHostClient({
    baseUrl: apiBase,
    credentials: "omit",
    getHeader: () => {
      const token = _readToken()
      return token === undefined ? undefined : ["authorization", `Bearer ${token}`]
    }
  }))

export const login = async (passcode: string): Promise<HostSession> => {
  const session = await hostClient().then((client) => client.login(passcode))
  if (session.token !== undefined) storeSessionToken(session.token)
  return session
}

export const logout = async (): Promise<HostSession> => {
  try {
    return await hostClient().then((client) => client.logout())
  } finally {
    clearSessionToken()
  }
}

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

/** URL of the event's "download all" ZIP. Host-only; needs the bearer header. */
export const downloadFileUrl = (slug: string): string =>
  `${apiBase}/events/${encodeURIComponent(slug)}/download`

/** Shared TanStack query key for the session snapshot (auth probe + events). */
export const SESSION_QUERY_KEY = ["host", "session"] as const

export interface SessionSnapshot {
  readonly authenticated: boolean
  readonly events: ReadonlyArray<EventPublic>
}

/**
 * Probes the session by listing events. Without a stored token the guest is
 * simply signed out; a 401 means the stored token was revoked or expired,
 * so it is dropped and the dashboard shows the login screen again.
 */
export const loadSession = async (): Promise<SessionSnapshot> => {
  if (!hasSessionToken()) return { authenticated: false, events: [] }
  try {
    const events = await listEvents()
    return { authenticated: true, events }
  } catch (error) {
    if (error instanceof ApiError && error.kind === "unauthorized") {
      clearSessionToken()
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
  const known = new Set(previous.map((photo) => photo.id))
  const fresh: HostPhoto[] = []
  let cursor: PhotoPageQuery | undefined
  for (let page = 0; page < 100; page += 1) {
    const pageData = await listEventPhotos(slug, { limit: 100, ...cursor })
    let reachedKnown = false
    for (const photo of pageData.photos) {
      // Walk until the pages overlap what the dashboard already holds, then
      // prepend just the new photos — deletions are not possible per-photo,
      // so the merged list stays accurate without a full refetch.
      if (known.has(photo.id)) {
        reachedKnown = true
        continue
      }
      fresh.push(photo)
    }
    if (reachedKnown || pageData.nextCursor === undefined) break
    cursor = {
      cursorUploadedAt: pageData.nextCursor.uploadedAt,
      cursorId: pageData.nextCursor.id
    }
  }
  return [...fresh, ...previous]
}

export const photoThumbUrl = (slug: string, photoId: string): string =>
  `${apiBase}/events/${encodeURIComponent(slug)}/photos/${encodeURIComponent(photoId)}/thumb`

/** URL of a photo's bytes for the dashboard. Host-only; needs the bearer header. */
export const photoImageUrl = (slug: string, photoId: string): string =>
  `${apiBase}/events/${encodeURIComponent(slug)}/photos/${encodeURIComponent(photoId)}`

/** Fetches a host-only asset with the session bearer and returns its status. */
export const authorizedFetch = (url: string): Promise<Response> =>
  fetch(url, { headers: authHeaders() })

/**
 * Fetches a host-only asset with the session bearer header and returns a
 * blob object URL for `<img>` tags (which cannot set headers themselves).
 */
export const fetchObjectUrl = async (url: string): Promise<string> => {
  const response = await authorizedFetch(url)
  if (!response.ok) throw new Error(`Asset request failed with status ${response.status}`)
  const blob = await response.blob()
  return URL.createObjectURL(blob)
}

const _extensionForContentType = (contentType: string): string => {
  if (contentType === "image/png") return "png"
  if (contentType === "image/webp") return "webp"
  return "jpg"
}

/**
 * Downloads a single photo's bytes via the host-only photo endpoint
 * (bearer header) and saves it with a per-photo filename. The archived
 * bytes are originals; when a filter pack is passed the shared ImageData
 * pipeline bakes it into the saved file so the download matches the
 * filtered grid. On mobile the native share sheet is used so the photo can
 * be saved straight to the camera roll; elsewhere an anchor download is used.
 */
export const downloadSinglePhoto = async (
  slug: string,
  photoId: string,
  filterPack?: string
): Promise<void> => {
  const { saveBlob } = await import("./share.ts")
  const response = await authorizedFetch(photoImageUrl(slug, photoId))
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
