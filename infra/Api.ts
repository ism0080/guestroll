import * as Cloudflare from "alchemy/Cloudflare"
import * as Alchemy from "alchemy"
import * as Config from "effect/Config"
import { ApiWorkerProgram } from "./ApiWorker.ts"
import { Bucket } from "./Bucket.ts"
import { Database } from "./Db.ts"

export default (
  apiDomain: string | undefined,
  hostOrigin: string | undefined,
  guestOrigin: string | undefined,
  zoneName: string | undefined
) => Cloudflare.Worker(
  "Api",
  {
    // The runtime module exports the Cloudflare.Worker wrapper consumed by
    // Alchemy's generated bridge.
    main: new URL("./ApiWorker.ts", import.meta.url).href,
    domain: apiDomain === undefined
      ? undefined
      : { name: apiDomain, zoneName },
    env: {
      DB: Database,
      BUCKET: Bucket,
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
  ApiWorkerProgram
)
