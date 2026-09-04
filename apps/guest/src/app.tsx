import { MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { createSignal, onMount, Show, Suspense } from "solid-js";
import "./app.css";

const isIosEmbeddedBrowser = (): boolean => {
  const { userAgent, platform, maxTouchPoints } = navigator;
  const isIos = /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
  const isStandalone = navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  // iOS WebViews omit Safari's Version/... Safari token. This deliberately
  // includes third-party iOS browsers, where camera capture is not dependable.
  const isSafari = /Version\/[^ ]+.*Safari\//.test(userAgent);
  return isIos && !isStandalone && !isSafari;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true
    }
  }
});

export default function App() {
  const [showEmbeddedBrowserNotice, setShowEmbeddedBrowserNotice] = createSignal(false);

  onMount(() => {
    setShowEmbeddedBrowserNotice(isIosEmbeddedBrowser());
  });

  return (
    <QueryClientProvider client={queryClient}>
      <Router
        root={(props) => (
          <MetaProvider>
            <Title>GuestRoll</Title>
            <div class="min-h-dvh bg-base-200">
              <Suspense>{props.children}</Suspense>
            </div>
          </MetaProvider>
        )}
      >
        <FileRoutes />
      </Router>
      <Show when={showEmbeddedBrowserNotice()}>
        <div class="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-6" role="alertdialog" aria-modal="true" aria-labelledby="open-safari-title">
          <section class="w-full max-w-sm rounded-box border-2 border-neutral bg-base-100 p-6 text-center shadow-[0_15px_35px_hsla(0,0%,0%,.2)]">
            <p class="text-xs font-bold uppercase tracking-[0.15em] text-primary">Camera access</p>
            <h1 id="open-safari-title" class="mt-2 text-2xl font-extrabold text-base-content">Open this invitation in Safari</h1>
            <p class="mt-3 text-sm leading-6 text-base-content/70">
              The browser inside this app can show the camera but cannot reliably save photos. Tap the <strong class="text-base-content">share</strong> or <strong class="text-base-content">more</strong> button, then choose <strong class="text-base-content">Open in Safari</strong>.
            </p>
            <p class="mt-4 text-xs leading-5 text-base-content/55">Safari will reopen this same invitation and your photos will save normally.</p>
          </section>
        </div>
      </Show>
    </QueryClientProvider>
  );
}
