import { Title } from "@solidjs/meta"
import { useParams } from "@solidjs/router"
import type { EventPublic } from "@guestroll/contracts"
import { createSignal, onMount, Show } from "solid-js"
import type { JSX } from "solid-js"
import { ApiError, createCamera, getEvent, randomUUID, uploadPhoto } from "~/lib/api"
import { compressCanvas, loadGalleryBitmap, renderFrame } from "~/lib/image"
import { clearCameraSession, loadCameraSession, saveCameraSession } from "~/lib/session"
import type { CameraSession } from "~/lib/session"
import { CameraScreen } from "~/components/CameraScreen"
import {
  DoneScreen,
  ErrorScreen,
  ReviewOverlay,
  WelcomeScreen
} from "~/components/screens"
import type { ErrorKind } from "~/components/screens"
import { CameraIcon } from "~/components/icons"

type Phase = "loading" | "error" | "welcome" | "shooting" | "done"

interface ReviewPhoto {
  readonly canvas: HTMLCanvasElement
  readonly url: string
  readonly takenAt: Date
}

const _kindFor = (error: ApiError): ErrorKind => {
  switch (error.kind) {
    case "not-found":
    case "forbidden":
      return "not-ready"
    case "network":
      return "network"
    default:
      return "unknown"
  }
}

const _slugRoute = (): string => {
  const params = useParams()
  return params["slug"] ?? ""
}

const GuestRoute = (): JSX.Element => {
  const slug = _slugRoute()

  const [phase, setPhase] = createSignal<Phase>("loading")
  const [errorKind, setErrorKind] = createSignal<ErrorKind>("unknown")
  const [event, setEvent] = createSignal<EventPublic | null>(null)
  const [camera, setCamera] = createSignal<CameraSession | null>(null)
  const [guestName, setGuestName] = createSignal("")
  const [starting, setStarting] = createSignal(false)
  const [cameraIssue, setCameraIssue] = createSignal(false)
  const [review, setReview] = createSignal<ReviewPhoto | null>(null)
  const [busy, setBusy] = createSignal(false)
  const [uploadError, setUploadError] = createSignal<string | null>(null)
  const [doneCount, setDoneCount] = createSignal(0)
  let fileInput: HTMLInputElement | undefined

  const enterError = (kind: ErrorKind): void => {
    setErrorKind(kind)
    setPhase("error")
  }

  const loadEvent = async (): Promise<void> => {
    setPhase("loading")
    const stored = loadCameraSession(slug)
    if (stored !== undefined && stored.usedCount >= stored.photoLimit) {
      setDoneCount(stored.usedCount)
      setPhase("done")
      return
    }
    try {
      const loaded = await getEvent(slug)
      setEvent(loaded)
      if (stored !== undefined) {
        setCamera(stored)
        setPhase("shooting")
      } else {
        setPhase("welcome")
      }
    } catch (error) {
      enterError(error instanceof ApiError ? _kindFor(error) : "network")
    }
  }

  const makeSession = (cameraId: string, usedCount: number, photoLimit: number): CameraSession => {
    const trimmed = guestName().trim()
    return {
      cameraId,
      usedCount,
      photoLimit,
      guestName: trimmed === "" ? undefined : trimmed
    }
  }

  const ensureCamera = async (): Promise<CameraSession> => {
    const existing = camera()
    if (existing !== null) return existing
    const loaded = event()
    if (loaded === null) throw new ApiError("network", "Event not loaded")
    const result = await createCamera(loaded.slug, guestName().trim() === "" ? undefined : guestName().trim())
    const session = makeSession(result.cameraId, result.usedCount, result.photoLimit)
    saveCameraSession(loaded.slug, session)
    setCamera(session)
    setPhase("shooting")
    return session
  }

  const handleStart = async (): Promise<void> => {
    setStarting(true)
    try {
      await ensureCamera()
    } catch (error) {
      enterError(error instanceof ApiError ? _kindFor(error) : "unknown")
    } finally {
      setStarting(false)
    }
  }

  const handleGallery = async (): Promise<void> => {
    setStarting(true)
    try {
      await ensureCamera()
      fileInput?.click()
    } catch (error) {
      enterError(error instanceof ApiError ? _kindFor(error) : "unknown")
    } finally {
      setStarting(false)
    }
  }

  const handleGalleryFile = async (file: File): Promise<void> => {
    try {
      const bitmap = await loadGalleryBitmap(file)
      const canvas = renderFrame(bitmap)
      setReview({ canvas, url: canvas.toDataURL("image/jpeg", 0.85), takenAt: new Date() })
      bitmap.close()
    } catch {
      setCameraIssue(true)
    }
  }

  const handleCapture = (bitmap: ImageBitmap): void => {
    const canvas = renderFrame(bitmap)
    setReview({ canvas, url: canvas.toDataURL("image/jpeg", 0.85), takenAt: new Date() })
    bitmap.close()
  }

  const handleRetake = (): void => {
    setReview(null)
    setUploadError(null)
    setBusy(false)
  }

  const handleKeep = async (): Promise<void> => {
    const current = review()
    const session = camera()
    const loaded = event()
    if (current === null || session === null || loaded === null) return
    setBusy(true)
    setUploadError(null)
    try {
      const blob = await compressCanvas(current.canvas)
      const result = await uploadPhoto({
        slug: loaded.slug,
        cameraId: session.cameraId,
        takenAt: current.takenAt,
        uploadId: randomUUID(),
        file: blob
      })
      const updated = makeSession(session.cameraId, result.usedCount, result.photoLimit)
      saveCameraSession(loaded.slug, updated)
      setCamera(updated)
      setReview(null)
      setBusy(false)
      if (result.remaining <= 0) {
        setDoneCount(result.usedCount)
        setPhase("done")
      }
    } catch (error) {
      setBusy(false)
      if (error instanceof ApiError && error.kind === "conflict") {
        const session2 = camera()
        setReview(null)
        setUploadError(null)
        setDoneCount(session2?.usedCount ?? 0)
        setPhase("done")
        return
      }
      setUploadError(error instanceof ApiError ? error.message : "Couldn't send that photo. Try again.")
    }
  }

  const handleRetakeCamera = (): void => {
    clearCameraSession(slug)
    setCamera(null)
    setReview(null)
    setGuestName("")
    setPhase("welcome")
  }

  onMount(() => {
    loadEvent().catch(() => enterError("network"))
  })

  return (
    <>
      <Show when={event() !== null}>
        <Title>{event()?.title ?? "Guestroll"}</Title>
      </Show>

      <Show when={phase() === "loading"}>
        <div class="flex min-h-dvh flex-col items-center justify-center gap-4">
          <span class="loading loading-spinner loading-lg text-primary" />
          <div class="flex items-center gap-2 text-base-content/60">
            <CameraIcon class="h-5 w-5" />
            <span>Loading the camera roll…</span>
          </div>
        </div>
      </Show>

      <Show when={phase() === "error"}>
        <ErrorScreen kind={errorKind()} onRetry={() => loadEvent().catch(() => {})} />
      </Show>

      <Show when={phase() === "welcome" && event() !== null}>
        <WelcomeScreen
          title={event()!.title}
          photoLimit={event()!.photoLimit}
          starting={starting()}
          guestName={guestName}
          setGuestName={setGuestName}
          onStart={() => handleStart().catch(() => {})}
          onPickFromGallery={() => handleGallery().catch(() => {})}
        />
      </Show>

      <Show when={phase() === "shooting" && camera() !== null && event() !== null}>
        <div class="relative">
          <CameraScreen
            usedCount={() => camera()?.usedCount ?? 0}
            photoLimit={camera()!.photoLimit}
            onCapture={handleCapture}
            onPickFromGallery={() => handleGallery().catch(() => {})}
            onUnavailable={() => setCameraIssue(true)}
          />
          <Show when={cameraIssue()}>
            <div class="fixed inset-x-0 bottom-24 z-20 flex justify-center px-4">
              <div class="alert alert-warning max-w-md shadow-lg">
                <span>
                  {window.isSecureContext
                    ? "Camera didn't start. Allow camera access, or pick photos from your library instead."
                    : "Camera access needs a secure (HTTPS) connection. You can still add photos from your library."}
                </span>
                <button
                  type="button"
                  class="btn btn-sm"
                  onClick={() => {
                    setCameraIssue(false)
                    fileInput?.click()
                  }}
                >
                  Use photo roll
                </button>
              </div>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={review() !== null}>
        <ReviewOverlay
          url={review()!.url}
          busy={busy()}
          error={uploadError()}
          onKeep={() => handleKeep().catch(() => {})}
          onRetake={handleRetake}
        />
      </Show>

      <Show when={phase() === "done"}>
        <DoneScreen
          title={event()?.title ?? "the couple"}
          count={doneCount()}
          onRetake={handleRetakeCamera}
        />
      </Show>

      <input
        ref={(el) => {
          fileInput = el
        }}
        type="file"
        accept="image/*"
        class="hidden"
        onChange={(changeEvent) => {
          const file = changeEvent.currentTarget.files?.[0]
          if (file !== undefined) handleGalleryFile(file).catch(() => {})
          changeEvent.currentTarget.value = ""
        }}
      />
    </>
  )
}

export default GuestRoute