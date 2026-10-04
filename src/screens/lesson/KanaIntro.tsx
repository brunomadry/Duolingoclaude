import { useState } from 'preact/hooks';
import type { KanaItem } from '../../lesson/engine.ts';
import { findKana, groupById } from '../../lesson/kana.ts';
import { SpeakButton } from '../../ui/SpeakButton.tsx';
import { StrokeOrder } from '../../ui/StrokeOrder.tsx';
import { MixedText } from '../../ui/MixedText.tsx';

interface KanaIntroProps {
  items: readonly KanaItem[];
  groupIds: readonly string[];
  onDone: () => void;
}

/** "Nowa rzecz" for kana lessons: an optional group note, then one card per character. */
export function KanaIntro({ items, groupIds, onDone }: KanaIntroProps) {
  const notes = groupIds
    .map((id) => groupById(id))
    .filter((g) => g?.note)
    .map((g) => ({ label: g?.label ?? '', text: g?.note?.pl ?? '' }));
  const pages = notes.length ? 1 + items.length : items.length;
  const [page, setPage] = useState(0);
  const [strokes, setStrokes] = useState(false);

  const go = (next: number) => {
    setStrokes(false);
    if (next >= pages) onDone();
    else setPage(Math.max(0, next));
  };

  const showNotes = notes.length > 0 && page === 0;
  const item = items[notes.length ? page - 1 : page];
  const details = item ? findKana(item.char) : undefined;
  const single = item ? [...item.char].length === 1 : false;

  return (
    <div class="intro">
      <p class="exercise__prompt" aria-live="polite">
        {showNotes ? 'Zanim zaczniemy' : `Znak ${notes.length ? page : page + 1} z ${items.length}`}
      </p>

      {showNotes ? (
        <div class="card stack intro__note">
          {notes.map((n) => (
            <div key={n.label} class="stack" style={{ gap: 'var(--space-2)' }}>
              <h3 class="lesson-card__eyebrow">{n.label}</h3>
              <p>
                <MixedText text={n.text} />
              </p>
            </div>
          ))}
        </div>
      ) : (
        item && (
          <div class="intro__card card card--elevated">
            {strokes && single ? (
              <StrokeOrder char={item.char} size={220} />
            ) : (
              <span class="intro__kana jp" lang="ja">
                {item.char}
              </span>
            )}
            <div class="row" style={{ justifyContent: 'center' }}>
              <span class="intro__romaji">{item.romaji}</span>
              <SpeakButton text={item.char} />
            </div>
            {details?.mnemonic && (
              <p class="intro__mnemonic">
                <MixedText text={details.mnemonic.pl} />
              </p>
            )}
            {single && (
              <button
                class="btn btn--ghost"
                onClick={() => setStrokes(!strokes)}
                aria-pressed={strokes}
              >
                {strokes ? 'Pokaż znak' : 'Kolejność kresek'}
              </button>
            )}
          </div>
        )
      )}

      <div class="intro__nav">
        <button class="btn" onClick={() => go(page - 1)} disabled={page === 0}>
          Wstecz
        </button>
        <button class="btn btn--primary" onClick={() => go(page + 1)}>
          {page + 1 >= pages ? 'Ćwiczymy' : 'Dalej'}
        </button>
      </div>
    </div>
  );
}
