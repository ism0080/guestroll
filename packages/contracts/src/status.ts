import { Schema } from "effect"

export const EventStatus = Schema.Literals(["draft", "live"])
export type EventStatus = typeof EventStatus.Type

export const FilterPack = Schema.NonEmptyString.pipe(Schema.brand("FilterPack"))
export type FilterPack = typeof FilterPack.Type

export const PhotoLimit = Schema.Int.pipe(
  Schema.refine((n): n is number => n > 0, { message: "must be a positive integer" })
)
export type PhotoLimit = typeof PhotoLimit.Type

export const UsedCount = Schema.Int.pipe(
  Schema.refine((n): n is number => n >= 0, { message: "must be a non-negative integer" })
)
export type UsedCount = typeof UsedCount.Type