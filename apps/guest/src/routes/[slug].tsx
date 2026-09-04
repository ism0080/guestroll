import { Title } from "@solidjs/meta"
import { useNavigate, useParams } from "@solidjs/router"
import { createMutation, createQuery } from "@tanstack/solid-query"
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import type { JSX } from "solid-js"
import { ApiError, createCamera, getEvent, randomUUID } from "~/lib/api"
import { compressCanvas, compressThumbnail, loadGalleryBitmap, renderFrame, renderThumbnail } from "~/lib/image"
import { deviceGuestId, deviceGuestName, saveDeviceGuestName } from "~/lib/guestId"
import { claimedPhotoCount, hasCaptureCapacity } from "~/lib/rollCapacity"
import { clearCameraSession, loadCameraSession, rememberEventSession, saveCameraSession } from "~/lib/session"
import type { CameraSession } from "~/lib/session"
import { onWorkerMessage, readQueueState, retryFailedUploads, submitPhoto, wakeWorker } from "~/lib/uploadQueue"
import type { WorkerMessage } from "~/lib/uploadQueue"
import { CameraScreen } from "~/components/CameraScreen"
import { InstallPrompt } from "~/components/InstallPrompt"
import {
  DoneScreen,
  ErrorScreen,
  WelcomeScreen
} from "~/components/screens"
import type { ErrorKind } from "~/components/screens"
import { CameraBody } from "@guestroll/ui"

type Phase = "loading" | "error" | "welcome" | "shooting" | "done"

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

const GuestRoute = (props: { readonly slug: string }): JSX.Element => {
  const slug = props.slug
  const navigate = useNavigate()

  const stored = loadCameraSession(slug)
  const [camera, setCamera] = createSignal<CameraSession | null>(stored ?? null)
  const [guestName, setGuestName] = createSignal(stored?.guestName ?? deviceGuestName())
  const [cameraIssue, setCameraIssue] = createSignal(false)
  const [fatalError, setFatalError] = createSignal<ErrorKind | null>(null)
  const [forceDone, setForceDone] = createSignal(false)
  const [doneError, setDoneError] = createSignal<string | null>(null)
  let fileInput: HTMLInputElement | undefined

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

  createEffect(() => {
    const event = eventQuery.data
    if (event !== undefined) rememberEventSession(event.slug, event.title)
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
      return createCamera(slug, deviceGuestId(), name)
    },
    onSuccess: (result) => {
      setDoneError(null)
      saveDeviceGuestName(guestName().trim())
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

  const [savingCount, setSavingCount] = createSignal(0)
  const [uploadError, setUploadError] = createSignal<string | null>(null)
  const [pendingCount, setPendingCount] = createSignal(0)
  const [failedCount, setFailedCount] = createSignal(0)
  const [failedHidden, setFailedHidden] = createSignal(false)
  let disposeWorkerMessages: (() => void) | undefined

  // A queued or currently encoding photo already occupies an exposure. Count
  // it locally until the server-confirmed total catches up.
  const claimedCount = createMemo<number>(() => {
    const session = camera()
    if (session === null) return 0
    return claimedPhotoCount(session.usedCount, pendingCount(), failedCount(), savingCount())
  })
  const rollFull = createMemo<boolean>(() => {
    const session = camera()
    return session !== null && !hasCaptureCapacity(claimedCount(), session.photoLimit)
  })
  const canCapture = createMemo<boolean>(() => !rollFull())
  const phase = createMemo<Phase>(() => {
    if (fatalError() !== null) return "error"
    if (forceDone() || rollFull()) return "done"
    if (eventQuery.isPending) return "loading"
    if (eventQuery.isError) return "error"
    if (camera() !== null) return "shooting"
    return "welcome"
  })

  const applyUploadResult = (usedCount: number, photoLimit: number): void => {
    const loaded = eventQuery.data
    const session = camera()
    if (loaded === undefined || session === null) return
    const updated = makeSession(session.cameraId, Math.max(session.usedCount, usedCount), photoLimit)
    saveCameraSession(loaded.slug, updated)
    setCamera(updated)
  }

  const refreshPending = async (): Promise<void> => {
    const state = await readQueueState(camera()?.cameraId)
    setPendingCount(state.pending)
    setFailedCount(state.failed)
  }

  const handleWorkerMessage = (message: WorkerMessage): void => {
    switch (message.type) {
      case "uploaded":
        if (message.cameraId !== camera()?.cameraId) break
        applyUploadResult(message.usedCount, message.photoLimit)
        void refreshPending()
        break
      case "conflict":
        if (message.cameraId !== camera()?.cameraId) break
        setForceDone(true)
        void refreshPending()
        break
      case "failed":
        setFailedHidden(false)
        void refreshPending()
        break
      case "pending":
        void refreshPending()
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
    if (camera() !== null) {
      if (canCapture()) fileInput?.click()
      return
    }
    createCameraMutation.mutate(undefined, {
      onSuccess: () => fileInput?.click()
    })
  }

  // Disposable-camera behavior: every shutter press saves straight away
  // with no preview / keep-or-retake step. Fire-and-forget so guests can
  // keep snapping while earlier shots finish encoding in the background.
  const persistCanvas = async (canvas: HTMLCanvasElement, takenAt: Date): Promise<void> => {
    const loaded = eventQuery.data
    const session = camera()
    if (loaded === undefined || session === null || !canCapture()) return
    setSavingCount((count) => count + 1)
    try {
      const blob = await compressCanvas(canvas)
      const outcome = await submitPhoto({
        slug: loaded.slug,
        cameraId: session.cameraId,
        takenAt,
        uploadId: randomUUID(),
        file: blob,
        thumb: await compressThumbnail(renderThumbnail(canvas))
      })
      setUploadError(null)
      if (outcome.kind === "queued") {
        void refreshPending()
      } else {
        applyUploadResult(outcome.result.usedCount, outcome.result.photoLimit)
      }
    } catch (error) {
      setUploadError(error instanceof ApiError && error.kind === "conflict" ? null : error instanceof ApiError ? error.message : "Couldn't save that photo. It may still be queued — check back soon.")
      if (error instanceof ApiError && error.kind === "conflict") {
        setForceDone(true)
      }
    } finally {
      setSavingCount((count) => Math.max(0, count - 1))
    }
  }

  const handleGalleryFile = async (file: File): Promise<void> => {
    try {
      const bitmap = await loadGalleryBitmap(file)
      const takenAt = Number.isFinite(file.lastModified) && file.lastModified > 0
        ? new Date(file.lastModified)
        : new Date()
      const canvas = renderFrame(bitmap)
      bitmap.close()
      setUploadError(null)
      await persistCanvas(canvas, takenAt)
    } catch {
      setUploadError("That photo could not be read. Try a different image.")
    }
  }

  const handleCapture = (canvas: HTMLCanvasElement): void => {
    if (!canCapture()) return
    setUploadError(null)
    void persistCanvas(canvas, new Date())
  }

  const handleRetry = (): void => {
    setFatalError(null)
    if (eventQuery.data === undefined) {
      eventQuery.refetch().catch(() => {})
    }
  }

  const handleStartNewRoll = (): void => {
    if (guestName().trim() === "") {
      clearCameraSession(slug)
      setCamera(null)
      setForceDone(false)
      return
    }
    createCameraMutation.mutate()
  }

  return (
    <>
      <Show when={eventQuery.data !== undefined}>
        <Title>{eventQuery.data?.title ?? "Guestroll"}</Title>
      </Show>

      <Show when={phase() === "loading"}>
        <div class="flex min-h-dvh flex-col items-center justify-center gap-5 px-6">
          <CameraBody class="w-40 animate-pulse" />
          <div class="film-counter flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-base-content/50">
            <span class="loading loading-spinner loading-sm text-primary" />
            Loading the roll…
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
            pendingCount={() => pendingCount() + savingCount()}
            canCapture={canCapture}
            onCapture={handleCapture}
            onCaptureError={() => setUploadError("Couldn't take that photo. Try again.")}
            onPickFromGallery={handleGallery}
            onUnavailable={() => setCameraIssue(true)}
            onHome={() => navigate("/")}
          />
          <Show when={cameraIssue()}>
            <div class="capture-notice-bottom fixed inset-x-0 z-20 flex justify-center px-4">
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
          <Show when={!cameraIssue() && uploadError() !== null}>
            <div class="capture-notice-bottom fixed inset-x-0 z-20 flex justify-center px-4">
              <div class="alert alert-error max-w-md shadow-lg">
                <span>{uploadError()}</span>
                <button
                  type="button"
                  class="btn btn-sm"
                  onClick={() => setUploadError(null)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={phase() === "done"}>
        <DoneScreen
          title={eventQuery.data?.title ?? "the host"}
          count={doneCount()}
          pending={pendingCount() + savingCount()}
          starting={createCameraMutation.isPending}
          error={doneError()}
          onStartNewRoll={handleStartNewRoll}
          onHome={() => navigate("/")}
        />
      </Show>

      <Show when={failedCount() > 0 && !failedHidden()}>
        <div class="capture-notice-top fixed inset-x-0 z-30 flex justify-center px-4">
          <div class="alert alert-warning max-w-md shadow-lg">
            <span>{failedCount()} photo{failedCount() === 1 ? "" : "s"} could not be saved.</span>
            <button
              type="button"
              class="btn btn-sm"
              onClick={() => {
                setFailedHidden(true)
                void retryFailedUploads().then(() => refreshPending())
              }}
            >
              Retry
            </button>
            <button type="button" class="btn btn-sm btn-ghost" onClick={() => setFailedHidden(true)}>
              Dismiss
            </button>
          </div>
        </div>
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

const EventRoute = (): JSX.Element => {
  const params = useParams()
  return <Show keyed when={params["slug"]}>{(slug) => <GuestRoute slug={slug} />}</Show>
}

export default EventRoute
