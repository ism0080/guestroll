import { Context, Effect, Layer } from "effect"
import { OwnerId } from "@guestroll/contracts"

export interface OwnerScopeDeps {
  readonly ownerId: OwnerId
}

export class OwnerScope extends Context.Service<OwnerScope, OwnerScopeDeps>()(
  "guestroll/OwnerScope"
) {}

const PlaceholderOwner = OwnerId.make("owner-placeholder")

export const OwnerScopePlaceholder = Layer.succeed(OwnerScope, {
  ownerId: PlaceholderOwner
})

export const requireOwner = Effect.map(OwnerScope, (scope) => scope.ownerId)
