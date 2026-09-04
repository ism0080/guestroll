import type { JSX } from "solid-js"

interface CameraBodyProps {
  readonly class?: string
  /** Number shown in the exposure-counter window. */
  readonly count?: number | string
}

/** Minimalist line-art of a disposable camera, the GuestRoll visual anchor. */
export const CameraBody = (props: CameraBodyProps): JSX.Element => (
  <svg
    viewBox="0 0 200 132"
    class={props.class}
    fill="none"
    role="img"
    aria-label="Disposable camera"
  >
    <rect x="6" y="10" width="188" height="112" rx="16" fill="#f6f2e9" stroke="#201d18" stroke-width="3" />
    <g stroke="#201d18" stroke-width="2.5" stroke-linecap="round" opacity="0.75">
      <path d="M150 10v-4" />
      <path d="M160 10v-4" />
      <path d="M170 10v-4" />
    </g>
    <rect x="6" y="86" width="188" height="20" fill="#17a398" opacity="0.9" />
    <circle cx="72" cy="60" r="34" fill="#201d18" />
    <circle cx="72" cy="60" r="26" fill="#2b2621" stroke="#3a332b" stroke-width="2" />
    <circle cx="72" cy="60" r="15" fill="#0c0b09" />
    <circle cx="64" cy="52" r="5" fill="#f6f2e9" opacity="0.85" />
    <rect x="120" y="26" width="46" height="30" rx="6" fill="#f2b705" stroke="#201d18" stroke-width="3" />
    <path d="M141 32l-8 11h7l-2 9 9-12h-6z" fill="#201d18" />
    <rect x="176" y="24" width="10" height="10" rx="2" fill="#201d18" opacity="0.7" />
    <rect x="120" y="64" width="40" height="18" rx="4" fill="#e8503a" stroke="#201d18" stroke-width="2.5" />
    <text x="140" y="77" text-anchor="middle" font-family="'SF Mono', ui-monospace, monospace" font-size="12" font-weight="700" fill="#fff6f0">
      {props.count ?? "24"}
    </text>
  </svg>
)

interface FilmCounterProps {
  readonly used: number
  readonly limit: number
  readonly class?: string
}

/** Exposure counter chip in the style of a disposable-camera film window. */
export const FilmCounter = (props: FilmCounterProps): JSX.Element => (
  <div class={`film-counter inline-flex items-center gap-2 rounded-lg border-2 border-neutral bg-primary px-3 py-1 text-primary-content shadow-[3px_3px_0_0_var(--guestroll-ink)] ${props.class ?? ""}`}>
    <span class="text-lg font-bold leading-none">{props.used}</span>
    <span class="text-xs leading-none opacity-70">/ {props.limit}</span>
  </div>
)
