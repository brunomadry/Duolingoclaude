/**
 * Japanese speech with the Web Speech API: on-device voices only, no recordings, no network.
 *
 * speak() must be called synchronously from a user gesture handler (tap, click, key press).
 * iOS Safari drops speech that does not start inside a gesture, and the app never autoplays
 * audio on load. Reading the voice list (getSpeechStatus, subscribeSpeech, initSpeech) is safe
 * at any time and makes no sound.
 *
 * Voices load asynchronously. The list is read immediately and again on "voiceschanged". While
 * no Japanese voice is known the status is 'loading'; after a short grace period it becomes
 * 'no-voice', and it flips to 'ready' whenever a Japanese voice shows up later.
 */

export type SpeakResult = 'ok' | 'no-voice' | 'unsupported';
export type SpeechStatus = 'ready' | 'loading' | 'no-voice' | 'unsupported';
export type SpeechProblem = Exclude<SpeakResult, 'ok'>;

export interface SpeakOptions {
  /** Speaking rate, clamped to [MIN_RATE, MAX_RATE]. Defaults to DEFAULT_RATE. */
  rate?: number;
  /**
   * Called exactly once for every speak() that returned 'ok', when the utterance stops for any
   * reason: it ended, failed, was replaced by a newer speak() or stop(), or the watchdog gave
   * up waiting for an end event (some engines never fire one). Never called otherwise.
   */
  onEnd?: () => void;
}

/** Slightly slower than normal speech, which helps learners hear each mora. */
export const DEFAULT_RATE = 0.85;
export const MIN_RATE = 0.5;
export const MAX_RATE = 1.5;
/** How long to wait for a Japanese voice before reporting 'no-voice'. */
export const VOICE_GRACE_MS = 2000;

/** Guidance shown when no Japanese voice is installed (iPhone settings path, Polish UI). */
export const JAPANESE_VOICE_HELP =
  'Aby słyszeć wymowę, dodaj japoński głos na iPhonie: Ustawienia, Dostępność, Treść mówiona, ' +
  'Głosy, Japoński. Wybierz głos (np. Kyoko) i poczekaj, aż się pobierze. ' +
  'Potem zamknij aplikację i otwórz ją ponownie.';

/** Short inline messages for a speak() that could not play. */
export const SPEECH_PROBLEM_TEXT: Readonly<Record<SpeechProblem, string>> = {
  'no-voice': 'Brak japońskiego głosu. Dodaj go w Ustawieniach: Dostępność, Treść mówiona, Głosy.',
  unsupported: 'Ta przeglądarka nie obsługuje odtwarzania mowy.',
};

/** Accepts ja-JP, ja_JP (Android), any case, and plain "ja". */
const JAPANESE_LANG = /^ja(?:[-_]jp)?(?:$|[-_])/i;
/** Natural-sounding Apple voices, best first. Preferred when present, never required. */
const PREFERRED_VOICE_NAMES = ['kyoko', 'o-ren', 'otoya', 'hattori'];

/** The voice fields used for selection. */
export type VoiceInfo = Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'localService' | 'default'>;

/** The parts of window.speechSynthesis this module uses. */
export type SynthLike = Pick<SpeechSynthesis, 'getVoices' | 'speak' | 'cancel'> &
  Partial<Pick<SpeechSynthesis, 'addEventListener' | 'onvoiceschanged' | 'paused' | 'resume'>>;

export interface SpeechEnv {
  synth: SynthLike | null | undefined;
  Utterance: (new (text: string) => SpeechSynthesisUtterance) | null | undefined;
  /** Grace period before 'loading' turns into 'no-voice'. Defaults to VOICE_GRACE_MS. */
  graceMs?: number;
}

export interface Speech {
  /** Speak Japanese text. Call only from a user gesture handler. */
  speak(text: string, opts?: SpeakOptions): SpeakResult;
  /** Stop the current utterance, if any. */
  stop(): void;
  getStatus(): SpeechStatus;
  /** The cached Japanese voice, or null while none is known. */
  getVoice(): SpeechSynthesisVoice | null;
  /** Called when the status or the chosen voice changes. Returns an unsubscribe function. */
  subscribe(fn: (status: SpeechStatus) => void): () => void;
}

export function isJapaneseVoice(voice: Pick<VoiceInfo, 'lang'>): boolean {
  return JAPANESE_LANG.test(voice.lang.trim());
}

function voiceScore(voice: VoiceInfo): number {
  const name = voice.name.toLowerCase();
  const known = PREFERRED_VOICE_NAMES.findIndex((n) => name.includes(n));
  // On-device beats remote (works offline), then known good voices, then the platform default.
  return (voice.localService ? 100 : 0) + (known >= 0 ? 50 - known : 0) + (voice.default ? 1 : 0);
}

/** The best Japanese voice in the list, or null. Ties keep the platform's order. */
export function pickJapaneseVoice<V extends VoiceInfo>(voices: readonly V[]): V | null {
  let best: V | null = null;
  let bestScore = -1;
  for (const voice of voices) {
    if (!isJapaneseVoice(voice)) continue;
    const score = voiceScore(voice);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

export function clampRate(rate: number | undefined): number {
  if (rate === undefined || !Number.isFinite(rate)) return DEFAULT_RATE;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
}

/** Generous upper bound for an utterance, after which the UI stops showing "speaking". */
function watchdogMs(text: string, rate: number): number {
  return Math.max(3000, (1500 + [...text].length * 500) / rate);
}

interface Playback {
  utterance: SpeechSynthesisUtterance;
  onEnd: (() => void) | undefined;
  timer: ReturnType<typeof setTimeout> | undefined;
  done: boolean;
}

const UNSUPPORTED: Speech = {
  speak: () => 'unsupported',
  stop: () => {},
  getStatus: () => 'unsupported',
  getVoice: () => null,
  subscribe: () => () => {},
};

export function createSpeech(env: SpeechEnv): Speech {
  const { synth: engine, Utterance } = env;
  if (!engine || typeof Utterance !== 'function') return UNSUPPORTED;
  const synth: SynthLike = engine;
  const Ctor = Utterance;

  const listeners = new Set<(status: SpeechStatus) => void>();
  let voice: SpeechSynthesisVoice | null = null;
  let voiceCount = 0;
  let graceOver = (env.graceMs ?? VOICE_GRACE_MS) <= 0;
  let current: Playback | null = null;

  const status = (): SpeechStatus => (voice ? 'ready' : graceOver ? 'no-voice' : 'loading');
  const voiceKey = () => (voice ? `${voice.name}|${voice.lang}` : '');
  let lastStatus = status();
  let lastVoiceKey = voiceKey();

  function emitIfChanged(): void {
    const next = status();
    const key = voiceKey();
    if (next === lastStatus && key === lastVoiceKey) return;
    lastStatus = next;
    lastVoiceKey = key;
    for (const fn of [...listeners]) fn(next);
  }

  function refresh(): void {
    let voices: readonly SpeechSynthesisVoice[] = [];
    try {
      voices = synth.getVoices() ?? [];
    } catch {
      // Treat a failing engine like one without voices.
    }
    voiceCount = voices.length;
    voice = pickJapaneseVoice(voices);
    emitIfChanged();
  }

  function settle(playback: Playback): void {
    if (playback.done) return;
    playback.done = true;
    clearTimeout(playback.timer);
    if (current === playback) current = null;
    playback.onEnd?.();
  }

  function stop(): void {
    if (current) settle(current);
    synth.cancel();
  }

  function speak(text: string, opts: SpeakOptions = {}): SpeakResult {
    if (!voice) refresh();
    // With an empty list we cannot know yet, so let the engine pick by lang. A non-empty list
    // without Japanese would read kana with the wrong voice, so refuse instead.
    if (!voice && (graceOver || voiceCount > 0)) return 'no-voice';

    if (current) settle(current);
    // Always cancel first: it clears a queue stuck "speaking" (a known Safari and Chrome bug).
    synth.cancel();
    if (synth.paused === true) synth.resume?.();

    const rate = clampRate(opts.rate);
    const utterance = new Ctor(text);
    utterance.lang = 'ja-JP';
    if (voice) utterance.voice = voice;
    utterance.rate = rate;

    // `current` also keeps the utterance referenced, so it is not garbage collected mid-speech
    // (which silently drops its end event in some engines).
    const playback: Playback = { utterance, onEnd: opts.onEnd, timer: undefined, done: false };
    const finish = () => settle(playback);
    utterance.onend = finish;
    utterance.onerror = finish;
    playback.timer = setTimeout(finish, watchdogMs(text, rate));
    current = playback;

    try {
      synth.speak(utterance);
    } catch {
      playback.onEnd = undefined;
      settle(playback);
      return 'unsupported';
    }
    return 'ok';
  }

  refresh();
  if (typeof synth.addEventListener === 'function') {
    synth.addEventListener('voiceschanged', refresh);
  } else {
    // Older WebKit has no EventTarget on speechSynthesis, only the handler property.
    synth.onvoiceschanged = refresh;
  }
  if (!graceOver) {
    setTimeout(() => {
      graceOver = true;
      // Re-read too: some engines fill the list later without firing "voiceschanged".
      refresh();
    }, env.graceMs ?? VOICE_GRACE_MS);
  }

  return {
    speak,
    stop,
    getStatus: status,
    getVoice: () => voice,
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

function browserEnv(): SpeechEnv {
  const g = globalThis as Partial<
    Pick<typeof globalThis, 'speechSynthesis' | 'SpeechSynthesisUtterance'>
  >;
  return { synth: g.speechSynthesis, Utterance: g.SpeechSynthesisUtterance };
}

let defaultSpeech: Speech | null = null;

/** The browser instance, created on first use so importing this module in Node is harmless. */
function instance(): Speech {
  defaultSpeech ??= createSpeech(browserEnv());
  return defaultSpeech;
}

/** Start reading the voice list early (no sound), e.g. at app start, so status settles sooner. */
export function initSpeech(): void {
  instance();
}

/** Speak Japanese text. Call only from a user gesture handler; never on load. */
export function speak(text: string, opts?: SpeakOptions): SpeakResult {
  return instance().speak(text, opts);
}

export function stopSpeaking(): void {
  instance().stop();
}

export function getSpeechStatus(): SpeechStatus {
  return instance().getStatus();
}

export function getSpeechVoice(): SpeechSynthesisVoice | null {
  return instance().getVoice();
}

export function subscribeSpeech(fn: (status: SpeechStatus) => void): () => void {
  return instance().subscribe(fn);
}
