import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clampRate,
  createSpeech,
  DEFAULT_RATE,
  getSpeechStatus,
  JAPANESE_VOICE_HELP,
  MAX_RATE,
  MIN_RATE,
  pickJapaneseVoice,
  speak,
  SPEECH_PROBLEM_TEXT,
} from './speech.ts';
import type { SpeechEnv, SpeechStatus, SynthLike } from './speech.ts';

function voice(
  name: string,
  lang: string,
  opts: Partial<Pick<SpeechSynthesisVoice, 'localService' | 'default'>> = {},
): SpeechSynthesisVoice {
  return { name, lang, voiceURI: `test:${name}`, localService: true, default: false, ...opts };
}

class FakeUtterance {
  text: string;
  lang = '';
  rate = 1;
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

/** Records calls in order; voices arrive later through loadVoices(), like Chrome. */
class FakeSynth {
  voices: SpeechSynthesisVoice[] = [];
  log: string[] = [];
  spoken: FakeUtterance[] = [];
  paused = false;
  throwOnSpeak = false;
  private listeners = new Set<() => void>();

  getVoices(): SpeechSynthesisVoice[] {
    return this.voices;
  }

  speak(u: FakeUtterance): void {
    if (this.throwOnSpeak) throw new Error('boom');
    this.log.push(`speak:${u.text}`);
    this.spoken.push(u);
  }

  cancel(): void {
    this.log.push('cancel');
  }

  resume(): void {
    this.log.push('resume');
    this.paused = false;
  }

  addEventListener(type: string, fn: () => void): void {
    if (type === 'voiceschanged') this.listeners.add(fn);
  }

  loadVoices(voices: SpeechSynthesisVoice[]): void {
    this.voices = voices;
    for (const fn of this.listeners) fn();
  }

  get last(): FakeUtterance {
    const u = this.spoken.at(-1);
    if (!u) throw new Error('nothing spoken');
    return u;
  }
}

const KYOKO = voice('Kyoko', 'ja-JP');

function setup(voices: SpeechSynthesisVoice[] = [], graceMs = 1000) {
  const synth = new FakeSynth();
  synth.voices = voices;
  const env: SpeechEnv = {
    synth: synth as unknown as SynthLike,
    Utterance: FakeUtterance as unknown as SpeechEnv['Utterance'],
    graceMs,
  };
  return { synth, speech: createSpeech(env) };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('pickJapaneseVoice', () => {
  it('accepts ja-JP and the Android-style ja_JP in any case', () => {
    expect(pickJapaneseVoice([voice('en', 'en-US'), voice('A', 'ja-JP')])?.name).toBe('A');
    expect(pickJapaneseVoice([voice('B', 'ja_JP')])?.name).toBe('B');
    expect(pickJapaneseVoice([voice('C', 'JA-jp')])?.name).toBe('C');
    expect(pickJapaneseVoice([voice('D', 'ja')])?.name).toBe('D');
  });

  it('ignores non-Japanese voices', () => {
    const voices = [
      voice('a', 'en-US'),
      voice('b', 'jv-ID'),
      voice('c', 'ko-KR'),
      voice('d', 'pl'),
    ];
    expect(pickJapaneseVoice(voices)).toBeNull();
    expect(pickJapaneseVoice([])).toBeNull();
  });

  it('prefers on-device voices over remote ones', () => {
    const remote = voice('Google 日本語', 'ja-JP', { localService: false, default: true });
    const local = voice('Haruka', 'ja-JP');
    expect(pickJapaneseVoice([remote, local])).toBe(local);
  });

  it('prefers known good voices by name among local ones, without requiring them', () => {
    const eddy = voice('Eddy (Japanese (Japan))', 'ja-JP');
    const kyoko = voice('Kyoko (Enhanced)', 'ja-JP');
    expect(pickJapaneseVoice([eddy, kyoko])).toBe(kyoko);
    expect(
      pickJapaneseVoice([eddy, voice('Hattori', 'ja-JP'), voice('O-Ren', 'ja-JP')])?.name,
    ).toBe('O-Ren');
    expect(pickJapaneseVoice([eddy])).toBe(eddy);
  });

  it('keeps the platform order on ties and uses the default flag as a tiebreaker', () => {
    const a = voice('A', 'ja-JP');
    const b = voice('B', 'ja-JP');
    expect(pickJapaneseVoice([a, b])).toBe(a);
    const c = voice('C', 'ja-JP', { default: true });
    expect(pickJapaneseVoice([a, c])).toBe(c);
  });
});

describe('clampRate', () => {
  it('defaults to a slightly slow rate and clamps the rest', () => {
    expect(DEFAULT_RATE).toBeLessThan(1);
    expect(clampRate(undefined)).toBe(DEFAULT_RATE);
    expect(clampRate(Number.NaN)).toBe(DEFAULT_RATE);
    expect(clampRate(Number.POSITIVE_INFINITY)).toBe(DEFAULT_RATE);
    expect(clampRate(0.1)).toBe(MIN_RATE);
    expect(clampRate(10)).toBe(MAX_RATE);
    expect(clampRate(1)).toBe(1);
  });
});

describe('createSpeech status', () => {
  it('is unsupported without speechSynthesis or the utterance constructor', () => {
    const noSynth = createSpeech({ synth: undefined, Utterance: undefined });
    expect(noSynth.getStatus()).toBe('unsupported');
    expect(noSynth.speak('ねこ')).toBe('unsupported');

    const synth = new FakeSynth();
    const noCtor = createSpeech({ synth: synth as unknown as SynthLike, Utterance: null });
    expect(noCtor.getStatus()).toBe('unsupported');
    expect(noCtor.speak('ねこ')).toBe('unsupported');
    expect(synth.log).toEqual([]);
  });

  it('is ready at once when voices are available synchronously (iOS Safari)', () => {
    const { speech } = setup([voice('Samantha', 'en-US'), KYOKO]);
    expect(speech.getStatus()).toBe('ready');
    expect(speech.getVoice()).toBe(KYOKO);
  });

  it('goes from loading to ready when voices arrive later, and notifies subscribers', () => {
    const { synth, speech } = setup();
    const seen: SpeechStatus[] = [];
    speech.subscribe((s) => seen.push(s));
    expect(speech.getStatus()).toBe('loading');

    synth.loadVoices([voice('Samantha', 'en-US'), KYOKO]);
    expect(speech.getStatus()).toBe('ready');
    expect(speech.getVoice()).toBe(KYOKO);
    expect(seen).toEqual(['ready']);

    // The grace timer must not downgrade a ready status, and repeats are not re-announced.
    synth.loadVoices([voice('Samantha', 'en-US'), KYOKO]);
    vi.advanceTimersByTime(5000);
    expect(seen).toEqual(['ready']);
  });

  it('becomes no-voice after the grace period, and ready if a voice shows up later', () => {
    const { synth, speech } = setup([voice('Samantha', 'en-US')], 1000);
    const seen: SpeechStatus[] = [];
    speech.subscribe((s) => seen.push(s));
    expect(speech.getStatus()).toBe('loading');

    vi.advanceTimersByTime(999);
    expect(speech.getStatus()).toBe('loading');
    vi.advanceTimersByTime(1);
    expect(speech.getStatus()).toBe('no-voice');

    synth.loadVoices([voice('Samantha', 'en-US'), voice('Kyoko', 'ja_JP')]);
    expect(speech.getStatus()).toBe('ready');
    expect(seen).toEqual(['no-voice', 'ready']);
  });

  it('re-reads the list when the grace period ends, for engines without voiceschanged', () => {
    const synth = new FakeSynth();
    const legacy = {
      getVoices: () => synth.getVoices(),
      speak: (u: FakeUtterance) => synth.speak(u),
      cancel: () => synth.cancel(),
      onvoiceschanged: null as (() => void) | null,
    };
    const speech = createSpeech({
      synth: legacy as unknown as SynthLike,
      Utterance: FakeUtterance as unknown as SpeechEnv['Utterance'],
      graceMs: 500,
    });
    expect(typeof legacy.onvoiceschanged).toBe('function');
    synth.voices = [KYOKO];
    expect(speech.getStatus()).toBe('loading');
    vi.advanceTimersByTime(500);
    expect(speech.getStatus()).toBe('ready');
  });

  it('notifies when a better voice replaces the chosen one', () => {
    const { synth, speech } = setup([voice('Eddy', 'ja-JP')]);
    const seen: SpeechStatus[] = [];
    speech.subscribe((s) => seen.push(s));
    synth.loadVoices([voice('Eddy', 'ja-JP'), KYOKO]);
    expect(speech.getVoice()).toBe(KYOKO);
    expect(seen).toEqual(['ready']);
  });

  it('stops notifying after unsubscribe', () => {
    const { synth, speech } = setup();
    const fn = vi.fn();
    const off = speech.subscribe(fn);
    off();
    synth.loadVoices([KYOKO]);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('createSpeech speak', () => {
  it('cancels right before speaking and configures the utterance', () => {
    const { synth, speech } = setup([voice('Samantha', 'en-US'), KYOKO]);
    expect(speech.speak('ねこ')).toBe('ok');
    expect(synth.log).toEqual(['cancel', 'speak:ねこ']);
    expect(synth.last.lang).toBe('ja-JP');
    expect(synth.last.voice).toBe(KYOKO);
    expect(synth.last.rate).toBe(DEFAULT_RATE);

    expect(speech.speak('いぬ')).toBe('ok');
    expect(synth.log).toEqual(['cancel', 'speak:ねこ', 'cancel', 'speak:いぬ']);
  });

  it('clamps the requested rate', () => {
    const { synth, speech } = setup([KYOKO]);
    speech.speak('あ', { rate: 3 });
    expect(synth.last.rate).toBe(MAX_RATE);
    speech.speak('あ', { rate: 0 });
    expect(synth.last.rate).toBe(MIN_RATE);
    speech.speak('あ', { rate: 1.1 });
    expect(synth.last.rate).toBe(1.1);
  });

  it('resumes a paused engine before speaking', () => {
    const { synth, speech } = setup([KYOKO]);
    synth.paused = true;
    speech.speak('あ');
    expect(synth.log).toEqual(['cancel', 'resume', 'speak:あ']);
  });

  it('returns no-voice and stays silent when the device has no Japanese voice', () => {
    const { synth, speech } = setup([voice('Samantha', 'en-US')], 1000);
    // Still in the grace period, but the known list has no Japanese voice.
    expect(speech.speak('ねこ')).toBe('no-voice');
    vi.advanceTimersByTime(1000);
    expect(speech.getStatus()).toBe('no-voice');
    expect(speech.speak('ねこ')).toBe('no-voice');
    expect(synth.spoken).toEqual([]);
  });

  it('returns no-voice after the grace period when no voices ever arrived', () => {
    const { synth, speech } = setup([], 1000);
    vi.advanceTimersByTime(1000);
    expect(speech.speak('ねこ')).toBe('no-voice');
    expect(synth.spoken).toEqual([]);
  });

  it('speaks by language alone while the voice list is still empty', () => {
    const { synth, speech } = setup([], 1000);
    expect(speech.getStatus()).toBe('loading');
    expect(speech.speak('ねこ')).toBe('ok');
    expect(synth.last.voice).toBeNull();
    expect(synth.last.lang).toBe('ja-JP');
  });

  it('picks up voices that appeared without an event', () => {
    const { synth, speech } = setup([], 1000);
    vi.advanceTimersByTime(1000);
    expect(speech.getStatus()).toBe('no-voice');
    synth.voices = [KYOKO];
    expect(speech.speak('ねこ')).toBe('ok');
    expect(synth.last.voice).toBe(KYOKO);
    expect(speech.getStatus()).toBe('ready');
  });

  it('calls onEnd once when the utterance ends or fails', () => {
    const { synth, speech } = setup([KYOKO]);
    const onEnd = vi.fn();
    speech.speak('ねこ', { onEnd });
    expect(onEnd).not.toHaveBeenCalled();
    synth.last.onend?.();
    synth.last.onerror?.();
    vi.advanceTimersByTime(60_000);
    expect(onEnd).toHaveBeenCalledTimes(1);

    const onError = vi.fn();
    speech.speak('いぬ', { onEnd: onError });
    synth.last.onerror?.();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('ends the previous utterance before cancelling it for a new one', () => {
    const { synth, speech } = setup([KYOKO]);
    const order: string[] = [];
    speech.speak('ねこ', { onEnd: () => order.push(`end:ねこ (log ${synth.log.length})`) });
    speech.speak('いぬ');
    // The first onEnd ran before the second cancel (log had 2 entries: cancel, speak).
    expect(order).toEqual(['end:ねこ (log 2)']);
    expect(synth.log).toEqual(['cancel', 'speak:ねこ', 'cancel', 'speak:いぬ']);
  });

  it('falls back to a watchdog when the engine never reports the end', () => {
    const { speech } = setup([KYOKO]);
    const onEnd = vi.fn();
    speech.speak('ね', { onEnd });
    vi.advanceTimersByTime(2999);
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('stop() cancels and ends the current utterance', () => {
    const { synth, speech } = setup([KYOKO]);
    const onEnd = vi.fn();
    speech.speak('ねこ', { onEnd });
    speech.stop();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(synth.log.at(-1)).toBe('cancel');
  });

  it('reports unsupported, without onEnd, when the engine throws', () => {
    const { synth, speech } = setup([KYOKO]);
    synth.throwOnSpeak = true;
    const onEnd = vi.fn();
    expect(speech.speak('ねこ', { onEnd })).toBe('unsupported');
    vi.advanceTimersByTime(60_000);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('does not call onEnd for a speak() that did not play', () => {
    const { speech } = setup([voice('Samantha', 'en-US')]);
    const onEnd = vi.fn();
    expect(speech.speak('ねこ', { onEnd })).toBe('no-voice');
    vi.advanceTimersByTime(60_000);
    expect(onEnd).not.toHaveBeenCalled();
  });
});

describe('default instance', () => {
  it('is created lazily and reports unsupported in Node', () => {
    expect(getSpeechStatus()).toBe('unsupported');
    expect(speak('ねこ')).toBe('unsupported');
  });
});

describe('help text', () => {
  it('names the iPhone settings path and a known voice, without em dashes', () => {
    for (const part of [
      'Ustawienia',
      'Dostępność',
      'Treść mówiona',
      'Głosy',
      'Japoński',
      'Kyoko',
    ]) {
      expect(JAPANESE_VOICE_HELP).toContain(part);
    }
    expect(JAPANESE_VOICE_HELP).toMatch(/otwórz ją ponownie/);
    for (const text of [JAPANESE_VOICE_HELP, ...Object.values(SPEECH_PROBLEM_TEXT)]) {
      expect(text).not.toMatch(/[–—]/);
    }
  });
});
