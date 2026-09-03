import { Schema } from "effect"

export const EventStatus = Schema.Literals(["draft", "live"])
export type EventStatus = typeof EventStatus.Type

const FilmFilterCss = "saturate(0.82) contrast(1.08) sepia(0.14) brightness(1.02)"

/** The supported filter packs, shared by the guest camera and host creation. */
export const FilterPackOptions = [
  { id: "film", label: "Film", css: FilmFilterCss },
  { id: "none", label: "Natural", css: "none" },
  { id: "bw", label: "Black & white", css: "grayscale(1) contrast(1.12)" },
  { id: "vivid", label: "Vivid", css: "saturate(1.3) contrast(1.12)" }
] as const

/** CSS `filter` value for a pack; unknown packs fall back to the film look. */
export const filterPackCss = (pack: string): string =>
  FilterPackOptions.find((option) => option.id === pack)?.css ?? FilmFilterCss

export const FilterPack = Schema.NonEmptyString.pipe(
  Schema.check(Schema.isMaxLength(64)),
  Schema.brand("FilterPack")
)
export type FilterPack = typeof FilterPack.Type

export const PhotoLimit = Schema.Int.pipe(
  Schema.refine((n): n is number => n > 0 && n <= 100, {
    message: "must be an integer between 1 and 100"
  })
)
export type PhotoLimit = typeof PhotoLimit.Type

export const UsedCount = Schema.Int.pipe(
  Schema.refine((n): n is number => n >= 0, { message: "must be a non-negative integer" })
)
export type UsedCount = typeof UsedCount.Type
