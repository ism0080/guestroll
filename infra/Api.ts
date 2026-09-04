import * as Cloudflare from "alchemy/Cloudflare"
import * as Alchemy from "alchemy"
import * as Config from "effect/Config"
import ApiWorker from "./ApiWorker.ts"

export default (
  apiDomain: string | undefined,
  hostOrigin: string | undefined,
  guestOrigin: string | undefined,
  zoneName: string | undefined
) => Cloudflare.Worker(
  "Api",
  {
    // The resource factory is not the deployed Worker entrypoint. The
    // dedicated runtime module exports the Effect program consumed by the
    // generated Alchemy bridge.
    main: new URL("./ApiWorker.ts", import.meta.url).href,
    domain: apiDomain === undefined
      ? undefined
      : { name: apiDomain, zoneName },
    env: {
      HOST_PASSCODE: Config.redacted("HOST_PASSCODE"),
      HOST_SESSION_SECRET: Alchemy.makeRandom("HostSessionSecret"),
      HOST_ALLOWED_ORIGIN: hostOrigin ?? "",
      GUEST_ALLOWED_ORIGIN: guestOrigin ?? "",
      GUEST_RATE_LIMIT: Cloudflare.RateLimit("GUEST_RATE_LIMIT", {
        namespaceId: 1001,
        simple: { limit: 60, period: 60 }
      }),
      LOGIN_RATE_LIMIT: Cloudflare.RateLimit("LOGIN_RATE_LIMIT", {
        namespaceId: 1002,
        simple: { limit: 5, period: 60 }
      })
    }
  },
  ApiWorker
)
