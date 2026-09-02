import { Schema } from "effect"
import { CameraId, EventId, EventSlug, PhotoId, ObjectKey, UploadId } from "./brands.ts"
import { EventStatus, UsedCount } from "./status.ts"

export class EventPublic extends Schema.Class<EventPublic>("EventPublic")({
  id: EventId,
  slug: EventSlug,
  title: Schema.NonEmptyString,
  status: EventStatus,
  photoLimit: Schema.Int,
  filterPack: Schema.String
}) {}

export class CameraCreateResult extends Schema.Class<CameraCreateResult>("CameraCreateResult")({
  cameraId: CameraId,
  usedCount: UsedCount,
  photoLimit: Schema.Int
}) {}

export class UploadResult extends Schema.Class<UploadResult>("UploadResult")({
  photoId: PhotoId,
  usedCount: UsedCount,
  photoLimit: Schema.Int,
  remaining: Schema.Int
}) {}

export class HostPhoto extends Schema.Class<HostPhoto>("HostPhoto")({
  id: PhotoId,
  uploadId: UploadId,
  eventId: EventId,
  cameraId: CameraId,
  objectKey: ObjectKey,
  thumbKey: ObjectKey,
  takenAt: Schema.Date,
  uploadedAt: Schema.Date
}) {}

export class HostLogin extends Schema.Class<HostLogin>("HostLogin")({
  passcode: Schema.NonEmptyString
}) {}

export class HostSession extends Schema.Class<HostSession>("HostSession")({
  authenticated: Schema.Boolean
}) {}

export class PhotoCursor extends Schema.Class<PhotoCursor>("PhotoCursor")({
  uploadedAt: Schema.Date,
  id: PhotoId
}) {}

export class HostPhotoPage extends Schema.Class<HostPhotoPage>("HostPhotoPage")({
  photos: Schema.Array(HostPhoto),
  nextCursor: Schema.optional(PhotoCursor)
}) {}

export class RateLimitExceeded extends Schema.Error<RateLimitExceeded>("RateLimitExceeded")({
  _tag: Schema.tag("RateLimitExceeded")
}, {
  httpApiStatus: 429
}) {}
