import { createSignal, Show } from "solid-js"
import type { JSX } from "solid-js"
import { CameraBody } from "./camera-art"

export interface LoginScreenProps {
  readonly busy: boolean
  readonly error: string | null
  readonly onLogin: (passcode: string) => void
}

export const LoginScreen = (props: LoginScreenProps): JSX.Element => {
  const [passcode, setPasscode] = createSignal("")

  const submit = (event: Event): void => {
    event.preventDefault()
    props.onLogin(passcode())
  }

  return (
    <div class="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex flex-col items-center gap-4 text-center">
          <CameraBody class="w-48 drop-shadow-[6px_6px_0_rgba(32,29,24,0.12)]" />
          <div>
            <p class="film-counter text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
              Couple's dashboard
            </p>
            <h1 class="mt-1 text-3xl font-extrabold text-base-content">Welcome back</h1>
          </div>
          <p class="max-w-xs text-base-content/70">
            Sign in with the passcode from your invite to watch the photos roll in.
          </p>
        </div>

        <form class="paper-card p-5" onSubmit={submit}>
          <label class="block">
            <span class="text-sm font-semibold text-base-content">Passcode</span>
            <input
              type="password"
              autofocus
              class="input input-lg mt-2 w-full border-2 border-neutral bg-base-200 focus:border-primary focus:outline-none"
              placeholder="••••••••"
              autocomplete="current-password"
              value={passcode()}
              onInput={(event) => setPasscode(event.currentTarget.value)}
            />
          </label>

          <Show when={props.error !== null}>
            <div class="mt-3 rounded-field border-2 border-error bg-error/10 p-3 text-sm text-base-content">
              {props.error}
            </div>
          </Show>

          <button
            type="submit"
            class="shutter-btn btn btn-primary btn-lg mt-4 w-full border-2 border-neutral shadow-[3px_3px_0_0_var(--guestroll-ink)]"
            disabled={props.busy || passcode() === ""}
          >
            {props.busy ? <span class="loading loading-spinner" /> : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  )
}
