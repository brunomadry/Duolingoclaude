import { useState } from 'preact/hooks';
import { APP_NAME } from '../shared/constants.ts';
import { Mascot } from '../mascot/Mascot.tsx';
import { unlock } from '../state/app.ts';

export function AccessScreen() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    const result = await unlock(code.trim());
    setBusy(false);
    if (result === 'ok') return;
    if (result === 'wrong')
      setError('Ten kod nie pasuje. Sprawdź wielkość liter i spróbuj jeszcze raz.');
    else if (result === 'offline')
      setError('Brak internetu. Kod trzeba wpisać raz, z połączeniem.');
    else if (result === 'error') setError('Serwer nie odpowiada. Spróbuj za chwilę.');
    else {
      const minutes = Math.max(1, Math.ceil(result.retryAfterSeconds / 60));
      setError(`Za dużo prób. Spróbuj ponownie za ${minutes} min.`);
    }
  };

  return (
    <main class="screen centered-screen waves">
      <div class="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
        <Mascot pose="idle" size={150} />
        <h1 class="display" style={{ fontSize: 'var(--fs-xl)' }}>
          {APP_NAME}
        </h1>
        <p class="muted">Prywatna apka. Wpisz wspólny kod, żeby wejść.</p>
      </div>
      <form class="card stack" onSubmit={submit} noValidate>
        <div class="field">
          <label class="field__label" for="access-code">
            Kod dostępu
          </label>
          <input
            id="access-code"
            class="input"
            type="password"
            autoComplete="current-password"
            autoCapitalize="none"
            spellcheck={false}
            value={code}
            onInput={(e) => setCode(e.currentTarget.value)}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? 'access-error' : undefined}
          />
          {error && (
            <p id="access-error" class="field__error" role="alert">
              {error}
            </p>
          )}
        </div>
        <button class="btn btn--primary btn--block" type="submit" disabled={busy || !code.trim()}>
          {busy ? 'Sprawdzam…' : 'Wejdź'}
        </button>
      </form>
    </main>
  );
}
