export type FacingMode = "environment" | "user"

const _constraints = (facingMode: FacingMode): MediaStreamConstraints => ({
  audio: false,
  video: {
    facingMode,
    width: { ideal: 1920 },
    height: { ideal: 1440 }
  }
})

/** Requests a camera stream. Throws on permission denial or missing camera. */
export const startStream = async (facingMode: FacingMode): Promise<MediaStream> => {
  const mediaDevices = navigator.mediaDevices
  if (mediaDevices === undefined) {
    throw new Error("Camera access requires a secure (HTTPS) connection")
  }
  const stream = await mediaDevices.getUserMedia(_constraints(facingMode))
  const video = stream.getVideoTracks()[0]
  if (video === undefined) {
    for (const track of stream.getTracks()) track.stop()
    throw new Error("No video track available")
  }
  return stream
}

export const stopStream = (stream: MediaStream): void => {
  for (const track of stream.getTracks()) track.stop()
}

/** Best-effort torch toggle; returns false when the device cannot flash. */
export const setTorch = async (stream: MediaStream, on: boolean): Promise<boolean> => {
  const video = stream.getVideoTracks()[0]
  if (video === undefined) return false
  try {
    await video.applyConstraints({ advanced: [{ torch: on }] })
    return true
  } catch {
    return false
  }
}

/** Captures the current video frame as an ImageBitmap. */
export const captureFrame = (video: HTMLVideoElement): Promise<ImageBitmap> => {
  if ("createImageBitmap" in window) {
    return createImageBitmap(video)
  }
  return Promise.reject(new Error("createImageBitmap is not supported"))
}