import { Effect } from "effect"
import { makeEventSlug, SlugAlphabet, SlugLength } from "@guestroll/domain"
import { WorkerEnv } from "./env.ts"

/** Generates a cryptographically secure UUID for persisted identifiers. */
export const randomId = Effect.map(WorkerEnv, (env) => env.CRYPTO.randomUUID())

/** Generates an unbiased cryptographically secure guest access slug. */
export const randomEventSlug = Effect.map(WorkerEnv, (env) => {
  const rejectionLimit = 256 - (256 % SlugAlphabet.length)
  let token = ""
  while (token.length < SlugLength) {
    const bytes = env.CRYPTO.getRandomValues(new Uint8Array(SlugLength - token.length))
    for (const byte of bytes) {
      if (byte < rejectionLimit) token += SlugAlphabet[byte % SlugAlphabet.length] ?? ""
    }
  }
  return makeEventSlug(token)
})
