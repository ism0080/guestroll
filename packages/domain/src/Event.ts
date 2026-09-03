import { Match, Result, Schema } from "effect"
import { Event, EventCreate, EventId, EventSlug, EventStatus, OwnerId } from "@guestroll/contracts"

export class InvalidEventTransition extends Schema.TaggedError<InvalidEventTransition>()(
  "InvalidEventTransition",
  {
    from: EventStatus,
    to: EventStatus
  }
) {}

export interface EventContext {
  readonly id: EventId
  readonly ownerId: OwnerId
  readonly slug: EventSlug
  readonly now: Date
}

export const transitionAllowed = (from: EventStatus, to: EventStatus): boolean =>
  Match.value(from).pipe(
    Match.when("draft", () => to === "live"),
    Match.when("live", () => to === "draft"),
    Match.orElse(() => false)
  )

export const createEvent = (input: EventCreate, ctx: EventContext): Event =>
  new Event({
    id: ctx.id,
    ownerId: ctx.ownerId,
    slug: ctx.slug,
    title: input.title,
    filterPack: input.filterPack,
    photoLimit: input.photoLimit,
    status: "draft",
    createdAt: ctx.now,
    updatedAt: ctx.now
  })

export const transitionEventStatus = (
  event: Event,
  to: EventStatus,
  now: Date
): Result.Result<Event, InvalidEventTransition> => {
  const from = event.status
  if (transitionAllowed(from, to)) {
    return Result.succeed(
      new Event({
        id: event.id,
        ownerId: event.ownerId,
        slug: event.slug,
        title: event.title,
        coverKey: event.coverKey,
        filterPack: event.filterPack,
        photoLimit: event.photoLimit,
        status: to,
        createdAt: event.createdAt,
        updatedAt: now
      })
    )
  }
  return Result.fail(new InvalidEventTransition({ from, to }))
}