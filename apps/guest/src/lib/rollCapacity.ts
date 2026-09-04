/**
 * Counts server-confirmed photos plus local photos that have claimed an
 * exposure. Failed photos are excluded: the server never recorded them, so
 * reserving capacity for them would lock the shutter until the guest
 * noticed the retry banner.
 */
export const claimedPhotoCount = (
  usedCount: number,
  pendingCount: number,
  savingCount: number
): number => usedCount + pendingCount + savingCount

/** Whether the guest can take another photo without exceeding their roll. */
export const hasCaptureCapacity = (claimedCount: number, photoLimit: number): boolean =>
  claimedCount < photoLimit
