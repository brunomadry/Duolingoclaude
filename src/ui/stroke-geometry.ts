/**
 * Pure helpers for StrokeOrder.tsx: reading KanjiVG path data (start point, initial
 * direction, approximate length), placing stroke-number labels and timing the animation.
 * No DOM access, so everything here is unit tested in stroke-order.test.ts.
 */

export interface Point {
  x: number;
  y: number;
}

export interface StrokeGeometry {
  /** First point of the stroke (where the brush lands). */
  start: Point;
  /** Unit vector of the initial drawing direction. */
  direction: Point;
  /** Approximate length in viewBox units. */
  length: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** KanjiVG's coordinate space; used when a viewBox string cannot be parsed. */
export const DEFAULT_BOX: Box = { x: 0, y: 0, width: 109, height: 109 };

export function parseViewBox(viewBox: string): Box {
  const n = viewBox.trim().split(/[\s,]+/).map(Number);
  const [x = NaN, y = NaN, width = NaN, height = NaN] = n;
  if (n.length !== 4 || !n.every(Number.isFinite) || width <= 0 || height <= 0) return DEFAULT_BOX;
  return { x, y, width, height };
}

const PARAMS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const TOKEN = /[MLHVCSQTAZ]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
const EPS = 1e-6;

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/** Bezier length estimate: the mean of the chord and the control polygon. */
function curveLength(points: Point[]): number {
  let polygon = 0;
  for (let i = 1; i < points.length; i++) polygon += dist(points[i - 1] as Point, points[i] as Point);
  const first = points[0] as Point;
  const last = points[points.length - 1] as Point;
  return (polygon + dist(first, last)) / 2;
}

/**
 * Reads an SVG path `d` string (KanjiVG uses M, C, c, S and s; the other commands are
 * handled well enough for an estimate, arcs as straight lines). Returns null when the
 * string does not start with a moveto or has no drawable segment.
 */
export function strokeGeometry(d: string): StrokeGeometry | null {
  const tokens = d.match(TOKEN) ?? [];
  let i = 0;
  let cmd = '';
  let cur: Point = { x: 0, y: 0 };
  let subpath: Point = cur;
  let start: Point | null = null;
  let direction: Point | null = null;
  let length = 0;
  let lastCubic: Point | null = null; // second control point of the previous C/S
  let lastQuad: Point | null = null; // control point of the previous Q/T

  const segment = (points: Point[]) => {
    if (!direction) {
      const from = points[0] as Point;
      const to = points.slice(1).find((p) => dist(from, p) > EPS);
      if (to) {
        const len = dist(from, to);
        direction = { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
      }
    }
    length += points.length > 2 ? curveLength(points) : dist(points[0] as Point, points[1] as Point);
  };

  while (i < tokens.length) {
    const token = tokens[i] as string;
    if (/^[a-z]$/i.test(token)) {
      cmd = token;
      i++;
      if (!start && cmd !== 'M' && cmd !== 'm') return null; // must start with a moveto
      if (cmd === 'Z' || cmd === 'z') {
        segment([cur, subpath]);
        cur = subpath;
        lastCubic = lastQuad = null;
      }
      continue;
    }
    const upper = cmd.toUpperCase();
    const count = PARAMS[upper];
    if (!count) return null; // numbers before any command, or after Z
    const nums = tokens.slice(i, i + count).map(Number);
    if (nums.length < count || nums.some((v) => !Number.isFinite(v))) break;
    i += count;

    const rel = cmd !== upper;
    const pt = (k: number): Point => ({
      x: (nums[k] as number) + (rel ? cur.x : 0),
      y: (nums[k + 1] as number) + (rel ? cur.y : 0),
    });
    let nextCubic: Point | null = null;
    let nextQuad: Point | null = null;

    switch (upper) {
      case 'M': {
        cur = subpath = pt(0);
        start ??= cur;
        cmd = rel ? 'l' : 'L'; // extra pairs after a moveto are linetos
        break;
      }
      case 'L':
      case 'T':
      case 'A': {
        const end = upper === 'A' ? pt(5) : pt(0);
        if (upper === 'T') {
          const c: Point = lastQuad ? { x: 2 * cur.x - lastQuad.x, y: 2 * cur.y - lastQuad.y } : cur;
          segment([cur, c, end]);
          nextQuad = c;
        } else {
          segment([cur, end]);
        }
        cur = end;
        break;
      }
      case 'H':
      case 'V': {
        const v = nums[0] as number;
        const end: Point =
          upper === 'H'
            ? { x: v + (rel ? cur.x : 0), y: cur.y }
            : { x: cur.x, y: v + (rel ? cur.y : 0) };
        segment([cur, end]);
        cur = end;
        break;
      }
      case 'C':
      case 'S': {
        const c1: Point =
          upper === 'C'
            ? pt(0)
            : lastCubic
              ? { x: 2 * cur.x - lastCubic.x, y: 2 * cur.y - lastCubic.y }
              : cur;
        const c2 = upper === 'C' ? pt(2) : pt(0);
        const end = upper === 'C' ? pt(4) : pt(2);
        segment([cur, c1, c2, end]);
        nextCubic = c2;
        cur = end;
        break;
      }
      case 'Q': {
        const c = pt(0);
        const end = pt(2);
        segment([cur, c, end]);
        nextQuad = c;
        cur = end;
        break;
      }
    }
    lastCubic = nextCubic;
    lastQuad = nextQuad;
  }

  if (!start) return null;
  return { start, direction: direction ?? { x: 1, y: 0 }, length };
}

/* ------------------------------------------------------------ labels */

export interface LabelOptions {
  /** Distance from the stroke start to the label centre, in viewBox units. */
  offset?: number;
  /** Minimum distance between two label centres. */
  minGap?: number;
  /** Keep label centres at least this far inside the box. */
  margin?: number;
}

/** Rotations tried (in degrees) when the preferred spot collides with an earlier label. */
const TURNS = [0, 50, -50, 90, -90, 135, -135, 180];

/**
 * Places each stroke number just before the point where its stroke begins, opposite to
 * the initial direction (above a downward stroke, left of a rightward one). When that
 * spot is taken by an earlier label it tries rotated positions, then falls back to the
 * preferred one. Positions are clamped inside the box.
 */
export function labelPositions(
  strokes: readonly StrokeGeometry[],
  box: Box = DEFAULT_BOX,
  { offset = 7, minGap = 7, margin = 5 }: LabelOptions = {},
): Point[] {
  const placed: Point[] = [];
  const clamp = (p: Point): Point => ({
    x: Math.min(box.x + box.width - margin, Math.max(box.x + margin, p.x)),
    y: Math.min(box.y + box.height - margin, Math.max(box.y + margin, p.y)),
  });
  for (const s of strokes) {
    const back = { x: -s.direction.x, y: -s.direction.y };
    const candidates = TURNS.map((deg) => {
      const r = (deg * Math.PI) / 180;
      const dx = back.x * Math.cos(r) - back.y * Math.sin(r);
      const dy = back.x * Math.sin(r) + back.y * Math.cos(r);
      return clamp({ x: s.start.x + dx * offset, y: s.start.y + dy * offset });
    });
    const free = candidates.find((c) => placed.every((p) => dist(p, c) >= minGap));
    placed.push(free ?? (candidates[0] as Point));
  }
  return placed;
}

/* ------------------------------------------------------------ timing */

export interface TimingOptions {
  /** Pause before the first stroke. */
  leadMs?: number;
  /** Pause between strokes. */
  gapMs?: number;
  msPerUnit?: number;
  minMs?: number;
  maxMs?: number;
}

export interface StrokeTiming {
  delayMs: number;
  durationMs: number;
}

/** Longer strokes take longer to draw (clamped), one after another with a short pause. */
export function strokeTimings(
  lengths: readonly number[],
  { leadMs = 300, gapMs = 220, msPerUnit = 9, minMs = 300, maxMs = 1200 }: TimingOptions = {},
): StrokeTiming[] {
  let t = leadMs;
  return lengths.map((len) => {
    const durationMs = Math.round(Math.min(maxMs, Math.max(minMs, len * msPerUnit)));
    const timing = { delayMs: t, durationMs };
    t += durationMs + gapMs;
    return timing;
  });
}

/* ------------------------------------------------------------ copy */

/** Polish plural of "kreska": 1 kreska, 2 kreski, 5 kresek, 22 kreski. */
export function strokeCountPl(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return '1 kreska';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} kreski`;
  return `${n} kresek`;
}

/** Accessible name of the drawing, e.g. "Kolejność kresek znaku あ: 3 kreski". */
export function strokeOrderLabel(char: string, count: number): string {
  return `Kolejność kresek znaku ${char}: ${strokeCountPl(count)}`;
}
