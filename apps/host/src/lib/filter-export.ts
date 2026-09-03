import { applyFilterToPixels, normalizeFilterPack } from "@guestroll/contracts"

export interface BakeOptions {
  /** Film grain overlay (matches `.film-grain` in the guest viewfinder). Default true. */
  readonly grain?: boolean
  /** Vignette (matches `.camera-frame::after` in the guest viewfinder). Default true. */
  readonly vignette?: boolean
}

/** Tile size echoing the guest's SVG noise tile (120px). */
const GRAIN_TILE = 120
/** Grain strength echoing the viewfinder overlay opacity (0.16). */
const GRAIN_ALPHA = 0.16

/**
 * Darkens the frame edges to match
 * `radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.28) 100%)`.
 * The transform maps a unit-circle gradient onto the canvas ellipse, so the
 * 100% stop lands on the farthest corner exactly like the CSS default.
 */
const _applyVignette = (context: CanvasRenderingContext2D, width: number, height: number): void => {
  context.save()
  try {
    context.translate(width / 2, height / 2)
    context.scale(width / 2, height / 2)
    const corner = Math.SQRT2
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, corner)
    gradient.addColorStop(0, "rgba(0, 0, 0, 0)")
    gradient.addColorStop(0.55, "rgba(0, 0, 0, 0)")
    gradient.addColorStop(1, "rgba(0, 0, 0, 0.28)")
    context.fillStyle = gradient
    context.fillRect(-1, -1, 2, 2)
  } finally {
    context.restore()
  }
}

/**
 * Tiles random monochrome noise over the frame with the `overlay` blend at
 * 0.16 alpha, echoing the guest's `feTurbulence` grain overlay. Falls back
 * to a faint `source-over` dusting where `overlay` is unsupported (the
 * assignment is then ignored and the composite stays `source-over`).
 */
const _applyGrain = (context: CanvasRenderingContext2D, width: number, height: number): void => {
  const tile = document.createElement("canvas")
  tile.width = GRAIN_TILE
  tile.height = GRAIN_TILE
  const tileContext = tile.getContext("2d")
  if (tileContext === null) return
  const pixels = tileContext.createImageData(GRAIN_TILE, GRAIN_TILE)
  for (let i = 0; i < pixels.data.length; i += 4) {
    const value = Math.floor(Math.random() * 256)
    pixels.data[i] = value
    pixels.data[i + 1] = value
    pixels.data[i + 2] = value
    pixels.data[i + 3] = 255
  }
  tileContext.putImageData(pixels, 0, 0)
  const pattern = context.createPattern(tile, "repeat")
  if (pattern === null) return
  context.save()
  try {
    context.globalAlpha = GRAIN_ALPHA
    context.globalCompositeOperation = "overlay"
    if (context.globalCompositeOperation !== "overlay") {
      // Blend unsupported — fall back to a fainter direct dusting.
      context.globalAlpha = 0.05
    }
    context.fillStyle = pattern
    context.fillRect(0, 0, width, height)
  } finally {
    context.restore()
  }
}

/**
 * Bakes a photo's filter pack into bytes using the shared ImageData pipeline
 * (no `ctx.filter`, so it behaves identically on Safari/Chrome), plus the
 * viewfinder's grain and vignette chrome which are CSS-only elsewhere and
 * would otherwise never reach the final file. The source is fetched with the
 * host session cookie, decoded in memory, and therefore never taints the
 * canvas — unlike drawing a credentialed `<img>` directly. The `none`
 * (Natural) pack returns the source untouched.
 */
export const bakeBlobFilter = async (
  source: Blob,
  filterPack: string,
  options: BakeOptions = {}
): Promise<Blob> => {
  const { grain = true, vignette = true } = options
  const pack = normalizeFilterPack(filterPack)
  if (pack === "none") return source
  if (!("createImageBitmap" in window)) return source
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" })
  try {
    const canvas = document.createElement("canvas")
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext("2d")
    if (context === null) return source
    context.drawImage(bitmap, 0, 0)
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    applyFilterToPixels(image.data, pack)
    context.putImageData(image, 0, 0)
    if (vignette) _applyVignette(context, canvas.width, canvas.height)
    if (grain) _applyGrain(context, canvas.width, canvas.height)
    const baked = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    )
    return baked ?? source
  } finally {
    try {
      bitmap.close()
    } catch {
      // Bitmap cleanup is best-effort.
    }
  }
}
