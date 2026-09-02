import * as Cloudflare from "alchemy/Cloudflare"
import * as Drizzle from "alchemy/Drizzle"
import * as Effect from "effect/Effect"

/**
 * The D1 database, kept in lockstep with the `@guestroll/api` schema expectations:
 * `Drizzle.Schema` regenerates migration SQL on every deploy and the
 * `migrations` wire applies it to D1 before the Worker is updated.
 */
export const Database = Effect.gen(function* () {
  const schema = yield* Drizzle.Schema("app-schema", {
    schema: "./infra/schema.ts",
    out: "./migrations",
    dialect: "sqlite"
  })

  return yield* Cloudflare.D1.Database("DB", {
    migrations: schema
  })
})