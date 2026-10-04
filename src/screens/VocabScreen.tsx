import { useEffect, useMemo, useState } from 'preact/hooks';
import '../styles/vocab.css';
import { navigate } from '../app/router.ts';
import { cardState, loadLearning, type LearningSnapshot } from '../data/learning.ts';
import { loadVocab } from '../data/vocab-data.ts';
import { completedPrefix, dueReviews } from '../lesson/context.ts';
import { romajiDisplay, type RomajiDisplay } from '../lesson/romaji.ts';
import { localDaysBetween } from '../lesson/schedule.ts';
import {
  searchWords,
  vocabCardId,
  wordsUpTo,
  type VocabIndex,
  type WordItem,
} from '../lesson/vocab.ts';
import { plural } from '../lib/plural.ts';
import type { ProfileRecord } from '../shared/api.ts';
import { appState, database } from '../state/app.ts';
import { useStore } from '../state/store.ts';
import { EmptyState } from '../ui/EmptyState.tsx';
import { Modal } from '../ui/Modal.tsx';
import { Segmented } from '../ui/Segmented.tsx';
import { WordCard } from '../ui/WordCard.tsx';

type View = 'mine' | 'all';

const MAX_RESULTS = 100;

/** Goju-on row of a word's first kana (dictionary section headers). */
const ROWS = [
  ['あ', 'あいうえおぁぃぅぇぉ'],
  ['か', 'かきくけこがぎぐげご'],
  ['さ', 'さしすせそざじずぜぞ'],
  ['た', 'たちつてとだぢづでどっ'],
  ['な', 'なにぬねの'],
  ['は', 'はひふへほばびぶべぼぱぴぷぺぽ'],
  ['ま', 'まみむめも'],
  ['や', 'やゆよゃゅょ'],
  ['ら', 'らりるれろ'],
  ['わ', 'わをん'],
] as const;

export function kanaRow(kana: string): string {
  const first = (kana[0] ?? '').replace(/[ァ-ヶ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0x60),
  );
  return ROWS.find(([, chars]) => chars.includes(first))?.[0] ?? '…';
}

interface Section {
  key: string;
  title: string;
  words: WordItem[];
}

function sectionsOf(words: readonly WordItem[], view: View): Section[] {
  const sections: Section[] = [];
  for (const w of words) {
    const key = view === 'mine' ? `l${w.lesson ?? 0}` : kanaRow(w.kana);
    let section = sections.find((s) => s.key === key);
    if (!section) {
      section = { key, title: view === 'mine' ? `Lekcja ${w.lesson ?? ''}` : key, words: [] };
      sections.push(section);
    }
    section.words.push(w);
  }
  return sections;
}

/** "Nowe słówko", "Do powtórki teraz", "Następna powtórka za 3 dni"... */
export function reviewStatus(
  word: WordItem,
  snap: LearningSnapshot,
  done: number,
  now: number,
  timeZone: string,
): string {
  if (word.lesson === null) return 'Słówko dodatkowe, spoza lekcji, więc nie trafia do powtórek.';
  if (word.lesson > done) return `Poznasz je w lekcji ${word.lesson}.`;
  const state = cardState(snap.cards.get(vocabCardId(word.id)));
  if (!state) return 'Jeszcze bez powtórek.';
  if (state.due <= now) return 'Czeka na powtórkę.';
  const days = localDaysBetween(now, state.due, timeZone);
  if (days <= 0) return 'Następna powtórka jeszcze dziś.';
  if (days === 1) return 'Następna powtórka jutro.';
  return `Następna powtórka za ${plural(days, 'dzień', 'dni', 'dni')}.`;
}

function WordRow({
  word,
  view,
  onOpen,
}: {
  word: WordItem;
  view: View;
  onOpen: (w: WordItem) => void;
}) {
  const badge = view === 'all' ? (word.lesson === null ? '+' : `L${word.lesson}`) : null;
  return (
    <button
      class="list__item word-row"
      onClick={() => onOpen(word)}
      aria-label={`${word.kana}${word.kanji ? `, ${word.kanji}` : ''}: ${word.pl[0] ?? ''}${
        badge ? (word.lesson === null ? ', słówko dodatkowe' : `, lekcja ${word.lesson}`) : ''
      }`}
    >
      <span class="word-row__ja" aria-hidden="true">
        <span class="word-row__kana jp" lang="ja">
          {word.kana}
        </span>
        {word.kanji && (
          <span class="word-row__kanji jp" lang="ja">
            {word.kanji}
          </span>
        )}
      </span>
      <span class="word-row__pl grow" aria-hidden="true">
        {word.pl[0]}
      </span>
      {badge && (
        <span class="chip word-row__badge" aria-hidden="true">
          {badge}
        </span>
      )}
    </button>
  );
}

export function VocabScreen({ profile }: { profile: ProfileRecord }) {
  const { dataVersion } = useStore(appState);
  const [snap, setSnap] = useState<LearningSnapshot | null>(null);
  const [vocab, setVocab] = useState<VocabIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>('mine');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<WordItem | null>(null);

  useEffect(() => {
    void loadLearning(database(), profile.id).then(setSnap);
  }, [profile.id, dataVersion]);

  useEffect(() => {
    loadVocab().then(setVocab, () => setFailed(true));
  }, []);

  const done = snap ? completedPrefix(snap.lessons) : 0;
  const mine = useMemo(() => (vocab ? [...wordsUpTo(vocab, done)].reverse() : []), [vocab, done]);
  const results = useMemo(
    () => searchWords(view === 'mine' ? mine : (vocab?.words ?? []), query),
    [view, mine, vocab, query],
  );

  if (failed) {
    return (
      <EmptyState
        title="Słówka się nie wczytały"
        text="Sprawdź połączenie z internetem i otwórz tę zakładkę jeszcze raz."
        pose="sleepy"
      />
    );
  }
  if (!snap || !vocab) return <div aria-busy="true" />;

  const now = Date.now();
  const display: RomajiDisplay = romajiDisplay(profile.settings.romaji, done + 1);
  const due = dueReviews(snap.cards, now, { filter: 'words' }).dueTotal;
  const firstLesson = Math.min(...vocab.byLesson.keys(), done + 1);
  const searching = query.trim().length > 0;
  const shown = searching ? results.slice(0, MAX_RESULTS) : results;

  return (
    <div class="stack">
      <Segmented<View>
        label="Widok słówek"
        value={view}
        options={[
          { value: 'mine', label: 'Moje słówka' },
          { value: 'all', label: 'Słownik N5' },
        ]}
        onChange={(v) => {
          setView(v);
          setQuery('');
        }}
      />

      {view === 'mine' && (
        <section class="card stack" aria-labelledby="vocab-summary">
          <div class="row" style={{ justifyContent: 'space-between' }}>
            <h2 id="vocab-summary" style={{ fontSize: 'var(--fs-md)' }}>
              Znasz {plural(mine.length, 'słówko', 'słówka', 'słówek')}
            </h2>
          </div>
          <p class="setting__hint">
            {due
              ? `Do powtórki: ${plural(due, 'słówko', 'słówka', 'słówek')}.`
              : mine.length
                ? 'Na razie nic do powtórki.'
                : `Pierwsze słówka pojawią się w lekcji ${firstLesson}.`}
          </p>
          <div class="vocab-actions">
            <button
              class="btn btn--primary"
              disabled={!due}
              onClick={() => navigate('/powtorki/slowka')}
            >
              Powtórz słówka
            </button>
            <button
              class="btn"
              disabled={mine.length < 4}
              onClick={() => navigate('/cwicz/slowka')}
            >
              Ćwicz słówka
            </button>
          </div>
        </section>
      )}

      {(view === 'all' || mine.length > 0) && (
        <div class="field">
          <label class="visually-hidden" for="vocab-search">
            Szukaj słówka
          </label>
          <input
            id="vocab-search"
            class="input"
            type="search"
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
            placeholder="Szukaj: kana, romaji albo po polsku"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellcheck={false}
            enterKeyHint="search"
          />
        </div>
      )}

      {view === 'all' && !searching && (
        <p class="setting__hint">
          Wszystkie słówka N5 w kursie: {vocab.words.length}. Oznaczenie L12 to lekcja, w której się
          pojawiają, a plus to słówka dodatkowe, spoza lekcji.
        </p>
      )}

      {searching && (
        <p class="setting__hint" role="status">
          {results.length
            ? `Wyniki: ${results.length}${results.length > MAX_RESULTS ? ` (pokazano ${MAX_RESULTS})` : ''}`
            : 'Nic nie znaleziono.'}
        </p>
      )}

      {view === 'mine' && !mine.length ? (
        <EmptyState
          title="Jeszcze pusto"
          text="Słówka będą się tu zbierać lekcja po lekcji, razem z powtórkami."
          pose="sleepy"
        />
      ) : searching ? (
        <div class="list">
          {shown.map((w) => (
            <WordRow key={w.id} word={w} view={view} onOpen={setSelected} />
          ))}
        </div>
      ) : (
        sectionsOf(shown, view).map((s) => (
          <section key={s.key} aria-label={view === 'all' ? `Słówka na ${s.title}` : s.title}>
            <h3 class={`section-label${view === 'all' ? ' jp' : ''}`}>{s.title}</h3>
            <div class="list">
              {s.words.map((w) => (
                <WordRow key={w.id} word={w} view={view} onOpen={setSelected} />
              ))}
            </div>
          </section>
        ))
      )}

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? selected.kana : 'Słówko'}
      >
        {selected && (
          <WordCard word={selected} display={display}>
            <p class="setting__hint">
              {reviewStatus(selected, snap, done, now, profile.settings.timeZone)}
            </p>
          </WordCard>
        )}
      </Modal>
    </div>
  );
}
