import { Title } from "@solidjs/meta"
import { useNavigate } from "@solidjs/router"
import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query"
import { createMemo, createSignal, For, Show } from "solid-js"
import type { JSX } from "solid-js"
import type { CreateEventInput } from "@guestroll/sdk"
import type { EventPublic } from "@guestroll/contracts"
import {
  ApiError,
  createEvent,
  deleteEvent,
  duplicateEvent,
  loadSession,
  login,
  logout,
  renameEvent,
  SESSION_QUERY_KEY,
  type SessionSnapshot
} from "~/lib/api"
import {
  CameraIcon,
  DuplicateIcon,
  EditIcon,
  LogoutIcon,
  MoreIcon,
  PlusIcon,
  QrIcon,
  TrashIcon
} from "~/components/icons"
import { LoginScreen } from "~/components/LoginScreen"
import { NewEventModal } from "~/components/NewEventModal"
import { RenameEventModal } from "~/components/RenameEventModal"
import { ShareModal } from "~/components/ShareModal"

const Home = (): JSX.Element => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = createSignal(false)
  const [shareEvent, setShareEvent] = createSignal<EventPublic | null>(null)
  const [renameTarget, setRenameTarget] = createSignal<EventPublic | null>(null)

  const sessionQuery = createQuery(() => ({
    queryKey: SESSION_QUERY_KEY,
    queryFn: loadSession,
    retry: false
  }))

  const loginMutation = createMutation(() => ({
    mutationFn: (passcode: string) => login(passcode),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
    }
  }))

  const logoutMutation = createMutation(() => ({
    mutationFn: () => logout(),
    onSuccess: () => {
      queryClient.setQueryData<SessionSnapshot>(SESSION_QUERY_KEY, {
        authenticated: false,
        events: []
      })
    }
  }))

  const newEventMutation = createMutation(() => ({
    mutationFn: (input: CreateEventInput) => createEvent(input),
    onSuccess: () => {
      setShowCreate(false)
      void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
    }
  }))

  const renameMutation = createMutation(() => ({
    mutationFn: ({ slug, title }: { slug: string; title: string }) => renameEvent(slug, title),
    onSuccess: () => {
      setRenameTarget(null)
      void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
    }
  }))

  const duplicateMutation = createMutation(() => ({
    mutationFn: (slug: string) => duplicateEvent(slug),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
    }
  }))

  const deleteMutation = createMutation(() => ({
    mutationFn: (slug: string) => deleteEvent(slug),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
    }
  }))

  const state = createMemo<"loading" | "error" | "login" | "dashboard">(() => {
    if (sessionQuery.isPending) return "loading"
    if (sessionQuery.isError) return "error"
    return sessionQuery.data.authenticated ? "dashboard" : "login"
  })

  const loginError = createMemo<string | null>(() => {
    const error = loginMutation.error
    if (error === null) return null
    if (error instanceof ApiError && error.kind === "unauthorized") {
      return "That passcode didn't work."
    }
    return error instanceof ApiError ? error.message : "Couldn't reach the service. Try again."
  })

  const createError = createMemo<string | null>(() => {
    const error = newEventMutation.error
    if (error === null) return null
    if (error instanceof ApiError && error.kind === "bad-request") {
      return "Check the event details and try again."
    }
    return error instanceof ApiError ? error.message : "Couldn't create the event. Try again."
  })

  const renameError = createMemo<string | null>(() => {
    const error = renameMutation.error
    if (error === null) return null
    if (error instanceof ApiError && error.kind === "bad-request") {
      return "Check the title and try again."
    }
    return error instanceof ApiError ? error.message : "Couldn't rename the event. Try again."
  })

  const deleteError = createMemo<string | null>(() => {
    const error = deleteMutation.error
    if (error === null) return null
    return error instanceof ApiError ? error.message : "Couldn't delete the event. Try again."
  })

  const confirmDelete = (event: EventPublic): void => {
    if (window.confirm(`Delete "${event.title}" and all its photos? This can't be undone.`)) {
      deleteMutation.mutate(event.slug)
    }
  }

  return (
    <>
      <Show when={state() === "loading"}>
        <div class="flex min-h-dvh flex-col items-center justify-center gap-4">
          <span class="loading loading-spinner loading-lg text-primary" />
          <span class="text-base-content/60">Loading your events…</span>
        </div>
      </Show>

      <Show when={state() === "error"}>
        <div class="flex min-h-dvh flex-col items-center justify-center px-6">
          <div class="card w-full max-w-md bg-base-100 shadow-xl">
            <div class="card-body gap-3 text-center">
              <h1 class="card-title justify-center text-2xl">Can't reach the service</h1>
              <p class="text-base-content/80">
                Check your connection and try again.
              </p>
              <button
                type="button"
                class="btn btn-primary mt-2"
                onClick={() => {
                  queryClient.clear()
                  sessionQuery.refetch().catch(() => {})
                }}
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={state() === "login"}>
        <LoginScreen
          busy={loginMutation.isPending}
          error={loginError()}
          onLogin={(passcode) => loginMutation.mutate(passcode)}
        />
      </Show>

      <Show when={state() === "dashboard"}>
        <Title>Guestroll</Title>
        <div class="mx-auto max-w-5xl px-4 py-8">
          <header class="mb-8 flex items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <div class="flex h-12 w-12 items-center justify-center rounded-box bg-primary text-primary-content">
                <CameraIcon class="h-6 w-6" />
              </div>
              <div>
                <h1 class="text-2xl font-bold">Guestroll</h1>
                <p class="text-sm text-base-content/60">Your guest photo rolls</p>
              </div>
            </div>
            <button
              type="button"
              class="btn btn-ghost"
              onClick={() => logoutMutation.mutate()}
            >
              <LogoutIcon class="h-5 w-5" />
              Sign out
            </button>
          </header>

          <div class="mb-6 flex items-center justify-between">
            <h2 class="text-lg font-semibold">Events</h2>
            <button
              type="button"
              class="btn btn-primary"
              onClick={() => setShowCreate(true)}
            >
              <PlusIcon class="h-5 w-5" />
              New event
            </button>
          </div>

          <Show when={deleteError() !== null}>
            <div class="alert alert-error mb-4">
              <span>{deleteError()}</span>
            </div>
          </Show>

          <Show
            when={sessionQuery.data!.events.length > 0}
            fallback={
              <div class="card bg-base-100 shadow-xl">
                <div class="card-body items-center gap-2 text-center">
                  <p class="text-base-content/70">
                    No events yet — create your first guest roll.
                  </p>
                </div>
              </div>
            }
          >
            <div class="grid gap-4 sm:grid-cols-2">
              <For each={sessionQuery.data!.events}>
                {(event) => (
                  <div class="card bg-base-100 shadow-xl">
                    <div class="card-body gap-3">
                      <div class="flex items-start justify-between gap-2">
                        <h3 class="card-title">{event.title}</h3>
                        <div class="flex items-center gap-1">
                          <Show
                            when={event.status === "live"}
                            fallback={<span class="badge badge-ghost">Draft</span>}
                          >
                            <span class="badge badge-success">Live</span>
                          </Show>
                          <div class="dropdown dropdown-end">
                            <div
                              tabindex="0"
                              role="button"
                              class="btn btn-ghost btn-sm px-2"
                              aria-label={`Actions for ${event.title}`}
                            >
                              <MoreIcon class="h-5 w-5" />
                            </div>
                            <ul
                              tabindex="0"
                              class="dropdown-content menu rounded-box z-10 w-44 bg-base-100 p-2 shadow"
                            >
                              <li>
                                <button
                                  type="button"
                                  onClick={() => setRenameTarget(event)}
                                >
                                  <EditIcon class="h-4 w-4" />
                                  Rename
                                </button>
                              </li>
                              <li>
                                <button
                                  type="button"
                                  onClick={() => duplicateMutation.mutate(event.slug)}
                                >
                                  <DuplicateIcon class="h-4 w-4" />
                                  Duplicate
                                </button>
                              </li>
                              <li>
                                <button
                                  type="button"
                                  class="text-error"
                                  onClick={() => confirmDelete(event)}
                                >
                                  <TrashIcon class="h-4 w-4" />
                                  Delete
                                </button>
                              </li>
                            </ul>
                          </div>
                        </div>
                      </div>
                      <p class="text-sm text-base-content/60">
                        {event.photoLimit} shots per guest
                      </p>
                      <div class="flex gap-2">
                        <button
                          type="button"
                          class="btn btn-primary flex-1"
                          onClick={() => navigate(`/event/${event.slug}`)}
                        >
                          Open roll
                        </button>
                        <button
                          type="button"
                          class="btn btn-outline"
                          aria-label={`Share ${event.title}`}
                          onClick={() => setShareEvent(event)}
                        >
                          <QrIcon class="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={showCreate()}>
        <NewEventModal
          busy={newEventMutation.isPending}
          error={createError()}
          onClose={() => setShowCreate(false)}
          onCreate={(input) => newEventMutation.mutate(input)}
        />
      </Show>

      <Show when={shareEvent() !== null}>
        <ShareModal
          slug={shareEvent()!.slug}
          title={shareEvent()!.title}
          onClose={() => setShareEvent(null)}
        />
      </Show>

      <Show when={renameTarget() !== null}>
        <RenameEventModal
          busy={renameMutation.isPending}
          error={renameError()}
          initialTitle={renameTarget()!.title}
          onClose={() => setRenameTarget(null)}
          onRename={(title) =>
            renameMutation.mutate({ slug: renameTarget()!.slug, title })
          }
        />
      </Show>
    </>
  )
}

export default Home