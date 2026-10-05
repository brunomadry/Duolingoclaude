import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import '../../styles/lesson.css';
import '../../styles/vocab.css';
import type { ProfileRecord } from '../../shared/api.ts';
import { navigate } from '../../app/router.ts';
import { applyGrades, loadLearning, recordCompletion, seedCards } from '../../data/learning.ts';
import { loadCourse, type CourseData } from '../../data/course-data.ts';
import {
  buildLessonPlan,
  gradesFromResults,
  isSentenceExercise,
  kanaCardId,
  type AnswerResult,
  type Exercise,
  type LessonPlan,
  type Step,
} from '../../lesson/engine.ts';
import {
  COMING_SOON_TEXT,
  completedPrefix,
  dueReviews,
  dueSentenceReviews,
  particlesUpTo,
  kanaUpTo,
  lessonByN,
  lessonSupported,
  planLesson,
  readableWords,
  wordsOf,
  type ReviewFilter,
} from '../../lesson/context.ts';
import { createRng, seedFrom, shuffle } from '../../lesson/rng.ts';
import type { SentenceItem } from '../../lesson/sentences.ts';
import { KANA_PHASE_END } from '../../shared/constants.ts';
import { romajiDisplay } from '../../lesson/romaji.ts';
import { grammarCardId } from '../../lesson/sentence-exercises.ts';
import { sentencesUpTo, type GrammarNoteItem } from '../../lesson/grammar.ts';
import { vocabCardId, wordsUpTo } from '../../lesson/vocab.ts';
import { describeNextUnlock } from '../../lesson/schedule.ts';
import { computeUnlock } from '../../lesson/unlock.ts';
import { VOICE_GRACE_MS, getSpeechStatus, subscribeSpeech } from '../../lib/speech.ts';
import { Mascot } from '../../mascot/Mascot.tsx';
import { aiExercise, database, notifyLocalChange } from '../../state/app.ts';
import { CloseIcon } from '../../ui/icons.tsx';
import { Modal } from '../../ui/Modal.tsx';
import { Celebration } from './Celebration.tsx';
import { ExerciseView } from './ExerciseView.tsx';
import { SentenceExerciseView } from './SentenceExerciseView.tsx';
import { ChatStep } from './ChatStep.tsx';
import { GrammarIntro } from './GrammarIntro.tsx';
import { KanaIntro } from './KanaIntro.tsx';
import { WordIntro } from './WordIntro.tsx';

export type PlayerMode = 'lesson' | 'reviews' | 'extra';

interface LessonPlayerProps {
  profile: ProfileRecord;
  mode: PlayerMode;
  n?: number;
  /** Reviews and extra practice: kana, words or both. */
  filter?: ReviewFilter;
}

const STEP_LABELS: Record<Step['kind'], string> = {
  review: 'Powtórka',
  new: 'Nowa rzecz',
  grammar: 'Nowa rzecz',
  words: 'Nowe słówka',
  practice: 'Ćwiczenie',
  chat: 'Rozmowa',
  summary: 'Podsumowanie',
};

type Finish =
  | {
      kind: 'lesson';
      n: number;
      test: boolean;
      correct: number;
      total: number;
      nextInfo: string;
      firstTime: boolean;
    }
  | { kind: 'simple'; title: string; text: string };

const EXTRA_LENGTH = 12;
const EXTRA_WORDS_WITH_SENTENCES = 6;
const EXTRA_SENTENCES = 8;
/** How long extra practice waits for fresh AI sentences before using the course's own. */
const AI_WAIT_MS = 6000;

/** Validated AI practice sentences for the learner's level, or none (offline, off, slow). */
async function aiSentences(lesson: number, course: CourseData): Promise<SentenceItem[]> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return [];
  try {
    const res = await Promise.race([
      aiExercise(lesson),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), AI_WAIT_MS)),
    ]);
    return res.sentences.map((s, i) =>
      course.sentence({ id: `ai:${lesson}:${i}`, ja: s.ja, kana: s.kana, pl: s.pl, lesson }),
    );
  } catch {
    return [];
  }
}

const EXIT_COPY: Record<PlayerMode, { title: string; text: string; stay: string; leave: string }> =
  {
    lesson: {
      title: 'Przerwać lekcję?',
      text: 'Ukończone kroki zostaną w powtórkach, ale lekcja nie będzie zaliczona.',
      stay: 'Wracam do lekcji',
      leave: 'Przerwij',
    },
    reviews: {
      title: 'Przerwać powtórki?',
      text: 'Odpowiedzi z tej sesji nie zostaną zapisane. Powtórki poczekają.',
      stay: 'Wracam do powtórek',
      leave: 'Przerwij',
    },
    extra: {
      title: 'Zakończyć ćwiczenia?',
      text: 'Dodatkowe ćwiczenia niczego nie zapisują, więc możesz wyjść w każdej chwili.',
      stay: 'Ćwiczę dalej',
      leave: 'Zakończ',
    },
  };

/** Resolves once voices have loaded (or clearly will not), so plans know about listening. */
function speechAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    if (getSpeechStatus() !== 'loading') return resolve(getSpeechStatus() === 'ready');
    let unsubscribe: () => void = () => undefined;
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(getSpeechStatus() === 'ready');
    }, VOICE_GRACE_MS);
    unsubscribe = subscribeSpeech((status) => {
      if (status === 'loading') return;
      clearTimeout(timer);
      unsubscribe();
      resolve(status === 'ready');
    });
  });
}
const MIN_KANA_FOR_EXTRA = 4;
const MIN_WORDS_FOR_EXTRA = 4;
const VOCAB_FAILED_TEXT =
  'Nie udało się wczytać słówek. Sprawdź połączenie z internetem i spróbuj jeszcze raz.';

export function LessonPlayer({ profile, mode, n, filter = 'all' }: LessonPlayerProps) {
  const [plan, setPlan] = useState<LessonPlan | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  /** Missed exercises re-queued at the end of the current step. */
  const [retries, setRetries] = useState<Exercise[]>([]);
  const [position, setPosition] = useState(0);
  const [finish, setFinish] = useState<Finish | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const stepResults = useRef<AnswerResult[]>([]);
  /** First attempt per exercise; review answers do not count towards the lesson score. */
  const firstAttempts = useRef(new Map<string, { correct: boolean; review: boolean }>());
  /** Set while a step is being saved, so a double tap cannot apply grades twice. */
  const advancing = useRef(false);
  const [saving, setSaving] = useState(false);
  /** Lesson level for the romaji setting ("auto" fades romaji after the writing phase). */
  const [level, setLevel] = useState(1);
  const [notes, setNotes] = useState<ReadonlyMap<string, GrammarNoteItem>>(new Map());
  const requeued = useRef(new Set<string>());
  const lesson = n ? lessonByN(n) : undefined;

  // Build the plan once from the learner's current state.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [snapshot, voice, course] = await Promise.all([
        loadLearning(database(), profile.id),
        speechAvailable(),
        loadCourse().catch(() => null),
      ]);
      if (cancelled) return;
      if (!course) return setProblem(VOCAB_FAILED_TEXT);
      const { vocab, grammar } = course;
      setNotes(grammar.notes);
      // Listening exercises need a voice and the profile's sound switched on.
      const speech = voice && profile.settings.sound;
      const now = Date.now();
      const done = completedPrefix(snapshot.lessons);
      setLevel(mode === 'lesson' && lesson ? lesson.n : done + 1);
      let next: LessonPlan;
      if (mode === 'lesson') {
        if (!lesson) return setProblem('Nie ma takiej lekcji.');
        if (!lessonSupported(lesson)) return setProblem(COMING_SOON_TEXT);
        const unlock = computeUnlock({
          completions: snapshot.lessons,
          pace: profile.settings.pace,
          timeZone: profile.settings.timeZone,
          now,
        });
        const replay = snapshot.lessons.some((l) => l.n === lesson.n);
        if (!replay && !(unlock.nextN === lesson.n && unlock.nextUnlocked)) {
          return setProblem('Ta lekcja jeszcze się nie odblokowała.');
        }
        next = planLesson(
          lesson,
          {
            lessons: snapshot.lessons,
            cards: snapshot.cards,
            now,
            speech,
            attempt: replay ? now : 0,
          },
          vocab,
          grammar,
        );
      } else if (mode === 'reviews') {
        const due = dueReviews(snapshot.cards, now, { filter });
        const dueWords = wordsOf(vocab, due.wordIds);
        const dueSentences = dueSentenceReviews(due.grammarIds, grammar, done, `reviews:${now}`);
        if (!due.items.length && !dueWords.length && !dueSentences.length)
          return setProblem('Brak powtórek na teraz. Wróć później.');
        next = buildLessonPlan({
          lesson: { n: 0, kind: 'review', title: 'Powtórki', newItem: { type: 'none' } },
          lessonItems: [],
          coveredItems: [],
          knownItems: kanaUpTo(done),
          dueReviews: due.items,
          dueTotal: due.dueTotal,
          speech,
          seed: seedFrom(`reviews:${now}`),
          dueWords,
          knownWords: wordsUpTo(vocab, done),
          spareWords: readableWords(vocab, done),
          dueSentences,
          sentencePool: sentencesUpTo(grammar, done),
          particles: particlesUpTo(done),
        });
        next = { ...next, steps: next.steps.filter((s) => s.kind === 'review') };
      } else {
        // After the writing phase, mixed extra practice is words and sentences (kana have
        // their own practice in the Alfabet tab); fresh AI sentences join when online.
        const sentencePhase = filter === 'all' && done > KANA_PHASE_END;
        const known = filter === 'words' || sentencePhase ? [] : kanaUpTo(done);
        const knownWords = filter === 'kana' ? [] : wordsUpTo(vocab, done);
        if (filter === 'words' && knownWords.length < MIN_WORDS_FOR_EXTRA)
          return setProblem('Ćwiczenia ze słówkami odblokują się, gdy poznasz kilka słówek.');
        if (filter !== 'words' && !sentencePhase && known.length < MIN_KANA_FOR_EXTRA)
          return setProblem('Dodatkowe ćwiczenia odblokują się po pierwszej lekcji.');
        const seed = seedFrom(`extra:${now}`);
        const fromAi = sentencePhase ? await aiSentences(done, course) : [];
        if (cancelled) return;
        const pool = sentencePhase ? sentencesUpTo(grammar, done) : [];
        next = buildLessonPlan({
          lesson: { n: 0, kind: 'review', title: 'Ćwicz dodatkowo', newItem: { type: 'none' } },
          lessonItems: [],
          coveredItems: known,
          knownItems: known,
          dueReviews: [],
          dueTotal: 0,
          speech,
          seed,
          coveredWords: sentencePhase
            ? shuffle(knownWords, createRng(seed)).slice(0, EXTRA_WORDS_WITH_SENTENCES)
            : knownWords,
          knownWords,
          spareWords: readableWords(vocab, done),
          sentences: [...fromAi, ...shuffle(pool, createRng(seed + 1))],
          sentencePool: [...fromAi, ...pool],
          sentenceCount: sentencePhase ? EXTRA_SENTENCES : 0,
          particles: particlesUpTo(done),
        });
        const length = sentencePhase ? EXTRA_WORDS_WITH_SENTENCES + EXTRA_SENTENCES : EXTRA_LENGTH;
        next = {
          ...next,
          steps: next.steps
            .filter((s) => s.kind === 'practice')
            .map((s) =>
              s.kind === 'practice' ? { ...s, exercises: s.exercises.slice(0, length) } : s,
            ),
        };
      }
      if (!cancelled) setPlan(next);
    })();
    return () => {
      cancelled = true;
    };
    // The plan is built once per mount; replays remount the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = plan?.steps[stepIndex];

  // The queue is derived from the step itself, so it can never lag a render behind it.
  const queue = useMemo(() => {
    const base =
      step?.kind === 'review' || step?.kind === 'practice'
        ? step.exercises
        : step?.kind === 'summary'
          ? step.quiz
          : [];
    return [...base, ...retries];
  }, [step, retries]);

  const goToStep = (index: number) => {
    stepResults.current = [];
    requeued.current = new Set();
    setRetries([]);
    setPosition(0);
    setStepIndex(index);
  };

  const exit = () => navigate('/', { replace: true });

  const completeLesson = async () => {
    if (!plan) return;
    const all = [...firstAttempts.current.values()];
    // Reviews and extra practice report everything; lessons and tests score their own work.
    const scored = mode === 'lesson' ? all.filter((a) => !a.review) : all;
    const correct = scored.filter((a) => a.correct).length;
    const total = scored.length;
    if (mode === 'extra') {
      setFinish({
        kind: 'simple',
        title: 'Dobra robota',
        text: `Poprawne odpowiedzi: ${correct} z ${total}. Te ćwiczenia nie wpływają na lekcje.`,
      });
      return;
    }
    if (mode === 'reviews') {
      setFinish({
        kind: 'simple',
        title: 'Powtórki zrobione',
        text: `Poprawne odpowiedzi: ${correct} z ${total}. Pamięć odświeżona!`,
      });
      return;
    }
    if (!lesson) return;
    const now = Date.now();
    const db = database();
    // Backstop: a lesson with nothing of its own to do is never recorded as completed.
    const ownWork = plan.steps.some(
      (s) =>
        s.kind === 'new' ||
        s.kind === 'grammar' ||
        s.kind === 'words' ||
        (s.kind === 'practice' && s.exercises.length > 0),
    );
    if (!ownWork) {
      setProblem(COMING_SOON_TEXT);
      return;
    }
    const outcome = await recordCompletion(
      db,
      profile.id,
      lesson.n,
      total ? correct / total : 1,
      now,
    );
    notifyLocalChange();
    const after = await loadLearning(db, profile.id);
    const unlock = computeUnlock({
      completions: after.lessons,
      pace: profile.settings.pace,
      timeZone: profile.settings.timeZone,
      now,
    });
    setFinish({
      kind: 'lesson',
      n: lesson.n,
      test: lesson.kind === 'test',
      correct,
      total,
      nextInfo: describeNextUnlock(unlock, now, profile.settings.timeZone),
      firstTime: outcome === 'new',
    });
  };

  const nextStep = async () => {
    if (!plan || !step || advancing.current) return;
    advancing.current = true;
    setSaving(true);
    try {
      if (step.kind === 'new' && mode === 'lesson') {
        // Every introduced kana gets a card, even ones the capped practice cannot cover.
        await seedCards(
          database(),
          profile.id,
          step.items.map((i) => kanaCardId(i.char)),
          Date.now(),
        );
      }
      if (step.kind === 'grammar' && mode === 'lesson') {
        await seedCards(database(), profile.id, [grammarCardId(step.note.id)], Date.now());
      }
      if (step.kind === 'words' && mode === 'lesson') {
        await seedCards(
          database(),
          profile.id,
          step.words.map((w) => vocabCardId(w.id)),
          Date.now(),
        );
      }
      if ((step.kind === 'review' || step.kind === 'practice') && mode !== 'extra') {
        await applyGrades(
          database(),
          profile.id,
          gradesFromResults(stepResults.current),
          Date.now(),
        );
        notifyLocalChange();
      }
      if (stepIndex + 1 < plan.steps.length) goToStep(stepIndex + 1);
      else await completeLesson();
    } finally {
      advancing.current = false;
      setSaving(false);
    }
  };

  const current = queue[position];

  const onAnswered = (correct: boolean) => {
    if (!current) return;
    stepResults.current.push({ cardId: current.cardId, correct });
    const baseId = current.id.replace(/-again$/, '');
    if (!firstAttempts.current.has(baseId)) {
      firstAttempts.current.set(baseId, { correct, review: step?.kind === 'review' });
    }
    // A miss comes back once at the end of the step (not in the final quiz).
    if (!correct && step?.kind !== 'summary' && !requeued.current.has(baseId)) {
      requeued.current.add(baseId);
      setRetries((r) => [...r, { ...current, id: `${baseId}-again` }]);
    }
  };

  const onNextExercise = () => {
    if (position + 1 < queue.length) setPosition(position + 1);
    else void nextStep();
  };

  const stepProgress = useMemo(() => {
    if (!step) return 0;
    if (
      step.kind === 'new' ||
      step.kind === 'grammar' ||
      step.kind === 'words' ||
      step.kind === 'chat'
    )
      return 0;
    return queue.length ? position / queue.length : 0;
  }, [step, queue.length, position]);

  if (problem) {
    return (
      <main class="player screen centered-screen" style={{ textAlign: 'center' }}>
        <Mascot pose="sleepy" size={140} />
        <p>{problem}</p>
        <button class="btn btn--primary" onClick={exit}>
          Wróć
        </button>
      </main>
    );
  }

  if (finish) {
    return (
      <main class="player">
        <div class="player__body player__body--bare">
          {finish.kind === 'lesson' ? (
            <Celebration
              n={finish.n}
              test={finish.test}
              correct={finish.correct}
              total={finish.total}
              nextInfo={finish.nextInfo}
              firstTime={finish.firstTime}
              onDone={exit}
              onStamps={() => navigate('/pieczatki', { replace: true })}
            />
          ) : (
            <div class="celebration">
              <Mascot pose="happy" size={150} />
              <h2 class="display celebration__title">{finish.title}</h2>
              <p class="muted">{finish.text}</p>
              <button class="btn btn--primary btn--block" onClick={exit}>
                Gotowe
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  if (!plan || !step) {
    return (
      <main class="player screen centered-screen" aria-busy="true">
        <Mascot pose="thinking" size={120} decorative />
      </main>
    );
  }

  return (
    <main class="player">
      <header class="player__header">
        <button
          class="icon-button"
          onClick={() => setConfirmExit(true)}
          aria-label="Zakończ lekcję"
        >
          <CloseIcon />
        </button>
        <ol class="player__steps" aria-label="Kroki lekcji">
          {plan.steps.map((s, i) => (
            <li
              key={s.kind}
              class={`player__step${i < stepIndex ? ' is-done' : i === stepIndex ? ' is-current' : ''}`}
              aria-current={i === stepIndex ? 'step' : undefined}
            >
              <span class="player__step-bar">
                {i === stepIndex && (
                  <span style={{ width: `${Math.round(stepProgress * 100)}%` }} />
                )}
              </span>
              <span class="player__step-label">
                {s.kind === 'practice' && s.mode === 'test' ? 'Test' : STEP_LABELS[s.kind]}
              </span>
            </li>
          ))}
        </ol>
      </header>

      <div class="player__body">
        <h1 class="visually-hidden">
          {plan.title}: {STEP_LABELS[step.kind]}
        </h1>
        {step.kind === 'review' && position === 0 && step.dueTotal > step.exercises.length && (
          <p class="muted player__hint">
            Dziś {step.exercises.length} z {step.dueTotal} zaległych powtórek. Reszta poczeka, bez
            stresu.
          </p>
        )}
        {step.kind === 'new' ? (
          <KanaIntro items={step.items} groupIds={step.groupIds} onDone={() => void nextStep()} />
        ) : step.kind === 'grammar' ? (
          <GrammarIntro
            note={step.note}
            display={romajiDisplay(profile.settings.romaji, level)}
            onDone={() => void nextStep()}
          />
        ) : step.kind === 'chat' ? (
          <ChatStep
            lessonN={plan.n}
            display={romajiDisplay(profile.settings.romaji, level)}
            sound={profile.settings.sound}
            notes={notes}
            onDone={() => void nextStep()}
          />
        ) : step.kind === 'words' ? (
          <WordIntro
            words={step.words}
            display={romajiDisplay(profile.settings.romaji, level)}
            onDone={() => void nextStep()}
          />
        ) : current && isSentenceExercise(current) ? (
          <SentenceExerciseView
            key={current.id}
            exercise={current}
            sound={profile.settings.sound}
            display={romajiDisplay(profile.settings.romaji, level)}
            onAnswered={onAnswered}
            onNext={onNextExercise}
            busy={saving}
          />
        ) : current ? (
          <ExerciseView
            key={current.id}
            exercise={current}
            sound={profile.settings.sound}
            onAnswered={onAnswered}
            onNext={onNextExercise}
            busy={saving}
          />
        ) : (
          <div class="player__empty stack" style={{ alignItems: 'center' }}>
            <p class="muted">Tu nie ma nic do zrobienia.</p>
            <button class="btn btn--primary" onClick={() => void nextStep()}>
              Dalej
            </button>
          </div>
        )}
      </div>

      <Modal
        open={confirmExit}
        onClose={() => setConfirmExit(false)}
        title={EXIT_COPY[mode].title}
        variant="dialog"
      >
        <div class="stack">
          <p>{EXIT_COPY[mode].text}</p>
          <button class="btn btn--primary btn--block" onClick={() => setConfirmExit(false)}>
            {EXIT_COPY[mode].stay}
          </button>
          <button class="btn btn--block" onClick={exit}>
            {EXIT_COPY[mode].leave}
          </button>
        </div>
      </Modal>
    </main>
  );
}
