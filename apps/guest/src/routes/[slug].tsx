import { Title } from "@solidjs/meta"
import { useParams } from "@solidjs/router"
import { createMutation, createQuery } from "@tanstack/solid-query"
import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import type { JSX } from "solid-js"
import { ApiError, createCamera, getEvent, randomUUID } from "~/lib/api"
import { compressCanvas, loadGalleryBitmap, renderFrame } from "~/lib/image"
import { deviceGuestId } from "~/lib/guestId"
import { loadCameraSession, saveCameraSession } from "~/lib/session"
import type { CameraSession } from "~/lib/session"
import { onWorkerMessage, readQueueState, submitPhoto, wakeWorker } from "~/lib/uploadQueue"
import type { WorkerMessage } from "~/lib/uploadQueue"
import { CameraScreen } from "~/components/CameraScreen"
import { InstallPrompt } from "~/components/InstallPrompt"
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

  const [camera, setCamera] = createSignal<CameraSession | null>(loadCameraSession(slug) ?? null)
  const [guestName, setGuestName] = createSignal("")
  const [cameraIssue, setCameraIssue] = createSignal(false)
  const [review, setReview] = createSignal<ReviewPhoto | null>(null)
  const [fatalError, setFatalError] = createSignal<ErrorKind | null>(null)
  const [forceDone, setForceDone] = createSignal(false)
  const [doneError, setDoneError] = createSignal<string | null>(null)
  let fileInput: HTMLInputElement | undefined

  const storedFull = createMemo<boolean>(() => {
    const stored = camera()
    return stored !== null && stored.usedCount >= stored.photoLimit
  })

  const eventQuery = createQuery(() => ({
    queryKey: ["event", slug],
    queryFn: () => getEvent(slug),
    retry: (failureCount, error) => {
      if (failureCount >= 3) return false
      if (!(error instanceof ApiError)) return true
      return error.kind === "network" || error.kind === "unknown"
    }
  }))

  const filterPack = createMemo<string>(() => eventQuery.data?.filterPack ?? "film")

  const phase = createMemo<Phase>(() => {
    if (fatalError() !== null) return "error"
    if (forceDone() || storedFull()) return "done"
    if (eventQuery.isPending) return "loading"
    if (eventQuery.isError) return "error"
    if (camera() !== null) return "shooting"
    return "welcome"
  })

  const errorKind = createMemo<ErrorKind>(() => {
    const forced = fatalError()
    if (forced !== null) return forced
    const error = eventQuery.error
    return error instanceof ApiError ? _kindFor(error) : "unknown"
  })

  const doneCount = createMemo<number>(() => camera()?.usedCount ?? 0)

  const makeSession = (cameraId: string, usedCount: number, photoLimit: number): CameraSession => {
    const trimmed = guestName().trim()
    return {
      cameraId,
      usedCount,
      photoLimit,
      guestName: trimmed === "" ? undefined : trimmed
    }
  }

  const createCameraMutation = createMutation(() => ({
    mutationFn: async () => {
      const name = guestName().trim()
      return createCamera(slug, deviceGuestId(), name === "" ? undefined : name)
    },
    onSuccess: (result) => {
      setDoneError(null)
      const session = makeSession(result.cameraId, result.usedCount, result.photoLimit)
      saveCameraSession(slug, session)
      setCamera(session)
    },
    onError: (error) => {
      if (error instanceof ApiError && error.kind === "conflict") {
        setForceDone(true)
        setDoneError("This roll is already full. Check with the hosts before starting another.")
        return
      }
      setFatalError(error instanceof ApiError ? _kindFor(error) : "unknown")
    }
  }))

  const [encoding, setEncoding] = createSignal(false)
  const [uploadError, setUploadError] = createSignal<string | null>(null)
  const [pendingCount, setPendingCount] = createSignal(0)
  let disposeWorkerMessages: (() => void) | undefined

  const applyUploadResult = (usedCount: number, photoLimit: number): void => {
    const loaded = eventQuery.data
    const session = camera()
    if (loaded === undefined || session === null) return
    const updated = makeSession(session.cameraId, usedCount, photoLimit)
    saveCameraSession(loaded.slug, updated)
    setCamera(updated)
  }

  const refreshPending = async (): Promise<void> => {
    const state = await readQueueState()
    setPendingCount(state.pending)
  }

  const handleWorkerMessage = (message: WorkerMessage): void => {
    switch (message.type) {
      case "uploaded":
        applyUploadResult(message.usedCount, message.photoLimit)
        void refreshPending()
        break
      case "conflict":
        setReview(null)
        setForceDone(true)
        void refreshPending()
        break
      case "failed":
        void refreshPending()
        break
      case "pending":
        setPendingCount(message.pending)
        break
    }
  }

  onMount(() => {
    void wakeWorker()
    void refreshPending()
    disposeWorkerMessages = onWorkerMessage(handleWorkerMessage)
  })

  onCleanup(() => {
    disposeWorkerMessages?.()
  })

  const handleStart = (): void => {
    createCameraMutation.mutate()
  }

  const handleGallery = (): void => {
    createCameraMutation.mutate(undefined, {
      onSuccess: () => fileInput?.click()
    })
  }

  const handleGalleryFile = async (file: File): Promise<void> => {
    try {
      const bitmap = await loadGalleryBitmap(file)
      const canvas = renderFrame(bitmap, filterPack())
      setUploadError(null)
      setReview({ canvas, url: canvas.toDataURL("image/jpeg", 0.85), takenAt: new Date() })
      bitmap.close()
    } catch {
      setCameraIssue(true)
    }
  }

  const handleCapture = (bitmap: ImageBitmap): void => {
    const canvas = renderFrame(bitmap, filterPack())
    setUploadError(null)
    setReview({ canvas, url: canvas.toDataURL("image/jpeg", 0.85), takenAt: new Date() })
    bitmap.close()
  }

  const handleRetake = (): void => {
    setReview(null)
    setUploadError(null)
  }

  const handleKeep = async (): Promise<void> => {
    const current = review()
    const loaded = eventQuery.data
    const session = camera()
    if (current === null || loaded === undefined || session === null) return
    setEncoding(true)
    try {
      const blob = await compressCanvas(current.canvas)
      const outcome = await submitPhoto({
        slug: loaded.slug,
        cameraId: session.cameraId,
        takenAt: current.takenAt,
        uploadId: randomUUID(),
        file: blob
      })
      setReview(null)
      setUploadError(null)
      if (outcome.kind === "queued") {
        void refreshPending()
      } else {
        applyUploadResult(outcome.result.usedCount, outcome.result.photoLimit)
      }
    } catch (error) {
      setUploadError(
        error instanceof ApiError
          ? error.kind === "conflict"
            ? null
            : error.message
          : "Couldn't save that photo. Try again."
      )
      if (error instanceof ApiError && error.kind === "conflict") {
        setReview(null)
        setForceDone(true)
      }
    } finally {
      setEncoding(false)
    }
  }

  const handleRetry = (): void => {
    setFatalError(null)
    if (eventQuery.data === undefined) {
      eventQuery.refetch().catch(() => {})
    }
  }

  return (
    <>
      <Show when={eventQuery.data !== undefined}>
        <Title>{eventQuery.data?.title ?? "Guestroll"}</Title>
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
        <ErrorScreen kind={errorKind()} onRetry={handleRetry} />
      </Show>

      <Show when={phase() === "welcome" && eventQuery.data !== undefined}>
        <WelcomeScreen
          title={eventQuery.data!.title}
          photoLimit={eventQuery.data!.photoLimit}
          starting={createCameraMutation.isPending}
          guestName={guestName}
          setGuestName={setGuestName}
          onStart={handleStart}
          onPickFromGallery={handleGallery}
        />
      </Show>

      <Show when={phase() === "shooting" && camera() !== null && eventQuery.data !== undefined}>
        <div class="relative">
          <CameraScreen
            usedCount={() => camera()?.usedCount ?? 0}
            photoLimit={camera()!.photoLimit}
            filterPack={filterPack()}
            pendingCount={pendingCount}
            onCapture={handleCapture}
            onPickFromGallery={handleGallery}
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
          busy={encoding()}
          error={uploadError()}
          onKeep={() => {
            handleKeep().catch(() => {})
          }}
          onRetake={handleRetake}
        />
      </Show>

      <Show when={phase() === "done"}>
        <DoneScreen
          title={eventQuery.data?.title ?? "the couple"}
          count={doneCount()}
          pending={pendingCount()}
          starting={createCameraMutation.isPending}
          error={doneError()}
          onStartNewRoll={() => createCameraMutation.mutate()}
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

      <InstallPrompt />
    </>
  )
}

export default GuestRoute