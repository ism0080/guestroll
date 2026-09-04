import { defineConfig } from "vite";

import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";

// Unique per build so the service worker registration URL (`/sw.js?v=…`)
// changes with every deploy, invalidating the old shell cache (see
// `public/sw.js`) without a manual version bump.
const swVersion = `sw-${Date.now().toString(36)}`;

export default defineConfig({
  plugins: [solidStart({ ssr: false, devOverlay: false }), tailwindcss()],
  define: {
    __SW_VERSION__: JSON.stringify(swVersion)
  },
  server: {
    host: true,
    port: 5174,
    allowedHosts: true
  }
});
