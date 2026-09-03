/// <reference lib="dom" />

/**
 * `torch` is a non-standard but widely-supported video constraint on mobile
 * browsers; the DOM `MediaTrackConstraintSet` type omits it.
 */
interface MediaTrackConstraintSet {
  torch?: boolean
}

/** Chromium's PWA install prompt, not part of the standard DOM lib. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: ReadonlyArray<string>
  readonly userChoice: Promise<{ readonly outcome: "accepted" | "dismissed"; readonly platform: string }>
  prompt(): Promise<void>
}

/**
 * Background Sync API. Not in the DOM lib yet; `sync` is absent on browsers
 * without support, so it's optional and guarded at runtime.
 */
interface SyncManager {
  register(tag: string): Promise<void>
}

interface ServiceWorkerRegistration {
  readonly sync?: SyncManager
}

/** iOS Safari only: `true` when running from the home-screen icon. */
interface Navigator {
  readonly standalone?: boolean
}