import { Context, Effect } from "effect"

export interface BackgroundDeps {
  /**
   * Runs an Effect in the background after the request response is sent,
   * keeping the worker alive until it settles. Mirrors the Workers
   * `ctx.waitUntil` capability; the infra layer backs it with the per-event
   * execution context, which also provides the effect's services.
   */
  readonly waitUntil: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<void, never, R>
}

export class Background extends Context.Service<Background, BackgroundDeps>()(
  "guestroll/Background"
) {}