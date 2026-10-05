/**
 * Japanese as the learner can read it: kanji only when every kanji in it has been taught
 * (from the KnownKanji context), with furigana for words and the kana line under sentences;
 * otherwise the kana reading.
 */
import { createContext } from 'preact';
import type { RomajiDisplay } from '../lesson/romaji.ts';
import { JpText } from './JpText.tsx';
import { useContext } from 'preact/hooks';
import { furigana, hasKanji, kanjiKnown } from '../lesson/kanji.ts';

export const KnownKanji = createContext<ReadonlySet<string>>(new Set());

export function useShowKanji(written: string | undefined): boolean {
  const known = useContext(KnownKanji);
  return !!written && hasKanji(written) && kanjiKnown(written, known);
}

/** A word: kanji with furigana when known (or always, with `force`), else kana. */
export function WrittenWord({
  kanji,
  kana,
  force = false,
}: {
  kanji?: string;
  kana: string;
  force?: boolean;
}) {
  const show = useShowKanji(kanji) || (force && !!kanji);
  if (!show || !kanji) return <>{kana}</>;
  return (
    <>
      {furigana(kanji, kana).map((p, i) =>
        p.rt ? (
          <ruby key={i}>
            {p.text}
            <rt>{p.rt}</rt>
          </ruby>
        ) : (
          p.text
        ),
      )}
    </>
  );
}

interface SentenceLineProps {
  ja: string;
  /** Kana reading with spaces between phrases. */
  kana: string;
  romaji?: string;
  display: RomajiDisplay;
  size?: 'md' | 'lg' | 'xl';
  /** Show the usual spelling under a kana-only line (learning material, not quizzes). */
  showWritten?: boolean;
}

/** A sentence: in kanji with the kana line under it once its kanji are known, else in kana. */
export function SentenceLine({ ja, kana, romaji, display, size, showWritten }: SentenceLineProps) {
  const show = useShowKanji(ja);
  if (show) {
    return (
      <span class="sentence-line">
        <JpText text={ja} reading={kana} romaji={romaji} display={display} size={size} />
        <span class="sentence-line__kana jp" lang="ja">
          {kana}
        </span>
      </span>
    );
  }
  return (
    <span class="sentence-line">
      <JpText text={kana} reading={kana} romaji={romaji} display={display} size={size} />
      {showWritten && hasKanji(ja) && (
        <span class="example__written">
          Zapis z kanji:{' '}
          <span class="jp" lang="ja">
            {ja}
          </span>
        </span>
      )}
    </span>
  );
}
