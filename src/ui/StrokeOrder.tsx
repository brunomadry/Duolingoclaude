/**
 * Animated stroke order for one kana or kanji, drawn from KanjiVG data (CC BY-SA 3.0,
 * content/strokes.json). The data is imported lazily so it ships as its own chunk.
 * Under prefers-reduced-motion every stroke is shown at once with its number.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { StrokesFile } from '../shared/content-schema.ts';
import {
  labelPositions,
  parseViewBox,
  strokeGeometry,
  strokeOrderLabel,
  strokeTimings,
} from './stroke-geometry.ts';
import type { StrokeGeometry } from './stroke-geometry.ts';
import '../styles/stroke-order.css';

type StrokeData = Pick<StrokesFile, 'viewBox' | 'chars'>;
type LoadState = StrokeData | 'loading' | 'error';

let loaded: StrokeData | undefined;
let pending: Promise<StrokeData> | undefined;

function loadStrokes(): Promise<StrokeData> {
  pending ??= import('../../content/strokes.json').then(
    (m) => {
      const data: StrokeData = m.default;
      loaded = data;
      return data;
    },
    (err: unknown) => {
      pending = undefined; // let a later mount retry (e.g. once back online)
      throw err;
    },
  );
  return pending;
}

function useStrokeData(): LoadState {
  const [state, setState] = useState<LoadState>(() => loaded ?? 'loading');
  useEffect(() => {
    if (state !== 'loading') return;
    let alive = true;
    loadStrokes().then(
      (data) => {
        if (alive) setState(data);
      },
      () => {
        if (alive) setState('error');
      },
    );
    return () => {
      alive = false;
    };
  }, [state]);
  return state;
}

const round = (v: number) => Math.round(v * 100) / 100;

interface StrokeOrderProps {
  /** A single kana or kanji. */
  char: string;
  /** Width and height in CSS pixels; shrinks to fit narrower containers. */
  size?: number;
}

export function StrokeOrder({ char, size = 200 }: StrokeOrderProps) {
  const data = useStrokeData();
  const [run, setRun] = useState(0);
  const style = { '--stroke-order-size': `${size}px` };
  const entry = typeof data === 'object' ? data.chars[char] : undefined;

  if (data === 'loading') {
    return (
      <div class="stroke-order" style={style}>
        <div class="stroke-order__box" aria-busy="true">
          <span class="visually-hidden">Wczytywanie kolejności kresek</span>
        </div>
      </div>
    );
  }

  if (typeof data !== 'object' || !entry) {
    return (
      <div class="stroke-order" style={style}>
        <div class="stroke-order__box">
          <p class="stroke-order__status">Brak danych o kreskach</p>
        </div>
      </div>
    );
  }

  return (
    <div class="stroke-order" style={style}>
      <div class="stroke-order__box">
        <StrokeDrawing
          char={char}
          strokes={entry.strokes}
          viewBox={data.viewBox}
          size={size}
          run={run}
        />
      </div>
      <button
        type="button"
        class="btn btn--ghost stroke-order__replay"
        aria-label={`Odtwórz kolejność kresek znaku ${char}`}
        onClick={() => setRun((r) => r + 1)}
      >
        <ReplayIcon />
        Odtwórz
      </button>
    </div>
  );
}

interface StrokeDrawingProps {
  char: string;
  strokes: string[];
  viewBox: string;
  size: number;
  /** Changing this remounts the animated layer, which restarts the CSS animations. */
  run: number;
}

function StrokeDrawing({ char, strokes, viewBox, size, run }: StrokeDrawingProps) {
  const layout = useMemo(() => {
    const box = parseViewBox(viewBox);
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const geometry = strokes.map(
      (d): StrokeGeometry =>
        strokeGeometry(d) ?? { start: center, direction: { x: 1, y: 0 }, length: box.width / 2 },
    );
    return {
      grid: `M${center.x} ${box.y}V${box.y + box.height}M${box.x} ${center.y}H${box.x + box.width}`,
      labels: labelPositions(geometry, box),
      timings: strokeTimings(geometry.map((g) => g.length)),
    };
  }, [strokes, viewBox]);

  return (
    <svg
      class="stroke-order__svg"
      viewBox={viewBox}
      width={size}
      height={size}
      role="img"
      aria-label={strokeOrderLabel(char, strokes.length)}
    >
      <path class="stroke-order__grid" d={layout.grid} />
      <g class="stroke-order__guide">
        {strokes.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g key={`${char}:${run}`}>
        <g class="stroke-order__ink">
          {strokes.map((d, i) => {
            const t = layout.timings[i];
            return (
              <path
                key={i}
                d={d}
                pathLength={1}
                style={{
                  '--stroke-delay': `${t?.delayMs ?? 0}ms`,
                  '--stroke-draw': `${t?.durationMs ?? 0}ms`,
                }}
              />
            );
          })}
        </g>
        <g class="stroke-order__numbers">
          {layout.labels.map((p, i) => (
            <text
              key={i}
              x={round(p.x)}
              y={round(p.y)}
              style={{ '--stroke-delay': `${layout.timings[i]?.delayMs ?? 0}ms` }}
            >
              {i + 1}
            </text>
          ))}
        </g>
      </g>
    </svg>
  );
}

function ReplayIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 12a8 8 0 1 0 2.34-5.66L4 9" />
      <path d="M4 4.5V9h4.5" />
    </svg>
  );
}
