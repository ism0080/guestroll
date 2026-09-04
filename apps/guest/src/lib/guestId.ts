import { randomUUID } from "./api"

const _key = "guestroll.guestId"
const _nameKey = "guestroll.guestName"
let _memoryGuestId: string | undefined

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
  if (storage === undefined) return (_memoryGuestId ??= randomUUID())
  const existing = storage.getItem(_key)
  if (existing !== null && existing !== "") return existing
  const id = randomUUID()
  try {
    storage.setItem(_key, id)
  } catch {
    _memoryGuestId = id
  }
  return id
}

/** The guest name saved with this device, or an empty string on first use. */
export const deviceGuestName = (): string => {
  const storage = _storage()
  if (storage === undefined) return ""
  return storage.getItem(_nameKey) ?? ""
}

/** Persists the guest name with the device so a reset roll keeps the same name. */
export const saveDeviceGuestName = (name: string): void => {
  const storage = _storage()
  if (storage === undefined) return
  storage.setItem(_nameKey, name)
}
