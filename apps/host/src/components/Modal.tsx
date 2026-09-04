import { onCleanup, onMount } from "solid-js"
import type { JSX } from "solid-js"

export const Modal = (props: { readonly label: string; readonly onClose: () => void; readonly children: JSX.Element }): JSX.Element => {
  let dialog: HTMLDivElement | undefined
  onMount(() => {
    const previous = document.activeElement
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.stopPropagation()
        props.onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    const first = dialog?.querySelector<HTMLElement>("input, select, textarea, button")
    ;(first ?? dialog)?.focus()
    onCleanup(() => {
      window.removeEventListener("keydown", onKey)
      if (previous instanceof HTMLElement) previous.focus()
    })
  })
  return (
    <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={props.onClose}>
      <div ref={(element) => { dialog = element }} role="dialog" aria-modal="true" aria-label={props.label} tabindex="-1" class="w-full max-w-md" onClick={(event) => event.stopPropagation()}>
        {props.children}
      </div>
    </div>
  )
}
