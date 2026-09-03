import { createResource, createSignal, For, Show } from "solid-js"
import type { JSX } from "solid-js"
import { Portal } from "solid-js/web"
import QRCode from "qrcode"
import { guestLink } from "~/lib/api"
import { CheckIcon, CloseIcon, CopyIcon, PrinterIcon } from "./icons"

export interface ShareModalProps {
  readonly slug: string
  readonly title: string
  readonly onClose: () => void
}

const qrSvgDataUrl = (text: string): Promise<string> =>
  QRCode.toString(text, { type: "svg", margin: 2, color: { dark: "#111111", light: "#ffffff" } }).then(
    (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  )

const TABLE_CARD_COUNT = 4

export const ShareModal = (props: ShareModalProps): JSX.Element => {
  const link = guestLink(props.slug)
  const [qr] = createResource(link, qrSvgDataUrl)
  const [copied, setCopied] = createSignal(false)

  const copyLink = (): void => {
    navigator.clipboard.writeText(link).catch(() => {})
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
        <div class="w-full max-w-sm">
          <div class="card bg-base-100 shadow-2xl">
            <div class="card-body items-center gap-4">
              <div class="flex w-full items-start justify-between">
                <h2 class="card-title text-2xl">Share</h2>
                <button
                  type="button"
                  class="btn btn-circle btn-ghost btn-sm"
                  aria-label="Close"
                  onClick={props.onClose}
                >
                  <CloseIcon class="h-5 w-5" />
                </button>
              </div>

              <p class="text-center text-base-content/70">{props.title}</p>

              <div class="rounded-box bg-white p-3 shadow-sm">
                <Show
                  when={qr()}
                  fallback={
                    <div class="flex h-64 w-64 items-center justify-center">
                      <span class="loading loading-spinner loading-lg text-primary" />
                    </div>
                  }
                >
                  <img src={qr()!} alt={`QR code for ${props.title}`} class="h-64 w-64" />
                </Show>
              </div>

              <p class="break-all text-center text-sm text-base-content/80">{link}</p>

              <div class="flex w-full flex-col gap-2">
                <button type="button" class="btn btn-primary" onClick={copyLink}>
                  {copied() ? <CheckIcon class="h-5 w-5" /> : <CopyIcon class="h-5 w-5" />}
                  {copied() ? "Link copied" : "Copy link"}
                </button>
                <button
                  type="button"
                  class="btn btn-outline"
                  disabled={qr() === undefined}
                  onClick={() => window.print()}
                >
                  <PrinterIcon class="h-5 w-5" />
                  Print table cards
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Portal>
        <div class="print-area hidden print:block" aria-hidden="true">
          <div class="table-card-grid">
            <For each={Array.from({ length: TABLE_CARD_COUNT }, (_, index) => index)}>
              {() => (
                <div class="table-card">
                  <div class="table-card-title">{props.title}</div>
                  <Show
                    when={qr()}
                    fallback={<div class="table-card-qr table-card-qr-placeholder" />}
                  >
                    <img src={qr()!} alt="" class="table-card-qr" />
                  </Show>
                  <div class="table-card-text">Scan to add your photos</div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Portal>
    </>
  )
}