import { Context } from "effect"
import type { D1Database, R2Bucket, RateLimit } from "@cloudflare/workers-types"

/**
 * The slice of the Web Crypto API Guestroll uses. `getRandomValues` is
 * narrowed to typed arrays — the only form Guestroll passes — so both the
 * Workers global `crypto` and Bun/Node's `webcrypto` satisfy it directly.
 */
export type GuestrollCrypto = Pick<Crypto, "randomUUID" | "subtle"> & {
  getRandomValues: <T extends Uint8Array<ArrayBuffer>>(array: T) => T
}

export interface WorkerEnvBindings {
  readonly DB: D1Database
  readonly BUCKET: R2Bucket
  readonly HOST_PASSCODE: string
  readonly HOST_SESSION_SECRET: string
  readonly HOST_ALLOWED_ORIGIN: string
  readonly GUEST_ALLOWED_ORIGIN: string
  readonly CRYPTO: GuestrollCrypto
  readonly GUEST_RATE_LIMIT: RateLimit
  readonly LOGIN_RATE_LIMIT: RateLimit
}

export class WorkerEnv extends Context.Service<WorkerEnv, WorkerEnvBindings>()(
  "guestroll/WorkerEnv"
) {}
