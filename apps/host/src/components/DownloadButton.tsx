import { createSignal, onCleanup, Show } from "solid-js"
import type { JSX } from "solid-js"
import type { DownloadStatus } from "@guestroll/contracts"
import { downloadFileUrl, getDownloadStatus, requestDownload } from "~/lib/api"

const PollIntervalMs = 3000
const MaxPolls = 180

const startFileDownload = async (slug: string): Promise<void> => {
  const { saveBlob } = await import("~/lib/share")
  const response = await fetch(downloadFileUrl(slug), { credentials: "include" })
  if (!response.ok) throw new Error(`Download failed with status ${response.status}`)
  const blob = await response.blob()
  await saveBlob(blob, `${slug}-photos.zip`, { title: `${slug}-photos.zip` })
}

export const DownloadButton = (props: { readonly slug: string }): JSX.Element => {
  const [phase, setPhase] = createSignal<"idle" | "building" | "error">("idle")
  const [message, setMessage] = createSignal("")
  let pollTimer: number | undefined
  let polls = 0

  onCleanup(() => {
    if (pollTimer !== undefined) window.clearInterval(pollTimer)
  })

  const handleStatus = async (status: DownloadStatus): Promise<void> => {
    if (status.status === "ready") {
      if (pollTimer !== undefined) window.clearInterval(pollTimer)
      pollTimer = undefined
      setPhase("idle")
      try {
        await startFileDownload(props.slug)
      } catch {
        setPhase("error")
        setMessage("Couldn't download the ZIP — try again.")
      }
      return
    }
    if (status.status === "error") {
      if (pollTimer !== undefined) window.clearInterval(pollTimer)
      pollTimer = undefined
      setPhase("error")
      setMessage("The ZIP build failed — try again.")
    }
  }

  const start = async (): Promise<void> => {
    setPhase("building")
    setMessage("Preparing ZIP…")
    try {
      const status = await requestDownload(props.slug)
      if (status.status === "building" || status.status === "none") {
        polls = 0
        pollTimer = window.setInterval(() => {
          polls += 1
          if (polls > MaxPolls) {
            if (pollTimer !== undefined) window.clearInterval(pollTimer)
            setPhase("error")
            setMessage("The build is taking too long — try again.")
            return
          }
          void getDownloadStatus(props.slug).then(handleStatus).catch(() => {})
        }, PollIntervalMs)
        return
      }
      await handleStatus(status)
    } catch {
      setPhase("error")
      setMessage("Couldn't start the download — try again.")
    }
  }

  return (
    <div class="flex flex-col items-stretch gap-1">
      <button
        type="button"
        class="btn btn-ghost btn-sm border-2 border-neutral"
        disabled={phase() === "building"}
        onClick={() => void start()}
      >
        <Show when={phase() === "building"} fallback={<>Download all</>}>
          <span class="loading loading-spinner loading-xs" />
          Preparing ZIP…
        </Show>
      </button>
      <Show when={phase() === "error"}>
        <button type="button" class="btn btn-link btn-xs text-error" onClick={() => void start()}>
          {message()}
        </button>
      </Show>
    </div>
  )
}