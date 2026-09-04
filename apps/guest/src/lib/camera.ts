export type FacingMode = "environment" | "user"

export interface CameraDevice {
  readonly deviceId: string
  readonly label: string
  readonly facing: FacingMode | "unknown"
}

export interface ZoomRange {
  readonly min: number
  readonly max: number
  readonly step: number
  readonly value: number
}

export interface FocusInfo {
  readonly modes: ReadonlyArray<string>
  readonly distance: ZoomRange | null
}

export interface StartStreamOptions {
  readonly facingMode: FacingMode
  readonly deviceId?: string
}

const _constraints = (options: StartStreamOptions): MediaStreamConstraints => {
  if (options.deviceId !== undefined && options.deviceId !== "") {
    return {
      audio: false,
      video: {
        deviceId: { exact: options.deviceId },
        width: { ideal: 1920 },
        height: { ideal: 1440 }
      }
    }
  }
  return {
    audio: false,
    video: {
      facingMode: options.facingMode,
      width: { ideal: 1920 },
      height: { ideal: 1440 }
    }
  }
}

/** Requests a camera stream. Throws on permission denial or missing camera. */
export const startStream = async (
  facingMode: FacingMode,
  deviceId?: string
): Promise<MediaStream> => {
  const mediaDevices = navigator.mediaDevices
  if (mediaDevices === undefined) {
    throw new Error("Camera access requires a secure (HTTPS) connection")
  }
  const options: StartStreamOptions = { facingMode, deviceId }
  try {
    const stream = await mediaDevices.getUserMedia(_constraints(options))
    const video = stream.getVideoTracks()[0]
    if (video === undefined) {
      for (const track of stream.getTracks()) track.stop()
      throw new Error("No video track available")
    }
    return stream
  } catch (error) {
    // Exact deviceId can fail when the OS re-enumerates cameras; fall back
    // to a plain facingMode request before surfacing the error.
    if (options.deviceId !== undefined && options.deviceId !== "") {
      return startStream(facingMode)
    }
    throw error
  }
}

export const stopStream = (stream: MediaStream): void => {
  for (const track of stream.getTracks()) track.stop()
}

const _videoTrack = (stream: MediaStream): MediaStreamTrack | undefined =>
  stream.getVideoTracks()[0]

const _inferFacing = (label: string): FacingMode | "unknown" => {
  const lower = label.toLowerCase()
  if (
    lower.includes("front") ||
    lower.includes("user") ||
    lower.includes("selfie") ||
    lower.includes("facetime")
  ) {
    return "user"
  }
  if (
    lower.includes("back") ||
    lower.includes("rear") ||
    lower.includes("environment") ||
    lower.includes("ultra-wide") ||
    lower.includes("ultrawide") ||
    lower.includes("wide") ||
    lower.includes("tele") ||
    lower.includes("main")
  ) {
    return "environment"
  }
  return "unknown"
}

/**
 * Lists available cameras. Labels are empty until camera permission is
 * granted, so call this after `startStream` resolves. Returns an empty array
 * when enumeration is unsupported.
 */
export const listCameras = async (): Promise<ReadonlyArray<CameraDevice>> => {
  const mediaDevices = navigator.mediaDevices
  if (mediaDevices === undefined || mediaDevices.enumerateDevices === undefined) {
    return []
  }
  const devices = await mediaDevices.enumerateDevices()
  return devices
    .filter((device) => device.kind === "videoinput")
    .map((device, index): CameraDevice => {
      const label = device.label === "" ? `Camera ${index + 1}` : device.label
      return {
        deviceId: device.deviceId,
        label,
        facing: device.label === "" ? "unknown" : _inferFacing(device.label)
      }
    })
};

/** Best-effort torch toggle; returns false when the device cannot flash. */
export const setTorch = async (stream: MediaStream, on: boolean): Promise<boolean> => {
  const video = _videoTrack(stream)
  if (video === undefined) return false
  try {
    await video.applyConstraints({ advanced: [{ torch: on }] })
    return true
  } catch {
    return false
  }
};

/** Returns the zoom range when the active camera supports optical/digital zoom. */
export const getZoomRange = (stream: MediaStream): ZoomRange | null => {
  const video = _videoTrack(stream)
  if (video === undefined || video.getCapabilities === undefined) return null
  const capabilities = video.getCapabilities()
  const zoom = capabilities.zoom
  if (zoom === undefined || zoom.min === undefined || zoom.max === undefined) return null
  const min = zoom.min
  const max = zoom.max
  const settings = video.getSettings()
  const rawZoom = settings.zoom
  const current = rawZoom === undefined || !Number.isFinite(rawZoom) ? min : rawZoom
  if (!(max > min)) return null
  const step = zoom.step && zoom.step > 0 ? zoom.step : (max - min) / 20
  return {
    min,
    max,
    step,
    value: Math.min(Math.max(current, min), max)
  }
};

/** Software (digital) zoom range used when the track exposes no native zoom. */
export const SOFTWARE_ZOOM: ZoomRange = { min: 1, max: 4, step: 0.1, value: 1 }

/** Applies a zoom level, clamped to the device range. Returns false when unsupported. */
export const setZoom = async (stream: MediaStream, value: number): Promise<boolean> => {
  const range = getZoomRange(stream)
  const video = _videoTrack(stream)
  if (range === null || video === undefined) return false
  const clamped = Math.min(Math.max(value, range.min), range.max)
  try {
    await video.applyConstraints({ advanced: [{ zoom: clamped }] })
    return true
  } catch {
    return false
  }
};

/** Reports focus capabilities; empty modes means tap-to-focus is unsupported. */
export const getFocusInfo = (stream: MediaStream): FocusInfo => {
  const video = _videoTrack(stream)
  const empty: FocusInfo = { modes: [], distance: null }
  if (video === undefined || video.getCapabilities === undefined) return empty
  const capabilities = video.getCapabilities()
  const modes = capabilities.focusMode ?? []
  const distanceCapabilities = capabilities.focusDistance
  if (distanceCapabilities === undefined) return { modes, distance: null }
  const { min, max, step } = distanceCapabilities
  if (min === undefined || max === undefined) return { modes, distance: null }
  const settings = video.getSettings()
  const rawDistance = settings.focusDistance
  const focusValue = rawDistance === undefined || !Number.isFinite(rawDistance) ? min : rawDistance
  const distance: ZoomRange = {
    min,
    max,
    step: step && step > 0 ? step : (max - min) / 20,
    value: focusValue
  }
  return { modes, distance }
};

/**
 * Best-effort tap-to-focus: triggers a single-shot AF cycle, then restores
 * continuous focus when the device supports it. Returns false when the
 * device exposes no focusMode control (iOS Safari typically).
 */
export const triggerAutoFocus = async (stream: MediaStream): Promise<boolean> => {
  const video = _videoTrack(stream)
  if (video === undefined) return false
  const { modes } = getFocusInfo(stream)
  if (modes.length === 0) return false
  if (!modes.includes("single-shot")) return false
  try {
    await video.applyConstraints({ advanced: [{ focusMode: "single-shot" }] })
  } catch {
    return false
  }
  if (modes.includes("continuous")) {
    setTimeout(() => {
      video.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {})
    }, 1500)
  }
  return true
};

/**
 * Captures the current video frame into a canvas. Avoiding `createImageBitmap`
 * entirely is necessary for iOS embedded browsers, which can show a live video
 * stream but do not always support creating a bitmap from it. When `zoom` is
 * greater than 1, the center 1/zoom region is cropped and upscaled back to
 * full resolution so the saved photo matches the software-zoom preview.
 */
export const captureFrame = (video: HTMLVideoElement, zoom = 1): HTMLCanvasElement => {
  const sourceWidth = video.videoWidth
  const sourceHeight = video.videoHeight
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
    throw new Error("Camera frame is not ready")
  }
  const cropZoom = zoom > 1.01 ? zoom : 1
  const cropWidth = Math.floor(sourceWidth / cropZoom)
  const cropHeight = Math.floor(sourceHeight / cropZoom)
  const cropX = Math.floor((sourceWidth - cropWidth) / 2)
  const cropY = Math.floor((sourceHeight - cropHeight) / 2)
  const canvas = document.createElement("canvas")
  canvas.width = sourceWidth
  canvas.height = sourceHeight
  const context = canvas.getContext("2d")
  if (context === null) {
    throw new Error("Canvas 2D context unavailable")
  }
  context.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, sourceWidth, sourceHeight)
  return canvas
};
