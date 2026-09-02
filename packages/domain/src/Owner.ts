import { Owner, OwnerId } from "@guestroll/contracts"

export interface OwnerContext {
  readonly id: OwnerId
  readonly passcodeHash: string
  readonly now: Date
}

export const createOwner = (ctx: OwnerContext): Owner =>
  new Owner({
    id: ctx.id,
    passcodeHash: ctx.passcodeHash,
    createdAt: ctx.now
  })