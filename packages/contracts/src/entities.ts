import { Schema } from "effect"
import {
  CameraId,
  EventId,
  EventSlug,
  GuestId,
  ObjectKey,
  OwnerId,
  PhotoId,
  UploadId
} from "./brands.ts"
import {
  EventStatus,
  FilterPack,
  PhotoLimit,
  UsedCount
} from "./status.ts"

export class Owner extends Schema.Class<Owner>("Owner")({
  id: OwnerId,
  passcodeHash: Schema.NonEmptyString,
  createdAt: Schema.Date
}) {}

export class Event extends Schema.Class<Event>("Event")({
  id: EventId,
  ownerId: OwnerId,
  slug: EventSlug,
  title: Schema.NonEmptyString.check(Schema.isMaxLength(160)),
  coverKey: Schema.optional(ObjectKey),
  filterPack: FilterPack,
  photoLimit: PhotoLimit,
  status: EventStatus,
  createdAt: Schema.Date,
  updatedAt: Schema.Date
}) {}

export class EventCreate extends Schema.Class<EventCreate>("EventCreate")({
  title: Schema.NonEmptyString.check(Schema.isMaxLength(160)),
  filterPack: FilterPack,
  photoLimit: PhotoLimit
}) {}

export class EventRename extends Schema.Class<EventRename>("EventRename")({
  title: Schema.NonEmptyString.check(Schema.isMaxLength(160))
}) {}

export class Camera extends Schema.Class<Camera>("Camera")({
  id: CameraId,
  eventId: EventId,
  guestName: Schema.optional(Schema.NonEmptyString.check(Schema.isMaxLength(80))),
  usedCount: UsedCount,
  createdAt: Schema.Date
}) {}

export class CameraCreate extends Schema.Class<CameraCreate>("CameraCreate")({
  guestId: GuestId,
  guestName: Schema.NonEmptyString.check(Schema.isMaxLength(80))
}) {}

export class Photo extends Schema.Class<Photo>("Photo")({
  id: PhotoId,
  uploadId: UploadId,
  eventId: EventId,
  cameraId: CameraId,
  objectKey: ObjectKey,
  thumbKey: ObjectKey,
  takenAt: Schema.Date,
  uploadedAt: Schema.Date
}) {}

export class PhotoUploadMeta extends Schema.Class<PhotoUploadMeta>("PhotoUploadMeta")({
  uploadId: UploadId,
  cameraId: CameraId,
  takenAt: Schema.Date
}) {}

export class EventStatusUpdate extends Schema.Class<EventStatusUpdate>("EventStatusUpdate")({
  status: EventStatus
}) {}
