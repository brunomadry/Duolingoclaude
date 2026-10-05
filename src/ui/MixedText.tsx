/**
 * Polish text with Japanese fragments ("Hamak z は"): wraps every Japanese run in
 * <span lang="ja"> so VoiceOver switches to a Japanese voice for it.
 */
import { splitJapanese } from './mixed-text.ts';

export function MixedText({ text }: { text: string }) {
  return (
    <>
      {splitJapanese(text).map((part, i) =>
        part.ja ? (
          <span key={i} lang="ja" class="jp">
            {part.text}
          </span>
        ) : (
          part.text
        ),
      )}
    </>
  );
}
