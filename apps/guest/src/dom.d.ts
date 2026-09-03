/// <reference lib="dom" />

/**
 * `torch` is a non-standard but widely-supported video constraint on mobile
 * browsers; the DOM `MediaTrackConstraintSet` type omits it.
 */
interface MediaTrackConstraintSet {
  torch?: boolean
}