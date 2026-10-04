import { useEffect, useRef, useState } from 'preact/hooks';
import type { SentenceExercise } from '../../lesson/engine.ts';
import type { RomajiDisplay } from '../../lesson/romaji.ts';
import { tilesMatch } from '../../lesson/sentences.ts';
import { speak } from '../../lib/speech.ts';
import { JpText } from '../../ui/JpText.tsx';
import { SpeakButton } from '../../ui/SpeakButton.tsx';

interface SentenceExerciseViewProps {
  exercise: SentenceExercise;
  sound: boolean;
  display: RomajiDisplay;
  onAnswered: (correct: boolean) => void;
  onNext: () => void;
  busy?: boolean;
}

const PROMPTS: Record<SentenceExercise['kind'], string> = {
  'sentence-tiles': 'Ułóż zdanie po japońsku',
  'sentence-gap': 'Uzupełnij lukę',
  'sentence-meaning': 'Co znaczy to zdanie?',
  'sentence-audio': 'Co słyszysz?',
};

export function SentenceExerciseView({
  exercise,
  sound,
  display,
  onAnswered,
  onNext,
  busy = false,
}: SentenceExerciseViewProps) {
  const s = exercise.sentence;
  const tiles = exercise.tiles ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  /** Indices into `tiles`, in the order the learner placed them. */
  const [placed, setPlaced] = useState<number[]>([]);
  const [result, setResult] = useState<boolean | null>(null);
  const promptRef = useRef<HTMLParagraphElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    promptRef.current?.focus({ preventScroll: true });
  }, [exercise.id]);

  useEffect(() => {
    if (result !== null) nextRef.current?.focus({ preventScroll: true });
  }, [result]);

  const finish = (correct: boolean) => {
    setResult(correct);
    onAnswered(correct);
    // Runs inside the tap handler, so iOS allows speech here.
    if (sound) speak(s.kana);
  };

  const choose = (option: string) => {
    if (result !== null) return;
    setPicked(option);
    finish(option === exercise.answer);
  };

  const checkTiles = () => {
    if (result !== null || !placed.length) return;
    finish(
      tilesMatch(
        placed.map((i) => tiles[i] ?? ''),
        s.tiles,
      ),
    );
  };

  const japaneseOptions = exercise.kind === 'sentence-gap';
  const gapText =
    exercise.kind === 'sentence-gap'
      ? s.tiles.map((t, i) => (i === exercise.gap ? '＿＿' : t)).join(' ')
      : '';

  return (
    <div class="exercise">
      <p ref={promptRef} class="exercise__prompt" tabIndex={-1}>
        {PROMPTS[exercise.kind]}
      </p>

      <div class="exercise__stage exercise__stage--sentence">
        {exercise.kind === 'sentence-meaning' && (
          <JpText text={s.kana} romaji={s.romaji} display={display} size="lg" />
        )}
        {exercise.kind === 'sentence-audio' && (
          <SpeakButton text={s.kana} size={88} label="Posłuchaj zdania" hideText />
        )}
        {exercise.kind === 'sentence-gap' && (
          <div class="stack" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
            <p class="sentence-gap jp" lang="ja">
              {gapText}
            </p>
            <p class="exercise__translation">{s.pl}</p>
          </div>
        )}
        {exercise.kind === 'sentence-tiles' && <p class="exercise__translation">{s.pl}</p>}
      </div>

      {exercise.kind === 'sentence-tiles' ? (
        <div class="tiles">
          <div class="tiles__answer" aria-label="Twoje zdanie" role="group">
            {placed.length ? (
              placed.map((i, pos) => (
                <button
                  key={`${i}-${pos}`}
                  class="tile jp"
                  lang="ja"
                  onClick={() => result === null && setPlaced(placed.filter((_, p) => p !== pos))}
                  aria-disabled={result !== null}
                  aria-label={`${tiles[i] ?? ''}, usuń`}
                >
                  {tiles[i]}
                </button>
              ))
            ) : (
              <span class="tiles__hint">Stuknij klocki w dobrej kolejności.</span>
            )}
          </div>
          <div class="tiles__bank" aria-label="Klocki" role="group">
            {tiles.map((t, i) => {
              const used = placed.includes(i);
              return (
                <button
                  key={i}
                  class={`tile jp${used ? ' is-used' : ''}`}
                  lang="ja"
                  disabled={used || result !== null}
                  onClick={() => setPlaced([...placed, i])}
                >
                  {t}
                </button>
              );
            })}
          </div>
          {result === null && (
            <button
              class="btn btn--primary btn--block"
              disabled={!placed.length}
              onClick={checkTiles}
            >
              Sprawdź
            </button>
          )}
        </div>
      ) : (
        <div
          class={`options${japaneseOptions ? '' : ' options--wide'}`}
          role="group"
          aria-label="Odpowiedzi"
        >
          {exercise.options.map((o) => {
            const state =
              result === null
                ? ''
                : o === exercise.answer
                  ? ' is-correct'
                  : o === picked
                    ? ' is-wrong'
                    : ' is-dim';
            return (
              <button
                key={o}
                class={`option${japaneseOptions ? ' option--kana jp' : ' option--text'}${state}`}
                lang={japaneseOptions ? 'ja' : undefined}
                onClick={() => choose(o)}
                aria-disabled={result !== null}
              >
                {o}
              </button>
            );
          })}
        </div>
      )}

      {result !== null && (
        <div class={`feedback ${result ? 'feedback--ok' : 'feedback--miss'}`} role="status">
          <p class="feedback__title" id={`fb-title-${exercise.id}`}>
            {result ? 'Dobrze!' : 'Prawie.'}
          </p>
          <div id={`fb-answer-${exercise.id}`} class="stack" style={{ gap: 'var(--space-1)' }}>
            <JpText text={s.kana} romaji={s.romaji} display="show" />
            <p>{s.pl}</p>
          </div>
          <button
            ref={nextRef}
            class="btn btn--primary btn--block"
            onClick={onNext}
            disabled={busy}
            aria-busy={busy}
            aria-describedby={`fb-title-${exercise.id} fb-answer-${exercise.id}`}
          >
            Dalej
          </button>
        </div>
      )}
    </div>
  );
}
