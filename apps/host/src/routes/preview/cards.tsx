import { createResource } from "solid-js"
import type { JSX } from "solid-js"
import { Portal } from "solid-js/web"
import QRCode from "qrcode"
import { guestLink } from "~/lib/api"
import { TableCards } from "~/components/TableCards"

const qrSvgDataUrl = (text: string): Promise<string> =>
  QRCode.toString(text, { type: "svg", margin: 2, color: { dark: "#111111", light: "#ffffff" } }).then(
    (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  )

/** Standalone preview of the printable table cards. Needs no API or login. */
export default function PreviewCards(): JSX.Element {
  const link = guestLink("preview-event")
  const [qr] = createResource(link, qrSvgDataUrl)

  return (
    <>
      <div class="mx-auto max-w-3xl p-4">
        <div class="mb-4 flex items-center justify-between">
          <p class="film-counter text-sm">{link}</p>
          <button type="button" class="btn btn-primary" onClick={() => window.print()}>
            Print
          </button>
        </div>
        <TableCards title="Event Preview" qr={qr()} />
      </div>
      <Portal>
        <div class="print-area hidden print:block" aria-hidden="true">
          <TableCards title="Event Preview" qr={qr()} />
        </div>
      </Portal>
    </>
  )
}
