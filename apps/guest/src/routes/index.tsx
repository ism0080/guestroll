import { Title } from "@solidjs/meta"
import type { JSX } from "solid-js"
import { CameraBody } from "@guestroll/ui"
import { useNavigate } from "@solidjs/router"
import { InvitationEntry } from "~/components/InvitationEntry"

const Home = (): JSX.Element => {
  const navigate = useNavigate()
  return (
    <div class="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <Title>GuestRoll</Title>
      <div class="w-full max-w-sm text-center">
        <CameraBody class="mx-auto w-44 drop-shadow-[6px_6px_0_rgba(32,29,24,0.12)]" />
        <p class="film-counter mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-secondary">GuestRoll</p>
        <h1 class="mt-1 text-3xl font-extrabold text-base-content">The guest camera roll</h1>
        <p class="mt-3 text-base-content/70">Your invitation is the key to the camera.</p>
        <div class="mt-5">
          <InvitationEntry onOpen={(slug) => navigate(`/${slug}`)} />
        </div>
      </div>
    </div>
  )
}

export default Home
