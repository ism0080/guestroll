import * as Cloudflare from "alchemy/Cloudflare"
import * as Output from "alchemy/Output"

/**
 * The guest PWA — a SolidStart SPA (client-side rendering only) deployed
 * as a Cloudflare Worker with static assets. The SPA shell is served by
 * the Worker (unmatched paths fall through to it); hashed CSS/JS and
 * `public/` files are served by the asset layer. The API Worker's URL is
 * inlined into the client bundle as `import.meta.env.VITE_API_BASE` at
 * build time via the `VITE_` env channel.
 */
export const Guest = (
  apiUrl: Output.Output<string | undefined>,
  domain: string | undefined,
  zoneName: string | undefined
) =>
  Cloudflare.Website.Vite("Guest", {
    rootDir: "apps/guest",
    domain: domain === undefined
      ? undefined
      : { name: domain, zoneName },
    env: {
      VITE_API_BASE: Output.map(apiUrl, (url) => url ?? "http://localhost:8787"),
      VITE_GUEST_BASE: domain === undefined ? "http://localhost:5174" : `https://${domain}`
    }
  })
