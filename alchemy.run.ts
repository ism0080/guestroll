import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Drizzle from "alchemy/Drizzle"
import * as Effect from "effect/Effect"
import * as Config from "effect/Config"
import * as Option from "effect/Option"
import * as Layer from "effect/Layer"
import ApiWorker from "./infra/Api.ts"
import { Bucket } from "./infra/Bucket.ts"
import { Database } from "./infra/Db.ts"
import { Guest } from "./infra/Guest.ts"
import { Host } from "./infra/Host.ts"

export default Alchemy.Stack(
  "Guestroll",
  {
    providers: Layer.mergeAll(
      Cloudflare.providers(),
      Drizzle.providers(),
      Alchemy.RandomProvider()
    ),
    state: Cloudflare.state()
  },
  Effect.gen(function* () {
    const apiDomain = Option.getOrUndefined(yield* Config.option(Config.string("API_DOMAIN")))
    const guestDomain = Option.getOrUndefined(yield* Config.option(Config.string("GUEST_DOMAIN")))
    const hostDomain = Option.getOrUndefined(yield* Config.option(Config.string("HOST_DOMAIN")))
    const bucket = yield* Bucket
    const database = yield* Database
    const api = yield* ApiWorker(
      apiDomain,
      hostDomain === undefined ? undefined : `https://${hostDomain}`,
      guestDomain === undefined ? undefined : `https://${guestDomain}`
    )
    const guest = yield* Guest(api.url, guestDomain)
    const host = yield* Host(api.url, guest.url, hostDomain)

    return {
      apiUrl: api.url,
      guestUrl: guest.url,
      hostUrl: host.url,
      bucketName: bucket.bucketName,
      databaseName: database.databaseName
    }
  })
)
