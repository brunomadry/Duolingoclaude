/**
 * Japanese text with optional romaji (per the profile setting) and a speaker button.
 * Romaji modes: "show" prints it under the text, "tap" hides it behind a small toggle,
 * "off" leaves it out entirely. Romaji is derived from the kana reading when not given.
 */
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { kanaToRomaji, type RomajiDisplay } from '../lesson/romaji.ts';
import { SpeakButton } from './SpeakButton.tsx';

interface JpTextProps {
  /** As written (may contain kanji). */
  text: string;
  /** Kana reading, used for romaji and speech when given. */
  reading?: string;
  romaji?: string;
  display: RomajiDisplay;
  size?: 'md' | 'lg' | 'xl';
  speak?: boolean;
  /** Rendered instead of `text` (e.g. kanji with furigana); `text` still names the audio. */
  children?: ComponentChildren;
}

export function JpText({
  text,
  reading,
  romaji,
  display,
  size = 'md',
  speak = true,
  children,
}: JpTextProps) {
  const [revealed, setRevealed] = useState(false);
  const latin = romaji ?? kanaToRomaji(reading ?? text);
  const showRomaji = display === 'show' || (display === 'tap' && revealed);

  return (
    <span class={`jptext jptext--${size}`}>
      <span class="jptext__line">
        <span class="jptext__ja jp" lang="ja">
          {children ?? text}
        </span>
        {speak && <SpeakButton text={reading ?? text} />}
      </span>
      {showRomaji && (
        <span class="jptext__romaji" lang="ja-Latn">
          {latin}
        </span>
      )}
      {display === 'tap' && !revealed && (
        <button class="jptext__reveal" onClick={() => setRevealed(true)}>
          Pokaż romaji
        </button>
      )}
    </span>
  );
}
