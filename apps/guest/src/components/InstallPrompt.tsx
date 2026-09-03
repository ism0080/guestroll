import { createSignal, onCleanup, onMount, Show } from "solid-js"
import type { JSX } from "solid-js"
import { CloseIcon, DownloadIcon } from "./icons"

/**
 * Offers to install the guest PWA as a home-screen app. Chromium fires
 * `beforeinstallprompt` once install criteria are met (Android Chrome, desktop
 * Chrome); iOS Safari has no programmatic prompt, so the banner simply stays
 * hidden there.
 */
export const InstallPrompt = (): JSX.Element => {
  const [installable, setInstallable] = createSignal(false)
  const [dismissed, setDismissed] = createSignal(false)
  let deferred: BeforeInstallPromptEvent | undefined

  onMount(() => {
    const onPrompt = (event: Event): void => {
      event.preventDefault()
      // SAFETY: `beforeinstallprompt` events are Chromium's
      // `BeforeInstallPromptEvent`, which augments `Event` with `prompt` and
      // `userChoice`; the DOM lib does not model it.
      deferred = event as BeforeInstallPromptEvent
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
    await prompt.prompt()
    await prompt.userChoice
    deferred = undefined
    setInstallable(false)
  }

  return (
    <Show when={installable() && !dismissed()}>
      <div class="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
        <div class="card w-full max-w-md bg-base-100 shadow-2xl">
          <div class="card-body flex-row items-center gap-3 p-4">
            <div class="flex-1 text-sm">
              <p class="font-semibold">Snap like an app</p>
              <p class="text-base-content/70">Install Guestroll for a full-screen camera.</p>
            </div>
            <button
              type="button"
              class="btn btn-sm btn-primary"
              onClick={() => void install()}
            >
              <DownloadIcon class="h-4 w-4" />
              Install
            </button>
            <button
              type="button"
              class="btn btn-sm btn-ghost"
              aria-label="Dismiss install prompt"
              onClick={() => setDismissed(true)}
            >
              <CloseIcon class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </Show>
  )
}