import { Context } from "effect"
import type { D1Database, R2Bucket } from "@cloudflare/workers-types"

export interface WorkerEnvBindings {
  readonly DB: D1Database
  readonly BUCKET: R2Bucket
}

export class WorkerEnv extends Context.Service<WorkerEnv, WorkerEnvBindings>()(
  "guestroll/WorkerEnv"
) {}
