const EVENT_SLUG_PATTERN = /^[A-Za-z0-9]{16}$/

/** Extracts the event slug from a pasted code or a GuestRoll invitation URL. */
export const invitationSlug = (value: string): string | undefined => {
  const input = value.trim()
  if (EVENT_SLUG_PATTERN.test(input)) return input

  try {
    const url = new URL(input, window.location.origin)
    const parts = url.pathname.split("/").filter(Boolean)
    const slug = parts.length === 1 ? parts[0] : undefined
    return slug !== undefined && EVENT_SLUG_PATTERN.test(slug) ? slug : undefined
  } catch {
    return undefined
  }
}
