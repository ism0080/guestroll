import { Schema } from "effect"

const _id = (name: string) => Schema.NonEmptyString.pipe(Schema.brand(name))

export const OwnerId = _id("OwnerId")
export type OwnerId = typeof OwnerId.Type

export const EventId = _id("EventId")
export type EventId = typeof EventId.Type

export const CameraId = _id("CameraId")
export type CameraId = typeof CameraId.Type

export const PhotoId = _id("PhotoId")
export type PhotoId = typeof PhotoId.Type

export const UploadId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand("UploadId"))
export type UploadId = typeof UploadId.Type

export const EventSlug = _id("EventSlug")
export type EventSlug = typeof EventSlug.Type

export const ObjectKey = _id("ObjectKey")
export type ObjectKey = typeof ObjectKey.Type
