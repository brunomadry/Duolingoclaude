import sources from '../../content/SOURCES.json';
import { APP_NAME } from '../shared/constants.ts';

/** "Źródła i licencje", generated from content/SOURCES.json. */
export function LicensesScreen() {
  return (
    <div class="stack">
      <p class="muted">
        {APP_NAME} korzysta wyłącznie z otwartych zbiorów danych. Oto skąd pochodzą treści i na
        jakich zasadach z nich korzystamy.
      </p>
      {sources.sources.map((s) => (
        <article key={s.id} class="card source">
          <h2 style={{ fontSize: 'var(--fs-md)' }}>{s.name}</h2>
          <a class="source__license" href={s.licenseUrl} target="_blank" rel="noreferrer noopener">
            {s.license}
          </a>
          <p>{s.usedForPl}</p>
          <p class="muted" style={{ fontSize: 'var(--fs-sm)' }} lang="en">
            {s.attribution}
          </p>
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer noopener"
            style={{ fontSize: 'var(--fs-sm)' }}
          >
            {s.url.replace(/^https?:\/\//, '')}
          </a>
        </article>
      ))}
      <p class="muted" style={{ fontSize: 'var(--fs-sm)' }}>
        Maskotka Aka, notki gramatyczne i skojarzenia do kany są oryginalne, stworzone dla tej
        aplikacji.
      </p>
    </div>
  );
}
