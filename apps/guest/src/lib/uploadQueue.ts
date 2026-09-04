import type { UploadResult } from "@guestroll/contracts"
import { apiBase, uploadPhoto, type UploadPhotoInput } from "./api"

export const SYNC_TAG = "guestroll-uploads"

const DB_NAME = "guestroll-uploads"
const DB_VERSION = 1
const STORE = "queue"
let _registration: Promise<boolean> | undefined

/**
 * Messages the upload service worker posts back to open tabs. Mirrors the
 * shapes in `public/sw.js`; keep the two in sync.
 */
export type WorkerMessage =
  | { readonly type: "uploaded"; readonly cameraId: string; readonly usedCount: number; readonly photoLimit: number }
  | { readonly type: "conflict"; readonly cameraId: string }
  | { readonly type: "failed"; readonly uploadId: string }
  | { readonly type: "pending"; readonly pending: number; readonly failed: number }

export interface QueueState {
  readonly pending: number
  readonly failed: number
}

/** One queued photo, keyed by the client `uploadId`. Shared with `sw.js`. */
interface QueueRecord {
  readonly id: string
  readonly slug: string
  readonly cameraId: string
  readonly takenAt: string
  readonly apiBase: string
  readonly blob: Blob
  readonly thumbBlob?: Blob
  readonly status: "queued" | "retrying" | "failed"
  readonly attempts: number
  readonly nextAttemptAt: number
}

export type UploadOutcome =
  | { readonly kind: "queued" }
  | { readonly kind: "uploaded"; readonly result: UploadResult }

/**
 * The background upload worker only runs in production builds. In `vite dev`
 * the worker is never registered — its fetch handler would serve stale dev
 * modules and HMR, and an undrained queue would strand photos — so photos
 * upload inline through the SDK instead.
 */
const _workerEnabled = (): boolean =>
  import.meta.env.PROD && "serviceWorker" in navigator

const _ensureServiceWorker = (): Promise<boolean> => {
  if (!_workerEnabled()) return Promise.resolve(false)
  // The build id in the query gives every deploy a fresh worker script and
  // shell cache version without manual bumps (see `public/sw.js`).
  return (_registration ??=
    navigator.serviceWorker.register(`/sw.js?v=${__SW_VERSION__}`).then(() => true, () => false))
}

export const registerServiceWorker = (): void => {
  void _ensureServiceWorker()
}

const _openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const _runWrite = async (operation: (store: IDBObjectStore) => void): Promise<void> => {
  const db = await _openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite")
      operation(transaction.objectStore(STORE))
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}

/**
 * Wakes the service worker so it drains the queue: a direct postMessage plus
 * an OS background-sync registration as the durable fallback for when the
 * tab is closed. Best-effort; the queue persists regardless.
 */
export const wakeWorker = async (): Promise<void> => {
  if (!(await _ensureServiceWorker())) return
  try {
    const registration = await navigator.serviceWorker.ready
    const worker = registration.active ?? navigator.serviceWorker.controller
    worker?.postMessage({ type: "wake" })
    if (registration.sync) registration.sync.register(SYNC_TAG).catch(() => {})
  } catch {
    // Registration/activation failures are handled by the direct path in `submitPhoto`.
  }
}

/**
 * Enqueues a compressed photo for background upload. When service workers
 * are unavailable, uploads inline through the SDK as before.
 */
export const submitPhoto = async (input: UploadPhotoInput): Promise<UploadOutcome> => {
  if (await _ensureServiceWorker()) {
    await _runWrite((store) => {
      store.put({
        id: input.uploadId,
        slug: input.slug,
        cameraId: input.cameraId,
        takenAt: input.takenAt.toISOString(),
        apiBase,
        blob: input.file,
        thumbBlob: input.thumb,
        status: "queued",
        attempts: 0,
        nextAttemptAt: 0
      } satisfies QueueRecord)
    })
    void wakeWorker()
    return { kind: "queued" }
  }
  const result = await uploadPhoto(input)
  return { kind: "uploaded", result }
}

/** Requeues permanently failed records after the guest explicitly retries. */
export const retryFailedUploads = async (): Promise<number> => {
  const db = await _openDb()
  try {
    const records = await new Promise<readonly QueueRecord[]>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const failed = records.filter((record) => record.status === "failed")
    await _runWrite((store) => {
      for (const record of failed) store.put({ ...record, status: "queued", attempts: 0, nextAttemptAt: 0 })
    })
    if (failed.length > 0) void wakeWorker()
    return failed.length
  } finally {
    db.close()
  }
}

/** Reads queued upload counts, optionally limited to one camera roll. */
export const readQueueState = async (cameraId?: string): Promise<QueueState> => {
  if (!("indexedDB" in window)) return { pending: 0, failed: 0 }
  let db: IDBDatabase
  try {
    db = await _openDb()
  } catch {
    return { pending: 0, failed: 0 }
  }
  try {
    const records = await new Promise<readonly QueueRecord[]>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    let pending = 0
    let failed = 0
    for (const record of records) {
      if (cameraId !== undefined && record.cameraId !== cameraId) continue
      if (record.status === "failed") failed += 1
      else pending += 1
    }
    return { pending, failed }
  } finally {
    db.close()
  }
}

/** Subscribes to service-worker progress messages. Returns an unsubscribe. */
export const onWorkerMessage = (handler: (message: WorkerMessage) => void): (() => void) => {
  if (!_workerEnabled()) return () => {}
  const listener = (event: MessageEvent): void => {
    // SAFETY: the upload worker only ever posts WorkerMessage-shaped payloads,
    // and the `type` presence check below rules out primitives and null.
    const data = event.data as WorkerMessage | null
    if (data === null || !("type" in data)) return
    handler(data)
  }
  navigator.serviceWorker.addEventListener("message", listener)
  return () => navigator.serviceWorker.removeEventListener("message", listener)
}

/**
 * Registers the upload worker and nudges it whenever the guest comes back
 * online or returns to the tab. Call once at app boot.
 */
export const setupUploadQueue = (): (() => void) => {
  registerServiceWorker()
  const onOnline = (): void => {
    void wakeWorker()
  }
  const onVisible = (): void => {
    if (document.visibilityState === "visible") void wakeWorker()
  }
  window.addEventListener("online", onOnline)
  document.addEventListener("visibilitychange", onVisible)
  return () => {
    window.removeEventListener("online", onOnline)
    document.removeEventListener("visibilitychange", onVisible)
  }
}
