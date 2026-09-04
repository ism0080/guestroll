import { describe, expect, test } from "bun:test"
import { claimedPhotoCount, hasCaptureCapacity } from "../src/lib/rollCapacity"

describe("roll capture capacity", () => {
  test("reserves exposures for photos still saving or queued", () => {
    const claimed = claimedPhotoCount(2, 1, 0, 1)

    expect(claimed).toBe(4)
    expect(hasCaptureCapacity(claimed, 4)).toBe(false)
  })

  test("keeps failed photos reserved for retry", () => {
    const claimed = claimedPhotoCount(3, 0, 1, 0)

    expect(hasCaptureCapacity(claimed, 4)).toBe(false)
  })
})
