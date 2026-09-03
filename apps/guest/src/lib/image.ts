const MAX_DIMENSION = 1920
/** API cap is 2 MiB; leave headroom for multipart framing. */
const MAX_UPLOAD_BYTES = 1.9 * 1024 * 1024

const _downscale = (bitmap: ImageBitmap) => {
  const longest = Math.max(bitmap.width, bitmap.height)
  if (longest <= MAX_DIMENSION) return { width: bitmap.width, height: bitmap.height }
  const scale = MAX_DIMENSION / longest
  return {
    width: Math.round(bitmap.width * scale),
    height: Math.round(bitmap.height * scale)
  }
}

/**
 * Draws a source frame onto a canvas, downscaled to at most 1920px on the
 * longest edge. Uploads are intentionally originals: the event's filter pack
 * is only a preview (viewfinder CSS) plus per-photo metadata rendered by the
 * host. Baking here used `ctx.filter`, which older iOS Safari silently
 * ignores — so finals arrived unfiltered while the viewfinder promised film.
 */
export const renderFrame = (bitmap: ImageBitmap): HTMLCanvasElement => {
  const { width, height } = _downscale(bitmap)
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (context === null) throw new Error("Canvas 2D context unavailable")
  context.drawImage(bitmap, 0, 0, width, height)
  return canvas
}

const _toBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob === null ? reject(new Error("Image encoding failed")) : resolve(blob)),
      "image/jpeg",
      quality
    )
  })

/**
 * Encodes the canvas as JPEG, stepping the quality down until it fits under
 * the API's 2 MiB limit. Best-effort against a mobile venue; the caller
 * still has the raw canvas to retry.
 */
export const compressCanvas = async (canvas: HTMLCanvasElement): Promise<Blob> => {
  let quality = 0.82
  let blob = await _toBlob(canvas, quality)
  while (blob.size > MAX_UPLOAD_BYTES && quality > 0.3) {
    quality -= 0.12
    blob = await _toBlob(canvas, quality)
  }
  return blob
}

/** Loads a gallery file into an ImageBitmap, honoring EXIF orientation. */
export const loadGalleryBitmap = async (file: Blob): Promise<ImageBitmap> => {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file, { imageOrientation: "from-image" })
  }
  throw new Error("createImageBitmap is not supported")
}