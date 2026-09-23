import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import type { JSX } from "solid-js"
import { filterPackCss, type HostPhoto } from "@guestroll/contracts"
import { downloadSinglePhoto, photoImageUrl } from "~/lib/api"
import { AuthImage } from "~/components/AuthImage"
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, DownloadIcon } from "@guestroll/ui"

export interface LightboxProps {
  readonly slug: string
  readonly photo: HostPhoto | null
  /** The full ordered roll, so the viewer can move between neighbours. */
  readonly photos: ReadonlyArray<HostPhoto>
  readonly guestNames?: Readonly<Record<string, string | undefined>>
  readonly onNavigate: (photo: HostPhoto) => void
  readonly onClose: () => void
}

/** Horizontal travel (px) needed before a drag counts as a swipe. */
const SWIPE_THRESHOLD = 48

export const Lightbox = (props: LightboxProps): JSX.Element => {
  const [downloading, setDownloading] = createSignal(false)
  const [dragX, setDragX] = createSignal(0)
  const [dragging, setDragging] = createSignal(false)

  const index = createMemo(() => {
    const photo = props.photo
    if (photo === null) return -1
    return props.photos.findIndex((candidate) => candidate.id === photo.id)
  })

  const hasPrev = createMemo(() => index() > 0)
  const hasNext = createMemo(() => index() >= 0 && index() < props.photos.length - 1)

  const go = (delta: number): void => {
    const next = props.photos[index() + delta]
    if (next !== undefined) props.onNavigate(next)
  }

  // Pointer-drag state. A single pointer tracks the gesture so mouse-drag on
  // desktop and touch swipes on mobile share the same code path.
  let pointerId: number | undefined
  let startX = 0
  let startY = 0
  let swiped = false

  const endDrag = (event: PointerEvent): void => {
    if (pointerId === undefined || event.pointerId !== pointerId) return
    const dx = event.clientX - startX
    const dy = event.clientY - startY
    pointerId = undefined
    setDragging(false)
    setDragX(0)
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return
    swiped = true
    go(dx < 0 ? 1 : -1)
  }

  onMount(() => {
    const previousOverflow = document.body.style.overflow
    const onKey = (event: KeyboardEvent): void => {
      if (props.photo === null) return
      if (event.key === "Escape") props.onClose()
      else if (event.key === "ArrowLeft") go(-1)
      else if (event.key === "ArrowRight") go(1)
    }
    window.addEventListener("keydown", onKey)
    onCleanup(() => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = previousOverflow
    })
  })

  // The component remains mounted with a hidden Show, so only lock scroll while visible.
  const lockScroll = (): void => {
    document.body.style.overflow = props.photo === null ? "" : "hidden"
  }
  createEffect(() => lockScroll())

  const download = (): void => {
    const photo = props.photo
    if (photo === null || downloading()) return
    setDownloading(true)
    downloadSinglePhoto(props.slug, photo.id, photo.filterPack)
      .catch(() => {})
      .finally(() => setDownloading(false))
  }

  const closeFromBackdrop = (): void => {
    // A swipe ends with a click on the backdrop; don't let it also close.
    if (swiped) {
      swiped = false
      return
    }
    props.onClose()
  }

  const guestName = (photo: HostPhoto): string =>
    photo.guestName ?? props.guestNames?.[photo.cameraId] ?? "Anonymous guest"

  return (
    <Show when={props.photo !== null}>
      <div
        class="lightbox"
        role="dialog"
        aria-modal="true"
        aria-label={`Photo preview, ${index() + 1} of ${props.photos.length}`}
        onClick={closeFromBackdrop}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          const target = event.target
          if (target instanceof Element && target.closest("button") !== null) return
          pointerId = event.pointerId
          startX = event.clientX
          startY = event.clientY
          swiped = false
          setDragging(true)
          setDragX(0)
        }}
        onPointerMove={(event) => {
          if (pointerId === undefined || event.pointerId !== pointerId) return
          const dx = event.clientX - startX
          const dy = event.clientY - startY
          // Ignore clearly vertical gestures so they don't jitter the photo.
          if (Math.abs(dy) > Math.abs(dx)) return
          if (Math.abs(dx) > 8) event.preventDefault()
          setDragX(dx)
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <button
          type="button"
          class="btn btn-circle btn-ghost absolute right-4 top-4 text-white"
          aria-label="Close photo"
          onClick={props.onClose}
        >
          <CloseIcon class="h-6 w-6" />
        </button>

        <Show when={hasPrev()}>
          <button
            type="button"
            class="btn btn-circle btn-ghost lightbox-nav left-2 text-white sm:left-4"
            aria-label="Previous photo"
            onClick={(event) => {
              event.stopPropagation()
              go(-1)
            }}
          >
            <ChevronLeftIcon class="h-7 w-7" />
          </button>
        </Show>

        <Show when={hasNext()}>
          <button
            type="button"
            class="btn btn-circle btn-ghost lightbox-nav right-2 text-white sm:right-4"
            aria-label="Next photo"
            onClick={(event) => {
              event.stopPropagation()
              go(1)
            }}
          >
            <ChevronRightIcon class="h-7 w-7" />
          </button>
        </Show>

        <figure
          class="flex max-w-[92vw] flex-col items-center gap-2"
          style={{
            transform: dragX() !== 0 ? `translateX(${dragX()}px)` : undefined,
            transition: dragging() ? "none" : "transform 0.2s ease-out"
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <Show when={props.photo} keyed>
            {(photo) => (
              <AuthImage
                url={photoImageUrl(props.slug, photo.id)}
                alt={`Full size guest photo by ${guestName(photo)}`}
                style={{ filter: filterPackCss(photo.filterPack) }}
              />
            )}
          </Show>
          <figcaption class="flex items-center gap-3 text-sm text-white/80">
            <span>{props.photo !== null ? guestName(props.photo) : ""}</span>
            <Show when={props.photos.length > 1}>
              <span class="film-counter text-xs text-white/60">
                {index() + 1} / {props.photos.length}
              </span>
            </Show>
            <button
              type="button"
              class="btn btn-outline btn-sm text-white"
              disabled={downloading()}
              onClick={download}
            >
              {downloading() ? (
                <span class="loading loading-spinner loading-xs" />
              ) : (
                <DownloadIcon class="h-4 w-4" />
              )}
              Download
            </button>
          </figcaption>
        </figure>
      </div>
    </Show>
  )
}
