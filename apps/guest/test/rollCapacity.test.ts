import { describe, expect, test } from "bun:test"
import { claimedPhotoCount, hasCaptureCapacity } from "../src/lib/rollCapacity"

describe("roll capture capacity", () => {
  test("reserves exposures for photos still saving or queued", () => {
    const claimed = claimedPhotoCount(2, 1, 1)

    expect(claimed).toBe(4)
    expect(hasCaptureCapacity(claimed, 4)).toBe(false)
  })

  test("ignores failed photos, whose claims were never recorded server-side", () => {
    expect(hasCaptureCapacity(claimedPhotoCount(3, 0, 0), 4)).toBe(true)
  })
})
