import { describe, expect, test } from "bun:test"
import { Result } from "effect"
import { Camera, CameraId, EventId } from "@guestroll/contracts"
import { reservePhoto } from "./Camera.ts"

describe("camera photo quota", () => {
  test("reserves below the limit and rejects at the limit", () => {
    const camera = new Camera({
      id: CameraId.make("camera"),
      eventId: EventId.make("event"),
      usedCount: 0,
      createdAt: new Date("2026-01-01T00:00:00.000Z")
    })
    const first = reservePhoto(camera, 1)
    expect(Result.isSuccess(first)).toBe(true)
    if (Result.isFailure(first)) return
    expect(first.success.usedCount).toBe(1)
    expect(Result.isFailure(reservePhoto(first.success, 1))).toBe(true)
  })
})
