import { useState } from 'preact/hooks';
import { APP_NAME } from '../shared/constants.ts';
import { Avatar, Mascot } from '../mascot/Mascot.tsx';
import { AVATAR_IDS, AVATARS, POSES } from '../mascot/parts.ts';
import { applyTheme, normalizeTheme, type Theme } from '../theme/theme.ts';

/**
 * Phase 0 style guide: proves tokens, both themes, typography and the mascot.
 * Replaced by the real shell in Phase 1.
 */
export function App() {
  const [theme, setTheme] = useState<Theme>(() =>
    normalizeTheme(document.documentElement.dataset.theme),
  );

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };

  return (
    <main class="screen stack waves">
      <header class="row" style={{ justifyContent: 'space-between' }}>
        <h1 class="display" style={{ fontSize: 'var(--fs-xl)' }}>
          {APP_NAME}
        </h1>
        <button class="btn" onClick={toggle} aria-pressed={theme === 'light'}>
          {theme === 'dark' ? 'Jasny motyw' : 'Ciemny motyw'}
        </button>
      </header>

      <section class="card stack" aria-labelledby="poses">
        <h2 id="poses">Maskotka</h2>
        <div class="row" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          {POSES.map((p) => (
            <Mascot key={p} pose={p} size={120} />
          ))}
        </div>
      </section>

      <section class="card stack" aria-labelledby="avatars">
        <h2 id="avatars">Awatary</h2>
        <div class="row" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          {AVATAR_IDS.map((id) => (
            <figure key={id} style={{ margin: 0, textAlign: 'center' }}>
              <Avatar id={id} size={72} />
              <figcaption class="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                {AVATARS[id].label}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section class="card stack" aria-labelledby="type">
        <h2 id="type">Typografia</h2>
        <p class="jp" style={{ fontSize: 'var(--fs-kana)', lineHeight: 1 }}>
          あア
        </p>
        <p>Zażółć gęślą jaźń. ZAŻÓŁĆ GĘŚLĄ JAŹŃ.</p>
        <p class="muted">Tekst pomocniczy w kolorze stonowanym.</p>
        <p style={{ color: 'var(--accent-text)' }}>Akcent: vermilion shu.</p>
        <button class="btn btn--primary btn--block">Zaczynamy lekcję</button>
      </section>
    </main>
  );
}
