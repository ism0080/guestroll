import { Show } from "solid-js"
import type { JSX } from "solid-js"
import type { HostPhoto } from "@guestroll/contracts"
import { photoImageUrl } from "~/lib/api"
import { CloseIcon } from "./icons"

export interface LightboxProps {
  readonly slug: string
  readonly photo: HostPhoto | null
  readonly guestNames?: Readonly<Record<string, string | undefined>>
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
        />
        <figcaption class="text-sm text-white/80">
          {props.photo?.guestName ??
            (props.photo !== null ? props.guestNames?.[props.photo.cameraId] : undefined) ??
            "Anonymous guest"}
        </figcaption>
      </figure>
    </div>
  </Show>
)