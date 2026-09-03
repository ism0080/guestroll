import { Show } from "solid-js"
import type { Accessor, JSX } from "solid-js"
import { CameraIcon, CheckIcon, CloseIcon, GalleryIcon } from "./icons"

export interface WelcomeScreenProps {
  readonly title: string
  readonly photoLimit: number
  readonly starting: boolean
  readonly guestName: Accessor<string>
  readonly setGuestName: (name: string) => void
  readonly onStart: () => void
  readonly onPickFromGallery: () => void
}

export const WelcomeScreen = (props: WelcomeScreenProps): JSX.Element => (
  <div class="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
    <div class="w-full max-w-md">
      <div class="mb-6 flex justify-center">
        <div class="flex h-24 w-24 items-center justify-center rounded-box bg-primary text-primary-content shadow-lg">
          <CameraIcon class="h-12 w-12" />
        </div>
      </div>

      <div class="card bg-base-100 shadow-xl">
        <div class="card-body gap-4">
          <h1 class="card-title justify-center text-center text-3xl">{props.title}</h1>
          <p class="text-center text-base-content/80">
            You're the photographer! This disposable camera holds{" "}
            <span class="badge badge-primary badge-lg">{props.photoLimit} shots</span>.
          </p>

          <label class="form-control w-full">
            <div class="label">
              <span class="label-text">Who's behind the camera? <span class="text-base-content/50">(optional)</span></span>
            </div>
            <input
              type="text"
              class="input input-bordered input-lg"
              placeholder="Your name"
              maxlength="80"
              value={props.guestName()}
              onInput={(event) => props.setGuestName(event.currentTarget.value)}
            />
          </label>

          <button
            type="button"
            class="btn btn-primary btn-lg"
            disabled={props.starting}
            onClick={props.onStart}
          >
            {props.starting ? <span class="loading loading-spinner" /> : "Start snapping"}
          </button>

          <div class="divider text-base-content/40">or</div>

          <button
            type="button"
            class="btn btn-ghost btn-lg"
            disabled={props.starting}
            onClick={props.onPickFromGallery}
          >
            <GalleryIcon class="h-5 w-5" />
            Pick from my photo roll
          </button>
        </div>
      </div>

      <p class="mt-6 text-center text-sm text-base-content/50">
        No app, no account — just scan, snap, and hand it back.
      </p>
    </div>
  </div>
)

export interface DoneScreenProps {
  readonly title: string
  readonly count: number
  readonly onRetake: () => void
}

export const DoneScreen = (props: DoneScreenProps): JSX.Element => (
  <div class="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
    <div class="w-full max-w-md">
      <div class="mb-6 flex justify-center">
        <div class="flex h-24 w-24 items-center justify-center rounded-box bg-success text-success-content shadow-lg">
          <CheckIcon class="h-12 w-12" />
        </div>
      </div>

      <div class="card bg-base-100 shadow-xl">
        <div class="card-body gap-4 text-center">
          <h1 class="card-title justify-center text-3xl">That's a wrap!</h1>
          <p>
            Your <span class="font-semibold">{props.count}</span> photos are safely tucked
            away for <span class="font-semibold">{props.title}</span>.
          </p>
          <p class="text-base-content/70">
            Thanks for being part of the day — the couple will see every frame you captured.
          </p>
          <button type="button" class="btn btn-outline btn-lg mt-2" onClick={props.onRetake}>
            Take a new camera
          </button>
        </div>
      </div>
    </div>
  </div>
)

export type ErrorKind = "not-ready" | "network" | "camera" | "unknown"

export interface ErrorScreenProps {
  readonly kind: ErrorKind
  readonly detail?: string
  readonly onRetry?: () => void
}

const _heading = (kind: ErrorKind): string => {
  switch (kind) {
    case "not-ready":
      return "This link isn't ready yet"
    case "network":
      return "Can't reach the service"
    case "camera":
      return "Camera unavailable"
    default:
      return "Something went wrong"
  }
}

const _message = (kind: ErrorKind): string => {
  switch (kind) {
    case "not-ready":
      return "The couple hasn't opened this camera roll yet. Try again when the event goes live."
    case "network":
      return "Check your connection and give it another go — the moment is worth retrying."
    case "camera":
      return "We couldn't start the camera. Allow camera access, or pick photos from your library instead."
    default:
      return "An unexpected hiccup happened. Please try again."
  }
}

export const ErrorScreen = (props: ErrorScreenProps): JSX.Element => (
  <div class="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
    <div class="w-full max-w-md">
      <div class="card bg-base-100 shadow-xl">
        <div class="card-body gap-3 text-center">
          <h1 class="card-title justify-center text-2xl">{_heading(props.kind)}</h1>
          <p class="text-base-content/80">{_message(props.kind)}</p>
          <Show when={props.detail !== undefined}>
            <p class="text-sm text-base-content/50">{props.detail}</p>
          </Show>
          <Show when={props.onRetry !== undefined}>
            <button type="button" class="btn btn-primary btn-lg mt-2" onClick={props.onRetry}>
              Try again
            </button>
          </Show>
        </div>
      </div>
    </div>
  </div>
)

export interface ReviewOverlayProps {
  readonly url: string
  readonly busy: boolean
  readonly error: string | null
  readonly onKeep: () => void
  readonly onRetake: () => void
}

export const ReviewOverlay = (props: ReviewOverlayProps): JSX.Element => (
  <div class="fixed inset-0 z-40 flex flex-col bg-black">
    <div class="relative flex min-h-0 flex-1 items-center justify-center p-4">
      <div class="film-grain relative max-h-full overflow-hidden rounded-box shadow-2xl">
        <img src={props.url} alt="Your capture" class="review-photo max-h-[70dvh] w-auto" />
      </div>
      <button
        type="button"
        class="btn btn-circle btn-ghost absolute right-4 top-4 text-white"
        aria-label="Close and retake"
        disabled={props.busy}
        onClick={props.onRetake}
      >
        <CloseIcon class="h-6 w-6" />
      </button>
    </div>

    <div class="px-6 pb-8">
      <Show
        when={props.error === null}
        fallback={
          <div class="alert alert-error mb-3">
            <span>{props.error}</span>
          </div>
        }
      >
        <p class="mb-3 text-center text-sm text-white/70">
          {props.busy ? "Sending to the couple's roll…" : "Keep this one or snap it again."}
        </p>
      </Show>

      <div class="flex gap-3">
        <button
          type="button"
          class="btn btn-ghost btn-lg flex-1 text-white"
          disabled={props.busy}
          onClick={props.onRetake}
        >
          Retake
        </button>
        <button
          type="button"
          class="btn btn-primary btn-lg flex-1"
          disabled={props.busy}
          onClick={props.onKeep}
        >
          {props.busy ? <span class="loading loading-spinner" /> : "Keep it"}
        </button>
      </div>
    </div>
  </div>
)