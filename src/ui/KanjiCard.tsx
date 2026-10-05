/**
 * One kanji: the character (or its stroke order), Polish meanings, on and kun readings and
 * words the learner knows that are written with it.
 */
import { useState } from 'preact/hooks';
import '../styles/vocab.css';
import { readingsOf, type KanjiItem } from '../lesson/kanji.ts';
import type { WordItem } from '../lesson/vocab.ts';
import { strokeCountPl } from './stroke-geometry.ts';
import { StrokeOrder } from './StrokeOrder.tsx';
import { WrittenWord } from './Written.tsx';

interface KanjiCardProps {
  kanji: KanjiItem;
  /** Known words written with the kanji (a few are shown). */
  words: readonly WordItem[];
}

export function KanjiCard({ kanji, words }: KanjiCardProps) {
  const [strokes, setStrokes] = useState(false);
  const { on, kun } = readingsOf(kanji);
  return (
    <article class="kanji-card" aria-label={`${kanji.char}: ${kanji.pl.join(', ')}`}>
      {strokes ? (
        <StrokeOrder char={kanji.char} size={200} />
      ) : (
        <span class="kanji-card__char jp" lang="ja">
          {kanji.char}
        </span>
      )}
      <button class="btn btn--ghost" onClick={() => setStrokes(!strokes)} aria-pressed={strokes}>
        {strokes ? 'Pokaż znak' : `Kolejność kresek (${strokeCountPl(kanji.strokes)})`}
      </button>
      <p class="kanji-card__meaning">{kanji.pl.join(', ')}</p>
      <dl class="kanji-card__readings">
        {on.length > 0 && (
          <>
            <dt>On (czytanie chińskie)</dt>
            <dd class="jp" lang="ja">
              {on.join('、')}
            </dd>
          </>
        )}
        {kun.length > 0 && (
          <>
            <dt>Kun (czytanie japońskie)</dt>
            <dd class="jp" lang="ja">
              {kun.join('、')}
            </dd>
          </>
        )}
      </dl>
      {words.length > 0 && (
        <div class="stack" style={{ gap: 'var(--space-2)' }}>
          <h3 class="section-label kanji-card__label">W poznanych słówkach</h3>
          <ul class="kanji-card__words">
            {words.slice(0, 4).map((w) => (
              <li key={w.id}>
                <span class="jp" lang="ja">
                  <WrittenWord kanji={w.kanji} kana={w.kana} force />
                </span>
                <span class="muted">{w.pl[0]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
