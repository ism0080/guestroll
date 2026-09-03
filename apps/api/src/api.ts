import { Schema } from "effect"
import * as HttpApi from "effect/unstable/httpapi/HttpApi"
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint"
import * as HttpApiError from "effect/unstable/httpapi/HttpApiError"
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup"
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema"
import {
  CameraCreate,
  CameraCreateResult,
  EventCreate,
  EventPublic,
  EventSlug,
  EventStatusUpdate,
  HostLogin,
  HostPhotoPage,
  HostSession,
  PhotoId,
  RateLimitExceeded,
  UploadResult
} from "@guestroll/contracts"

const SlugParams = Schema.Struct({ slug: EventSlug })
const PhotoParams = Schema.Struct({ slug: EventSlug, photoId: PhotoId })
const PhotoPageQuery = Schema.Struct({
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
  cursorUploadedAt: Schema.optional(Schema.Date),
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

export const CreateCamera = HttpApiEndpoint.post(
  "createCamera",
  "/events/:slug/cameras",
  {
    params: SlugParams,
    payload: CameraCreate,
    success: CameraCreateResult,
    error: [HttpApiError.NotFound, HttpApiError.Forbidden, HttpApiError.Unauthorized, RateLimitExceeded]
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

export const GetHostPhoto = HttpApiEndpoint.get(
  "getHostPhoto",
  "/events/:slug/photos/:photoId",
  {
    params: PhotoParams,
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
  .add(ListEventPhotos)
  .add(GetHostPhoto) {}

export class EventsApi extends HttpApi.make("events").add(GuestGroup).add(HostGroup) {}
