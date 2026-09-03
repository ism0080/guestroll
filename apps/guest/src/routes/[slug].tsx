import { Title } from "@solidjs/meta"
import { useParams } from "@solidjs/router"
import { createMutation, createQuery } from "@tanstack/solid-query"
import { createMemo, createSignal, Show } from "solid-js"
import type { JSX } from "solid-js"
import { ApiError, createCamera, getEvent, randomUUID, uploadPhoto } from "~/lib/api"
import { compressCanvas, loadGalleryBitmap, renderFrame } from "~/lib/image"
import { clearCameraSession, loadCameraSession, saveCameraSession } from "~/lib/session"
import type { CameraSession } from "~/lib/session"
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

interface UploadVariable {
  readonly canvas: HTMLCanvasElement
  readonly takenAt: Date
  readonly uploadId: string
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
  let fileInput: HTMLInputElement | undefined

  const storedFull = createMemo<boolean>(() => {
    const stored = camera()
    return stored !== null && stored.usedCount >= stored.photoLimit
  })

  const eventQuery = createQuery(() => ({
    queryKey: ["event", slug],
    queryFn: () => getEvent(slug),
    enabled: !storedFull(),
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
      const loaded = eventQuery.data
      if (loaded === undefined) throw new ApiError("network", "Event not loaded")
      const name = guestName().trim()
      return createCamera(loaded.slug, name === "" ? undefined : name)
    },
    onSuccess: (result) => {
      const loaded = eventQuery.data
      if (loaded === undefined) return
      const session = makeSession(result.cameraId, result.usedCount, result.photoLimit)
      saveCameraSession(loaded.slug, session)
      setCamera(session)
    },
    onError: (error) => {
      setFatalError(error instanceof ApiError ? _kindFor(error) : "unknown")
    }
  }))

  const uploadMutation = createMutation(() => ({
    mutationFn: async ({ canvas, takenAt, uploadId }: UploadVariable) => {
      const loaded = eventQuery.data
      const session = camera()
      if (loaded === undefined || session === null) throw new ApiError("network", "Not ready")
      const blob = await compressCanvas(canvas)
      return uploadPhoto({
        slug: loaded.slug,
        cameraId: session.cameraId,
        takenAt,
        uploadId,
        file: blob
      })
    },
    retry: (failureCount, error) => {
      if (failureCount >= 3) return false
      return error instanceof ApiError && error.kind === "network"
    },
    onSuccess: (result) => {
      const loaded = eventQuery.data
      const session = camera()
      if (loaded === undefined || session === null) return
      const updated = makeSession(session.cameraId, result.usedCount, result.photoLimit)
      saveCameraSession(loaded.slug, updated)
      setCamera(updated)
      setReview(null)
    },
    onError: (error) => {
      if (error instanceof ApiError && error.kind === "conflict") {
        setReview(null)
        setForceDone(true)
      }
    }
  }))

  const uploadError = createMemo<string | null>(() => {
    const error = uploadMutation.error
    if (error === null) return null
    if (error instanceof ApiError && error.kind === "conflict") return null
    return error instanceof ApiError ? error.message : "Couldn't send that photo. Try again."
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
      setReview({ canvas, url: canvas.toDataURL("image/jpeg", 0.85), takenAt: new Date() })
      bitmap.close()
    } catch {
      setCameraIssue(true)
    }
  }

  const handleCapture = (bitmap: ImageBitmap): void => {
    const canvas = renderFrame(bitmap, filterPack())
    setReview({ canvas, url: canvas.toDataURL("image/jpeg", 0.85), takenAt: new Date() })
    bitmap.close()
  }

  const handleRetake = (): void => {
    setReview(null)
    uploadMutation.reset()
  }

  const handleKeep = (): void => {
    const current = review()
    if (current === null) return
    uploadMutation.mutate({
      canvas: current.canvas,
      takenAt: current.takenAt,
      uploadId: randomUUID()
    })
  }

  const handleRetry = (): void => {
    setFatalError(null)
    if (eventQuery.data === undefined) {
      eventQuery.refetch().catch(() => {})
    }
  }

  const handleRetakeCamera = (): void => {
    clearCameraSession(slug)
    setCamera(null)
    setReview(null)
    setGuestName("")
    setForceDone(false)
    setFatalError(null)
    uploadMutation.reset()
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
          busy={uploadMutation.isPending}
          error={uploadError()}
          onKeep={handleKeep}
          onRetake={handleRetake}
        />
      </Show>

      <Show when={phase() === "done"}>
        <DoneScreen
          title={eventQuery.data?.title ?? "the couple"}
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

      <InstallPrompt />
    </>
  )
}

export default GuestRoute