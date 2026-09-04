import { createSignal, onCleanup } from "solid-js"

export type CopyState = "idle" | "copied" | "failed"

const legacyCopy = (text: string): boolean => {
  const input = document.createElement("textarea")
  input.value = text
  input.style.position = "fixed"
  input.style.opacity = "0"
  document.body.appendChild(input)
  input.select()
  const copied = document.execCommand("copy")
  input.remove()
  return copied
}

export const createCopyFeedback = () => {
  const [state, setState] = createSignal<CopyState>("idle")
  let timer: number | undefined
  const show = (next: CopyState): void => {
    if (timer !== undefined) window.clearTimeout(timer)
    setState(next)
    timer = window.setTimeout(() => setState("idle"), 2000)
  }
  onCleanup(() => {
    if (timer !== undefined) window.clearTimeout(timer)
  })
  const copy = (text: string): void => {
    if (navigator.clipboard?.writeText !== undefined) {
      void navigator.clipboard.writeText(text).then(() => show("copied")).catch(() => {
        show(legacyCopy(text) ? "copied" : "failed")
      })
      return
    }
    show(legacyCopy(text) ? "copied" : "failed")
  }
  return { state, copy }
}
