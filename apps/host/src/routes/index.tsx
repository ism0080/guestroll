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
  updateEventPhotoLimit,
  SESSION_QUERY_KEY,
  type SessionSnapshot
} from "~/lib/api"
import {
  DuplicateIcon,
  EditIcon,
  LogoutIcon,
  MoreIcon,
  PlusIcon,
  QrIcon,
  TrashIcon,
  CameraBody
} from "@guestroll/ui"
import { LoginScreen } from "~/components/LoginScreen"
import { NewEventModal } from "~/components/NewEventModal"
import { RenameEventModal } from "~/components/RenameEventModal"
import { ShareModal } from "~/components/ShareModal"
import { ShotLimitModal } from "~/components/ShotLimitModal"

const Home = (): JSX.Element => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = createSignal(false)
  const [shareEvent, setShareEvent] = createSignal<EventPublic | null>(null)
  const [renameTarget, setRenameTarget] = createSignal<EventPublic | null>(null)
  const [shotLimitTarget, setShotLimitTarget] = createSignal<EventPublic | null>(null)

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

  const shotLimitMutation = createMutation(() => ({
    mutationFn: ({ slug, photoLimit }: { slug: string; photoLimit: number }) =>
      updateEventPhotoLimit(slug, photoLimit),
    onSuccess: () => {
      setShotLimitTarget(null)
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

  const shotLimitError = createMemo<string | null>(() => {
    const error = shotLimitMutation.error
    if (error === null) return null
    if (error instanceof ApiError && error.kind === "bad-request") {
      return "Enter a whole number between 1 and 100."
    }
    return error instanceof ApiError ? error.message : "Couldn't update the shot count. Try again."
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
        <div class="flex min-h-dvh flex-col items-center justify-center gap-5 px-6">
          <CameraBody class="w-40 animate-pulse" />
          <div class="film-counter flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-base-content/50">
            <span class="loading loading-spinner loading-sm text-primary" />
            Loading your events…
          </div>
        </div>
      </Show>

      <Show when={state() === "error"}>
        <div class="flex min-h-dvh flex-col items-center justify-center px-6">
          <div class="paper-card w-full max-w-sm p-6 text-center">
            <h1 class="text-2xl font-extrabold text-base-content">Can't reach the service</h1>
            <p class="mt-2 text-base-content/70">Check your connection and try again.</p>
            <button
              type="button"
              class="shutter-btn btn btn-primary btn-lg mt-5 w-full border-2 border-neutral shadow-[3px_3px_0_0_var(--guestroll-ink)]"
              onClick={() => {
                queryClient.clear()
                sessionQuery.refetch().catch(() => {})
              }}
            >
              Try again
            </button>
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
        <Title>GuestRoll</Title>
        <div class="mx-auto max-w-5xl px-4 py-8">
          <header class="mb-8 flex items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <CameraBody class="w-16 shrink-0" />
              <div>
                <p class="film-counter text-[11px] font-semibold uppercase tracking-[0.2em] text-secondary">
                  GuestRoll
                </p>
                <h1 class="text-2xl font-extrabold leading-tight">Your guest rolls</h1>
              </div>
            </div>
            <button
              type="button"
              class="btn btn-ghost gap-2"
               disabled={logoutMutation.isPending}
               onClick={() => logoutMutation.mutate()}
            >
              <LogoutIcon class="h-5 w-5" />
              Sign out
            </button>
          </header>

          <div class="mb-6 flex items-center justify-between">
            <h2 class="text-lg font-bold">Events</h2>
            <button
              type="button"
              class="shutter-btn btn btn-primary gap-2 border-2 border-neutral shadow-[3px_3px_0_0_var(--guestroll-ink)]"
              onClick={() => setShowCreate(true)}
            >
              <PlusIcon class="h-5 w-5" />
              New event
            </button>
          </div>

          <Show when={deleteError() !== null}>
            <div class="mb-4 rounded-field border-2 border-error bg-error/10 p-3 text-sm text-base-content">
              {deleteError()}
            </div>
          </Show>

          <Show
            when={sessionQuery.data!.events.length > 0}
            fallback={
              <div class="paper-card p-8 text-center">
                <CameraBody class="mx-auto mb-4 w-32 opacity-80" />
                <p class="text-base-content/70">
                  No events yet — create your first guest roll.
                </p>
              </div>
            }
          >
            <div class="grid gap-4 sm:grid-cols-2">
              <For each={sessionQuery.data!.events}>
                {(event) => (
                  <div class="rounded-box border-2 border-neutral bg-base-100 p-5 shadow-[4px_4px_0_0_var(--guestroll-ink)] transition-transform hover:-translate-y-0.5">
                    <div class="flex items-start justify-between gap-2">
                      <h3 class="text-lg font-bold leading-tight">{event.title}</h3>
                      <div class="flex items-center gap-1">
                        <Show
                          when={event.status === "live"}
                          fallback={
                            <span class="film-counter rounded-md border-2 border-neutral bg-base-200 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">
                              Draft
                            </span>
                          }
                        >
                          <span class="film-counter inline-flex items-center gap-1 rounded-md border-2 border-neutral bg-secondary px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-secondary-content">
                            <span class="h-1.5 w-1.5 rounded-full bg-secondary-content" />
                            Live
                          </span>
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
                            class="dropdown-content menu rounded-box z-10 w-44 border-2 border-neutral bg-base-100 p-2 shadow-[4px_4px_0_0_var(--guestroll-ink)]"
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
                                onClick={() => setShotLimitTarget(event)}
                              >
                                <EditIcon class="h-4 w-4" />
                                Shot count
                              </button>
                            </li>
                            <li>
                              <button
                                type="button"
                                 disabled={duplicateMutation.isPending}
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
                    <p class="film-counter mt-2 text-sm text-base-content/60">
                      {event.photoLimit} shots per guest
                    </p>
                    <div class="mt-4 flex gap-2">
                      <button
                        type="button"
                        class="shutter-btn btn btn-primary flex-1 border-2 border-neutral"
                        onClick={() => navigate(`/event/${event.slug}`)}
                      >
                        Open roll
                      </button>
                      <button
                        type="button"
                        class="btn btn-ghost border-2 border-neutral"
                        aria-label={`Share ${event.title}`}
                        onClick={() => setShareEvent(event)}
                      >
                        <QrIcon class="h-5 w-5" />
                      </button>
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
           onClose={() => { newEventMutation.reset(); setShowCreate(false) }}
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
           onClose={() => { renameMutation.reset(); setRenameTarget(null) }}
          onRename={(title) =>
            renameMutation.mutate({ slug: renameTarget()!.slug, title })
          }
        />
      </Show>

      <Show when={shotLimitTarget() !== null}>
        <ShotLimitModal
          busy={shotLimitMutation.isPending}
          error={shotLimitError()}
          initialLimit={shotLimitTarget()!.photoLimit}
           onClose={() => { shotLimitMutation.reset(); setShotLimitTarget(null) }}
          onSave={(photoLimit) =>
            shotLimitMutation.mutate({ slug: shotLimitTarget()!.slug, photoLimit })
          }
        />
      </Show>
    </>
  )
}

export default Home
