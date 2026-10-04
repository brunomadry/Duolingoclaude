/** Service worker registration with a "Nowa wersja, odśwież" prompt instead of silent reloads. */
import { registerSW } from 'virtual:pwa-register';
import { appState } from '../state/app.ts';
import { showToast } from '../ui/toast.tsx';

let update: ((reload?: boolean) => Promise<void>) | null = null;

export function setupPwa(): void {
  if (!('serviceWorker' in navigator)) return;
  update = registerSW({
    onNeedRefresh() {
      appState.set({ updateAvailable: true });
    },
    onOfflineReady() {
      showToast('Gotowe: aplikacja działa też offline.');
    },
    onRegisteredSW(_url, registration) {
      // Check for a new version when the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration?.update();
      });
    },
  });
}

export function applyUpdate(): void {
  void update?.(true);
}
