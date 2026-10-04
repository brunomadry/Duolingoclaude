import { Mascot } from '../../mascot/Mascot.tsx';
import { Hanko } from '../../ui/Hanko.tsx';

const PETALS = [
  { left: 12, delay: 0, dur: 2.6, size: 14 },
  { left: 28, delay: 0.4, dur: 2.2, size: 10 },
  { left: 46, delay: 0.15, dur: 2.8, size: 12 },
  { left: 63, delay: 0.6, dur: 2.4, size: 9 },
  { left: 78, delay: 0.25, dur: 2.7, size: 13 },
  { left: 90, delay: 0.8, dur: 2.3, size: 10 },
];

/** A few sakura petals, once, only on the celebration screen (hidden under reduced motion). */
export function Petals() {
  return (
    <div class="petals" aria-hidden="true">
      {PETALS.map((p, i) => (
        <svg
          key={i}
          class="petal"
          width={p.size}
          height={p.size}
          viewBox="0 0 20 20"
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
          }}
        >
          <path
            d="M10 1 C 15 5, 17 11, 10 19 C 3 11, 5 5, 10 1 Z M10 1 L 9 4 L 11 4 Z"
            fill="#f4b6c2"
          />
        </svg>
      ))}
    </div>
  );
}

interface CelebrationProps {
  n: number;
  test: boolean;
  correct: number;
  total: number;
  /** Polish sentence about when the next lesson unlocks. */
  nextInfo: string;
  firstTime: boolean;
  onDone: () => void;
  onStamps: () => void;
}

export function Celebration({
  n,
  test,
  correct,
  total,
  nextInfo,
  firstTime,
  onDone,
  onStamps,
}: CelebrationProps) {
  return (
    <div class="celebration">
      {firstTime && <Petals />}
      <div class="celebration__seal">
        <Hanko n={n} size={150} test={test} stamp={firstTime} />
      </div>
      <h2 class="display celebration__title">
        {test ? `Test ${n} zaliczony` : `Lekcja ${n} ukończona`}
      </h2>
      {total > 0 && (
        <p class="muted">
          Poprawne odpowiedzi: {correct} z {total}
        </p>
      )}
      <Mascot pose={firstTime ? 'celebrating' : 'happy'} size={130} />
      <p class="celebration__next">{nextInfo}</p>
      <div class="stack" style={{ width: '100%' }}>
        <button class="btn btn--primary btn--block" onClick={onDone}>
          Gotowe
        </button>
        <button class="btn btn--block" onClick={onStamps}>
          Moje pieczątki
        </button>
      </div>
    </div>
  );
}
