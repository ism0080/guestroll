import { describe, expect, test } from "bun:test"
import { Result } from "effect"
import { Event, EventId, EventSlug, FilterPack, OwnerId } from "@guestroll/contracts"
import { transitionEventStatus } from "./Event.ts"

const createdAt = new Date("2026-01-01T00:00:00.000Z")
const event = new Event({
  id: EventId.make("event"),
  ownerId: OwnerId.make("owner"),
  slug: EventSlug.make("slug"),
  title: "Wedding",
  filterPack: FilterPack.make("film"),
  photoLimit: 10,
  status: "draft",
  createdAt,
  updatedAt: createdAt
})

describe("event status transitions", () => {
  test("allows draft to live", () => {
    const result = transitionEventStatus(event, "live", new Date("2026-01-02T00:00:00.000Z"))
    expect(Result.isSuccess(result)).toBe(true)
  })

  test("rejects repeated and reverse transitions", () => {
    expect(Result.isFailure(transitionEventStatus(event, "draft", createdAt))).toBe(true)
    const live = new Event({
      id: event.id,
      ownerId: event.ownerId,
      slug: event.slug,
      title: event.title,
      coverKey: event.coverKey,
      filterPack: event.filterPack,
      photoLimit: event.photoLimit,
      status: "live",
      createdAt: event.createdAt,
      updatedAt: event.updatedAt
    })
    expect(Result.isFailure(transitionEventStatus(live, "draft", createdAt))).toBe(true)
  })
})
