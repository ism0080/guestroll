import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import type { JSX } from "solid-js"
import { fetchObjectUrl } from "~/lib/api"

export interface AuthImageProps {
  readonly url: string
  readonly alt: string
  readonly style?: JSX.CSSProperties
  readonly loading?: "lazy" | "eager"
}

/**
 * An `<img>` whose bytes are fetched with the host session bearer header and
 * served as a blob object URL — `<img>` cannot set headers, and cookies are
 * not used for host auth. The object URL is revoked when it is replaced.
 */
export const AuthImage = (props: AuthImageProps): JSX.Element => {
  const [src, setSrc] = createSignal<string | null>(null)
  createEffect(() => {
    const url = props.url
    let objectUrl: string | undefined
    setSrc(null)
    void fetchObjectUrl(url).then((value) => {
      objectUrl = value
      setSrc(value)
    }, () => {})
    onCleanup(() => {
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl)
    })
  })
  return (
    <Show when={src()} keyed fallback={<span class="block h-full min-h-16 w-full bg-base-200" />}>
      {(value) => <img src={value} alt={props.alt} style={props.style} loading={props.loading} />}
    </Show>
  )
}
