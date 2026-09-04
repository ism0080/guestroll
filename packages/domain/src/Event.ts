import { Match, Result, Schema } from "effect"
import { Event, EventStatus } from "@guestroll/contracts"

export class InvalidEventTransition extends Schema.TaggedError<InvalidEventTransition>()(
  "InvalidEventTransition",
  {
    from: EventStatus,
    to: EventStatus
  }
) {}

export const transitionAllowed = (from: EventStatus, to: EventStatus): boolean =>
  Match.value(from).pipe(
    Match.when("draft", () => to === "live"),
    Match.when("live", () => to === "draft"),
    Match.orElse(() => false)
  )

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
