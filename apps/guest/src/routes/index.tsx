import { Title } from "@solidjs/meta"
import type { JSX } from "solid-js"
import { CameraBody } from "~/components/camera-art"

const Home = (): JSX.Element => (
  <div class="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
    <Title>GuestRoll</Title>
    <div class="w-full max-w-sm text-center">
      <CameraBody class="mx-auto w-56 drop-shadow-[6px_6px_0_rgba(32,29,24,0.12)]" />
      <p class="film-counter mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
        GuestRoll
      </p>
      <h1 class="mt-1 text-3xl font-extrabold text-base-content">The guest camera roll</h1>
      <div class="mt-5 rounded-box border-2 border-neutral bg-base-100 p-5 shadow-[6px_6px_0_0_var(--guestroll-ink)]">
        <p class="text-base-content/70">
          Open the link from your invitation or scan the QR code at the venue to load your
          single-use camera and start snapping.
        </p>
      </div>
    </div>
  </div>
)

export default Home
