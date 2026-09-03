import { EventSlug } from "@guestroll/contracts"

export const SlugAlphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

export const SlugLength = 16

/** Brands a token created with the slug alphabet and fixed length. */
export const makeEventSlug = (token: string): EventSlug => EventSlug.make(token)
