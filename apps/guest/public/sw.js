// GuestRoll upload service worker.
//
// Owns the durable photo upload queue (IndexedDB) so guests can keep
// snapping while their photos send in the background. Uploads retry with
// backoff, re-register the OS background sync when connectivity drops, and
// the worker broadcasts progress back to any open tab so the roll counter
// stays accurate. Records survive tab close and reload.
//
// The queue store is shared with the page (`guestroll-uploads` / `queue`),
// keyed by the client's uploadId so retries stay idempotent.
//
// The worker also pre-caches the app shell so the camera works offline and
// the site satisfies Chromium's installability criteria (which require a
// fetch handler) for the install prompt.

const DB_NAME = "guestroll-uploads"
const DB_VERSION = 1
const STORE = "queue"
const SYNC_TAG = "guestroll-uploads"

// App-shell cache. Versioned from the registering URL's build query
// (`/sw.js?v=<build>`), so every deploy installs a fresh cache with no
// manual version bumps.
const SW_VERSION = new URL(self.location.href).searchParams.get("v") ?? "legacy"
const SHELL_CACHE = `guestroll-shell-${SW_VERSION}`

// Known shell files; the hashed JS/CSS bundles are cached at runtime on the
// first SW-controlled load.
const PRECACHE_URLS = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"]

// Per-attempt delay in ms; the last entry is the ceiling for later tries.
const BACKOFF_MS = [5000, 15000, 45000, 120000, 300000]

const openDb = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" })
      }
    }
    request.addEventListener("success", () => resolve(request.result))
    request.addEventListener("error", () => reject(request.error))
  })

const getAllRecords = async () => {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll()
      request.addEventListener("success", () => resolve(request.result))
      request.addEventListener("error", () => reject(request.error))
    })
  } finally {
    db.close()
  }
}

const runWrite = async (operation) => {
  const db = await openDb()
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite")
      operation(transaction.objectStore(STORE))
      transaction.addEventListener("complete", () => resolve())
      transaction.addEventListener("error", () => reject(transaction.error))
      transaction.addEventListener("abort", () => reject(transaction.error))
    })
  } finally {
    db.close()
  }
}

const putRecord = (record) => runWrite((store) => store.put(record))

const deleteRecord = (id) => runWrite((store) => store.delete(id))

const broadcast = (message) => {
  self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    // Passes an empty transfer list: Client.postMessage takes a transfer
    // list/options, not a target origin (that belongs to Window.postMessage).
    // Supplying an origin throws and leaves the page's queue count stale
    // after a successful upload.
    for (const client of clients) client.postMessage(message, [])
  })
}

const registerSync = () => {
  if (self.registration.sync) {
    self.registration.sync.register(SYNC_TAG).catch(() => {})
  }
}

const retryLater = async (record) => {
  const attempts = record.attempts + 1
  const delay = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)]
  const nextAttemptAt = Date.now() + delay
  await putRecord({
    ...record,
    attempts,
    status: "retrying",
    nextAttemptAt
  })
  registerSync()
  return nextAttemptAt
}

const uploadRecord = async (record) => {
  const form = new FormData()
  form.append("photo", record.blob, "photo.jpg")
  form.append("cameraId", record.cameraId)
  form.append("takenAt", record.takenAt)
  form.append("uploadId", record.id)
  if (record.thumbBlob) form.append("thumb", record.thumbBlob, "thumb.jpg")

  let response
  try {
    response = await fetch(`${record.apiBase}/events/${record.slug}/photos`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(60000)
    })
  } catch {
    return retryLater(record)
  }

  if (response.ok) {
    const result = await response.json().catch(() => null)
    if (
      result !== null &&
      Number.isFinite(result.usedCount) &&
      Number.isFinite(result.photoLimit)
    ) {
      await deleteRecord(record.id)
      broadcast({
        type: "uploaded",
        cameraId: record.cameraId,
        usedCount: result.usedCount,
        photoLimit: result.photoLimit
      })
      return "done"
    }
    // The claim may already be recorded server-side; re-uploading the same
    // uploadId is idempotent, so a malformed body just means retry.
    return retryLater(record)
  }

  if (response.status === 409) {
    await deleteRecord(record.id)
    broadcast({ type: "conflict", cameraId: record.cameraId })
    return "done"
  }

  if (response.status === 429 || response.status >= 500) {
    return retryLater(record)
  }

  // Permanent client error (400/401/403/404) — surface it and stop retrying.
  await putRecord({ ...record, status: "failed" })
  broadcast({ type: "failed", uploadId: record.id })
  return "done"
}

let draining = false
let rerunRequested = false
let timer = 0

const scheduleNext = (nextAttemptAt) => {
  if (timer !== 0) {
    clearTimeout(timer)
    timer = 0
  }
  if (Number.isFinite(nextAttemptAt)) {
    timer = setTimeout(() => {
      timer = 0
      void drainQueue()
    }, Math.max(0, nextAttemptAt - Date.now()))
  }
}

const broadcastCounts = async () => {
  const records = await getAllRecords()
  let pending = 0
  let failed = 0
  for (const record of records) {
    if (record.status === "failed") failed += 1
    else pending += 1
  }
  broadcast({ type: "pending", pending, failed })
}

const drainQueue = async () => {
  if (draining) {
    rerunRequested = true
    return
  }
  draining = true
  try {
    const records = await getAllRecords()
    const now = Date.now()
    let nextAttemptAt = Infinity
    for (const record of records) {
      if (record.status === "failed") continue
      if (record.nextAttemptAt > now) {
        nextAttemptAt = Math.min(nextAttemptAt, record.nextAttemptAt)
        continue
      }
      const outcome = await uploadRecord(record)
      if (outcome !== "done") {
        nextAttemptAt = Math.min(nextAttemptAt, outcome)
      }
    }
    scheduleNext(nextAttemptAt)
    await broadcastCounts()
  } catch {
    scheduleNext(Date.now() + BACKOFF_MS[0])
  } finally {
    draining = false
    if (rerunRequested) {
      rerunRequested = false
      void drainQueue()
    }
  }
}

// Network-first for the SPA shell: serve fresh HTML when online, fall back
// to the last cached copy (any route) when offline.
const navigationResponse = async (request) => {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE)
      void cache.put(request.url, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request.url)
    if (cached) return cached
    return caches.match("/")
  }
}

// Cache-first for hashed assets, refreshed in the background.
const assetResponse = async (request) => {
  const cached = await caches.match(request)
  if (cached) {
    void fetch(request)
      .then((response) => {
        if (!response.ok) return undefined
        return caches.open(SHELL_CACHE).then((cache) => cache.put(request, response))
      })
      .catch(() => {})
    return cached
  }
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(SHELL_CACHE)
    void cache.put(request, response.clone())
  }
  return response
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
      await self.skipWaiting()
    })()
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names.filter((name) => name !== SHELL_CACHE).map((name) => caches.delete(name))
      )
      await self.clients.claim()
      await drainQueue()
    })()
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.destination === "document") {
    event.respondWith(navigationResponse(request))
    return
  }
  event.respondWith(assetResponse(request))
})

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "wake") {
    void drainQueue()
  }
})

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(drainQueue())
  }
})
