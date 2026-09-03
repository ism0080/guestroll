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
        <div class="flex min-h-dvh flex-col items-center justify-center gap-4">
          <span class="loading loading-spinner loading-lg text-primary" />
          <span class="text-base-content/60">Loading the roll…</span>
        </div>
      </Show>

      <Show when={sessionQuery.isError}>
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

      <Show when={sessionQuery.data?.authenticated === false}>
        <Navigate href="/" />
      </Show>

      <Show when={sessionQuery.data?.authenticated === true && event() === undefined}>
        <div class="flex min-h-dvh flex-col items-center justify-center px-6">
          <div class="card w-full max-w-md bg-base-100 shadow-xl">
            <div class="card-body gap-3 text-center">
              <h1 class="card-title justify-center text-2xl">Event not found</h1>
              <button
                type="button"
                class="btn btn-primary mt-2"
                onClick={() => navigate("/")}
              >
                Back to events
              </button>
            </div>
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
                <h1 class="text-3xl font-bold">{event()!.title}</h1>
                <Show
                  when={event()!.status === "live"}
                  fallback={<span class="badge badge-ghost">Draft</span>}
                >
                  <span class="badge badge-success">Live</span>
                </Show>
              </div>
              <p class="mt-1 text-sm text-base-content/60">
                {photosQuery.data?.length ?? 0} photos · {event()!.photoLimit} shots per guest
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
                class="btn btn-outline btn-sm"
                onClick={() => setShareOpen(true)}
              >
                <QrIcon class="h-4 w-4" />
                Share & print
              </button>
              <DownloadButton slug={slug} />
              <button
                type="button"
                class="btn btn-outline btn-sm"
                onClick={copyLink}
              >
                {copied() ? <CheckIcon class="h-4 w-4" /> : <CopyIcon class="h-4 w-4" />}
                {copied() ? "Link copied" : "Copy guest link"}
              </button>
              <button
                type="button"
                class="btn btn-primary btn-sm"
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
            <div class="collapse collapse-arrow mb-6 bg-base-100 shadow-xl">
              <input type="checkbox" />
              <div class="collapse-title flex items-center justify-between gap-3">
                <h2 class="text-lg font-semibold">Guest rolls</h2>
                <span class="badge badge-ghost">{camerasQuery.data?.length}</span>
              </div>
              <div class="collapse-content">
                <p class="text-sm text-base-content/60">
                  Reset a roll to let that device start a new set of photos. Their photos
                  stay in the event.
                </p>
                <ul class="divide-y divide-base-300">
                  <For each={camerasQuery.data}>
                    {(roll) => (
                      <li class="flex items-center justify-between gap-4 py-2">
                        <div class="min-w-0">
                          <p class="truncate font-medium">{roll.guestName ?? "Anonymous guest"}</p>
                          <p class="text-sm text-base-content/60">
                            {roll.usedCount}/{roll.photoLimit} photos
                          </p>
                        </div>
                        <div class="flex shrink-0 items-center gap-2">
                          <Show when={rollStatus(roll) === "in-progress"}>
                            <span class="badge badge-success">In progress</span>
                          </Show>
                          <Show when={rollStatus(roll) === "full"}>
                            <span class="badge badge-warning">Full</span>
                          </Show>
                          <Show when={rollStatus(roll) === "reset"}>
                            <span class="badge badge-ghost">Reset</span>
                          </Show>
                          <Show when={roll.resetAt === undefined}>
                            <button
                              type="button"
                              class="btn btn-outline btn-sm"
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
            <div class="alert alert-warning mb-4">
              <span>Couldn't refresh photos.</span>
              <button
                type="button"
                class="btn btn-sm"
                onClick={() => photosQuery.refetch().catch(() => {})}
              >
                Retry
              </button>
            </div>
          </Show>

          <Show
            when={(photosQuery.data?.length ?? 0) > 0}
            fallback={
              <div class="card bg-base-100 shadow-xl">
                <div class="card-body items-center gap-2 text-center">
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
                  <button type="button" class="btn btn-sm mt-2" onClick={copyLink}>
                    <CopyIcon class="h-4 w-4" />
                    Copy guest link
                  </button>
                </div>
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