import { Clock, Context, Effect, Layer, Option } from "effect"
import type * as HttpServerRequest from "effect/unstable/http/HttpServerRequest"
import { OwnerId } from "@guestroll/contracts"
import { WorkerEnv } from "./env.ts"
import type { GuestrollCrypto } from "./env.ts"

export const HostSessionCookie = "guestroll_host_session"
const SessionLifetimeSeconds = 60 * 60 * 24 * 30
const Owner = OwnerId.make("owner")
const encoder = new TextEncoder()

const _constantTimeEqual = Effect.fn("constantTimeEqual")(function* (
  left: string,
  right: string,
  cryptography: GuestrollCrypto
) {
  const digest = (value: string) =>
    Effect.promise(() => cryptography.subtle.digest("SHA-256", encoder.encode(value)))
  const [leftHash, rightHash] = yield* Effect.all([digest(left), digest(right)])
  const leftBytes = new Uint8Array(leftHash)
  const rightBytes = new Uint8Array(rightHash)
  let difference = leftBytes.length ^ rightBytes.length
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0)
  }
  return difference === 0
})

const _signSessionExpiry = (
  secret: string,
  expiresAt: number,
  cryptography: GuestrollCrypto
): Effect.Effect<string> =>
  Effect.promise(() => cryptography.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    ).then((key) => cryptography.subtle.sign("HMAC", key, encoder.encode(`guestroll:${expiresAt}`)))
      .then((bytes) =>
        Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""))
  )

export interface HostAuthDeps {
  readonly authenticate: (passcode: string) => Effect.Effect<Option.Option<string>>
  readonly authorize: (request: HttpServerRequest.HttpServerRequest) => Effect.Effect<Option.Option<OwnerId>>
}

/** Authenticates the single host and issues/verifies a signed 30-day session cookie. */
export class HostAuth extends Context.Service<HostAuth, HostAuthDeps>()("guestroll/HostAuth") {}

/** Builds host authentication from explicit secrets and a Web Crypto implementation. */
export const makeHostAuth = (
  hostPasscode: string,
  sessionSecret: string,
  cryptography: GuestrollCrypto
): HostAuthDeps => {
  const authenticate: HostAuthDeps["authenticate"] = Effect.fn("HostAuth.authenticate")(
      function* (passcode) {
        if (!(yield* _constantTimeEqual(passcode, hostPasscode, cryptography))) return Option.none()
        const now = yield* Clock.currentTimeMillis
        const expiresAt = Math.floor(now / 1000) + SessionLifetimeSeconds
        const signature = yield* _signSessionExpiry(sessionSecret, expiresAt, cryptography)
        return Option.some(`${expiresAt}.${signature}`)
      }
    )
  const authorize: HostAuthDeps["authorize"] = Effect.fn("HostAuth.authorize")(
      function* (request) {
        const token = request.cookies[HostSessionCookie]
        if (token === undefined) return Option.none()
        const separator = token.indexOf(".")
        if (separator < 1) return Option.none()
        const expiresAtText = token.slice(0, separator)
        const signature = token.slice(separator + 1)
        const expiresAt = Number(expiresAtText)
        const now = yield* Clock.currentTimeMillis
        if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) {
          return Option.none()
        }
        const expected = yield* _signSessionExpiry(sessionSecret, expiresAt, cryptography)
        return (yield* _constantTimeEqual(signature, expected, cryptography)) ? Option.some(Owner) : Option.none()
      }
    )
  return { authenticate, authorize }
}

export const HostAuthLive = Layer.effect(
  HostAuth,
  Effect.gen(function* () {
    const env = yield* WorkerEnv
    return HostAuth.of(makeHostAuth(env.HOST_PASSCODE, env.HOST_SESSION_SECRET, env.CRYPTO))
  })
)
