import { randomUUID } from "./api"

const _key = "guestroll.guestId"

const _storage = (): Storage | undefined => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/**
 * The device's stable guest identity, minted once and reused across every
 * event. The API ties one camera (roll) to each `(event, guestId)` pair, so a
 * guest who has used up their roll cannot start a new one for the same event.
 */
export const deviceGuestId = (): string => {
  const storage = _storage()
  if (storage === undefined) return randomUUID()
  const existing = storage.getItem(_key)
  if (existing !== null && existing !== "") return existing
  const id = randomUUID()
  storage.setItem(_key, id)
  return id
}