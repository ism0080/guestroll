import { Title } from "@solidjs/meta"
import { Navigate, useNavigate, useParams } from "@solidjs/router"
import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query"
import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import type { JSX } from "solid-js"
import type { EventStatus, HostPhoto } from "@guestroll/contracts"
import {
  fetchAllEventPhotos,
  guestLink,
  loadSession,
  SESSION_QUERY_KEY,
  updateEventStatus
} from "~/lib/api"
import { CheckIcon, CopyIcon, QrIcon } from "~/components/icons"
import { DownloadButton } from "~/components/DownloadButton"
import { ShareModal } from "~/components/ShareModal"
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

  const copyLink = (): void => {
    navigator.clipboard.writeText(guestLink(slug)).catch(() => {})
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

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
                {photosQuery.data?.length ?? 0} photos
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
              onSelect={(photo) => setSelected(photo)}
            />
          </Show>
        </div>
      </Show>

      <Lightbox slug={slug} photo={selected()} onClose={() => setSelected(null)} />

      <Show when={shareOpen() && event() !== undefined}>
        <ShareModal slug={slug} title={event()!.title} onClose={() => setShareOpen(false)} />
      </Show>
    </>
  )
}

export default EventDetail