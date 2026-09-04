import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js"
import type { JSX } from "solid-js"
import { filterPackCss, type HostPhoto } from "@guestroll/contracts"
import { downloadSinglePhoto, photoImageUrl } from "~/lib/api"
import { AuthImage } from "~/components/AuthImage"
import { CloseIcon, DownloadIcon } from "@guestroll/ui"

export interface LightboxProps {
  readonly slug: string
  readonly photo: HostPhoto | null
  readonly guestNames?: Readonly<Record<string, string | undefined>>
  readonly onClose: () => void
}

export const Lightbox = (props: LightboxProps): JSX.Element => {
  const [downloading, setDownloading] = createSignal(false)

  onMount(() => {
    const previousOverflow = document.body.style.overflow
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") props.onClose()
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

  return (
    <Show when={props.photo !== null}>
      <div class="lightbox" role="dialog" aria-modal="true" aria-label="Photo preview" onClick={props.onClose}>
        <button
          type="button"
          class="btn btn-circle btn-ghost absolute right-4 top-4 text-white"
          aria-label="Close photo"
          onClick={props.onClose}
        >
          <CloseIcon class="h-6 w-6" />
        </button>
        <figure
          class="flex max-w-[92vw] flex-col items-center gap-2"
          onClick={(event) => event.stopPropagation()}
        >
          <Show when={props.photo} keyed>
            {(photo) => (
              <AuthImage
                url={photoImageUrl(props.slug, photo.id)}
                alt={`Full size guest photo by ${photo.guestName ?? props.guestNames?.[photo.cameraId] ?? "Anonymous guest"}`}
                style={{ filter: filterPackCss(photo.filterPack) }}
              />
            )}
          </Show>
          <figcaption class="flex items-center gap-3 text-sm text-white/80">
            <span>
              {props.photo?.guestName ??
                (props.photo !== null ? props.guestNames?.[props.photo.cameraId] : undefined) ??
                "Anonymous guest"}
            </span>
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
