import { createSignal, Show } from "solid-js"
import type { JSX } from "solid-js"
import { CloseIcon } from "./icons"

export interface RenameEventModalProps {
  readonly busy: boolean
  readonly error: string | null
  readonly initialTitle: string
  readonly onClose: () => void
  readonly onRename: (title: string) => void
}

export const RenameEventModal = (props: RenameEventModalProps): JSX.Element => {
  const [title, setTitle] = createSignal(props.initialTitle)

  const canSubmit = (): boolean => props.busy || title().trim() === ""

  const submit = (event: Event): void => {
    event.preventDefault()
    props.onRename(title().trim())
  }

  return (
    <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <div class="w-full max-w-md">
        <form class="paper-card" onSubmit={submit}>
          <div class="card-body gap-4">
            <div class="flex items-start justify-between">
              <h2 class="card-title text-2xl font-extrabold">Rename event</h2>
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
                <span class="label-text">Title</span>
              </div>
              <input
                type="text"
                class="input input-bordered"
                placeholder="e.g. Our wedding"
                maxlength="160"
                value={title()}
                onInput={(event) => setTitle(event.currentTarget.value)}
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
      </div>
    </div>
  )
}