import { For, Show } from "solid-js"
import type { JSX } from "solid-js"

export const TABLE_CARD_COUNT = 6

export interface TableCardsProps {
  readonly qr: string | undefined
  readonly title: string
}

export const TableCards = (props: TableCardsProps): JSX.Element => (
  <div class="table-card-grid">
    <For each={Array.from({ length: TABLE_CARD_COUNT }, (_, index) => index)}>
      {() => (
        <div class="table-card">
          <div class="table-card-title">{props.title}</div>
          <div class="">We want your perspective from the night</div>
          <div class="table-card-text">Scan the QR code and share your photos!</div>
          <div class="table-card-qr-frame">
            <Show when={props.qr} fallback={<div class="table-card-qr table-card-qr-placeholder" />}>
              {(value) => <img src={value()} alt="" class="table-card-qr" />}
            </Show>
          </div>
          <div class="table-card-text"><span class="small">No download required</span></div>
          <div class="table-card-perforations" />
        </div>
      )}
    </For>
  </div>
)
