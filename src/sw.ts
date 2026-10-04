/// <reference lib="webworker" />
/**
 * Service worker (vite-plugin-pwa injectManifest). Precaches the app shell, content
 * and mascot assets. Nothing from /api is ever cached. Updates wait for the user to
 * tap "Odśwież" (the page posts SKIP_WAITING).
 */
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  matchPrecache,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute, setCatchHandler } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null } | string>;
};

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Single-page app: every navigation gets the precached shell, except the API.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//],
  }),
);

// Last resort for documents that are not precached while offline.
setCatchHandler(async ({ request }) => {
  if (request.destination === 'document') {
    return (await matchPrecache('/offline.html')) ?? Response.error();
  }
  return Response.error();
});

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});
