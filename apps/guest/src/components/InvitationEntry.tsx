import { createSignal, onCleanup, onMount, Show } from "solid-js"
import type { JSX } from "solid-js"
import { invitationSlug } from "~/lib/invitation"

interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<ReadonlyArray<{ readonly rawValue?: string }>>
}

interface BarcodeDetectorConstructorLike {
  new (options?: { readonly formats?: ReadonlyArray<string> }): BarcodeDetectorLike
  getSupportedFormats?: () => Promise<ReadonlyArray<string>>
}

const _barcodeDetector = (): BarcodeDetectorConstructorLike | undefined => {
  return window.BarcodeDetector
}

export interface InvitationEntryProps {
  readonly onOpen: (slug: string) => void
}

export const InvitationEntry = (props: InvitationEntryProps): JSX.Element => {
  const [value, setValue] = createSignal("")
  const [error, setError] = createSignal<string | null>(null)
  const [scanning, setScanning] = createSignal(false)
  const [scanMessage, setScanMessage] = createSignal<string | null>(null)
  let video: HTMLVideoElement | undefined
  let stream: MediaStream | undefined
  let scanTimer: number | undefined
  let scanActive = false

  const stopScanning = (): void => {
    scanActive = false
    setScanning(false)
    if (scanTimer !== undefined) window.clearTimeout(scanTimer)
    scanTimer = undefined
    stream?.getTracks().forEach((track) => track.stop())
    stream = undefined
  }

  const openValue = (input: string): void => {
    const slug = invitationSlug(input)
    if (slug === undefined) {
      setError("Enter the 16-character invitation code or paste the full invitation link.")
      return
    }
    stopScanning()
    props.onOpen(slug)
  }

  const scan = async (): Promise<void> => {
    const Detector = _barcodeDetector()
    if (Detector === undefined) {
      setScanMessage("QR scanning is not available in this browser. Enter the invitation code instead.")
      return
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } })
      if (video === undefined) throw new Error("Scanner preview is unavailable")
      video.srcObject = stream
      await video.play()
      const detector = new Detector({ formats: ["qr_code"] })
      scanActive = true
      setScanning(true)
      setScanMessage("Point your camera at the invitation QR code.")

      const detect = async (): Promise<void> => {
        if (!scanActive || video === undefined) return
        try {
          const codes = await detector.detect(video)
          const rawValue = codes[0]?.rawValue
          if (rawValue !== undefined) {
            if (invitationSlug(rawValue) === undefined) {
              setError("That QR code is not a GuestRoll invitation.")
            } else {
              openValue(rawValue)
              return
            }
          }
        } catch {
          // Keep scanning; a frame can be temporarily unreadable while moving.
        }
        if (scanActive) scanTimer = window.setTimeout(() => void detect(), 150)
      }
      void detect()
    } catch {
      stopScanning()
      setScanMessage("Camera access was unavailable. Enter the invitation code instead.")
    }
  }

  onMount(() => {
    if (_barcodeDetector() !== undefined) setScanMessage("Scan the QR code on the invitation, or enter its code below.")
  })

  onCleanup(stopScanning)

  return (
    <div class="rounded-box border-2 border-neutral bg-base-100 p-5 text-left shadow-[6px_6px_0_0_var(--guestroll-ink)]">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-lg font-extrabold text-base-content">Join an invitation</h2>
          <p class="mt-1 text-sm text-base-content/65">Enter the code from your host or scan their QR code.</p>
        </div>
        <span class="badge badge-secondary">Guest</span>
      </div>

      <form
        class="mt-4"
        onSubmit={(event) => {
          event.preventDefault()
          openValue(value())
        }}
      >
        <label class="block">
          <span class="text-sm font-semibold text-base-content">Invitation code or link</span>
          <input
            type="text"
            class="input input-lg mt-2 w-full border-2 border-neutral bg-base-200 font-mono tracking-wide focus:border-primary focus:outline-none"
            placeholder="Paste code or link"
            autocomplete="off"
            autocapitalize="none"
            value={value()}
            onInput={(event) => {
              setValue(event.currentTarget.value)
              setError(null)
            }}
          />
        </label>
        <Show when={error() !== null}>
          <p class="mt-2 text-sm font-semibold text-error" role="alert">{error()}</p>
        </Show>
        <button type="submit" class="shutter-btn btn btn-primary btn-lg mt-4 w-full border-2 border-neutral shadow-[3px_3px_0_0_var(--guestroll-ink)]">
          Open invitation
        </button>
      </form>

      <div class="my-4 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.15em] text-base-content/40">
        <span class="h-px flex-1 bg-base-content/15" />or<span class="h-px flex-1 bg-base-content/15" />
      </div>

      <Show when={!scanning()} fallback={
        <div class="overflow-hidden rounded-box border-2 border-neutral bg-neutral">
          <video ref={(element) => { video = element }} class="aspect-video w-full object-cover" autoplay playsinline muted />
          <button type="button" class="btn btn-ghost w-full rounded-none text-base-100" onClick={stopScanning}>Stop scanning</button>
        </div>
      }>
        <button type="button" class="btn btn-outline btn-lg w-full border-2 border-neutral" onClick={() => void scan()}>
          Scan invitation QR code
        </button>
      </Show>
      <Show when={scanMessage() !== null}>
        <p class="mt-3 text-center text-xs text-base-content/55">{scanMessage()}</p>
      </Show>
    </div>
  )
}
