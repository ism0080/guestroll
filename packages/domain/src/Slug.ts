import { Effect, Random } from "effect"
import { EventSlug } from "@guestroll/contracts"

export const SlugAlphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

export const SlugLength = 16

export const randomToken = (length: number) =>
  Effect.gen(function* () {
    const indices = yield* Effect.all(
      Array.from({ length }, () => Random.nextIntBetween(0, SlugAlphabet.length))
    )
    return indices.map((i) => SlugAlphabet[i] ?? "").join("")
  })

export const generateSlug = Effect.fn("generateSlug")(function* () {
  const token = yield* randomToken(SlugLength)
  return EventSlug.make(token)
})