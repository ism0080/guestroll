import { Context, Effect, Layer, Option } from "effect"
import { OwnerId } from "@guestroll/contracts"
import { WorkerEnv } from "./env.ts"
import type { GuestrollCrypto } from "./env.ts"

/** Host sessions live 30 days and can be revoked server-side at any time. */
export const SessionLifetimeSeconds = 60 * 60 * 24 * 30
export const HostOwnerId: OwnerId = OwnerId.make("owner")

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

const _signSessionPayload = (
  secret: string,
  sessionId: string,
  expiresAt: number,
  cryptography: GuestrollCrypto
): Effect.Effect<string> =>
  Effect.promise(() => cryptography.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    ).then((key) =>
      cryptography.subtle.sign(
        "HMAC",
        key,
        encoder.encode(`guestroll-host:${sessionId}:${expiresAt}`)
      )
    ).then((bytes) =>
      Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")
    )
  )

export interface VerifiedSession {
  readonly sessionId: string
  readonly expiresAt: number
}

export interface HostAuthDeps {
  readonly verifyPasscode: (passcode: string) => Effect.Effect<boolean>
  readonly signSession: (sessionId: string, expiresAt: number) => Effect.Effect<string>
  readonly verifyToken: (token: string) => Effect.Effect<Option.Option<VerifiedSession>>
}

/**
 * Signs and verifies bearer tokens of the form
 * `<sessionId>.<expiresAt-epoch-seconds>.<hmac>`. The signature only proves
 * authenticity and expiry; server-side liveness is checked against D1, so a
 * signed token stops working as soon as its session is revoked.
 */
export class HostAuth extends Context.Service<HostAuth, HostAuthDeps>()("guestroll/HostAuth") {}

/** Builds host authentication from explicit secrets and a Web Crypto implementation. */
export const makeHostAuth = (
  hostPasscode: string,
  sessionSecret: string,
  cryptography: GuestrollCrypto
): HostAuthDeps => {
  const verifyPasscode: HostAuthDeps["verifyPasscode"] = Effect.fn("HostAuth.verifyPasscode")(
      function* (passcode) {
        return yield* _constantTimeEqual(passcode, hostPasscode, cryptography)
      }
    )
  const signSession: HostAuthDeps["signSession"] = Effect.fn("HostAuth.signSession")(
      function* (sessionId, expiresAt) {
        const signature = yield* _signSessionPayload(sessionSecret, sessionId, expiresAt, cryptography)
        return `${sessionId}.${expiresAt}.${signature}`
      }
    )
  const verifyToken: HostAuthDeps["verifyToken"] = Effect.fn("HostAuth.verifyToken")(
      function* (token) {
        const first = token.indexOf(".")
        const second = first < 0 ? -1 : token.indexOf(".", first + 1)
        if (first < 1 || second < first + 2) return Option.none()
        const sessionId = token.slice(0, first)
        const expiresAtText = token.slice(first + 1, second)
        const signature = token.slice(second + 1)
        const expiresAt = Number(expiresAtText)
        if (!Number.isSafeInteger(expiresAt)) return Option.none()
        const expected = yield* _signSessionPayload(sessionSecret, sessionId, expiresAt, cryptography)
        if (!(yield* _constantTimeEqual(signature, expected, cryptography))) return Option.none()
        return Option.some({ sessionId, expiresAt })
      }
    )
  return { verifyPasscode, signSession, verifyToken }
}

export const HostAuthLive = Layer.effect(
  HostAuth,
  Effect.gen(function* () {
    const env = yield* WorkerEnv
    return HostAuth.of(makeHostAuth(env.HOST_PASSCODE, env.HOST_SESSION_SECRET, env.CRYPTO))
  })
)
