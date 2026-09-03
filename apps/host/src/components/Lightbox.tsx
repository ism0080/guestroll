import { Show } from "solid-js"
import type { JSX } from "solid-js"
import type { HostPhoto } from "@guestroll/contracts"
import { photoImageUrl } from "~/lib/api"
import { CloseIcon } from "./icons"

export interface LightboxProps {
  readonly slug: string
  readonly photo: HostPhoto | null
  readonly onClose: () => void
}

export const Lightbox = (props: LightboxProps): JSX.Element => (
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
      <img
        src={props.photo !== null ? photoImageUrl(props.slug, props.photo.id) : ""}
        alt="Full size guest photo"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  </Show>
)