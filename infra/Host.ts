import * as Cloudflare from "alchemy/Cloudflare"
import * as Output from "alchemy/Output"

/**
 * The host dashboard — a SolidStart SPA (client-side rendering only) deployed
 * as a Cloudflare Worker with static assets, mirroring the guest PWA. The API
 * Worker's URL is inlined as `import.meta.env.VITE_API_BASE` at build time, and
 * the guest PWA's URL as `VITE_GUEST_BASE` so the host can copy share links.
 */
export const Host = (
  apiUrl: Output.Output<string | undefined>,
  guestUrl: Output.Output<string | undefined>,
  domain: string | undefined,
  zoneName: string | undefined
) =>
  Cloudflare.Website.Vite("Host", {
    rootDir: "apps/host",
    domain: domain === undefined
      ? undefined
      : { name: domain, zoneName },
    env: {
      VITE_API_BASE: Output.map(apiUrl, (url) => url ?? "http://localhost:8787"),
      VITE_GUEST_BASE: Output.map(guestUrl, (url) => url ?? "http://localhost:5174")
    }
  })
