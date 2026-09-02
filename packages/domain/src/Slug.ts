import { EventSlug } from "@guestroll/contracts"

export const SlugAlphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

export const SlugLength = 16

/** Brands a securely generated token as an event slug. */
export const makeEventSlug = (token: string): EventSlug => EventSlug.make(token)
