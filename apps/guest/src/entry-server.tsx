// @refresh reload
import { createHandler, StartServer } from "@solidjs/start/server";

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en" data-theme="guestroll">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          <meta name="theme-color" content="#f6f2e9" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
           <meta name="apple-mobile-web-app-title" content="GuestRoll" />
           <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
           <meta name="description" content="GuestRoll — a disposable camera for your wedding guests" />
           <meta property="og:type" content="website" />
           <meta property="og:site_name" content="GuestRoll" />
           <meta property="og:title" content="GuestRoll" />
           <meta property="og:description" content="GuestRoll — a disposable camera for your wedding guests" />
           <meta property="og:image" content="/icons/icon-512.png" />
           <meta property="og:image:width" content="512" />
           <meta property="og:image:height" content="512" />
           <meta property="og:image:alt" content="GuestRoll camera" />
           <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
          <link rel="manifest" href="/manifest.webmanifest" />
          <link rel="apple-touch-icon" href="/icons/icon-192.png" />
          {assets}
        </head>
        <body>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
