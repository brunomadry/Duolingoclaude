/**
 * Hanko: a red seal stamped for every completed lesson. Drawn as SVG with a slight,
 * deterministic tilt per lesson and a faint ink-grain filter. Test lessons get a
 * double ring. The stamp animation is CSS (disabled under reduced motion).
 */
import { toKanjiNumber } from '../lesson/numerals.ts';

interface HankoProps {
  n: number;
  size?: number;
  test?: boolean;
  /** Play the stamping animation (celebration screen). */
  stamp?: boolean;
  /** Draw an empty slot instead of a seal. */
  empty?: boolean;
  /** Accessible name; pass "" when the surrounding control already names it. */
  label?: string;
}

const SHU = '#c8341b';

function tilt(n: number): number {
  return ((n * 37) % 17) - 8;
}

export function Hanko({ n, size = 72, test = false, stamp = false, empty = false, label }: HankoProps) {
  if (empty) {
    return (
      <svg class="hanko hanko--empty" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border-strong)" stroke-width="2" stroke-dasharray="4 6" />
        <text x="50" y="57" text-anchor="middle" font-size="22" fill="var(--text-muted)" font-family="var(--font-ui)">
          {n}
        </text>
      </svg>
    );
  }
  const numeral = toKanjiNumber(n);
  const fontSize = numeral.length === 1 ? 40 : numeral.length === 2 ? 30 : 23;
  const filterId = `hanko-grain-${n}`;
  return (
    <svg
      class={`hanko${stamp ? ' hanko--stamp' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={label === '' ? undefined : 'img'}
      aria-hidden={label === '' ? 'true' : undefined}
      aria-label={label === '' ? undefined : (label ?? `Pieczątka za lekcję ${n}`)}
      style={{ transform: `rotate(${tilt(n)}deg)` }}
    >
      <defs>
        <filter id={filterId} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={n} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g filter={`url(#${filterId})`} fill={SHU} stroke={SHU}>
        <circle cx="50" cy="50" r="44" fill="none" stroke-width="5" />
        {test && <circle cx="50" cy="50" r="37" fill="none" stroke-width="2" />}
        <text
          x="50"
          y="45"
          text-anchor="middle"
          dominant-baseline="middle"
          font-size={fontSize}
          font-weight="700"
          stroke="none"
          font-family="'Hiragino Mincho ProN', 'Noto Serif JP', serif"
          lang="ja"
        >
          {numeral}
        </text>
        <text
          x="50"
          y="78"
          text-anchor="middle"
          font-size="15"
          font-weight="700"
          stroke="none"
          font-family="'Hiragino Mincho ProN', 'Noto Serif JP', serif"
          lang="ja"
        >
          課
        </text>
      </g>
    </svg>
  );
}
