/**
 * Sentence exercises for grammar lessons: arrange tiles, fill a particle gap, understand a
 * sentence by reading or by ear. Pure and seeded like the rest of the engine.
 */
import type { SentenceExercise, SentenceExerciseKind } from './engine.ts';
import { shuffle, type Rng } from './rng.ts';
import { GAP_PARTICLES, interchangeable, type SentenceItem } from './sentences.ts';

export function grammarCardId(grammarId: string): string {
  return `grammar:${grammarId}`;
}

export function grammarIdFromCardId(cardId: string): string | null {
  return cardId.startsWith('grammar:') ? cardId.slice('grammar:'.length) : null;
}

export interface SentenceContext {
  /** Other sentences the learner can read (distractor meanings). */
  pool: readonly SentenceItem[];
  /** GAP_PARTICLES keys taught so far (gap options and distractor tiles). */
  particles: readonly string[];
  rng: Rng;
}

/** Up to `count` particles that are not in the sentence and not interchangeable with one. */
function extraParticles(s: SentenceItem, count: number, ctx: SentenceContext): string[] {
  const present = s.gaps.map((g) => g.key);
  const candidates = ctx.particles.filter(
    (k) => !present.includes(k) && !present.some((p) => interchangeable(p, k)),
  );
  return shuffle(candidates, ctx.rng)
    .slice(0, count)
    .map((k) => GAP_PARTICLES[k] ?? k);
}

/** Polish meanings of other sentences, never equal to the answer. */
function meaningOptions(s: SentenceItem, ctx: SentenceContext): string[] {
  const others: string[] = [];
  for (const o of shuffle(ctx.pool, ctx.rng)) {
    if (others.length === 3) break;
    if (o.id === s.id || o.pl === s.pl || o.kana === s.kana || others.includes(o.pl)) continue;
    others.push(o.pl);
  }
  return shuffle([s.pl, ...others], ctx.rng);
}

/**
 * Builds one exercise of the wanted kind, falling back to a kind the sentence supports
 * (no particle: no gap; a single tile: nothing to arrange; too few other sentences: tiles).
 * `focus` prefers a gap on a particle of that grammar key.
 */
export function makeSentenceExercise(
  wanted: SentenceExerciseKind,
  s: SentenceItem,
  cardId: string,
  ctx: SentenceContext,
  id: string,
  focusKeys: readonly string[] = [],
): SentenceExercise {
  const base = { id, cardId, sentence: s };
  const tilesExercise = (): SentenceExercise => ({
    ...base,
    kind: 'sentence-tiles',
    tiles: shuffle([...s.tiles, ...extraParticles(s, s.tiles.length > 5 ? 1 : 2, ctx)], ctx.rng),
    options: [],
    answer: s.tiles.join(' '),
  });
  const meaningExercise = (
    kind: 'sentence-meaning' | 'sentence-audio',
  ): SentenceExercise | null => {
    const options = meaningOptions(s, ctx);
    return options.length >= 2 ? { ...base, kind, options, answer: s.pl } : null;
  };

  if (wanted === 'sentence-gap' && s.gaps.length) {
    const preferred = s.gaps.filter((g) => focusKeys.includes(g.key));
    const gap = shuffle(preferred.length ? preferred : s.gaps, ctx.rng)[0];
    if (gap) {
      const answer = s.tiles[gap.index] ?? '';
      const others = shuffle(
        ctx.particles.filter((k) => k !== gap.key && !interchangeable(k, gap.key)),
        ctx.rng,
      )
        .map((k) => GAP_PARTICLES[k] ?? k)
        .filter((p) => p !== answer)
        .slice(0, 3);
      if (others.length) {
        return {
          ...base,
          kind: 'sentence-gap',
          gap: gap.index,
          options: shuffle([answer, ...others], ctx.rng),
          answer,
        };
      }
    }
  }
  if (wanted === 'sentence-meaning' || wanted === 'sentence-audio') {
    const made = meaningExercise(wanted);
    if (made) return made;
  }
  if (s.tiles.length >= 2) return tilesExercise();
  return meaningExercise('sentence-meaning') ?? tilesExercise();
}

/** Cycle of kinds for a run of sentence exercises (listening only with a voice). */
export function sentenceKinds(speech: boolean): SentenceExerciseKind[] {
  return [
    'sentence-meaning',
    'sentence-gap',
    'sentence-tiles',
    speech ? 'sentence-audio' : 'sentence-meaning',
    'sentence-gap',
    'sentence-tiles',
  ];
}
