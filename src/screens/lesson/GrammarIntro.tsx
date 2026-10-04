import { useEffect, useRef, useState } from 'preact/hooks';
import type { GrammarNoteItem } from '../../lesson/grammar.ts';
import type { RomajiDisplay } from '../../lesson/romaji.ts';
import { GrammarNoteView } from '../../ui/GrammarNoteView.tsx';

interface GrammarIntroProps {
  note: GrammarNoteItem;
  display: RomajiDisplay;
  onDone: () => void;
}

const PAGES = ['explain', 'examples'] as const;

/** "Nowa rzecz" for grammar lessons: the explanation, then examples and the typical mistake. */
export function GrammarIntro({ note, display, onDone }: GrammarIntroProps) {
  const [page, setPage] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [page]);

  const go = (next: number) => {
    if (next >= PAGES.length) onDone();
    else setPage(Math.max(0, next));
  };

  return (
    <div class="intro">
      <h2 ref={headingRef} class="grammar-intro__title" tabIndex={-1}>
        {note.title}
      </h2>
      <div class="card card--elevated intro__word">
        <GrammarNoteView note={note} display={display} part={PAGES[page] ?? 'explain'} />
      </div>
      <div class="intro__nav">
        <button class="btn" onClick={() => go(page - 1)} disabled={page === 0}>
          Wstecz
        </button>
        <button class="btn btn--primary" onClick={() => go(page + 1)}>
          {page + 1 >= PAGES.length ? 'Dalej' : 'Przykłady'}
        </button>
      </div>
    </div>
  );
}
