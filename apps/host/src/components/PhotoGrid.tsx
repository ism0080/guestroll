import { createSignal, For } from "solid-js"
import type { JSX } from "solid-js"
import { filterPackCss, type HostPhoto } from "@guestroll/contracts"
import { downloadSinglePhoto, photoThumbUrl } from "~/lib/api"
import { AuthImage } from "~/components/AuthImage"
import { DownloadIcon } from "@guestroll/ui"

export interface PhotoGridProps {
  readonly slug: string
  readonly photos: ReadonlyArray<HostPhoto>
  readonly guestNames?: Readonly<Record<string, string | undefined>>
  readonly onSelect: (photo: HostPhoto) => void
}

const resolveGuestName = (
  photo: HostPhoto,
  guestNames?: Readonly<Record<string, string | undefined>>
): string => photo.guestName ?? guestNames?.[photo.cameraId] ?? "Anonymous guest"

export const PhotoGrid = (props: PhotoGridProps): JSX.Element => {
  const [downloadingId, setDownloadingId] = createSignal<string | null>(null)

  const download = (photo: HostPhoto, event: MouseEvent): void => {
    event.stopPropagation()
    if (downloadingId() !== null) return
    setDownloadingId(photo.id)
    downloadSinglePhoto(props.slug, photo.id, photo.filterPack)
      .catch(() => {})
      .finally(() => setDownloadingId(null))
  }

  return (
    <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      <For each={props.photos}>
        {(photo) => (
          <figure class="overflow-hidden rounded-box bg-base-100">
            <button
              type="button"
              class="photo-tile w-full rounded-none"
              aria-label={`Open photo by ${resolveGuestName(photo, props.guestNames)}`}
              onClick={() => props.onSelect(photo)}
            >
              <AuthImage
                url={photoThumbUrl(props.slug, photo.id)}
                alt=""
                loading="lazy"
                style={{ filter: filterPackCss(photo.filterPack) }}
              />
            </button>
            <figcaption class="flex items-center gap-1 px-2 py-1.5">
              <span class="min-w-0 flex-1 truncate text-xs text-base-content/70">
                {resolveGuestName(photo, props.guestNames)}
              </span>
              <button
                type="button"
                class="btn btn-ghost btn-xs shrink-0"
                aria-label={`Download photo by ${resolveGuestName(photo, props.guestNames)}`}
                disabled={downloadingId() === photo.id}
                onClick={(event) => download(photo, event)}
              >
                {downloadingId() === photo.id ? (
                  <span class="loading loading-spinner loading-xs" />
                ) : (
                  <DownloadIcon class="h-4 w-4" />
                )}
              </button>
            </figcaption>
          </figure>
        )}
      </For>
    </div>
  )
}
