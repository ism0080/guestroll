import { Effect } from "effect"
import {
  EventCreate,
  EventRename,
  EventSlug,
  EventStatusUpdate,
  HostLogin,
  PhotoId
} from "@guestroll/contracts"
import type {
  DownloadStatus,
  EventPublic,
  EventStatus,
  HostPhotoPage,
  HostSession
} from "@guestroll/contracts"
import { makeApiClient, type ApiClientOptions } from "./client.ts"
import { parse, runApi } from "./error.ts"

export interface CreateEventInput {
  readonly title: string
  readonly filterPack: string
  readonly photoLimit: number
}

export interface PhotoPageQuery {
  readonly limit?: number
  readonly cursorUploadedAt?: Date
  readonly cursorId?: string
}

/** Promise-based host API. Uses `credentials: "include"` to send the session cookie. */
export interface HostClient {
  readonly login: (passcode: string) => Promise<HostSession>
  readonly logout: () => Promise<HostSession>
  readonly createEvent: (input: CreateEventInput) => Promise<EventPublic>
  readonly listEvents: () => Promise<ReadonlyArray<EventPublic>>
  readonly updateEventStatus: (slug: string, status: EventStatus) => Promise<EventPublic>
  readonly renameEvent: (slug: string, title: string) => Promise<EventPublic>
  readonly duplicateEvent: (slug: string) => Promise<EventPublic>
  readonly deleteEvent: (slug: string) => Promise<void>
  readonly listEventPhotos: (slug: string, query?: PhotoPageQuery) => Promise<HostPhotoPage>
  readonly requestDownload: (slug: string) => Promise<DownloadStatus>
  readonly getDownloadStatus: (slug: string) => Promise<DownloadStatus>
}

export const createHostClient = (options: ApiClientOptions): Promise<HostClient> =>
  Effect.runPromise(makeApiClient(options)).then((client) => ({
    login: (passcode) =>
      runApi(client.host.loginHost({
        payload: parse(HostLogin, { passcode }, "Invalid passcode")
      })),
    logout: () =>
      runApi(client.host.logoutHost()),
    createEvent: (input) =>
      runApi(client.host.createEvent({
        payload: parse(EventCreate, input, "Invalid event details")
      })),
    listEvents: () =>
      runApi(client.host.listEvents()),
    updateEventStatus: (slug, status) =>
      runApi(client.host.updateEventStatus({
        params: { slug: parse(EventSlug, slug, "Invalid event link") },
        payload: parse(EventStatusUpdate, { status }, "Invalid event status")
      })),
    renameEvent: (slug, title) =>
      runApi(client.host.renameEvent({
        params: { slug: parse(EventSlug, slug, "Invalid event link") },
        payload: parse(EventRename, { title }, "Invalid event title")
      })),
    duplicateEvent: (slug) =>
      runApi(client.host.duplicateEvent({
        params: { slug: parse(EventSlug, slug, "Invalid event link") }
      })),
    deleteEvent: (slug) =>
      runApi(client.host.deleteEvent({
        params: { slug: parse(EventSlug, slug, "Invalid event link") }
      })),
    listEventPhotos: (slug, query) =>
      runApi(client.host.listEventPhotos({
        params: { slug: parse(EventSlug, slug, "Invalid event link") },
        query: query === undefined ? {} : {
          limit: query.limit,
          cursorUploadedAt: query.cursorUploadedAt,
          cursorId: query.cursorId === undefined
            ? undefined
            : parse(PhotoId, query.cursorId, "Invalid photo cursor")
        }
      })),
    requestDownload: (slug) =>
      runApi(client.host.requestDownload({
        params: { slug: parse(EventSlug, slug, "Invalid event link") }
      })),
    getDownloadStatus: (slug) =>
      runApi(client.host.getDownloadStatus({
        params: { slug: parse(EventSlug, slug, "Invalid event link") }
      }))
  }))