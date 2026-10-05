import { useEffect, useRef, useState } from 'preact/hooks';
import type { KanjiItem } from '../../lesson/kanji.ts';
import type { WordItem } from '../../lesson/vocab.ts';
import { KanjiCard } from '../../ui/KanjiCard.tsx';

interface KanjiIntroProps {
  items: readonly KanjiItem[];
  words: ReadonlyMap<string, readonly WordItem[]>;
  onDone: () => void;
}

/** "Kanji": one card per new kanji, with the known words written with it. */
export function KanjiIntro({ items, words, onDone }: KanjiIntroProps) {
  const [page, setPage] = useState(0);
  const headingRef = useRef<HTMLParagraphElement>(null);
  const item = items[page];

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [page]);

  const go = (next: number) => {
    if (next >= items.length) onDone();
    else setPage(Math.max(0, next));
  };

  return (
    <div class="intro">
      <p ref={headingRef} class="exercise__prompt" tabIndex={-1}>
        Kanji {page + 1} z {items.length}
      </p>
      {item && (
        <div class="card card--elevated intro__word">
          <KanjiCard key={item.char} kanji={item} words={words.get(item.char) ?? []} />
        </div>
      )}
      <div class="intro__nav">
        <button class="btn" onClick={() => go(page - 1)} disabled={page === 0}>
          Wstecz
        </button>
        <button class="btn btn--primary" onClick={() => go(page + 1)}>
          {page + 1 >= items.length ? 'Ćwiczymy' : 'Dalej'}
        </button>
      </div>
    </div>
  );
}
