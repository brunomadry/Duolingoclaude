/**
 * A grammar note: pattern, explanation in Polish, three examples with audio and romaji,
 * and the typical mistake. Notes are original content marked as not yet reviewed until a
 * person confirms them, so the view offers the error report.
 */
import '../styles/vocab.css';
import type { GrammarNoteItem } from '../lesson/grammar.ts';
import type { RomajiDisplay } from '../lesson/romaji.ts';
import { JpText } from './JpText.tsx';
import { MixedText } from './MixedText.tsx';

interface GrammarNoteViewProps {
  note: GrammarNoteItem;
  display: RomajiDisplay;
  /** Which part to show: everything, or one page of the lesson's two-page intro. */
  part?: 'all' | 'explain' | 'examples';
}

export function GrammarNoteView({ note, display, part = 'all' }: GrammarNoteViewProps) {
  const explain = part === 'all' || part === 'explain';
  const examples = part === 'all' || part === 'examples';
  return (
    <article class="grammar-note" aria-label={note.title}>
      {explain && (
        <>
          <p class="grammar-note__pattern">
            <MixedText text={note.pattern} />
          </p>
          {note.note.split(/\n{2,}/).map((p) => (
            <p key={p} class="grammar-note__text">
              <MixedText text={p} />
            </p>
          ))}
        </>
      )}
      {examples && (
        <>
          <h3 class="section-label grammar-note__label">Przykłady</h3>
          <ul class="grammar-note__examples">
            {note.examples.map((ex) => (
              <li key={ex.id} class="grammar-note__example">
                <JpText text={ex.kana} romaji={ex.romaji} display={display} />
                {ex.ja !== ex.kana.replace(/\s+/g, '') && (
                  <p class="example__written">
                    Zapis z kanji:{' '}
                    <span class="jp" lang="ja">
                      {ex.ja}
                    </span>
                  </p>
                )}
                <p class="example__pl">{ex.pl}</p>
              </li>
            ))}
          </ul>
          <div class="grammar-note__mistake">
            <h3 class="section-label grammar-note__label">Typowy błąd</h3>
            <p>
              <MixedText text={note.typicalMistake} />
            </p>
          </div>
        </>
      )}
    </article>
  );
}
