import { Title } from "@solidjs/meta"
import type { JSX } from "solid-js"
import { CameraIcon } from "~/components/icons"

const Home = (): JSX.Element => (
  <div class="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
    <Title>Guestroll</Title>
    <div class="w-full max-w-md">
      <div class="mb-6 flex justify-center">
        <div class="flex h-24 w-24 items-center justify-center rounded-box bg-primary text-primary-content shadow-lg">
          <CameraIcon class="h-12 w-12" />
        </div>
      </div>
      <div class="card bg-base-100 shadow-xl">
        <div class="card-body gap-3 text-center">
          <h1 class="card-title justify-center text-3xl">Guestroll</h1>
          <p class="text-base-content/80">
            This is the couple's guest camera roll. Open the link from your invitation or scan
            the QR code at the venue to start snapping.
          </p>
        </div>
      </div>
    </div>
  </div>
)

export default Home