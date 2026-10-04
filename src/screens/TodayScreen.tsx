import { useEffect, useState } from 'preact/hooks';
import curriculum from '../../content/curriculum.json';
import { Mascot } from '../mascot/Mascot.tsx';
import { TOTAL_LESSONS } from '../shared/constants.ts';
import type { ProfileRecord } from '../shared/api.ts';
import { getLessons } from '../data/repo.ts';
import { appState, database } from '../state/app.ts';
import { useStore } from '../state/store.ts';
import { ToriiProgress } from '../ui/ToriiProgress.tsx';

function greeting(hour: number): string {
  if (hour < 5) return 'Dobranoc';
  if (hour < 18) return 'Dzień dobry';
  return 'Dobry wieczór';
}

export function TodayScreen({ profile }: { profile: ProfileRecord }) {
  const { dataVersion } = useStore(appState);
  const [completed, setCompleted] = useState(0);

  useEffect(() => {
    void getLessons(database(), profile.id).then((l) => setCompleted(l.length));
  }, [profile.id, dataVersion]);

  const nextN = Math.min(completed + 1, TOTAL_LESSONS);
  const next = curriculum.lessons[nextN - 1];

  return (
    <div class="stack">
      <div class="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div class="stack" style={{ gap: 'var(--space-1)' }}>
          <p class="jp muted" lang="ja">
            こんにちは
          </p>
          <h2 class="display" style={{ fontSize: 'var(--fs-xl)' }}>
            {greeting(new Date().getHours())}, {profile.name}
          </h2>
        </div>
        <Mascot pose={completed > 0 ? 'happy' : 'idle'} size={104} />
      </div>

      <section class="card stack" aria-label="Postęp kursu">
        <div class="progress-label">
          <span>
            <strong>Lekcja {nextN}</strong> z {TOTAL_LESSONS}
          </span>
          <span>{completed} ukończonych</span>
        </div>
        <ToriiProgress
          value={completed / TOTAL_LESSONS}
          label={`Ukończono ${completed} z ${TOTAL_LESSONS} lekcji`}
        />
      </section>

      {next && (
        <section class="card card--elevated stack waves" aria-labelledby="next-lesson">
          <span class="lesson-card__eyebrow">Następna lekcja · {next.n}</span>
          <h3 id="next-lesson" class="lesson-card__title">
            {next.title}
          </h3>
          <p class="muted">{next.summary}</p>
          <button class="btn btn--primary btn--block" disabled>
            Zaczynamy
          </button>
          <p class="setting__hint" style={{ textAlign: 'center' }}>
            Odtwarzacz lekcji pojawi się w następnej aktualizacji.
          </p>
        </section>
      )}
    </div>
  );
}
