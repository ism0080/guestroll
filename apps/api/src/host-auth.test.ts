import { describe, expect, test } from "bun:test"
import { webcrypto } from "node:crypto"
import { Effect, Option } from "effect"
import type { GuestrollCrypto } from "./env.ts"
import { makeHostAuth } from "./host-auth.ts"
import { isAllowedOrigin } from "./handlers.ts"

// SAFETY: Bun's Web Crypto implements the three standard methods used by HostAuth.
const testCrypto = webcrypto as GuestrollCrypto
const auth = makeHostAuth("correct horse", "test-session-secret", testCrypto)

describe("host authentication", () => {
  test("accepts the configured passcode and rejects others", async () => {
    expect(await Effect.runPromise(auth.verifyPasscode("correct horse"))).toBe(true)
    expect(await Effect.runPromise(auth.verifyPasscode("wrong"))).toBe(false)
    expect(await Effect.runPromise(auth.verifyPasscode(""))).toBe(false)
  })

  test("signs a token that verifies back to its session", async () => {
    const token = await Effect.runPromise(auth.signSession("session-1", 2000000000))
    const verified = await Effect.runPromise(auth.verifyToken(token))
    expect(Option.isSome(verified)).toBe(true)
    if (Option.isSome(verified)) {
      expect(verified.value.sessionId).toBe("session-1")
      expect(verified.value.expiresAt).toBe(2000000000)
    }
  })

  test("rejects tampered and malformed tokens", async () => {
    const token = await Effect.runPromise(auth.signSession("session-1", 2000000000))
    expect(Option.isSome(await Effect.runPromise(auth.verifyToken(`${token}x`)))).toBe(false)
    const tamperedSessionId = `session-2.${token.slice(token.indexOf(".") + 1)}`
    expect(Option.isSome(await Effect.runPromise(auth.verifyToken(tamperedSessionId)))).toBe(false)
    const tamperedExpiry = token.replace(/\.2\d{9}\./, ".2900000000.")
    expect(Option.isSome(await Effect.runPromise(auth.verifyToken(tamperedExpiry)))).toBe(false)
    for (const malformed of ["", ".", "a.b", "..sig", "session-1.notanumber.sig"]) {
      expect(Option.isSome(await Effect.runPromise(auth.verifyToken(malformed)))).toBe(false)
    }
  })

  test("tokens from a different secret do not verify", async () => {
    const other = makeHostAuth("correct horse", "other-secret", testCrypto)
    const token = await Effect.runPromise(auth.signSession("session-1", 2000000000))
    expect(Option.isSome(await Effect.runPromise(other.verifyToken(token)))).toBe(false)
  })
})

describe("origin allowlist", () => {
  const configured = "https://dashboard.example.com"

  test("accepts only the exact configured origin", () => {
    expect(isAllowedOrigin(configured, configured)).toBe(true)
    expect(isAllowedOrigin("https://evil.example.com", configured)).toBe(false)
    expect(isAllowedOrigin(undefined, configured)).toBe(false)
  })

  test("does not treat generated workers.dev origins as allowed once configured", () => {
    expect(isAllowedOrigin("https://guestroll-api.workers.dev", configured)).toBe(false)
  })

  test("falls back to generated workers.dev origins only when unconfigured", () => {
    expect(isAllowedOrigin("https://guestroll-host.workers.dev", "")).toBe(true)
    expect(isAllowedOrigin("https://evil.example.com", "")).toBe(false)
    expect(isAllowedOrigin(undefined, "")).toBe(false)
    expect(isAllowedOrigin("https://sub.guestroll-host.workers.dev.attacker.com", "")).toBe(false)
  })
})
