import { createSignal, onCleanup, onMount, Show } from "solid-js"
import type { Accessor, JSX } from "solid-js"
import { captureFrame, setTorch, startStream, stopStream } from "~/lib/camera"
import type { FacingMode } from "~/lib/camera"
import { FlashIcon, FlipIcon, GalleryIcon, ShutterIcon } from "./icons"

export interface CameraScreenProps {
  readonly usedCount: Accessor<number>
  readonly photoLimit: number
  readonly onCapture: (bitmap: ImageBitmap) => void
  readonly onPickFromGallery: () => void
  readonly onUnavailable: () => void
}

const _capture = async (
  video: HTMLVideoElement,
  flash: () => void,
  onCapture: (bitmap: ImageBitmap) => void
): Promise<void> => {
  flash()
  const bitmap = await captureFrame(video)
  onCapture(bitmap)
}

export const CameraScreen = (props: CameraScreenProps): JSX.Element => {
  const [facing, setFacing] = createSignal<FacingMode>("environment")
  const [torch, setTorchOn] = createSignal(false)
  const [flashing, setFlashing] = createSignal(false)
  let video: HTMLVideoElement | undefined
  let stream: MediaStream | undefined

  const flash = (): void => {
    setFlashing(true)
    setTimeout(() => setFlashing(false), 240)
  }

  const attach = async (mode: FacingMode): Promise<void> => {
    if (stream !== undefined) stopStream(stream)
    stream = await startStream(mode)
    setTorchOn(false)
    if (video !== undefined) {
      video.srcObject = stream
      await video.play()
    }
  }

  onMount(() => {
    attach(facing()).catch(() => props.onUnavailable())
  })

  onCleanup(() => {
    if (stream !== undefined) stopStream(stream)
  })

  const toggleFacing = (): void => {
    setFacing((previous) => (previous === "environment" ? "user" : "environment"))
    attach(facing()).catch(() => props.onUnavailable())
  }

  const toggleTorch = (): void => {
    if (stream === undefined) return
    const next = !torch()
    setTorchOn(next)
    setTorch(stream, next).catch(() => setTorchOn(false))
  }

  const handleCapture = (): void => {
    if (video !== undefined) _capture(video, flash, props.onCapture).catch(() => {})
  }

  return (
    <div class="capture-mode">
      <div class="camera-viewport film-grain">
        <video
          ref={(el) => {
            video = el
          }}
          autoplay
          playsinline
          muted
          class={`film ${facing() === "user" ? "flipped" : ""}`}
        />
        <div class="camera-frame" />
        <Show when={flashing()}>
          <div class="flash-overlay active" />
        </Show>
      </div>

      <div class="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-4">
        <div
          class="radial-progress text-primary-content bg-primary/20 text-primary"
          style={{ "--value": props.usedCount() === 0 ? 0 : Math.round((props.usedCount() / props.photoLimit) * 100) }}
          aria-label={`${props.usedCount()} of ${props.photoLimit} photos taken`}
        >
          <span class="text-xs font-bold">
            {props.usedCount()}/{props.photoLimit}
          </span>
        </div>
      </div>

      <div class="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-4 p-6 pb-8">
        <button
          type="button"
          class="btn btn-circle btn-ghost btn-lg text-white"
          aria-label="Add from photo library"
          onClick={props.onPickFromGallery}
        >
          <GalleryIcon class="h-7 w-7" />
        </button>

        <button
          type="button"
          class="btn btn-circle btn-neutral h-20 w-20 border-4 border-white/70 text-white shadow-xl"
          aria-label="Take a photo"
          onClick={handleCapture}
        >
          <ShutterIcon class="h-9 w-9" />
        </button>

        <div class="flex flex-col gap-3">
          <button
            type="button"
            class="btn btn-circle btn-ghost text-white"
            aria-label="Toggle flash"
            onClick={toggleTorch}
          >
            <FlashIcon class={`h-6 w-6 ${torch() ? "text-warning" : ""}`} />
          </button>
          <button
            type="button"
            class="btn btn-circle btn-ghost text-white"
            aria-label="Switch camera"
            onClick={toggleFacing}
          >
            <FlipIcon class="h-6 w-6" />
          </button>
        </div>
      </div>
    </div>
  )
}