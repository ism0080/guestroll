import { For } from "solid-js"
import type { JSX } from "solid-js"
import type { HostPhoto } from "@guestroll/contracts"
import { photoImageUrl } from "~/lib/api"

export interface PhotoGridProps {
  readonly slug: string
  readonly photos: ReadonlyArray<HostPhoto>
  readonly onSelect: (photo: HostPhoto) => void
}

export const PhotoGrid = (props: PhotoGridProps): JSX.Element => (
  <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
    <For each={props.photos}>
      {(photo) => (
        <button
          type="button"
          class="photo-tile rounded-box bg-base-100"
          aria-label={`Open photo ${photo.id}`}
          onClick={() => props.onSelect(photo)}
        >
          <img src={photoImageUrl(props.slug, photo.id)} alt="" loading="lazy" />
        </button>
      )}
    </For>
  </div>
)