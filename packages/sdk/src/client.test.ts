import { describe, expect, test } from "bun:test"
import { ApiError, createGuestClient, createHostClient } from "./index.ts"

const LiveSlug = "aaaaaaaaaaaaaaaa"

const startMock = (): string => {
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      if (request.method === "GET" && url.pathname.startsWith("/events/")) {
        const slug = url.pathname.slice("/events/".length)
        if (slug === LiveSlug) {
          return Response.json({
            id: "event-1",
            slug: LiveSlug,
            title: "Test Wedding",
            status: "live",
            photoLimit: 12,
            filterPack: "retro"
          })
        }
        return new Response("Not found", { status: 404 })
      }
      if (request.method === "POST" && url.pathname.endsWith("/cameras")) {
        return Response.json({ cameraId: "camera-1", usedCount: 0, photoLimit: 12 })
      }
      if (request.method === "POST" && url.pathname.endsWith("/photos")) {
        return Response.json({ photoId: "photo-1", usedCount: 1, photoLimit: 12, remaining: 11 })
      }
      if (request.method === "POST" && url.pathname.endsWith("/host/login")) {
        return Response.json({ authenticated: true })
      }
      if (request.method === "GET" && url.pathname === "/events") {
        return Response.json([{
          id: "event-1",
          slug: LiveSlug,
          title: "Test Wedding",
          status: "live",
          photoLimit: 12,
          filterPack: "retro"
        }])
      }
      return new Response("Not found", { status: 404 })
    }
  })
  return `http://localhost:${server.port}`
}

describe("guest client", () => {
  test("decodes getEvent and maps a 404 to ApiError", async () => {
    const client = await createGuestClient({ baseUrl: startMock() })
    const event = await client.getEvent(LiveSlug)
    expect(event.title).toBe("Test Wedding")
    expect(event.photoLimit).toBe(12)

    try {
      await client.getEvent("bbbbbbbbbbbbbbbb")
      expect.unreachable()
    } catch (error) {
      expect(error instanceof ApiError).toBe(true)
      if (error instanceof ApiError) expect(error.kind).toBe("not-found")
    }
  })

  test("creates a camera and uploads a photo", async () => {
    const client = await createGuestClient({ baseUrl: startMock() })
    const camera = await client.createCamera(LiveSlug, "guest-1", "Sam")
    expect(camera.cameraId).toMatch("camera-1")

    const photo = await client.uploadPhoto({
      slug: LiveSlug,
      cameraId: camera.cameraId,
      takenAt: new Date("2026-01-01T00:00:00.000Z"),
      uploadId: "6f6ef8f4-3f8b-4f8b-9f8b-6f6ef8f4a1b2",
      file: new Blob(["fake"], { type: "image/jpeg" })
    })
    expect(photo.remaining).toBe(11)
  })
})

describe("host client", () => {
  test("logs in and lists events", async () => {
    const client = await createHostClient({ baseUrl: startMock(), credentials: "include" })
    const session = await client.login("correct horse")
    expect(session.authenticated).toBe(true)
    const events = await client.listEvents()
    expect(events[0]?.slug).toMatch(LiveSlug)
  })
})