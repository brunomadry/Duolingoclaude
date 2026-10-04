import { useEffect, useState } from 'preact/hooks';
import '../styles/lesson.css';
import { navigate } from '../app/router.ts';
import type { LessonProgressRecord, ProfileRecord } from '../shared/api.ts';
import { TOTAL_LESSONS } from '../shared/constants.ts';
import { getLessons } from '../data/repo.ts';
import { curriculum } from '../lesson/context.ts';
import { appState, database } from '../state/app.ts';
import { useStore } from '../state/store.ts';
import { Hanko } from '../ui/Hanko.tsx';
import { Modal } from '../ui/Modal.tsx';

function formatDate(ms: number, timeZone: string): string {
  return new Date(ms).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  });
}

/** Stamp collection: one hanko per completed lesson, empty slots for the rest. */
export function StampsScreen({ profile }: { profile: ProfileRecord }) {
  const { dataVersion } = useStore(appState);
  const [done, setDone] = useState<Map<number, LessonProgressRecord>>(new Map());
  const [selected, setSelected] = useState<LessonProgressRecord | null>(null);

  useEffect(() => {
    void getLessons(database(), profile.id).then((l) => setDone(new Map(l.map((x) => [x.n, x]))));
  }, [profile.id, dataVersion]);

  const selectedLesson = selected ? curriculum.lessons[selected.n - 1] : undefined;

  return (
    <div class="stack">
      <p class="muted">
        Pieczątki: <strong style={{ color: 'var(--text)' }}>{done.size}</strong> z {TOTAL_LESSONS}.
        Każda ukończona lekcja zostawia tu swoje hanko.
      </p>
      <ol class="stamp-grid" aria-label="Kolekcja pieczątek">
        {Array.from({ length: TOTAL_LESSONS }, (_, i) => i + 1).map((n) => {
          const record = done.get(n);
          const test = curriculum.lessons[n - 1]?.kind === 'test';
          return (
            <li key={n}>
              {record ? (
                <button
                  onClick={() => setSelected(record)}
                  aria-label={`Lekcja ${n}, ukończona. Szczegóły`}
                >
                  <Hanko n={n} size={60} test={test} label="" />
                </button>
              ) : (
                <span aria-label={`Lekcja ${n}, jeszcze przed Tobą`} role="img">
                  <Hanko n={n} size={52} empty />
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? `Lekcja ${selected.n}` : ''}
        variant="dialog"
      >
        {selected && (
          <div class="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
            <Hanko n={selected.n} size={110} test={selectedLesson?.kind === 'test'} />
            <p class="display" style={{ fontSize: 'var(--fs-lg)' }}>
              {selectedLesson?.title}
            </p>
            <p class="muted">
              Ukończono {formatDate(selected.completedAt, profile.settings.timeZone)}
              {selected.score !== null ? `, wynik ${Math.round(selected.score * 100)}%` : ''}.
            </p>
            <button
              class="btn btn--primary btn--block"
              onClick={() => {
                setSelected(null);
                navigate(`/lekcja/${selected.n}`);
              }}
            >
              Powtórz lekcję
            </button>
            <p class="setting__hint">Powtórka lekcji nie zmienia odblokowania kolejnych.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
