import { Schema } from "effect"
import * as HttpApi from "effect/unstable/httpapi/HttpApi"
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint"
import * as HttpApiError from "effect/unstable/httpapi/HttpApiError"
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup"
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema"
import {
  CameraCreate,
  CameraCreateResult,
  CameraId,
  DownloadStatus,
  EventCreate,
  EventPublic,
  EventRename,
  EventSlug,
  EventStatusUpdate,
  HostCamera,
  HostLogin,
  HostPhotoPage,
  HostSession,
  PhotoId,
  RateLimitExceeded,
  UploadResult
} from "@guestroll/contracts"

const SlugParams = Schema.Struct({ slug: EventSlug })
const PhotoParams = Schema.Struct({ slug: EventSlug, photoId: PhotoId })
const CameraParams = Schema.Struct({ slug: EventSlug, cameraId: CameraId })
const PhotoPageQuery = Schema.Struct({
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
  cursorUploadedAt: Schema.optional(Schema.DateFromString),
  cursorId: Schema.optional(PhotoId)
})

export const LoginHost = HttpApiEndpoint.post("loginHost", "/host/login", {
  payload: HostLogin,
  success: HostSession,
  error: [HttpApiError.Unauthorized, RateLimitExceeded]
})

export const LogoutHost = HttpApiEndpoint.post("logoutHost", "/host/logout", {
  success: HostSession,
  error: HttpApiError.Unauthorized
})

export const GetEvent = HttpApiEndpoint.get("getEvent", "/events/:slug", {
  params: SlugParams,
  success: EventPublic,
  error: HttpApiError.NotFound
})

export const CreateEvent = HttpApiEndpoint.post("createEvent", "/events", {
  payload: EventCreate,
  success: EventPublic,
  error: HttpApiError.Unauthorized
})

export const ListEvents = HttpApiEndpoint.get("listEvents", "/events", {
  success: Schema.Array(EventPublic),
  error: HttpApiError.Unauthorized
})

export const UpdateEventStatus = HttpApiEndpoint.patch(
  "updateEventStatus",
  "/events/:slug/status",
  {
    params: SlugParams,
    payload: EventStatusUpdate,
    success: EventPublic,
    error: [HttpApiError.NotFound, HttpApiError.BadRequest, HttpApiError.Unauthorized]
  }
)

export const RenameEvent = HttpApiEndpoint.patch(
  "renameEvent",
  "/events/:slug",
  {
    params: SlugParams,
    payload: EventRename,
    success: EventPublic,
    error: [HttpApiError.NotFound, HttpApiError.BadRequest, HttpApiError.Unauthorized]
  }
)

export const DuplicateEvent = HttpApiEndpoint.post(
  "duplicateEvent",
  "/events/:slug/duplicate",
  {
    params: SlugParams,
    success: EventPublic,
    error: [HttpApiError.NotFound, HttpApiError.Unauthorized]
  }
)

export const DeleteEvent = HttpApiEndpoint.delete(
  "deleteEvent",
  "/events/:slug",
  {
    params: SlugParams,
    success: HttpApiSchema.NoContent,
    error: [HttpApiError.NotFound, HttpApiError.Unauthorized]
  }
)

export const CreateCamera = HttpApiEndpoint.post(
  "createCamera",
  "/events/:slug/cameras",
  {
    params: SlugParams,
    payload: CameraCreate,
    success: CameraCreateResult,
    error: [
      HttpApiError.NotFound,
      HttpApiError.Forbidden,
      HttpApiError.Unauthorized,
      HttpApiError.Conflict,
      RateLimitExceeded
    ]
  }
)

export const UploadPhoto = HttpApiEndpoint.post(
  "uploadPhoto",
  "/events/:slug/photos",
  {
    params: SlugParams,
    payload: Schema.Unknown.pipe(HttpApiSchema.asMultipartStream({
      maxParts: 4,
      maxFieldSize: 256,
      maxFileSize: 2 * 1024 * 1024,
      maxTotalSize: 2 * 1024 * 1024 + 1024
    })),
    success: UploadResult,
    error: [
      HttpApiError.NotFound,
      HttpApiError.Forbidden,
      HttpApiError.Unauthorized,
      HttpApiError.BadRequest,
      HttpApiError.Conflict,
      RateLimitExceeded
    ]
  }
)

export const ListEventPhotos = HttpApiEndpoint.get(
  "listEventPhotos",
  "/events/:slug/photos",
  {
    params: SlugParams,
    query: PhotoPageQuery,
    success: HostPhotoPage,
    error: [HttpApiError.NotFound, HttpApiError.BadRequest, HttpApiError.Unauthorized]
  }
)

export const ListEventCameras = HttpApiEndpoint.get(
  "listEventCameras",
  "/events/:slug/cameras",
  {
    params: SlugParams,
    success: Schema.Array(HostCamera),
    error: [HttpApiError.NotFound, HttpApiError.Unauthorized]
  }
)

export const ResetCamera = HttpApiEndpoint.post(
  "resetCamera",
  "/events/:slug/cameras/:cameraId/reset",
  {
    params: CameraParams,
    success: HostCamera,
    error: [HttpApiError.NotFound, HttpApiError.Unauthorized]
  }
)

export const GetHostPhoto = HttpApiEndpoint.get(
  "getHostPhoto",
  "/events/:slug/photos/:photoId",
  {
    params: PhotoParams,
    success: HttpApiSchema.NoContent,
    error: [HttpApiError.NotFound, HttpApiError.Unauthorized]
  }
)

export const RequestDownload = HttpApiEndpoint.post(
  "requestDownload",
  "/events/:slug/downloads",
  {
    params: SlugParams,
    success: DownloadStatus,
    error: [HttpApiError.NotFound, HttpApiError.Unauthorized]
  }
)

export const GetDownloadStatus = HttpApiEndpoint.get(
  "getDownloadStatus",
  "/events/:slug/downloads",
  {
    params: SlugParams,
    success: DownloadStatus,
    error: [HttpApiError.NotFound, HttpApiError.Unauthorized]
  }
)

export const GetDownloadFile = HttpApiEndpoint.get(
  "getDownloadFile",
  "/events/:slug/download",
  {
    params: SlugParams,
    success: HttpApiSchema.NoContent,
    error: [HttpApiError.NotFound, HttpApiError.Unauthorized]
  }
)

export class GuestGroup extends HttpApiGroup.make("guest")
  .add(GetEvent)
  .add(CreateCamera)
  .add(UploadPhoto) {}

export class HostGroup extends HttpApiGroup.make("host")
  .add(LoginHost)
  .add(LogoutHost)
  .add(CreateEvent)
  .add(ListEvents)
  .add(UpdateEventStatus)
  .add(RenameEvent)
  .add(DuplicateEvent)
  .add(DeleteEvent)
  .add(ListEventPhotos)
  .add(ListEventCameras)
  .add(ResetCamera)
  .add(GetHostPhoto)
  .add(RequestDownload)
  .add(GetDownloadStatus)
  .add(GetDownloadFile) {}

export class EventsApi extends HttpApi.make("events").add(GuestGroup).add(HostGroup) {}
