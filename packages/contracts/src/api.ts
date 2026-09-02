import { Schema } from "effect"
import { CameraId, EventId, EventSlug, PhotoId, ObjectKey } from "./brands.ts"
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
  eventId: EventId,
  cameraId: CameraId,
  objectKey: ObjectKey,
  thumbKey: ObjectKey,
  takenAt: Schema.Date
}) {}
