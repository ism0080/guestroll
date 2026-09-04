import { createSignal, Show } from "solid-js"
import type { JSX } from "solid-js"
import { CloseIcon } from "./icons"
import { Modal } from "./Modal"

export interface ShotLimitModalProps {
  readonly busy: boolean
  readonly error: string | null
  readonly initialLimit: number
  readonly onClose: () => void
  readonly onSave: (photoLimit: number) => void
}

export const ShotLimitModal = (props: ShotLimitModalProps): JSX.Element => {
  const [photoLimit, setPhotoLimit] = createSignal(props.initialLimit)

  const canSubmit = (): boolean => {
    const value = photoLimit()
    return props.busy || !Number.isInteger(value) || value < 1 || value > 100
  }

  const submit = (event: Event): void => {
    event.preventDefault()
    props.onSave(photoLimit())
  }

  return (
    <Modal label="Shots per guest" onClose={props.onClose}>
        <form class="paper-card" onSubmit={submit}>
          <div class="card-body gap-4">
            <div class="flex items-start justify-between">
              <h2 class="card-title text-2xl font-extrabold">Shots per guest</h2>
              <button
                type="button"
                class="btn btn-circle btn-ghost btn-sm"
                aria-label="Close"
                onClick={props.onClose}
              >
                <CloseIcon class="h-5 w-5" />
              </button>
            </div>

            <label class="form-control w-full">
              <div class="label">
                <span class="label-text">Shot count (1–100)</span>
              </div>
              <input
                type="number"
                class="input input-bordered"
                min="1"
                max="100"
                step="1"
                value={photoLimit()}
                onInput={(event) => setPhotoLimit(Number(event.currentTarget.value))}
              />
            </label>

            <Show when={props.error !== null}>
              <div class="rounded-field border-2 border-error bg-error/10 p-3 text-sm text-base-content">
                {props.error}
              </div>
            </Show>

            <button
              type="submit"
              class="shutter-btn btn btn-primary btn-lg border-2 border-neutral shadow-[3px_3px_0_0_var(--guestroll-ink)]"
              disabled={canSubmit()}
            >
              {props.busy ? <span class="loading loading-spinner" /> : "Save"}
            </button>
          </div>
        </form>
    </Modal>
  )
}
