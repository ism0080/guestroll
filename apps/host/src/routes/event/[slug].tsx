import { Title } from "@solidjs/meta"
import { Navigate, useNavigate, useParams } from "@solidjs/router"
import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query"
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import type { JSX } from "solid-js"
import type { EventStatus, HostCamera, HostPhoto } from "@guestroll/contracts"
import {
  fetchAllEventPhotos,
  guestLink,
  listEventCameras,
  loadSession,
  resetCamera,
  SESSION_QUERY_KEY,
  updateEventPhotoLimit,
  updateEventStatus
} from "~/lib/api"
import { CheckIcon, CopyIcon, EditIcon, QrIcon } from "~/components/icons"
import { CameraBody } from "~/components/camera-art"
import { DownloadButton } from "~/components/DownloadButton"
import { ShareModal } from "~/components/ShareModal"
import { ShotLimitModal } from "~/components/ShotLimitModal"
import { PhotoGrid } from "~/components/PhotoGrid"
import { Lightbox } from "~/components/Lightbox"

const EventDetail = (): JSX.Element => {
  const params = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const slug = params["slug"] ?? ""

  const [selected, setSelected] = createSignal<HostPhoto | null>(null)
  const [copied, setCopied] = createSignal(false)
  const [shareOpen, setShareOpen] = createSignal(false)
  const [shotLimitOpen, setShotLimitOpen] = createSignal(false)

  onMount(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setSelected(null)
    }
    window.addEventListener("keydown", onKey)
    onCleanup(() => window.removeEventListener("keydown", onKey))
  })

  const sessionQuery = createQuery(() => ({
    queryKey: SESSION_QUERY_KEY,
    queryFn: loadSession,
    retry: false
  }))

  const event = createMemo(() =>
    sessionQuery.data?.events.find((candidate) => candidate.slug === slug)
  )

  const photosQuery = createQuery(() => ({
    queryKey: ["host", "photos", slug],
    queryFn: () => fetchAllEventPhotos(slug),
    enabled: sessionQuery.data?.authenticated === true && event() !== undefined,
    retry: false,
    refetchInterval: 20000,
    refetchOnWindowFocus: true
  }))

  const statusMutation = createMutation(() => ({
    mutationFn: (status: EventStatus) => updateEventStatus(slug, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
    }
  }))

  const camerasQuery = createQuery(() => ({
    queryKey: ["host", "cameras", slug],
    queryFn: () => listEventCameras(slug),
    enabled: sessionQuery.data?.authenticated === true && event() !== undefined,
    retry: false,
    refetchOnWindowFocus: true
  }))

  const shotLimitMutation = createMutation(() => ({
    mutationFn: (photoLimit: number) => updateEventPhotoLimit(slug, photoLimit),
    onSuccess: () => {
      setShotLimitOpen(false)
      void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: ["host", "cameras", slug] })
    }
  }))

  const resetMutation = createMutation(() => ({
    mutationFn: (cameraId: string) => resetCamera(slug, cameraId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["host", "cameras", slug] })
    }
  }))

  const copyLink = (): void => {
    navigator.clipboard.writeText(guestLink(slug)).catch(() => {})
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const rollStatus = (roll: HostCamera): "in-progress" | "full" | "reset" =>
    roll.resetAt !== undefined ? "reset" : roll.usedCount >= roll.photoLimit ? "full" : "in-progress"

  const guestNames = createMemo<Readonly<Record<string, string | undefined>>>(() => {
    const names: Record<string, string | undefined> = {}
    for (const roll of camerasQuery.data ?? []) {
      if (roll.guestName !== undefined) names[roll.id] = roll.guestName
    }
    return names
  })

  return (
    <>
      <Show when={sessionQuery.isPending}>
        <div class="flex min-h-dvh flex-col items-center justify-center gap-5 px-6">
          <CameraBody class="w-40 animate-pulse" />
          <div class="film-counter flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-base-content/50">
            <span class="loading loading-spinner loading-sm text-primary" />
            Loading the roll…
          </div>
        </div>
      </Show>

      <Show when={sessionQuery.isError}>
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

      <Show when={sessionQuery.data?.authenticated === false}>
        <Navigate href="/" />
      </Show>

      <Show when={sessionQuery.data?.authenticated === true && event() === undefined}>
        <div class="flex min-h-dvh flex-col items-center justify-center px-6">
          <div class="paper-card w-full max-w-sm p-6 text-center">
            <h1 class="text-2xl font-extrabold text-base-content">Event not found</h1>
            <button
              type="button"
              class="shutter-btn btn btn-primary btn-lg mt-5 w-full border-2 border-neutral shadow-[3px_3px_0_0_var(--guestroll-ink)]"
              onClick={() => navigate("/")}
            >
              Back to events
            </button>
          </div>
        </div>
      </Show>

      <Show when={sessionQuery.data?.authenticated === true && event() !== undefined}>
        <Title>{event()!.title} — Guestroll</Title>
        <div class="mx-auto max-w-5xl px-4 py-8">
          <div class="mb-6 flex items-start justify-between gap-4">
            <div>
              <button
                type="button"
                class="btn btn-ghost btn-sm mb-2 -ml-3"
                onClick={() => navigate("/")}
              >
                ← All events
              </button>
              <div class="flex items-center gap-3">
                <h1 class="text-3xl font-extrabold">{event()!.title}</h1>
                <Show
                  when={event()!.status === "live"}
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
              </div>
              <p class="film-counter mt-2 flex items-center gap-1 text-sm text-base-content/60">
                <span class="font-bold text-primary">{photosQuery.data?.length ?? 0}</span> photos
                · {event()!.photoLimit} shots per guest
                <button
                  type="button"
                  class="btn btn-ghost btn-xs ml-1"
                  aria-label="Edit shot count"
                  onClick={() => setShotLimitOpen(true)}
                >
                  <EditIcon class="h-3.5 w-3.5" />
                  Edit
                </button>
              </p>
            </div>

            <div class="flex flex-col items-stretch gap-2">
              <button
                type="button"
                class="btn btn-ghost btn-sm border-2 border-neutral"
                onClick={() => setShareOpen(true)}
              >
                <QrIcon class="h-4 w-4" />
                Share & print
              </button>
              <DownloadButton slug={slug} />
              <button
                type="button"
                class="btn btn-ghost btn-sm border-2 border-neutral"
                onClick={copyLink}
              >
                {copied() ? <CheckIcon class="h-4 w-4" /> : <CopyIcon class="h-4 w-4" />}
                {copied() ? "Link copied" : "Copy guest link"}
              </button>
              <button
                type="button"
                class="shutter-btn btn btn-primary btn-sm border-2 border-neutral shadow-[3px_3px_0_0_var(--guestroll-ink)]"
                disabled={statusMutation.isPending}
                onClick={() =>
                  statusMutation.mutate(event()!.status === "live" ? "draft" : "live")
                }
              >
                {event()!.status === "live" ? "Set to draft" : "Go live"}
              </button>
            </div>
          </div>

          <Show when={(camerasQuery.data?.length ?? 0) > 0}>
            <div class="collapse collapse-arrow mb-6 rounded-box border-2 border-neutral bg-base-100 shadow-[4px_4px_0_0_var(--guestroll-ink)]">
              <input type="checkbox" />
              <div class="collapse-title flex items-center justify-between gap-3">
                <h2 class="text-lg font-bold">Guest rolls</h2>
                <span class="film-counter rounded-md border-2 border-neutral bg-base-200 px-2 py-0.5 text-xs font-bold">
                  {camerasQuery.data?.length}
                </span>
              </div>
              <div class="collapse-content">
                <p class="text-sm text-base-content/60">
                  Reset a roll to let that device start a new set of photos. Their photos
                  stay in the event.
                </p>
                <ul class="mt-2 divide-y-2 divide-base-300">
                  <For each={camerasQuery.data}>
                    {(roll) => (
                      <li class="flex items-center justify-between gap-4 py-3">
                        <div class="min-w-0">
                          <p class="truncate font-semibold">{roll.guestName ?? "Anonymous guest"}</p>
                          <p class="film-counter text-sm text-base-content/60">
                            {roll.usedCount}/{roll.photoLimit} photos
                          </p>
                        </div>
                        <div class="flex shrink-0 items-center gap-2">
                          <Show when={rollStatus(roll) === "in-progress"}>
                            <span class="film-counter rounded-md border-2 border-neutral bg-secondary px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-secondary-content">
                              In progress
                            </span>
                          </Show>
                          <Show when={rollStatus(roll) === "full"}>
                            <span class="film-counter rounded-md border-2 border-neutral bg-accent px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent-content">
                              Full
                            </span>
                          </Show>
                          <Show when={rollStatus(roll) === "reset"}>
                            <span class="film-counter rounded-md border-2 border-neutral bg-base-200 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">
                              Reset
                            </span>
                          </Show>
                          <Show when={roll.resetAt === undefined}>
                            <button
                              type="button"
                              class="btn btn-ghost btn-sm border-2 border-neutral"
                              disabled={resetMutation.isPending}
                              onClick={() => resetMutation.mutate(roll.id)}
                            >
                              Reset
                            </button>
                          </Show>
                        </div>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </div>
          </Show>

          <Show when={photosQuery.isError}>
            <div class="mb-4 flex items-center justify-between gap-3 rounded-field border-2 border-warning bg-warning/10 p-3 text-sm">
              <span>Couldn't refresh photos.</span>
              <button
                type="button"
                class="btn btn-ghost btn-sm border-2 border-neutral"
                onClick={() => photosQuery.refetch().catch(() => {})}
              >
                Retry
              </button>
            </div>
          </Show>

          <Show
            when={(photosQuery.data?.length ?? 0) > 0}
            fallback={
              <div class="paper-card p-8 text-center">
                <CameraBody class="mx-auto mb-4 w-32 opacity-80" />
                <Show
                  when={event()!.status === "live"}
                  fallback={
                    <p class="text-base-content/70">
                      This roll is a draft. Go live so guests can start snapping.
                    </p>
                  }
                >
                  <p class="text-base-content/70">
                    No photos yet — share the link and wait for the first shots to roll in.
                  </p>
                </Show>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm mt-4 border-2 border-neutral"
                  onClick={copyLink}
                >
                  <CopyIcon class="h-4 w-4" />
                  Copy guest link
                </button>
              </div>
            }
          >
            <PhotoGrid
              slug={slug}
              photos={photosQuery.data ?? []}
              guestNames={guestNames()}
              onSelect={(photo) => setSelected(photo)}
            />
          </Show>
        </div>
      </Show>

      <Lightbox slug={slug} photo={selected()} guestNames={guestNames()} onClose={() => setSelected(null)} />

      <Show when={shareOpen() && event() !== undefined}>
        <ShareModal slug={slug} title={event()!.title} onClose={() => setShareOpen(false)} />
      </Show>

      <Show when={shotLimitOpen() && event() !== undefined}>
        <ShotLimitModal
          busy={shotLimitMutation.isPending}
          error={shotLimitMutation.error ? "Couldn't update the shot count. Try again." : null}
          initialLimit={event()!.photoLimit}
          onClose={() => setShotLimitOpen(false)}
          onSave={(photoLimit) => shotLimitMutation.mutate(photoLimit)}
        />
      </Show>
    </>
  )
}

export default EventDetail