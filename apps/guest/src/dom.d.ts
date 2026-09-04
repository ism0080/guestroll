/// <reference lib="dom" />

/**
 * Non-standard but widely-supported video constraints on mobile browsers.
 * The DOM `MediaTrackConstraintSet` type omits several of these.
 */
interface MediaTrackConstraintSet {
  torch?: boolean
  zoom?: number
  focusMode?: string
  focusDistance?: number
  exposureMode?: string
}

interface MediaTrackCapabilities {
  torch?: boolean
  zoom?: MediaSettingsRange
  focusMode?: ReadonlyArray<string>
  focusDistance?: MediaSettingsRange
  exposureMode?: ReadonlyArray<string>
}

interface MediaTrackSettings {
  zoom?: number
  focusDistance?: number
}

/** Chromium's PWA install prompt, not part of the standard DOM lib. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: ReadonlyArray<string>
  readonly userChoice: Promise<{ readonly outcome: "accepted" | "dismissed"; readonly platform: string }>
  prompt(): Promise<void>
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent
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

/** Chromium's QR detector; iOS uses the bundled decoder instead. */
interface BarcodeDetector {
  detect(source: ImageBitmapSource): Promise<ReadonlyArray<{ readonly rawValue?: string }>>
}

interface BarcodeDetectorConstructor {
  new (options?: { readonly formats?: ReadonlyArray<string> }): BarcodeDetector
}

interface Window {
  BarcodeDetector?: BarcodeDetectorConstructor
}

/** Barcode Detection API, supported by Chromium but not yet in TypeScript's DOM lib. */
