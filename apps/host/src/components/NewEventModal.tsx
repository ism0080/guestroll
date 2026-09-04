import { createSignal, For, Show } from "solid-js"
import type { JSX } from "solid-js"
import { FilterPackOptions } from "@guestroll/contracts"
import type { CreateEventInput } from "@guestroll/sdk"
import { CloseIcon } from "@guestroll/ui"
import { Modal } from "./Modal"

export interface NewEventModalProps {
  readonly busy: boolean
  readonly error: string | null
  readonly onClose: () => void
  readonly onCreate: (input: CreateEventInput) => void
}

const DEFAULT_LIMIT = 24
const DEFAULT_FILTER_PACK = "film"

export const NewEventModal = (props: NewEventModalProps): JSX.Element => {
  const [title, setTitle] = createSignal("")
  const [photoLimit, setPhotoLimit] = createSignal(DEFAULT_LIMIT)
  const [filterPack, setFilterPack] = createSignal(DEFAULT_FILTER_PACK)

  const canSubmit = (): boolean => props.busy || title().trim() === "" || !Number.isInteger(photoLimit()) || photoLimit() < 1 || photoLimit() > 100

  const submit = (event: Event): void => {
    event.preventDefault()
    props.onCreate({
      title: title().trim(),
      filterPack: filterPack(),
      photoLimit: photoLimit()
    })
  }

  return (
    <Modal label="New event" onClose={props.onClose}>
        <form class="paper-card" onSubmit={submit}>
          <div class="card-body gap-4">
            <div class="flex items-start justify-between">
              <h2 class="card-title text-2xl font-extrabold">New event</h2>
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

            <div class="flex gap-3">
              <label class="form-control w-full">
                <div class="label">
                  <span class="label-text">Shots per guest</span>
                </div>
                <input
                  type="number"
                  class="input input-bordered"
                  min="1"
                  max="100"
                  value={photoLimit()}
                  onInput={(event) => setPhotoLimit(Number(event.currentTarget.value))}
                />
              </label>

              <label class="form-control w-full">
                <div class="label">
                  <span class="label-text">Filter</span>
                </div>
                <select
                  class="select select-bordered"
                  value={filterPack()}
                  onInput={(event) => setFilterPack(event.currentTarget.value)}
                >
                  <For each={FilterPackOptions}>
                    {(option) => <option value={option.id}>{option.label}</option>}
                  </For>
                </select>
              </label>
            </div>

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
              {props.busy ? <span class="loading loading-spinner" /> : "Create event"}
            </button>
          </div>
        </form>
    </Modal>
  )
}
