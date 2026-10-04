import { useEffect, useMemo, useState } from 'preact/hooks';
import '../styles/alphabet.css';
import { navigate } from '../app/router.ts';
import { ReportDialog } from '../app/ReportDialog.tsx';
import { loadLearning, type LearningSnapshot } from '../data/learning.ts';
import { completedPrefix, dueReviews, kanaUpTo } from '../lesson/context.ts';
import { kanaGroups } from '../lesson/kana.ts';
import type { KanaGroup } from '../shared/content-schema.ts';
import type { ProfileRecord } from '../shared/api.ts';
import { appState, database } from '../state/app.ts';
import { useStore } from '../state/store.ts';
import { Modal } from '../ui/Modal.tsx';
import { Segmented } from '../ui/Segmented.tsx';
import { SpeakButton } from '../ui/SpeakButton.tsx';
import { StrokeOrder } from '../ui/StrokeOrder.tsx';
import { MixedText } from '../ui/MixedText.tsx';

type Script = 'hiragana' | 'katakana';
type View = 'chart' | 'practice';
type KanaChar = KanaGroup['chars'][number];

interface Selected {
  char: KanaChar;
  group: KanaGroup;
}

const SECTIONS: { title: string; kinds: KanaGroup['kind'][]; columns: 3 | 5 }[] = [
  { title: 'Podstawowe', kinds: ['basic'], columns: 5 },
  { title: 'Z kreskami (dakuten)', kinds: ['dakuten'], columns: 5 },
  { title: 'Połączenia (yōon)', kinds: ['yoon'], columns: 3 },
  {
    title: 'Małe っ, długie samogłoski i dźwięki obce',
    kinds: ['small-tsu', 'long-vowel', 'extended'],
    columns: 3,
  },
];

/**
 * Lays chars out in goju-on rows using `col` (0..4). A new row starts whenever the
 * column does not advance; chars without a column (ん) get their own row.
 */
export function gojuonRows(chars: readonly KanaChar[]): (KanaChar | null)[][] {
  const rows: (KanaChar | null)[][] = [];
  let row: (KanaChar | null)[] | null = null;
  let last = -1;
  const loose: KanaChar[] = [];
  for (const c of chars) {
    if (c.col === undefined) {
      loose.push(c);
      continue;
    }
    if (!row || c.col <= last) {
      row = [null, null, null, null, null];
      rows.push(row);
    }
    row[c.col] = c;
    last = c.col;
  }
  for (const c of loose) rows.push([c, null, null, null, null]);
  return rows;
}

function chunk<T>(items: readonly T[], size: number): (T | null)[][] {
  const rows: (T | null)[][] = [];
  for (let i = 0; i < items.length; i += size) {
    const row: (T | null)[] = items.slice(i, i + size);
    while (row.length < size) row.push(null);
    rows.push(row);
  }
  return rows;
}

export function AlphabetScreen({ profile }: { profile: ProfileRecord }) {
  const { dataVersion } = useStore(appState);
  const [script, setScript] = useState<Script>('hiragana');
  const [view, setView] = useState<View>('chart');
  const [snap, setSnap] = useState<LearningSnapshot | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    void loadLearning(database(), profile.id).then(setSnap);
  }, [profile.id, dataVersion]);

  const learned = useMemo(
    () => new Set(snap ? kanaUpTo(completedPrefix(snap.lessons)).map((i) => i.char) : []),
    [snap],
  );
  const groups = kanaGroups().filter((g) => g.script === script);
  const total = groups.reduce((sum, g) => sum + g.chars.length, 0);
  const known = groups.reduce(
    (sum, g) => sum + g.chars.filter((c) => learned.has(c.char)).length,
    0,
  );
  const due = snap ? dueReviews(snap.cards, Date.now(), { filter: 'kana' }).dueTotal : 0;

  const cell = (c: KanaChar | null, group: KanaGroup, key: string) =>
    c ? (
      <button
        key={key}
        class={`kana-cell ${learned.has(c.char) ? 'kana-cell--learned' : 'kana-cell--new'}`}
        onClick={() => setSelected({ char: c, group })}
        aria-label={`${c.char}, ${c.romaji}${learned.has(c.char) ? '' : ', jeszcze niepoznany'}`}
      >
        <span class="kana-cell__char" lang="ja" aria-hidden="true">
          {c.char}
        </span>
        <span class="kana-cell__romaji" aria-hidden="true">
          {c.romaji}
        </span>
      </button>
    ) : (
      <span key={key} class="kana-gap" aria-hidden="true" />
    );

  return (
    <div class="stack">
      <Segmented
        label="Alfabet"
        value={script}
        onChange={setScript}
        options={[
          { value: 'hiragana', label: 'Hiragana' },
          { value: 'katakana', label: 'Katakana' },
        ]}
      />
      <Segmented
        label="Widok"
        value={view}
        onChange={setView}
        options={[
          { value: 'chart', label: 'Tabela' },
          { value: 'practice', label: 'Ćwiczenia' },
        ]}
      />
      <div class="alphabet-stats" aria-live="polite">
        <span>
          Poznane znaki: {known} z {total}
        </span>
        <span>Dotknij znaku</span>
      </div>

      {view === 'chart' ? (
        SECTIONS.map((section) => {
          const sectionGroups = groups.filter((g) => section.kinds.includes(g.kind));
          if (!sectionGroups.length) return null;
          return (
            <section key={section.title} class="kana-section" aria-label={section.title}>
              <h2 class="kana-section__title">{section.title}</h2>
              <div class={`kana-grid kana-grid--${section.columns}`}>
                {sectionGroups.flatMap((g) =>
                  (section.columns === 5 ? gojuonRows(g.chars) : chunk(g.chars, 3)).flatMap(
                    (row, r) => row.map((c, i) => cell(c, g, `${g.id}-${r}-${i}`)),
                  ),
                )}
              </div>
            </section>
          );
        })
      ) : (
        <section class="card stack">
          <h2 class="display" style={{ fontSize: 'var(--fs-lg)' }}>
            Ćwiczenia z kany
          </h2>
          <p class="muted">
            Dodatkowe ćwiczenia ze wszystkich poznanych znaków. Nie wpływają na odblokowanie lekcji,
            więc ćwicz, ile chcesz.
          </p>
          <button
            class="btn btn--primary btn--block"
            disabled={learned.size < 4}
            onClick={() => navigate('/cwicz/kana')}
          >
            Ćwicz rozpoznawanie i pisanie
          </button>
          <button class="btn btn--block" disabled={!due} onClick={() => navigate('/powtorki/kana')}>
            Powtórki ({due})
          </button>
          {learned.size < 4 && (
            <p class="setting__hint">Ćwiczenia odblokują się po pierwszej lekcji.</p>
          )}
        </section>
      )}

      <Modal
        open={selected !== null && !reporting}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.char.char} (${selected.char.romaji})` : ''}
        hideTitle
      >
        {selected && (
          <div class="kana-detail">
            {[...selected.char.char].length === 1 ? (
              <StrokeOrder char={selected.char.char} size={200} />
            ) : (
              <span class="kana-detail__char" lang="ja">
                {selected.char.char}
              </span>
            )}
            <div class="row" style={{ justifyContent: 'center' }}>
              <span class="kana-detail__romaji">{selected.char.romaji}</span>
              <SpeakButton text={selected.char.char} />
            </div>
            {selected.char.alt?.length ? (
              <p class="setting__hint">
                Przy wpisywaniu zaliczamy też: {selected.char.alt.join(', ')}
              </p>
            ) : null}
            {selected.char.mnemonic && (
              <p>
                <MixedText text={selected.char.mnemonic.pl} />
              </p>
            )}
            {selected.group.note && (
              <p class="muted">
                <MixedText text={selected.group.note.pl} />
              </p>
            )}
            {!learned.has(selected.char.char) && (
              <p class="setting__hint">Ten znak pojawi się w jednej z kolejnych lekcji.</p>
            )}
            <button class="btn btn--ghost" onClick={() => setReporting(true)}>
              Zgłoś błąd
            </button>
          </div>
        )}
      </Modal>
      <ReportDialog
        open={reporting}
        onClose={() => setReporting(false)}
        sentence={selected?.char.char ?? ''}
        context="alfabet"
      />
    </div>
  );
}
