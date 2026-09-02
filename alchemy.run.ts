import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Drizzle from "alchemy/Drizzle"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import ApiWorker from "./infra/Api.ts"
import { Bucket } from "./infra/Bucket.ts"
import { Database } from "./infra/Db.ts"

export default Alchemy.Stack(
  "Guestroll",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Drizzle.providers()),
    state: Cloudflare.state()
  },
  Effect.gen(function* () {
    const bucket = yield* Bucket
    const database = yield* Database
    const api = yield* ApiWorker

    return {
      apiUrl: api.url,
      bucketName: bucket.bucketName,
      databaseName: database.databaseName
    }
  })
)