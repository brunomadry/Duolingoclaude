import { useEffect, useRef, useState } from 'preact/hooks';
import { isKanaExercise, type Exercise, type KanaExercise } from '../../lesson/engine.ts';
import { romajiToKana } from '../../lesson/kana-input.ts';
import { isRomajiAnswerCorrect } from '../../lesson/romaji.ts';
import { isKatakanaWord, isWordAnswerCorrect } from '../../lesson/vocab.ts';
import { speak } from '../../lib/speech.ts';
import { SpeakButton } from '../../ui/SpeakButton.tsx';

interface ExerciseViewProps {
  exercise: Exercise;
  /** Speak the correct kana or word after answering (profile "sound" setting). */
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
  'word-to-meaning': 'Co to znaczy?',
  'meaning-to-word': 'Jak to jest po japońsku?',
  'audio-to-word': 'Które słowo słyszysz?',
  'type-word': 'Napisz po japońsku (w romaji)',
};

/** Lower case without spaces or apostrophes. Hyphens stay: "ka-" is a long vowel (カー). */
export function normalizeRomaji(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s'’]+/g, '');
}

export function isTypedAnswerCorrect(exercise: KanaExercise, input: string): boolean {
  const typed = normalizeRomaji(input);
  if (!typed) return false;
  const accepted = [exercise.item.romaji, ...(exercise.item.alt ?? [])].map(normalizeRomaji);
  return accepted.includes(typed) || isRomajiAnswerCorrect(input, exercise.item.char);
}

/** What the learner sees as the answer once the exercise is checked. */
function solutionOf(exercise: Exercise): { ja: string; romaji: string; meaning?: string } {
  if (isKanaExercise(exercise)) return { ja: exercise.item.char, romaji: exercise.item.romaji };
  const w = exercise.word;
  return { ja: w.kana, romaji: w.romaji, meaning: w.pl[0] ?? '' };
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
  const typing = exercise.kind === 'type-romaji' || exercise.kind === 'type-word';
  const solution = solutionOf(exercise);

  useEffect(() => {
    setPicked(null);
    setTyped('');
    setResult(null);
    // Move focus to the new question so VoiceOver does not fall back to the top of the page.
    if (typing) inputRef.current?.focus({ preventScroll: true });
    else promptRef.current?.focus({ preventScroll: true });
  }, [exercise.id, typing]);

  useEffect(() => {
    if (result !== null) nextRef.current?.focus({ preventScroll: true });
  }, [result]);

  const finish = (correct: boolean) => {
    setResult(correct);
    onAnswered(correct);
    // Runs inside the tap handler, so iOS allows speech here.
    if (sound) speak(solution.ja);
  };

  const choose = (option: string) => {
    if (result !== null) return;
    setPicked(option);
    finish(option === exercise.answer);
  };

  const check = (e: Event) => {
    e.preventDefault();
    if (result !== null || !normalizeRomaji(typed)) return;
    finish(
      isKanaExercise(exercise)
        ? isTypedAnswerCorrect(exercise, typed)
        : isWordAnswerCorrect(exercise.word, typed),
    );
  };

  // Which stage the question shows, and whether the options are Japanese.
  const showJa =
    exercise.kind === 'kana-to-romaji' ||
    exercise.kind === 'type-romaji' ||
    exercise.kind === 'word-to-meaning';
  const showMeaning = exercise.kind === 'meaning-to-word' || exercise.kind === 'type-word';
  const audio = exercise.kind === 'audio-to-kana' || exercise.kind === 'audio-to-word';
  const optionsAreJa =
    exercise.kind === 'romaji-to-kana' ||
    exercise.kind === 'audio-to-kana' ||
    exercise.kind === 'meaning-to-word' ||
    exercise.kind === 'audio-to-word';
  const isWord = !isKanaExercise(exercise);
  const preview =
    exercise.kind === 'type-word' && normalizeRomaji(typed)
      ? romajiToKana(typed, { katakana: isKatakanaWord(exercise.word) })
      : '';

  return (
    <div class="exercise">
      <p ref={promptRef} class="exercise__prompt" tabIndex={-1}>
        {PROMPTS[exercise.kind]}
      </p>

      <div class="exercise__stage">
        {showJa && (
          <span
            class={`exercise__kana jp${isWord ? ' exercise__kana--word' : ''}`}
            lang="ja"
            id={`q-${exercise.id}`}
          >
            {solution.ja}
          </span>
        )}
        {exercise.kind === 'romaji-to-kana' && (
          <span class="exercise__romaji">{exercise.item.romaji}</span>
        )}
        {showMeaning && solution.meaning && (
          <span class="exercise__meaning" id={`q-${exercise.id}`}>
            {solution.meaning}
          </span>
        )}
        {audio && (
          <SpeakButton
            text={solution.ja}
            size={88}
            label={isWord ? 'Posłuchaj słowa' : 'Posłuchaj dźwięku'}
            hideText
          />
        )}
        {result !== null && showJa && <SpeakButton text={solution.ja} />}
      </div>

      {typing ? (
        <form class="exercise__type" onSubmit={check}>
          <label class="visually-hidden" for={`answer-${exercise.id}`}>
            {isWord ? 'Słowo w romaji' : 'Czytanie w romaji'}
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
          {preview && result === null && (
            <p class="exercise__preview jp" lang="ja" aria-hidden="true">
              {preview}
            </p>
          )}
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
            const kanaOption = optionsAreJa && !isWord;
            return (
              <button
                key={o}
                class={`option${kanaOption ? ' option--kana' : ''}${optionsAreJa ? ' jp' : ''}${isWord ? ' option--text' : ''}${state}`}
                lang={optionsAreJa ? 'ja' : undefined}
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
          {(!result || isWord) && (
            <p id={`fb-answer-${exercise.id}`}>
              {result ? '' : 'Poprawnie: '}
              <span class="jp" lang="ja">
                {solution.ja}
              </span>{' '}
              = <strong>{solution.romaji}</strong>
              {solution.meaning && <> · {solution.meaning}</>}
            </p>
          )}
          <button
            ref={nextRef}
            class="btn btn--primary btn--block"
            onClick={onNext}
            disabled={busy}
            aria-busy={busy}
            aria-describedby={
              result && !isWord
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
