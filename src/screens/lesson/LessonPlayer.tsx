import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import '../../styles/lesson.css';
import type { ProfileRecord } from '../../shared/api.ts';
import { navigate } from '../../app/router.ts';
import { applyGrades, loadLearning, recordCompletion } from '../../data/learning.ts';
import { buildLessonPlan, gradesFromResults, type AnswerResult, type Exercise, type LessonPlan, type Step } from '../../lesson/engine.ts';
import { completedPrefix, dueKana, kanaUpTo, lessonByN, planLesson } from '../../lesson/context.ts';
import { seedFrom } from '../../lesson/rng.ts';
import { describeNextUnlock } from '../../lesson/schedule.ts';
import { computeUnlock } from '../../lesson/unlock.ts';
import { getSpeechStatus } from '../../lib/speech.ts';
import { Mascot } from '../../mascot/Mascot.tsx';
import { database, notifyLocalChange } from '../../state/app.ts';
import { CloseIcon } from '../../ui/icons.tsx';
import { Modal } from '../../ui/Modal.tsx';
import { Celebration } from './Celebration.tsx';
import { ExerciseView } from './ExerciseView.tsx';
import { KanaIntro } from './KanaIntro.tsx';

export type PlayerMode = 'lesson' | 'reviews' | 'extra';

interface LessonPlayerProps {
  profile: ProfileRecord;
  mode: PlayerMode;
  n?: number;
}

const STEP_LABELS: Record<Step['kind'], string> = {
  review: 'Powtórka',
  new: 'Nowa rzecz',
  practice: 'Ćwiczenie',
  summary: 'Podsumowanie',
};

type Finish =
  | { kind: 'lesson'; n: number; test: boolean; correct: number; total: number; nextInfo: string; firstTime: boolean }
  | { kind: 'simple'; title: string; text: string };

const EXTRA_LENGTH = 12;
const MIN_KANA_FOR_EXTRA = 4;

export function LessonPlayer({ profile, mode, n }: LessonPlayerProps) {
  const [plan, setPlan] = useState<LessonPlan | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [queue, setQueue] = useState<Exercise[]>([]);
  const [position, setPosition] = useState(0);
  const [finish, setFinish] = useState<Finish | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const stepResults = useRef<AnswerResult[]>([]);
  const firstAttempts = useRef(new Map<string, boolean>());
  const requeued = useRef(new Set<string>());
  const lesson = n ? lessonByN(n) : undefined;

  // Build the plan once from the learner's current state.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const snapshot = await loadLearning(database(), profile.id);
      const now = Date.now();
      const speech = getSpeechStatus() === 'ready';
      let next: LessonPlan | null = null;
      if (mode === 'lesson') {
        if (!lesson) return setProblem('Nie ma takiej lekcji.');
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
        next = planLesson(lesson, {
          lessons: snapshot.lessons,
          cards: snapshot.cards,
          now,
          speech,
          attempt: replay ? now : 0,
        });
      } else if (mode === 'reviews') {
        const due = dueKana(snapshot.cards, now);
        if (!due.items.length) return setProblem('Brak powtórek na teraz. Wróć później.');
        next = buildLessonPlan({
          lesson: { n: 0, kind: 'review', title: 'Powtórki', newItem: { type: 'none' } },
          lessonItems: [],
          coveredItems: [],
          knownItems: kanaUpTo(completedPrefix(snapshot.lessons)),
          dueReviews: due.items,
          dueTotal: due.dueTotal,
          speech,
          seed: seedFrom(`reviews:${now}`),
        });
        next = { ...next, steps: next.steps.filter((s) => s.kind === 'review') };
      } else {
        const known = kanaUpTo(completedPrefix(snapshot.lessons));
        if (known.length < MIN_KANA_FOR_EXTRA) return setProblem('Dodatkowe ćwiczenia odblokują się po pierwszej lekcji.');
        next = buildLessonPlan({
          lesson: { n: 0, kind: 'review', title: 'Ćwicz dodatkowo', newItem: { type: 'none' } },
          lessonItems: [],
          coveredItems: known,
          knownItems: known,
          dueReviews: [],
          dueTotal: 0,
          speech,
          seed: seedFrom(`extra:${now}`),
        });
        next = {
          ...next,
          steps: next.steps
            .filter((s) => s.kind === 'practice')
            .map((s) => (s.kind === 'practice' ? { ...s, exercises: s.exercises.slice(0, EXTRA_LENGTH) } : s)),
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

  useEffect(() => {
    if (!step) return;
    stepResults.current = [];
    requeued.current = new Set();
    setPosition(0);
    setQueue(step.kind === 'review' || step.kind === 'practice' ? step.exercises : step.kind === 'summary' ? step.quiz : []);
  }, [step]);

  const exit = () => navigate('/', { replace: true });

  const completeLesson = async () => {
    if (!plan) return;
    const firsts = [...firstAttempts.current.values()];
    const correct = firsts.filter(Boolean).length;
    const total = firsts.length;
    if (mode === 'extra') {
      setFinish({ kind: 'simple', title: 'Dobra robota', text: `Poprawne odpowiedzi: ${correct} z ${total}. Te ćwiczenia nie wpływają na lekcje.` });
      return;
    }
    if (mode === 'reviews') {
      setFinish({ kind: 'simple', title: 'Powtórki zrobione', text: `Poprawne odpowiedzi: ${correct} z ${total}. Pamięć odświeżona!` });
      return;
    }
    if (!lesson) return;
    const now = Date.now();
    const db = database();
    const outcome = await recordCompletion(db, profile.id, lesson.n, total ? correct / total : 1, now);
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
    if (!plan || !step) return;
    if ((step.kind === 'review' || step.kind === 'practice') && mode !== 'extra') {
      await applyGrades(database(), profile.id, gradesFromResults(stepResults.current), Date.now());
      notifyLocalChange();
    }
    if (stepIndex + 1 < plan.steps.length) setStepIndex(stepIndex + 1);
    else await completeLesson();
  };

  const current = queue[position];

  const onAnswered = (correct: boolean) => {
    if (!current) return;
    stepResults.current.push({ cardId: current.cardId, correct });
    const baseId = current.id.replace(/-again$/, '');
    if (!firstAttempts.current.has(baseId)) firstAttempts.current.set(baseId, correct);
    // A miss comes back once at the end of the step (not in the final quiz).
    if (!correct && step?.kind !== 'summary' && !requeued.current.has(baseId)) {
      requeued.current.add(baseId);
      setQueue((q) => [...q, { ...current, id: `${baseId}-again` }]);
    }
  };

  const onNextExercise = () => {
    if (position + 1 < queue.length) setPosition(position + 1);
    else void nextStep();
  };

  const stepProgress = useMemo(() => {
    if (!step) return 0;
    if (step.kind === 'new') return 0;
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
        <div class="player__body">
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
        <button class="icon-button" onClick={() => setConfirmExit(true)} aria-label="Zakończ lekcję">
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
                {i === stepIndex && <span style={{ width: `${Math.round(stepProgress * 100)}%` }} />}
              </span>
              <span class="player__step-label">{s.kind === 'practice' && s.mode === 'test' ? 'Test' : STEP_LABELS[s.kind]}</span>
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
            Dziś {step.exercises.length} z {step.dueTotal} zaległych powtórek. Reszta poczeka, bez stresu.
          </p>
        )}
        {step.kind === 'new' ? (
          <KanaIntro items={step.items} groupIds={step.groupIds} onDone={() => void nextStep()} />
        ) : current ? (
          <ExerciseView
            key={current.id}
            exercise={current}
            sound={profile.settings.sound}
            onAnswered={onAnswered}
            onNext={onNextExercise}
          />
        ) : (
          <div class="celebration">
            <p class="muted">Tu nie ma nic do zrobienia.</p>
            <button class="btn btn--primary" onClick={() => void nextStep()}>
              Dalej
            </button>
          </div>
        )}
      </div>

      <Modal open={confirmExit} onClose={() => setConfirmExit(false)} title="Przerwać lekcję?" variant="dialog">
        <div class="stack">
          <p>Ukończone kroki zostaną w powtórkach, ale lekcja nie będzie zaliczona.</p>
          <button class="btn btn--primary btn--block" onClick={() => setConfirmExit(false)}>
            Wracam do lekcji
          </button>
          <button class="btn btn--block" onClick={exit}>
            Przerwij
          </button>
        </div>
      </Modal>
    </main>
  );
}
