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
  HostPhoto,
  UploadResult
} from "@guestroll/contracts"

const SlugParams = Schema.Struct({ slug: EventSlug })

export const GetEvent = HttpApiEndpoint.get("getEvent", "/events/:slug", {
  params: SlugParams,
  success: EventPublic,
  error: HttpApiError.NotFound
})

export const CreateEvent = HttpApiEndpoint.post("createEvent", "/events", {
  payload: EventCreate,
  success: EventPublic
})

export const ListEvents = HttpApiEndpoint.get("listEvents", "/events", {
  success: Schema.Array(EventPublic)
})

export const UpdateEventStatus = HttpApiEndpoint.patch(
  "updateEventStatus",
  "/events/:slug/status",
  {
    params: SlugParams,
    payload: EventStatusUpdate,
    success: EventPublic,
    error: [HttpApiError.NotFound, HttpApiError.BadRequest]
  }
)

export const CreateCamera = HttpApiEndpoint.post(
  "createCamera",
  "/events/:slug/cameras",
  {
    params: SlugParams,
    payload: CameraCreate,
    success: CameraCreateResult,
    error: [HttpApiError.NotFound, HttpApiError.Forbidden]
  }
)

export const UploadPhoto = HttpApiEndpoint.post(
  "uploadPhoto",
  "/events/:slug/photos",
  {
    params: SlugParams,
    payload: Schema.Unknown.pipe(HttpApiSchema.asMultipartStream()),
    success: UploadResult,
    error: [
      HttpApiError.NotFound,
      HttpApiError.Forbidden,
      HttpApiError.BadRequest,
      HttpApiError.Conflict
    ]
  }
)

export const ListEventPhotos = HttpApiEndpoint.get(
  "listEventPhotos",
  "/events/:slug/photos",
  {
    params: SlugParams,
    success: Schema.Array(HostPhoto),
    error: HttpApiError.NotFound
  }
)

export class GuestGroup extends HttpApiGroup.make("guest")
  .add(GetEvent)
  .add(CreateCamera)
  .add(UploadPhoto) {}

export class HostGroup extends HttpApiGroup.make("host")
  .add(CreateEvent)
  .add(ListEvents)
  .add(UpdateEventStatus)
  .add(ListEventPhotos) {}

export class EventsApi extends HttpApi.make("events").add(GuestGroup).add(HostGroup) {}
