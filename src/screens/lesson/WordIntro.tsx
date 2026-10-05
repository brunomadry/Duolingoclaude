import { useEffect, useRef, useState } from 'preact/hooks';
import type { RomajiDisplay } from '../../lesson/romaji.ts';
import type { WordItem } from '../../lesson/vocab.ts';
import { WordCard } from '../../ui/WordCard.tsx';

interface WordIntroProps {
  words: readonly WordItem[];
  display: RomajiDisplay;
  onDone: () => void;
}

/** "Nowe słówka": one card per new word, then on to practice. */
export function WordIntro({ words, display, onDone }: WordIntroProps) {
  const [page, setPage] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const word = words[page];

  // Each new page starts at its heading for VoiceOver.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [page]);

  const go = (next: number) => {
    if (next >= words.length) onDone();
    else setPage(Math.max(0, next));
  };

  return (
    <div class="intro">
      <h2 ref={headingRef} class="exercise__prompt" tabIndex={-1}>
        Słówko {page + 1} z {words.length}
      </h2>
      {word && (
        <div class="card card--elevated intro__word">
          <WordCard key={word.id} word={word} display={display} />
        </div>
      )}
      <div class="intro__nav">
        <button class="btn" onClick={() => go(page - 1)} disabled={page === 0}>
          Wstecz
        </button>
        <button class="btn btn--primary" onClick={() => go(page + 1)}>
          {page + 1 >= words.length ? 'Ćwiczymy' : 'Dalej'}
        </button>
      </div>
    </div>
  );
}
