import { createSignal, onCleanup, onMount, Show } from "solid-js"
import type { JSX } from "solid-js"
import { CloseIcon, DownloadIcon, ShareIcon } from "@guestroll/ui"

const IOS_DISMISS_KEY = "guestroll.install.ios-dismissed"

const _isIOS = (): boolean =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)

const _isStandalone = (): boolean => {
  if ("standalone" in navigator) return navigator.standalone === true
  return window.matchMedia("(display-mode: standalone)").matches
}

const _iosDismissed = (): boolean => {
  try {
    return window.localStorage.getItem(IOS_DISMISS_KEY) === "1"
  } catch {
    return false
  }
}

const _dismissIos = (): void => {
  try {
    window.localStorage.setItem(IOS_DISMISS_KEY, "1")
  } catch {
    // Storage unavailable — the banner just stays for this session.
  }
}

/**
 * Offers to install the guest PWA as a home-screen app.
 *
 * - Chromium (Android/desktop Chrome) fires `beforeinstallprompt` once install
 *   criteria are met; the banner then shows a one-tap install button.
 * - iOS Safari has no programmatic prompt, so it shows step-by-step "Add to
 *   Home Screen" guidance instead, hidden once the app is running standalone.
 */
export const InstallPrompt = (): JSX.Element => {
  const [installable, setInstallable] = createSignal(false)
  const [iosVisible, setIosVisible] = createSignal(false)
  let deferred: BeforeInstallPromptEvent | undefined

  onMount(() => {
    if (_isIOS() && !_isStandalone() && !_iosDismissed()) {
      setIosVisible(true)
    }

    const onPrompt = (event: BeforeInstallPromptEvent): void => {
      event.preventDefault()
      deferred = event
      setInstallable(true)
    }
    const onInstalled = (): void => {
      deferred = undefined
      setInstallable(false)
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    onCleanup(() => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    })
  })

  const install = async (): Promise<void> => {
    const prompt = deferred
    if (prompt === undefined) return
    try {
      await prompt.prompt()
      await prompt.userChoice
      deferred = undefined
      setInstallable(false)
    } catch {
      deferred = undefined
      setInstallable(false)
    }
  }

  const dismissIos = (): void => {
    setIosVisible(false)
    _dismissIos()
  }

  return (
    <>
      <Show when={installable()}>
        <div class="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <div class="w-full max-w-md rounded-box border-2 border-neutral bg-base-100 shadow-[5px_5px_0_0_var(--guestroll-ink)]">
            <div class="flex flex-row items-center gap-3 p-4">
              <div class="flex-1 text-sm">
                <p class="font-semibold">Snap like an app</p>
                <p class="text-base-content/70">Install GuestRoll for a full-screen camera.</p>
              </div>
              <button
                type="button"
                class="shutter-btn btn btn-sm btn-primary border-2 border-neutral"
                onClick={() => void install()}
              >
                <DownloadIcon class="h-4 w-4" />
                Install
              </button>
              <button
                type="button"
                class="btn btn-sm btn-ghost"
                aria-label="Dismiss install prompt"
                onClick={() => setInstallable(false)}
              >
                <CloseIcon class="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={iosVisible()}>
        <div class="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <div class="w-full max-w-md rounded-box border-2 border-neutral bg-base-100 shadow-[5px_5px_0_0_var(--guestroll-ink)]">
            <div class="flex flex-col gap-3 p-4">
              <div class="flex items-start gap-3">
                <div class="flex-1 text-sm">
                  <p class="font-semibold">Snap like an app</p>
                  <p class="mt-1 flex items-center gap-1 text-base-content/70">
                    Tap
                    <ShareIcon class="h-4 w-4 text-primary" />
                    Share, then “Add to Home Screen” for a full-screen camera.
                  </p>
                </div>
                <button
                  type="button"
                  class="btn btn-sm btn-ghost"
                  aria-label="Dismiss install prompt"
                  onClick={dismissIos}
                >
                  <CloseIcon class="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </>
  )
}
