/**
 * Canonical filter definitions shared by the guest camera, the host
 * dashboard, and any export path that bakes a filter into bytes.
 *
 * Why this exists: the guest used to bake filters with
 * `CanvasRenderingContext2D.filter = css`. That property is silently ignored
 * on older iOS Safari, so uploads arrived unfiltered while the viewfinder
 * (pure CSS) promised a film look. Grain and vignette were CSS overlays and
 * never baked at all. The pipeline below is pure `ImageData` math, so it
 * behaves identically everywhere, and the per-photo `filterPack` metadata
 * (not baked bytes) is the source of truth.
 */

export const FilterPackIds = ["film", "none", "bw", "vivid"] as const
export type FilterPackId = (typeof FilterPackIds)[number]

/** Unknown packs fall back to the film look (matches `filterPackCss`). */
export const normalizeFilterPack = (pack: string): FilterPackId => {
  for (const id of FilterPackIds) {
    if (pack === id) return id
  }
  return "film"
}

const _clamp = (value: number): number => (value < 0 ? 0 : value > 255 ? 255 : value)

const _luma = (r: number, g: number, b: number): number =>
  0.2126 * r + 0.7152 * g + 0.0722 * b

/**
 * Applies one filter pack to raw RGBA pixels in place. Alpha is untouched.
 * Operation order mirrors the CSS `filter` strings in `status.ts` so the
 * canvas bake matches the viewfinder preview.
 */
export const applyFilterToPixels = (data: Uint8ClampedArray, pack: string): void => {
  const id = normalizeFilterPack(pack)
  if (id === "none") return
  for (let i = 0; i + 3 < data.length + 1; i += 4) {
    let r = data[i]!
    let g = data[i + 1]!
    let b = data[i + 2]!

    const saturate = (amount: number): void => {
      const gray = _luma(r, g, b)
      r = _clamp(gray + (r - gray) * amount)
      g = _clamp(gray + (g - gray) * amount)
      b = _clamp(gray + (b - gray) * amount)
    }
    const contrast = (amount: number): void => {
      r = _clamp((r - 128) * amount + 128)
      g = _clamp((g - 128) * amount + 128)
      b = _clamp((b - 128) * amount + 128)
    }
    const brightness = (amount: number): void => {
      r = _clamp(r * amount)
      g = _clamp(g * amount)
      b = _clamp(b * amount)
    }
    const sepia = (amount: number): void => {
      const sr = _clamp(0.393 * r + 0.769 * g + 0.189 * b)
      const sg = _clamp(0.349 * r + 0.686 * g + 0.168 * b)
      const sb = _clamp(0.272 * r + 0.534 * g + 0.131 * b)
      r = _clamp(r + (sr - r) * amount)
      g = _clamp(g + (sg - g) * amount)
      b = _clamp(b + (sb - b) * amount)
    }

    if (id === "film") {
      saturate(0.82)
      contrast(1.08)
      sepia(0.14)
      brightness(1.02)
    } else if (id === "bw") {
      const gray = _luma(r, g, b)
      r = gray
      g = gray
      b = gray
      contrast(1.12)
    } else {
      saturate(1.3)
      contrast(1.12)
    }

    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
  }
}
