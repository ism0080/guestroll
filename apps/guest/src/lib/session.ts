import { Option, Schema } from "effect"

const NonNegativeInt = Schema.Int.pipe(
  Schema.refine((n): n is number => n >= 0, { message: "must be a non-negative integer" })
)
const PositiveInt = Schema.Int.pipe(
  Schema.refine((n): n is number => n > 0, { message: "must be a positive integer" })
)

export const CameraSession = Schema.Struct({
  cameraId: Schema.NonEmptyString,
  usedCount: NonNegativeInt,
  photoLimit: PositiveInt,
  guestName: Schema.optional(Schema.NonEmptyString)
})
export type CameraSession = typeof CameraSession.Type

const _keyFor = (slug: string): string => `guestroll.camera.${slug}`

const _storage = (): Storage | undefined => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/**
 * Loads the camera persisted for this event slug, or undefined when the
 * guest is on their first visit / the previous camera is gone.
 */
export const loadCameraSession = (slug: string): CameraSession | undefined => {
  const storage = _storage()
  if (storage === undefined) return undefined
  const raw = storage.getItem(_keyFor(slug))
  if (raw === null) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  return Option.match(Schema.decodeUnknownOption(CameraSession)(parsed), {
    onNone: () => undefined,
    onSome: (session) => session
  })
}

/** Persists the camera so a reload keeps the same roll and counter. */
export const saveCameraSession = (slug: string, session: CameraSession): void => {
  const storage = _storage()
  if (storage === undefined) return
  storage.setItem(_keyFor(slug), JSON.stringify(session))
}

export const clearCameraSession = (slug: string): void => {
  const storage = _storage()
  if (storage === undefined) return
  storage.removeItem(_keyFor(slug))
}