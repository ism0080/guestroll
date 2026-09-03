import { For } from "solid-js"
import type { JSX } from "solid-js"
import type { HostPhoto } from "@guestroll/contracts"
import { photoImageUrl } from "~/lib/api"

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

export const PhotoGrid = (props: PhotoGridProps): JSX.Element => (
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
            <img src={photoImageUrl(props.slug, photo.id)} alt="" loading="lazy" crossorigin="use-credentials" />
          </button>
          <figcaption class="truncate px-2 py-1.5 text-xs text-base-content/70">
            {resolveGuestName(photo, props.guestNames)}
          </figcaption>
        </figure>
      )}
    </For>
  </div>
)