import { useErrorBoundary } from 'preact/hooks';
import { Mascot } from '../mascot/Mascot.tsx';
import { AccessScreen } from '../screens/AccessScreen.tsx';
import { ProfilePicker } from '../screens/ProfilePicker.tsx';
import { activeProfile, appState } from '../state/app.ts';
import { useStore } from '../state/store.ts';
import { useToasts } from '../ui/toast.tsx';
import { applyUpdate } from './pwa.ts';
import { Shell } from './Shell.tsx';

function OfflineBanner() {
  const { online, phase } = useStore(appState);
  if (online || phase === 'booting') return null;
  return (
    <div class="offline-banner" role="status">
      Offline. Lekcje i powtórki działają, synchronizacja poczeka na sieć.
    </div>
  );
}

function Toasts() {
  const toasts = useToasts();
  const { updateAvailable } = useStore(appState);
  return (
    <div class="toast-region" aria-live="polite">
      {updateAvailable && (
        <div class="toast" role="status">
          <span class="grow">Nowa wersja aplikacji.</span>
          <button class="btn btn--primary" onClick={applyUpdate}>
            Odśwież
          </button>
        </div>
      )}
      {toasts.map((t) => (
        <div class="toast" key={t.id}>
          <span class="grow">{t.text}</span>
        </div>
      ))}
    </div>
  );
}

function Broken({ text }: { text: string }) {
  return (
    <main class="screen centered-screen" style={{ textAlign: 'center' }}>
      <Mascot pose="sleepy" size={150} />
      <h1 class="display" style={{ fontSize: 'var(--fs-lg)' }}>
        Coś poszło nie tak
      </h1>
      <p class="muted">{text}</p>
      <button class="btn btn--primary" onClick={() => location.reload()}>
        Spróbuj ponownie
      </button>
    </main>
  );
}

export function App() {
  const state = useStore(appState);
  const [error] = useErrorBoundary((e: unknown) => console.error(e));

  if (error) {
    return <Broken text="Aplikacja napotkała błąd. Twoje dane są bezpieczne na telefonie." />;
  }

  let screen;
  if (state.phase === 'booting') screen = null;
  else if (state.phase === 'broken') {
    screen = (
      <Broken text="Ta przeglądarka nie pozwala zapisywać danych (może tryb prywatny?). Otwórz aplikację normalnie z ekranu początkowego." />
    );
  } else if (state.phase === 'locked') screen = <AccessScreen />;
  else {
    const profile = activeProfile();
    screen = profile ? <Shell profile={profile} key={profile.id} /> : <ProfilePicker />;
  }

  return (
    <>
      <OfflineBanner />
      {screen}
      <Toasts />
    </>
  );
}
