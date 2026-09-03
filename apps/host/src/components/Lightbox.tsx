import { createSignal, Show } from "solid-js"
import type { JSX } from "solid-js"
import { filterPackCss, type HostPhoto } from "@guestroll/contracts"
import { downloadSinglePhoto, photoImageUrl } from "~/lib/api"
import { CloseIcon, DownloadIcon } from "./icons"

export interface LightboxProps {
  readonly slug: string
  readonly photo: HostPhoto | null
  readonly guestNames?: Readonly<Record<string, string | undefined>>
  readonly onClose: () => void
}

export const Lightbox = (props: LightboxProps): JSX.Element => {
  const [downloading, setDownloading] = createSignal(false)

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
      <div class="lightbox" onClick={props.onClose}>
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
          <img
            src={props.photo !== null ? photoImageUrl(props.slug, props.photo.id) : ""}
            alt={
              props.photo !== null
                ? `Full size guest photo by ${props.photo.guestName ?? props.guestNames?.[props.photo.cameraId] ?? "Anonymous guest"}`
                : "Full size guest photo"
            }
            crossorigin="use-credentials"
            style={{ filter: props.photo !== null ? filterPackCss(props.photo.filterPack) : undefined }}
          />
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