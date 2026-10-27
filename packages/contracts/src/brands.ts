import { Schema } from "effect"

export const EventSlugPattern = /^[A-Za-z0-9]{16}$/

export const OwnerId = Schema.NonEmptyString.pipe(Schema.brand("OwnerId"))
export type OwnerId = typeof OwnerId.Type

export const EventId = Schema.NonEmptyString.pipe(Schema.brand("EventId"))
export type EventId = typeof EventId.Type

export const CameraId = Schema.NonEmptyString.pipe(Schema.brand("CameraId"))
export type CameraId = typeof CameraId.Type

export const GuestId = Schema.NonEmptyString.pipe(Schema.brand("GuestId"))
export type GuestId = typeof GuestId.Type

export const PhotoId = Schema.NonEmptyString.pipe(Schema.brand("PhotoId"))
export type PhotoId = typeof PhotoId.Type

export const UploadId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand("UploadId"))
export type UploadId = typeof UploadId.Type

export const EventSlug = Schema.String.check(
  Schema.isPattern(EventSlugPattern, {
    message: "must contain exactly 16 ASCII letters or digits"
  })
).pipe(Schema.brand("EventSlug"))
export type EventSlug = typeof EventSlug.Type

export const ObjectKey = Schema.NonEmptyString.pipe(Schema.brand("ObjectKey"))
export type ObjectKey = typeof ObjectKey.Type
