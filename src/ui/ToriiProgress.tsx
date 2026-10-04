/** Course progress drawn as the top beam (kasagi) of a torii gate filling with vermilion. */
interface ToriiProgressProps {
  /** 0..1 */
  value: number;
  label: string;
}

const BEAM = 'M 6 12 Q 150 22 294 12';

export function ToriiProgress({ value, label }: ToriiProgressProps) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <svg
      class="torii"
      viewBox="0 0 300 44"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <path
        class="torii__post"
        d="M 52 16 V 42 M 248 16 V 42"
        stroke-width="3"
        stroke-linecap="round"
      />
      <path class="torii__post" d="M 34 26 H 266" stroke-width="2" stroke-linecap="round" />
      <path class="torii__track" d={BEAM} fill="none" stroke-width="6" stroke-linecap="round" />
      <path
        class="torii__fill"
        d={BEAM}
        fill="none"
        stroke-width="6"
        stroke-linecap="round"
        pathLength={100}
        stroke-dasharray={`${pct} 100`}
        opacity={pct === 0 ? 0 : 1}
      />
    </svg>
  );
}
