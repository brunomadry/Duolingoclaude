import { useEffect, useState } from 'preact/hooks';
import { navigate } from '../app/router.ts';
import { loadLearning, type LearningSnapshot } from '../data/learning.ts';
import { curriculum, dueKana } from '../lesson/context.ts';
import { describeNextUnlock, localDaysBetween } from '../lesson/schedule.ts';
import { computeUnlock } from '../lesson/unlock.ts';
import { Mascot } from '../mascot/Mascot.tsx';
import type { Pose } from '../mascot/parts.ts';
import { TOTAL_LESSONS } from '../shared/constants.ts';
import type { ProfileRecord } from '../shared/api.ts';
import { appState, database } from '../state/app.ts';
import { useStore } from '../state/store.ts';
import { Hanko } from '../ui/Hanko.tsx';
import { ToriiProgress } from '../ui/ToriiProgress.tsx';

function greeting(hour: number): string {
  if (hour < 5) return 'Dobranoc';
  if (hour < 18) return 'Dzień dobry';
  return 'Dobry wieczór';
}

/** Re-render at the next minute boundary so unlock states flip at midnight without a reload. */
function useMinuteClock(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function TodayScreen({ profile }: { profile: ProfileRecord }) {
  const { dataVersion } = useStore(appState);
  const [snap, setSnap] = useState<LearningSnapshot | null>(null);
  const now = useMinuteClock();
  const tz = profile.settings.timeZone;

  useEffect(() => {
    void loadLearning(database(), profile.id).then(setSnap);
  }, [profile.id, dataVersion]);

  if (!snap) return <div aria-busy="true" />;

  const unlock = computeUnlock({
    completions: snap.lessons,
    pace: profile.settings.pace,
    timeZone: tz,
    now,
  });
  const next = unlock.nextN ? curriculum.lessons[unlock.nextN - 1] : undefined;
  const due = dueKana(snap.cards, now);
  const doneToday = snap.lessons.some((l) => localDaysBetween(l.completedAt, now, tz) === 0);
  const recent = [...snap.lessons].sort((a, b) => b.completedAt - a.completedAt).slice(0, 5);
  const pose: Pose = !next
    ? 'celebrating'
    : doneToday
      ? 'happy'
      : unlock.nextUnlocked
        ? 'idle'
        : 'sleepy';
  const lessonLabel = unlock.nextN ?? TOTAL_LESSONS;

  return (
    <div class="stack">
      <div class="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div class="stack" style={{ gap: 'var(--space-1)' }}>
          <p class="jp muted" lang="ja">
            こんにちは
          </p>
          <h2 class="display" style={{ fontSize: 'var(--fs-xl)' }}>
            {greeting(new Date(now).getHours())}, {profile.name}
          </h2>
        </div>
        <Mascot pose={pose} size={104} />
      </div>

      <section class="card stack" aria-label="Postęp kursu">
        <div class="progress-label">
          <span>
            <strong>Lekcja {lessonLabel}</strong> z {TOTAL_LESSONS}
          </span>
          <span>Ukończone: {unlock.completedCount}</span>
        </div>
        <ToriiProgress
          value={unlock.completedCount / TOTAL_LESSONS}
          label={`Ukończono ${unlock.completedCount} z ${TOTAL_LESSONS} lekcji`}
        />
      </section>

      {next ? (
        <section class="card card--elevated stack waves" aria-labelledby="next-lesson">
          <span class="lesson-card__eyebrow">
            {next.kind === 'test' ? 'Test' : 'Lekcja'} {next.n}
            {unlock.nextUnlocked ? '' : ' · jeszcze zamknięta'}
          </span>
          <h3 id="next-lesson" class="lesson-card__title">
            {next.title}
          </h3>
          <p class="muted">{next.summary}</p>
          {unlock.nextUnlocked ? (
            <button
              class="btn btn--primary btn--block"
              onClick={() => navigate(`/lekcja/${next.n}`)}
            >
              {doneToday ? 'Jeszcze jedna? Zaczynamy' : 'Zaczynamy'}
            </button>
          ) : (
            <p class="setting__hint">{describeNextUnlock(unlock, now, tz)}</p>
          )}
        </section>
      ) : (
        <section class="card stack" style={{ textAlign: 'center' }}>
          <h3 class="lesson-card__title">Kurs ukończony</h3>
          <p class="muted">
            Wszystkie lekcje za Tobą. Powtórki nadal czekają, żeby wiedza została.
          </p>
        </section>
      )}

      <section class="card stack" aria-labelledby="reviews-title">
        <div class="row" style={{ justifyContent: 'space-between' }}>
          <h3 id="reviews-title" style={{ fontSize: 'var(--fs-md)' }}>
            Zaległe powtórki
          </h3>
          <strong class="display" style={{ fontSize: 'var(--fs-lg)' }}>
            {due.dueTotal}
          </strong>
        </div>
        <p class="setting__hint">
          {due.dueTotal
            ? 'Krótka sesja, maksymalnie kilka minut. Reszta poczeka.'
            : 'Na razie nic do powtórki. Pamięć ma się dobrze.'}
        </p>
        <div class="row">
          <button
            class="btn grow"
            style={{ flex: 1 }}
            disabled={!due.dueTotal}
            onClick={() => navigate('/powtorki')}
          >
            Powtórz teraz
          </button>
          <button
            class="btn grow"
            style={{ flex: 1 }}
            disabled={unlock.completedCount === 0}
            onClick={() => navigate('/cwicz')}
          >
            Ćwicz dodatkowo
          </button>
        </div>
      </section>

      <section class="card stack" aria-labelledby="stamps-title">
        <div class="row" style={{ justifyContent: 'space-between' }}>
          <h3 id="stamps-title" style={{ fontSize: 'var(--fs-md)' }}>
            Pieczątki
          </h3>
          <span class="muted">
            {snap.lessons.length} z {TOTAL_LESSONS}
          </span>
        </div>
        {recent.length ? (
          <div class="row" style={{ flexWrap: 'wrap' }}>
            {recent.map((l) => (
              <Hanko
                key={l.n}
                n={l.n}
                size={52}
                test={curriculum.lessons[l.n - 1]?.kind === 'test'}
              />
            ))}
          </div>
        ) : (
          <p class="setting__hint">Pierwsza hanko pojawi się po pierwszej lekcji.</p>
        )}
        <button class="btn btn--ghost" onClick={() => navigate('/pieczatki')}>
          Zobacz kolekcję
        </button>
      </section>
    </div>
  );
}
