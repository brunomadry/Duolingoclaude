import { useEffect, useState } from 'preact/hooks';
import '../styles/vocab.css';
import { ReportDialog } from '../app/ReportDialog.tsx';
import { loadCourse, type CourseData } from '../data/course-data.ts';
import { loadKanji } from '../data/kanji-data.ts';
import { kanjiUpTo, type KanjiIndex } from '../lesson/kanji.ts';
import { loadLearning, type LearningSnapshot } from '../data/learning.ts';
import { GRAMMAR_AVAILABLE, completedPrefix } from '../lesson/context.ts';
import type { GrammarNoteItem } from '../lesson/grammar.ts';
import { romajiDisplay } from '../lesson/romaji.ts';
import type { ProfileRecord } from '../shared/api.ts';
import { appState, database } from '../state/app.ts';
import { useStore } from '../state/store.ts';
import { EmptyState } from '../ui/EmptyState.tsx';
import { GrammarNoteView } from '../ui/GrammarNoteView.tsx';
import { MixedText } from '../ui/MixedText.tsx';
import { Modal } from '../ui/Modal.tsx';
import { KnownKanji } from '../ui/Written.tsx';

export function GrammarScreen({ profile }: { profile: ProfileRecord }) {
  const { dataVersion } = useStore(appState);
  const [snap, setSnap] = useState<LearningSnapshot | null>(null);
  const [course, setCourse] = useState<CourseData | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<GrammarNoteItem | null>(null);
  const [reporting, setReporting] = useState(false);
  const [kanji, setKanji] = useState<KanjiIndex | null>(null);

  useEffect(() => {
    void loadLearning(database(), profile.id).then(setSnap);
  }, [profile.id, dataVersion]);

  useEffect(() => {
    if (GRAMMAR_AVAILABLE) loadCourse().then(setCourse, () => setFailed(true));
    loadKanji().then(setKanji, () => undefined);
  }, []);

  if (!GRAMMAR_AVAILABLE) {
    return (
      <EmptyState
        title="Gramatyka czeka"
        text="Notki gramatyczne odblokują się, gdy dojdziesz do pierwszych zdań."
        pose="idle"
      />
    );
  }
  if (failed) {
    return (
      <EmptyState
        title="Notki się nie wczytały"
        text="Sprawdź połączenie z internetem i otwórz tę zakładkę jeszcze raz."
        pose="sleepy"
      />
    );
  }
  if (!snap || !course) return <div aria-busy="true" />;

  const done = completedPrefix(snap.lessons);
  const notes = [...course.grammar.notes.values()].sort((a, b) => a.lesson - b.lesson);
  const open = notes.filter((n) => n.lesson <= done);
  const display = romajiDisplay(profile.settings.romaji, done + 1);

  return (
    <KnownKanji.Provider value={kanji ? kanjiUpTo(kanji, done) : new Set()}>
      <div class="stack">
        <p class="setting__hint">
          {open.length
            ? `Poznane punkty gramatyki: ${open.length} z ${notes.length}. Notkę można otworzyć po lekcji, która ją wprowadza.`
            : `Pierwsza notka pojawi się w lekcji ${notes[0]?.lesson ?? ''}.`}
        </p>
        <div class="list">
          {notes.map((n) => {
            const unlocked = n.lesson <= done;
            return (
              <button
                key={n.id}
                class={`list__item grammar-row${unlocked ? '' : ' is-locked'}`}
                disabled={!unlocked}
                onClick={() => setSelected(n)}
                aria-label={`${n.title}, lekcja ${n.lesson}${unlocked ? '' : ', jeszcze zamknięta'}`}
              >
                <span class="grow" aria-hidden="true">
                  <span class="grammar-row__title">
                    <MixedText text={n.title} />
                  </span>
                  <span class="grammar-row__pattern">
                    <MixedText text={n.pattern} />
                  </span>
                </span>
                <span class="chip" aria-hidden="true">
                  L{n.lesson}
                </span>
              </button>
            );
          })}
        </div>

        <Modal
          open={selected !== null}
          onClose={() => setSelected(null)}
          title={selected?.title ?? 'Gramatyka'}
        >
          {selected && (
            <div class="stack">
              <GrammarNoteView note={selected} display={display} />
              {!selected.reviewed && (
                <p class="setting__hint">
                  Notka napisana dla tej aplikacji i jeszcze nie sprawdzona przez nauczyciela. Jeśli
                  coś się nie zgadza, daj znać.
                </p>
              )}
              <button class="btn btn--ghost" onClick={() => setReporting(true)}>
                Zgłoś błąd w notce
              </button>
            </div>
          )}
        </Modal>
        <ReportDialog
          open={reporting}
          onClose={() => setReporting(false)}
          sentence={selected?.title ?? ''}
          context={`gramatyka:${selected?.id ?? ''}`}
          lessonN={selected?.lesson ?? null}
        />
      </div>
    </KnownKanji.Provider>
  );
}
