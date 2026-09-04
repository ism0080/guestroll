/**
 * Mobile save/share helper.
 *
 * On mobile browsers an `<a download>` click does not land in the camera
 * roll — iOS Safari downloads into Files, Android Chrome into Downloads.
 * The Web Share API with files (`navigator.share({ files })`) opens the
 * native share sheet, where "Save Image" writes straight to Photos / the
 * gallery. So on share-capable mobile devices we prefer the share sheet
 * and only fall back to the anchor download elsewhere.
 */

export type SaveOutcome = "shared" | "downloaded"

export interface SaveDetails {
  readonly title: string
  readonly text?: string | undefined
}

const MobileUaPattern = /Android|iPhone|iPad|iPod|Mobile/i

/** True when the device looks like a share-sheet mobile target. */
export const isMobileShareTarget = (): boolean => {
  if (!("share" in navigator)) return false
  try {
    if (window.matchMedia("(pointer: coarse)").matches) return true
  } catch {
    // matchMedia unavailable in odd embeds; fall through to UA sniffing.
  }
  return MobileUaPattern.test(navigator.userAgent)
}

/** Whether the native share sheet can take this file. */
export const canShareFile = (file: File): boolean => {
  if (!("canShare" in navigator)) return false
  try {
    return navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

const _isDismissal = (cause: unknown): boolean =>
  cause instanceof DOMException && cause.name === "AbortError"

/** Plain anchor download (desktop fallback). */
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    // Blobs need to be in the DOM for the click on some mobile browsers.
    anchor.rel = "noopener"
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    // Let the browser start the download before revoking.
    window.setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
}

/**
 * Saves a blob on mobile via the native share sheet (Save Image → camera
 * roll) and via anchor download everywhere else. A user-dismissed share
 * sheet counts as "shared" so callers don't fall through to a download.
 */
export const saveBlob = async (blob: Blob, filename: string, details: SaveDetails): Promise<SaveOutcome> => {
  if (isMobileShareTarget()) {
    const file = new File([blob], filename, {
      type: blob.type || "application/octet-stream"
    })
    if (canShareFile(file)) {
      try {
        await navigator.share({ files: [file], title: details.title, text: details.text })
        return "shared"
      } catch (cause) {
        if (_isDismissal(cause)) return "shared"
        // Share failed (e.g. transient); fall through to anchor download.
      }
    }
  }
  downloadBlob(blob, filename)
  return "downloaded"
}
