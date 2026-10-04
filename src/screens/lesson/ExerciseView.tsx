import { useEffect, useRef, useState } from 'preact/hooks';
import type { Exercise } from '../../lesson/engine.ts';
import { isRomajiAnswerCorrect } from '../../lesson/romaji.ts';
import { speak } from '../../lib/speech.ts';
import { SpeakButton } from '../../ui/SpeakButton.tsx';

interface ExerciseViewProps {
  exercise: Exercise;
  /** Speak the correct kana after answering (profile "sound" setting). */
  sound: boolean;
  onAnswered: (correct: boolean) => void;
  onNext: () => void;
  /** The player is saving the step; the next button waits. */
  busy?: boolean;
}

const PROMPTS: Record<Exercise['kind'], string> = {
  'kana-to-romaji': 'Jak to przeczytać?',
  'romaji-to-kana': 'Który znak to…',
  'audio-to-kana': 'Który znak słyszysz?',
  'type-romaji': 'Wpisz czytanie w romaji',
};

/** Lower case without spaces or apostrophes. Hyphens stay: "ka-" is a long vowel (カー). */
export function normalizeRomaji(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s'’]+/g, '');
}

export function isTypedAnswerCorrect(exercise: Exercise, input: string): boolean {
  const typed = normalizeRomaji(input);
  if (!typed) return false;
  const accepted = [exercise.item.romaji, ...(exercise.item.alt ?? [])].map(normalizeRomaji);
  return accepted.includes(typed) || isRomajiAnswerCorrect(input, exercise.item.char);
}

export function ExerciseView({
  exercise,
  sound,
  onAnswered,
  onNext,
  busy = false,
}: ExerciseViewProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<boolean | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    setPicked(null);
    setTyped('');
    setResult(null);
    // Move focus to the new question so VoiceOver does not fall back to the top of the page.
    if (exercise.kind === 'type-romaji') inputRef.current?.focus({ preventScroll: true });
    else promptRef.current?.focus({ preventScroll: true });
  }, [exercise.id, exercise.kind]);

  useEffect(() => {
    if (result !== null) nextRef.current?.focus({ preventScroll: true });
  }, [result]);

  const finish = (correct: boolean) => {
    setResult(correct);
    onAnswered(correct);
    // Runs inside the tap handler, so iOS allows speech here.
    if (sound) speak(exercise.item.char);
  };

  const choose = (option: string) => {
    if (result !== null) return;
    setPicked(option);
    finish(option === exercise.answer);
  };

  const check = (e: Event) => {
    e.preventDefault();
    if (result !== null || !normalizeRomaji(typed)) return;
    finish(isTypedAnswerCorrect(exercise, typed));
  };

  const kanaPrompt = exercise.kind === 'kana-to-romaji' || exercise.kind === 'type-romaji';
  const optionsAreKana = exercise.kind === 'romaji-to-kana' || exercise.kind === 'audio-to-kana';

  return (
    <div class="exercise">
      <p ref={promptRef} class="exercise__prompt" tabIndex={-1}>
        {PROMPTS[exercise.kind]}
      </p>

      <div class="exercise__stage">
        {kanaPrompt && (
          <span class="exercise__kana jp" lang="ja" id={`q-${exercise.id}`}>
            {exercise.item.char}
          </span>
        )}
        {exercise.kind === 'romaji-to-kana' && (
          <span class="exercise__romaji">{exercise.item.romaji}</span>
        )}
        {exercise.kind === 'audio-to-kana' && (
          <SpeakButton text={exercise.item.char} size={88} label="Posłuchaj dźwięku" hideText />
        )}
        {result !== null && kanaPrompt && <SpeakButton text={exercise.item.char} />}
      </div>

      {exercise.kind === 'type-romaji' ? (
        <form class="exercise__type" onSubmit={check}>
          <label class="visually-hidden" for={`answer-${exercise.id}`}>
            Czytanie w romaji
          </label>
          <input
            ref={inputRef}
            id={`answer-${exercise.id}`}
            class={`input exercise__input${result === true ? ' is-correct' : result === false ? ' is-wrong' : ''}`}
            value={typed}
            onInput={(e) => setTyped(e.currentTarget.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellcheck={false}
            enterKeyHint="done"
            placeholder="wpisz romaji"
            readOnly={result !== null}
            aria-describedby={`q-${exercise.id}`}
          />
          {result === null && (
            <button
              class="btn btn--primary btn--block"
              type="submit"
              disabled={!normalizeRomaji(typed)}
            >
              Sprawdź
            </button>
          )}
        </form>
      ) : (
        <div class="options" role="group" aria-label="Odpowiedzi">
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
                class={`option${optionsAreKana ? ' option--kana jp' : ''}${state}`}
                lang={optionsAreKana ? 'ja' : undefined}
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
          {!result && (
            <p id={`fb-answer-${exercise.id}`}>
              Poprawnie:{' '}
              <span class="jp" lang="ja">
                {exercise.item.char}
              </span>{' '}
              = <strong>{exercise.item.romaji}</strong>
            </p>
          )}
          <button
            ref={nextRef}
            class="btn btn--primary btn--block"
            onClick={onNext}
            disabled={busy}
            aria-busy={busy}
            aria-describedby={
              result
                ? `fb-title-${exercise.id}`
                : `fb-title-${exercise.id} fb-answer-${exercise.id}`
            }
          >
            Dalej
          </button>
        </div>
      )}
    </div>
  );
}
