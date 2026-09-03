import { describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"
import { EventSlug } from "./brands.ts"
import { CameraCreate, EventCreate } from "./entities.ts"

describe("public input validation", () => {
  test("accepts only fixed-length alphanumeric event slugs", () => {
    expect(Option.isSome(Schema.decodeOption(EventSlug)("aB3dE5fG7hI9jK1L"))).toBe(true)
    expect(Option.isNone(Schema.decodeOption(EventSlug)("too-short"))).toBe(true)
    expect(Option.isNone(Schema.decodeOption(EventSlug)("aB3dE5fG7hI9jK1-"))).toBe(true)
  })

  test("rejects unbounded persisted guest input", () => {
    expect(Option.isNone(Schema.decodeOption(EventCreate)({
      title: "x".repeat(161),
      filterPack: "film",
      photoLimit: 12
    }))).toBe(true)
    expect(Option.isNone(Schema.decodeOption(CameraCreate)({
      guestName: "x".repeat(81)
    }))).toBe(true)
    expect(Option.isNone(Schema.decodeOption(EventCreate)({
      title: "Wedding",
      filterPack: "film",
      photoLimit: 101
    }))).toBe(true)
  })
})
