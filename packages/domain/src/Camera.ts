import { Result, Schema } from "effect"
import { Camera, CameraCreate, CameraId, EventId, PhotoLimit, UsedCount } from "@guestroll/contracts"

export class PhotoLimitExceeded extends Schema.TaggedError<PhotoLimitExceeded>()(
  "PhotoLimitExceeded",
  {
    limit: PhotoLimit,
    used: UsedCount
  }
) {}

export interface CameraContext {
  readonly id: CameraId
  readonly eventId: EventId
  readonly now: Date
}

export const createCamera = (input: CameraCreate, ctx: CameraContext): Camera =>
  new Camera({
    id: ctx.id,
    eventId: ctx.eventId,
    guestName: input.guestName,
    usedCount: 0,
    createdAt: ctx.now
  })

export const reservePhoto = (
  camera: Camera,
  limit: PhotoLimit
): Result.Result<Camera, PhotoLimitExceeded> => {
  if (camera.usedCount >= limit) {
    return Result.fail(new PhotoLimitExceeded({ limit, used: camera.usedCount }))
  }
  return Result.succeed(
    new Camera({
      id: camera.id,
      eventId: camera.eventId,
      guestName: camera.guestName,
      usedCount: camera.usedCount + 1,
      createdAt: camera.createdAt
    })
  )
}