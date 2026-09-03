import {
  ApiError,
  createHostClient,
  type CreateEventInput,
  type HostClient,
  type PhotoPageQuery
} from "@guestroll/sdk"
import type { EventPublic, EventStatus, HostPhoto, HostPhotoPage, HostSession } from "@guestroll/contracts"

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

export const listEventPhotos = (slug: string, query?: PhotoPageQuery): Promise<HostPhotoPage> =>
  hostClient().then((client) => client.listEventPhotos(slug, query))

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

/** Guest-facing link for an event (QR target / share). */
export const guestLink = (slug: string): string => `${guestBase}/${slug}`