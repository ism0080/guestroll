import { defineConfig } from "vite";

import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [solidStart({ ssr: false, devOverlay: false }), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true
  }
});