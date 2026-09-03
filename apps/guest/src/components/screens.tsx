import { Show } from "solid-js"
import type { Accessor, JSX } from "solid-js"
import { CheckIcon, GalleryIcon } from "./icons"
import { CameraBody } from "./camera-art"

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
    <div class="w-full max-w-sm">
      <div class="mb-8 flex flex-col items-center gap-5 text-center">
        <CameraBody class="w-52 drop-shadow-[6px_6px_0_rgba(32,29,24,0.12)]" count={props.photoLimit} />
        <div>
          <p class="film-counter text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
            Single-use camera
          </p>
          <h1 class="mt-1 text-3xl font-extrabold leading-tight text-base-content">{props.title}</h1>
        </div>
        <p class="max-w-xs text-base-content/70">
          You're the photographer. This roll holds{" "}
          <span class="font-bold text-primary">{props.photoLimit} exposures</span> — make them count.
        </p>
      </div>

      <div class="rounded-box border-2 border-neutral bg-base-100 p-5 shadow-[6px_6px_0_0_var(--guestroll-ink)]">
        <label class="block">
          <span class="text-sm font-semibold text-base-content">Who's behind the camera?</span>
          <input
            type="text"
            class="input input-lg mt-2 w-full border-2 border-neutral bg-base-200 focus:outline-none focus:border-primary"
            placeholder="Your name"
            maxlength="80"
            value={props.guestName()}
            onInput={(event) => props.setGuestName(event.currentTarget.value)}
          />
          <span class="mt-2 block text-xs text-base-content/50">
            We'll keep your roll together on this device.
          </span>
        </label>

        <button
          type="button"
          class="shutter-btn btn btn-primary btn-lg mt-4 w-full border-2 border-neutral shadow-[3px_3px_0_0_var(--guestroll-ink)]"
          disabled={props.starting || props.guestName().trim() === ""}
          onClick={props.onStart}
        >
          {props.starting ? <span class="loading loading-spinner" /> : "Load the film"}
        </button>

        <button
          type="button"
          class="btn btn-ghost btn-sm mt-3 w-full gap-2 text-base-content/70"
          disabled={props.starting || props.guestName().trim() === ""}
          onClick={props.onPickFromGallery}
        >
          <GalleryIcon class="h-4 w-4" />
          Pick from my photo roll
        </button>
      </div>

      <p class="mt-6 text-center text-sm text-base-content/45">
        No app, no account — just scan, snap, and hand it back.
      </p>
    </div>
  </div>
)

export interface DoneScreenProps {
  readonly title: string
  readonly count: number
  readonly pending?: number
  readonly starting?: boolean
  readonly error?: string | null
  readonly onStartNewRoll: () => void
}

export const DoneScreen = (props: DoneScreenProps): JSX.Element => (
  <div class="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
    <div class="w-full max-w-sm">
      <div class="mb-8 flex flex-col items-center gap-4 text-center">
        <div class="flex h-20 w-20 items-center justify-center rounded-full border-2 border-neutral bg-secondary text-secondary-content shadow-[4px_4px_0_0_var(--guestroll-ink)]">
          <CheckIcon class="h-10 w-10" />
        </div>
        <p class="film-counter text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
          Roll finished
        </p>
        <h1 class="text-3xl font-extrabold text-base-content">That's a wrap!</h1>
      </div>

      <div class="rounded-box border-2 border-neutral bg-base-100 p-6 text-center shadow-[6px_6px_0_0_var(--guestroll-ink)]">
        <div class="film-counter text-5xl font-extrabold text-primary">{props.count}</div>
        <p class="mt-1 text-sm text-base-content/70">
          frames captured for <span class="font-semibold text-base-content">{props.title}</span>
        </p>

        <div class="my-5 film-perforations" />

        <Show when={props.pending !== undefined && props.pending > 0}>
          <p class="text-sm text-base-content/60">
            {props.pending} more {props.pending === 1 ? "photo is" : "photos are"} still
            developing in the background — no need to stay on this page.
          </p>
        </Show>
        <p class="text-sm text-base-content/60">
          Thanks for being part of the day — the couple will see every frame you captured.
        </p>

        <Show when={props.error !== null && props.error !== undefined}>
          <div class="mt-4 rounded-field border-2 border-warning bg-warning/10 p-3 text-sm text-base-content">
            {props.error}
          </div>
        </Show>

        <button
          type="button"
          class="shutter-btn btn btn-primary btn-lg mt-5 w-full border-2 border-neutral shadow-[3px_3px_0_0_var(--guestroll-ink)]"
          disabled={props.starting}
          onClick={props.onStartNewRoll}
        >
          {props.starting ? <span class="loading loading-spinner" /> : "Start a new roll"}
        </button>
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
    <div class="w-full max-w-sm text-center">
      <div class="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border-2 border-neutral bg-accent text-accent-content shadow-[4px_4px_0_0_var(--guestroll-ink)]">
        <span class="film-counter text-2xl font-extrabold">!</span>
      </div>
      <div class="rounded-box border-2 border-neutral bg-base-100 p-6 shadow-[6px_6px_0_0_var(--guestroll-ink)]">
        <h1 class="text-2xl font-extrabold text-base-content">{_heading(props.kind)}</h1>
        <p class="mt-2 text-base-content/70">{_message(props.kind)}</p>
        <Show when={props.detail !== undefined}>
          <p class="mt-2 text-sm text-base-content/45">{props.detail}</p>
        </Show>
        <Show when={props.onRetry !== undefined}>
          <button
            type="button"
            class="shutter-btn btn btn-primary btn-lg mt-5 w-full border-2 border-neutral shadow-[3px_3px_0_0_var(--guestroll-ink)]"
            onClick={props.onRetry}
          >
            Try again
          </button>
        </Show>
      </div>
    </div>
  </div>
)

