import { describe, expect, test } from "bun:test"
import { applyFilterToPixels, normalizeFilterPack } from "./filters.ts"

describe("canonical filter pipeline", () => {
  test("leaves pixels untouched for the natural pack", () => {
    const data = new Uint8ClampedArray([200, 100, 50, 255])
    applyFilterToPixels(data, "none")
    expect(Array.from(data)).toEqual([200, 100, 50, 255])
  })

  test("falls back to film for unknown packs", () => {
    expect(normalizeFilterPack("retro")).toBe("film")
    expect(normalizeFilterPack("film")).toBe("film")
  })

  test("desaturates fully for black & white", () => {
    const data = new Uint8ClampedArray([200, 100, 50, 255])
    applyFilterToPixels(data, "bw")
    expect(data[0]).toBe(data[1])
    expect(data[1]).toBe(data[2])
  })

  test("preserves alpha", () => {
    const data = new Uint8ClampedArray([200, 100, 50, 128])
    applyFilterToPixels(data, "vivid")
    expect(data[3]).toBe(128)
  })
})
