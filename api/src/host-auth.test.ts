import { describe, expect, test } from "bun:test"
import { webcrypto } from "node:crypto"
import { Effect, Option } from "effect"
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest"
import type { GuestrollCrypto } from "./env.ts"
import { HostSessionCookie, makeHostAuth } from "./host-auth.ts"

// SAFETY: Bun's Web Crypto implements the three standard methods used by HostAuth.
const testCrypto = webcrypto as GuestrollCrypto
const auth = makeHostAuth("correct horse", "test-session-secret", testCrypto)

describe("host authentication", () => {
  test("accepts the configured passcode and verifies its signed cookie", async () => {
    const token = await Effect.runPromise(auth.authenticate("correct horse"))
    expect(Option.isSome(token)).toBe(true)
    if (Option.isNone(token)) return
    const request = HttpServerRequest.fromWeb(new Request("https://guestroll.test/events", {
      headers: { cookie: `${HostSessionCookie}=${token.value}` }
    }))
    const owner = await Effect.runPromise(auth.authorize(request))
    expect(Option.isSome(owner)).toBe(true)
  })

  test("rejects incorrect passcodes and modified cookies", async () => {
    const denied = await Effect.runPromise(auth.authenticate("wrong"))
    expect(Option.isNone(denied)).toBe(true)
    const token = await Effect.runPromise(auth.authenticate("correct horse"))
    if (Option.isNone(token)) throw new Error("Host auth test failed to issue a session")
    const request = HttpServerRequest.fromWeb(new Request("https://guestroll.test/events", {
      headers: { cookie: `${HostSessionCookie}=${token.value}changed` }
    }))
    const owner = await Effect.runPromise(auth.authorize(request))
    expect(Option.isNone(owner)).toBe(true)
  })
})
