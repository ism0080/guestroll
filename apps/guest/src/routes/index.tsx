import { Title } from "@solidjs/meta"
import type { JSX } from "solid-js"
import { CameraBody } from "@guestroll/ui"
import { useNavigate } from "@solidjs/router"
import { InvitationEntry } from "~/components/InvitationEntry"
import { listEventSessions } from "~/lib/session"
import { For, onMount, createSignal, Show } from "solid-js"

const Home = (): JSX.Element => {
  const navigate = useNavigate()
  const [sessions, setSessions] = createSignal<ReadonlyArray<{ readonly slug: string; readonly title: string }>>([])
  onMount(() => setSessions(listEventSessions()))
  return (
    <div class="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <Title>GuestRoll</Title>
      <div class="w-full max-w-sm text-center">
        <CameraBody class="mx-auto w-44 drop-shadow-[6px_6px_0_rgba(32,29,24,0.12)]" />
        <p class="film-counter mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-secondary">GuestRoll</p>
        <h1 class="mt-1 text-3xl font-extrabold text-base-content">The guest camera roll</h1>
        <p class="mt-3 text-base-content/70">Your invitation is the key to the camera.</p>
        <Show when={sessions().length > 0}>
          <div class="mt-5 text-left">
            <p class="mb-2 px-1 text-xs font-bold uppercase tracking-[0.15em] text-base-content/50">Your active rolls</p>
            <div class="space-y-2">
              <For each={sessions()}>
                {(session) => (
                  <button
                    type="button"
                    class="flex w-full items-center justify-between rounded-box border-2 border-neutral bg-base-100 p-3 text-left shadow-[3px_3px_0_0_var(--guestroll-ink)]"
                    onClick={() => navigate(`/${session.slug}`)}
                  >
                    <span>
                      <span class="block font-bold text-base-content">{session.title}</span>
                      <span class="font-mono text-xs text-base-content/50">{session.slug}</span>
                    </span>
                    <span class="text-sm font-semibold text-primary">Rejoin</span>
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>
        <div class="mt-5">
          <InvitationEntry onOpen={(slug) => navigate(`/${slug}`)} />
        </div>
      </div>
    </div>
  )
}

export default Home
