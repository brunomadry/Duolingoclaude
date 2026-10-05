/**
 * One vocabulary word: kana (and kanji spelling), romaji per the profile setting, audio,
 * Polish senses, part of speech and the lesson's example sentence.
 */
import type { ComponentChildren } from 'preact';
import '../styles/vocab.css';
import type { RomajiDisplay } from '../lesson/romaji.ts';
import { posLabel, type WordExample, type WordItem } from '../lesson/vocab.ts';
import { JpText } from './JpText.tsx';
import { SentenceLine, WrittenWord, useShowKanji } from './Written.tsx';

interface WordCardProps {
  word: WordItem;
  display: RomajiDisplay;
  /** Extra lines under the senses (e.g. the review status in the dictionary). */
  children?: ComponentChildren;
}

/** "Lekcja 12" or "Słówko dodatkowe" for words outside the lessons. */
export function lessonBadge(word: Pick<WordItem, 'lesson'>): string {
  return word.lesson === null ? 'Słówko dodatkowe' : `Lekcja ${word.lesson}`;
}

export function ExampleSentence({
  example,
  display,
}: {
  example: WordExample;
  display: RomajiDisplay;
}) {
  return (
    <figure class="example">
      <figcaption class="section-label example__label">Przykład</figcaption>
      <SentenceLine
        ja={example.ja}
        kana={example.kana ?? example.ja}
        romaji={example.romaji}
        display={display}
        showWritten
      />
      <p class="example__pl">{example.pl}</p>
      {example.tatoebaId !== undefined && (
        <a
          class="example__source"
          href={`https://tatoeba.org/sentences/show/${example.tatoebaId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Zdanie z Tatoeby (CC BY 2.0 FR)
        </a>
      )}
    </figure>
  );
}

export function WordCard({ word, display, children }: WordCardProps) {
  const pos = posLabel(word.pos);
  const kanjiShown = useShowKanji(word.kanji);
  return (
    <article class="word-card" aria-label={`${word.kana}: ${word.pl[0] ?? ''}`}>
      <div class="word-card__head">
        <JpText text={word.kana} romaji={word.romaji} display={display} size="xl">
          <WrittenWord kanji={word.kanji} kana={word.kana} />
        </JpText>
        {word.kanji && !kanjiShown && (
          <p class="word-card__kanji">
            Zapis z kanji:{' '}
            <span class="jp" lang="ja">
              {word.kanji}
            </span>
          </p>
        )}
      </div>
      {word.pl.length > 1 ? (
        <ol class="word-card__senses">
          {word.pl.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      ) : (
        <p class="word-card__sense">{word.pl[0]}</p>
      )}
      <p class="word-card__meta">
        {pos && <span class="chip">{pos}</span>}
        <span class="chip">{lessonBadge(word)}</span>
      </p>
      {children}
      {word.example && <ExampleSentence example={word.example} display={display} />}
    </article>
  );
}
