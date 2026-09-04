/** Counts server-confirmed photos plus local photos that have claimed an exposure. */
export const claimedPhotoCount = (
  usedCount: number,
  pendingCount: number,
  failedCount: number,
  savingCount: number
): number => usedCount + pendingCount + failedCount + savingCount

/** Whether the guest can take another photo without exceeding their roll. */
export const hasCaptureCapacity = (claimedCount: number, photoLimit: number): boolean =>
  claimedCount < photoLimit
