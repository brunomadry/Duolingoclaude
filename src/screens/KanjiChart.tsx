import { useEffect, useMemo, useState } from 'preact/hooks';
import '../styles/alphabet.css';
import { loadKanji } from '../data/kanji-data.ts';
import { loadVocab } from '../data/vocab-data.ts';
import { kanjiWordsUpTo } from '../lesson/context.ts';
import { kanjiUpTo, type KanjiIndex, type KanjiItem } from '../lesson/kanji.ts';
import type { VocabIndex } from '../lesson/vocab.ts';
import { EmptyState } from '../ui/EmptyState.tsx';
import { KanjiCard } from '../ui/KanjiCard.tsx';
import { Modal } from '../ui/Modal.tsx';
import { KnownKanji } from '../ui/Written.tsx';

/** The N5 kanji in teaching order: taught ones highlighted, each opens its card. */
export function KanjiChart({ done }: { done: number }) {
  const [kanji, setKanji] = useState<KanjiIndex | null>(null);
  const [vocab, setVocab] = useState<VocabIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<KanjiItem | null>(null);

  useEffect(() => {
    Promise.all([loadKanji(), loadVocab()]).then(
      ([k, v]) => {
        setKanji(k);
        setVocab(v);
      },
      () => setFailed(true),
    );
  }, []);

  const known = useMemo(() => (kanji ? kanjiUpTo(kanji, done) : new Set<string>()), [kanji, done]);
  const words = useMemo(() => (vocab ? kanjiWordsUpTo(vocab, done) : new Map()), [vocab, done]);

  if (failed) {
    return (
      <EmptyState
        title="Kanji się nie wczytały"
        text="Sprawdź połączenie z internetem i spróbuj jeszcze raz."
        pose="sleepy"
      />
    );
  }
  if (!kanji) return <div aria-busy="true" />;

  return (
    <KnownKanji.Provider value={known}>
      <div class="alphabet-stats" aria-live="polite">
        <span>
          Poznane kanji: {known.size} z {kanji.items.length}
        </span>
        <span>Dotknij znaku</span>
      </div>
      {known.size === 0 && (
        <p class="setting__hint">
          Pierwsze kanji pojawią się w lekcji {kanji.items[0]?.lesson ?? ''}. Do tego czasu słówka
          zapisujemy kaną.
        </p>
      )}
      <div class="kana-grid kana-grid--5">
        {kanji.items.map((k) => {
          const learned = known.has(k.char);
          return (
            <button
              key={k.char}
              class={`kana-cell ${learned ? 'kana-cell--learned' : 'kana-cell--new'}`}
              onClick={() => setSelected(k)}
              aria-label={`${k.char}, ${k.pl[0] ?? ''}${learned ? '' : `, lekcja ${k.lesson ?? ''}`}`}
            >
              <span class="kana-cell__char" lang="ja" aria-hidden="true">
                {k.char}
              </span>
              <span class="kana-cell__romaji" aria-hidden="true">
                {learned ? (k.pl[0] ?? '') : `L${k.lesson ?? ''}`}
              </span>
            </button>
          );
        })}
      </div>
      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.char ?? ''}
        hideTitle
      >
        {selected && (
          <div class="stack">
            <KanjiCard kanji={selected} words={words.get(selected.char) ?? []} />
            {!known.has(selected.char) && (
              <p class="setting__hint">Ten znak pojawi się w lekcji {selected.lesson}.</p>
            )}
          </div>
        )}
      </Modal>
    </KnownKanji.Provider>
  );
}
