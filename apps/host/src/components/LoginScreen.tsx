import { createSignal, Show } from "solid-js"
import type { JSX } from "solid-js"
import { CameraIcon } from "./icons"

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
      <div class="w-full max-w-md">
        <div class="mb-6 flex justify-center">
          <div class="flex h-24 w-24 items-center justify-center rounded-box bg-primary text-primary-content shadow-lg">
            <CameraIcon class="h-12 w-12" />
          </div>
        </div>

        <form class="card bg-base-100 shadow-xl" onSubmit={submit}>
          <div class="card-body gap-4">
            <h1 class="card-title justify-center text-3xl">Couple's dashboard</h1>
            <p class="text-center text-base-content/80">
              Sign in with the passcode from the invite to watch photos roll in.
            </p>

            <label class="form-control w-full">
              <div class="label">
                <span class="label-text">Passcode</span>
              </div>
              <input
                type="password"
                class="input input-bordered input-lg"
                placeholder="••••••••"
                autocomplete="current-password"
                value={passcode()}
                onInput={(event) => setPasscode(event.currentTarget.value)}
              />
            </label>

            <Show when={props.error !== null}>
              <div class="alert alert-error py-2">
                <span>{props.error}</span>
              </div>
            </Show>

            <button
              type="submit"
              class="btn btn-primary btn-lg"
              disabled={props.busy || passcode() === ""}
            >
              {props.busy ? <span class="loading loading-spinner" /> : "Sign in"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}