import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Drizzle from "alchemy/Drizzle"
import * as Effect from "effect/Effect"
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
    const bucket = yield* Bucket
    const database = yield* Database
    const api = yield* ApiWorker
    const guest = yield* Guest(api.url)
    const host = yield* Host(api.url, guest.url)

    return {
      apiUrl: api.url,
      guestUrl: guest.url,
      hostUrl: host.url,
      bucketName: bucket.bucketName,
      databaseName: database.databaseName
    }
  })
)
