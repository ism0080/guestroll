import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import type { Accessor, JSX } from "solid-js"
import { filterPackCss } from "@guestroll/contracts"
import {
  captureFrame,
  getFocusInfo,
  getZoomRange,
  listCameras,
  setTorch,
  setZoom,
  startStream,
  stopStream,
  triggerAutoFocus
} from "~/lib/camera"
import type { CameraDevice, FacingMode, ZoomRange } from "~/lib/camera"
import { FlashIcon, FlipIcon, GalleryIcon, ShutterIcon } from "./icons"

export interface CameraScreenProps {
  readonly usedCount: Accessor<number>
  readonly photoLimit: number
  readonly filterPack: string
  readonly pendingCount: Accessor<number>
  readonly onCapture: (bitmap: ImageBitmap) => void
  readonly onPickFromGallery: () => void
  readonly onUnavailable: () => void
}

interface FocusPoint {
  readonly x: number
  readonly y: number
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

const _shortLensLabel = (device: CameraDevice, index: number): string => {
  const lower = device.label.toLowerCase()
  if (lower.includes("ultra")) return "0.5×"
  if (lower.includes("tele")) return "2×"
  if (lower.includes("wide") || lower.includes("main")) return "1×"
  if (lower.includes("front") || lower.includes("selfie") || lower.includes("face")) {
    return "Front"
  }
  return device.label.length <= 8 ? device.label : `Cam ${index + 1}`
}

export const CameraScreen = (props: CameraScreenProps): JSX.Element => {
  const [facing, setFacing] = createSignal<FacingMode>("environment")
  const [deviceId, setDeviceId] = createSignal<string | undefined>(undefined)
  const [devices, setDevices] = createSignal<ReadonlyArray<CameraDevice>>([])
  const [torch, setTorchOn] = createSignal(false)
  const [flashing, setFlashing] = createSignal(false)
  const [zoomRange, setZoomRange] = createSignal<ZoomRange | null>(null)
  const [zoom, setZoomValue] = createSignal(1)
  const [focusSupported, setFocusSupported] = createSignal(false)
  const [focusPoint, setFocusPoint] = createSignal<FocusPoint | null>(null)
  let video: HTMLVideoElement | undefined
  let viewport: HTMLDivElement | undefined
  let stream: MediaStream | undefined
  let attachId = 0
  let focusTimeout: ReturnType<typeof setTimeout> | undefined
  let pinchStart: { readonly distance: number; readonly zoom: number } | null = null

  const flash = (): void => {
    setFlashing(true)
    setTimeout(() => setFlashing(false), 240)
  }

  const refreshCapabilities = async (): Promise<void> => {
    if (stream === undefined) return
    try {
      setDevices(await listCameras())
    } catch {
      // Enumeration is best-effort; lens switching just stays hidden.
    }
    const range = getZoomRange(stream)
    setZoomRange(range)
    if (range !== null) setZoomValue(range.value)
    setFocusSupported(getFocusInfo(stream).modes.includes("single-shot"))
  }

  const attach = async (mode: FacingMode, id: string | undefined): Promise<void> => {
    const current = ++attachId
    if (stream !== undefined) stopStream(stream)
    stream = await startStream(mode, id)
    if (current !== attachId) {
      stopStream(stream)
      return
    }
    setTorchOn(false)
    pinchStart = null
    if (video !== undefined) {
      video.srcObject = stream
      await video.play()
    }
    await refreshCapabilities()
  }

  onMount(() => {
    attach(facing(), deviceId()).catch(() => props.onUnavailable())
  })

  onCleanup(() => {
    attachId += 1
    if (focusTimeout !== undefined) clearTimeout(focusTimeout)
    if (stream !== undefined) stopStream(stream)
  })

  const devicesForFacing = createMemo(() => {
    const all = devices()
    if (all.length === 0) return []
    const match = all.filter((device) => device.facing === facing())
    // Labels can be empty/unknown before permission settles; fall back to all.
    const unknown = all.filter((device) => device.facing === "unknown")
    if (match.length > 0) return match
    if (unknown.length > 1) return unknown
    return []
  })

  const showLensSwitcher = createMemo(() => devicesForFacing().length > 1)

  const toggleFacing = (): void => {
    const next: FacingMode = facing() === "environment" ? "user" : "environment"
    const candidates = devices().filter((device) => device.facing === next)
    const nextId = candidates[0]?.deviceId
    setFacing(next)
    setDeviceId(nextId)
    attach(next, nextId).catch(() => props.onUnavailable())
  }

  const selectLens = (id: string): void => {
    if (id === deviceId()) return
    setDeviceId(id)
    attach(facing(), id).catch(() => props.onUnavailable())
  }

  const toggleTorch = (): void => {
    if (stream === undefined) return
    const next = !torch()
    setTorchOn(next)
    setTorch(stream, next).catch(() => setTorchOn(false))
  }

  const applyZoom = (value: number): void => {
    if (stream === undefined || zoomRange() === null) return
    setZoomValue(value)
    setZoom(stream, value).catch(() => {})
  }

  const handleZoomInput = (event: InputEvent & { currentTarget: HTMLInputElement }): void => {
    applyZoom(Number(event.currentTarget.value))
  }

  const touchDistance = (touches: TouchList): number => {
    const first = touches[0]!
    const second = touches[1]!
    return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY)
  }

  const handleTouchStart = (event: TouchEvent): void => {
    if (event.touches.length === 2) {
      pinchStart = { distance: touchDistance(event.touches), zoom: zoom() }
    }
  }

  const handleTouchMove = (event: TouchEvent): void => {
    if (event.touches.length !== 2 || pinchStart === null || zoomRange() === null) return
    event.preventDefault()
    const range = zoomRange()!
    const distance = touchDistance(event.touches)
    if (pinchStart.distance <= 0) return
    const next = pinchStart.zoom * (distance / pinchStart.distance)
    applyZoom(Math.min(Math.max(next, range.min), range.max))
  }

  const handleTouchEnd = (): void => {
    pinchStart = null
  }

  const handleViewportClick = (event: MouseEvent): void => {
    if (stream === undefined || !focusSupported() || pinchStart !== null) return
    const target = viewport
    if (target === undefined) return
    const rect = target.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 100
    const y = ((event.clientY - rect.top) / rect.height) * 100
    setFocusPoint({ x, y })
    if (focusTimeout !== undefined) clearTimeout(focusTimeout)
    focusTimeout = setTimeout(() => setFocusPoint(null), 900)
    triggerAutoFocus(stream).catch(() => {})
  }

  const handleCapture = (): void => {
    if (video !== undefined) _capture(video, flash, props.onCapture).catch(() => {})
  }

  const zoomLabel = createMemo(() => `${zoom().toFixed(1)}×`)

  return (
    <div class="capture-mode">
      <div
        class="camera-viewport film-grain"
        ref={(el) => {
          viewport = el
        }}
        onClick={handleViewportClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <video
          ref={(el) => {
            video = el
          }}
          autoplay
          playsinline
          muted
          style={{ filter: filterPackCss(props.filterPack) }}
          class={facing() === "user" ? "flipped" : ""}
        />
        <div class="camera-frame" />
        <Show when={focusPoint() !== null}>
          <div class="focus-ring" style={{ left: `${focusPoint()!.x}%`, top: `${focusPoint()!.y}%` }} />
        </Show>
        <Show when={flashing()}>
          <div class="flash-overlay active" />
        </Show>
      </div>

      <div class="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-4">
        <div class="flex flex-col items-center gap-2">
          <div
            class="radial-progress text-primary-content bg-primary/20 text-primary"
            style={{ "--value": props.usedCount() === 0 ? 0 : Math.round((props.usedCount() / props.photoLimit) * 100) }}
            aria-label={`${props.usedCount()} of ${props.photoLimit} photos taken`}
          >
            <span class="text-xs font-bold">
              {props.usedCount()}/{props.photoLimit}
            </span>
          </div>
          <Show when={props.pendingCount() > 0}>
            <div class="badge badge-ghost gap-1 border-0 bg-black/40 text-white">
              <span class="loading loading-spinner loading-xs" />
              Saving {props.pendingCount()}
            </div>
          </Show>
        </div>
      </div>

      <div class="pointer-events-none absolute inset-x-0 bottom-28 z-10 flex flex-col items-center gap-2 px-6">
        <Show when={showLensSwitcher()}>
          <div class="pointer-events-auto flex gap-1 rounded-full bg-black/50 p-1 backdrop-blur-sm" role="group" aria-label="Choose lens">
            <For each={devicesForFacing()}>
              {(device, index) => (
                <button
                  type="button"
                  class={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    (deviceId() ?? devicesForFacing()[0]?.deviceId) === device.deviceId
                      ? "bg-white text-black"
                      : "text-white/80"
                  }`}
                  aria-label={`Use ${device.label}`}
                  aria-pressed={(deviceId() ?? devicesForFacing()[0]?.deviceId) === device.deviceId}
                  onClick={() => selectLens(device.deviceId)}
                >
                  {_shortLensLabel(device, index())}
                </button>
              )}
            </For>
          </div>
        </Show>
        <Show when={zoomRange() !== null}>
          <div class="pointer-events-auto flex w-full max-w-xs items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 backdrop-blur-sm">
            <span class="badge badge-ghost border-0 bg-white/10 text-[11px] font-bold text-white">{zoomLabel()}</span>
            <input
              type="range"
              class="zoom-slider flex-1"
              min={zoomRange()!.min}
              max={zoomRange()!.max}
              step={zoomRange()!.step}
              value={zoom()}
              aria-label="Zoom"
              onInput={handleZoomInput}
            />
          </div>
        </Show>
      </div>

      <div class="pointer-events-auto absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-4 p-6 pb-8">
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
