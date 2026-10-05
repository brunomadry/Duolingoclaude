/**
 * Icon button that reads Japanese text aloud with the on-device voice (see lib/speech.ts).
 * Speech only ever starts from the tap itself, never on mount.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  getSpeechStatus,
  initSpeech,
  speak,
  SPEECH_PROBLEM_TEXT,
  stopSpeaking,
  subscribeSpeech,
} from '../lib/speech.ts';
import type { SpeechProblem, SpeechStatus } from '../lib/speech.ts';

/** Current speech status, updated when voices load (for screens that show the voice help). */
export function useSpeechStatus(): SpeechStatus {
  const [status, setStatus] = useState(getSpeechStatus);
  useEffect(() => {
    setStatus(getSpeechStatus());
    return subscribeSpeech(setStatus);
  }, []);
  return status;
}

function SpeakerIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9.2a4 4 0 0 1 0 5.6" />
      <path d="M18.2 6.6a7.6 7.6 0 0 1 0 10.8" />
    </svg>
  );
}

export interface SpeakButtonProps {
  /** Japanese text to read aloud. */
  text: string;
  /** Polish action label. The accessible name is "<label>: <text>". */
  label?: string;
  /** Button size in px; never smaller than the 44 px tap target. */
  size?: number;
  /** Speaking rate (see speak()). */
  rate?: number;
  /** Called instead of showing the inline message when speech cannot play. */
  onUnavailable?: (problem: SpeechProblem) => void;
  /** Extra class names for the button. */
  class?: string;
  /** Name the button with the label only (listening exercises must not reveal the answer). */
  hideText?: boolean;
}

const TAP = 44;

export function SpeakButton({
  text,
  label = 'Posłuchaj',
  size = TAP,
  rate,
  onUnavailable,
  class: className,
  hideText = false,
}: SpeakButtonProps) {
  const [speaking, setSpeaking] = useState(false);
  const [problem, setProblem] = useState<{ kind: SpeechProblem; attempt: number } | null>(null);
  const playId = useRef(0);
  const mounted = useRef(false);
  const speakingRef = useRef(false);

  useEffect(() => {
    mounted.current = true;
    // Read the voice list early (silent) so the first tap finds a voice.
    initSpeech();
    return () => {
      mounted.current = false;
      // Do not leave our own utterance playing behind a closed screen.
      if (speakingRef.current) stopSpeaking();
    };
  }, []);

  const setActive = (value: boolean) => {
    speakingRef.current = value;
    setSpeaking(value);
  };

  const onClick = () => {
    const id = ++playId.current;
    let ended = false;
    // Runs inside the tap handler, which iOS requires for speech.
    const result = speak(text, {
      rate,
      onEnd: () => {
        ended = true;
        if (mounted.current && playId.current === id) setActive(false);
      },
    });
    if (result === 'ok') {
      setProblem(null);
      if (!ended) setActive(true);
      return;
    }
    setActive(false);
    if (onUnavailable) onUnavailable(result);
    else setProblem({ kind: result, attempt: id });
  };

  const px = Math.max(TAP, Math.round(size));
  const large = px > TAP;

  return (
    <>
      <button
        type="button"
        class={className ? `icon-button ${className}` : 'icon-button'}
        data-speaking={speaking ? 'true' : undefined}
        onClick={onClick}
        style={{
          flex: 'none',
          width: `${px}px`,
          height: `${px}px`,
          color: speaking ? 'var(--accent-text)' : undefined,
          background: speaking || large ? 'var(--surface)' : undefined,
          border: large ? '1px solid var(--border)' : undefined,
          boxShadow: speaking ? 'inset 0 0 0 2px var(--accent-soft)' : undefined,
          transition: 'color var(--dur-fast), background-color var(--dur-fast)',
        }}
      >
        <SpeakerIcon size={Math.round(px * 0.55)} />
        {/* Name from content (not aria-label) so VoiceOver reads the kana with a Japanese voice. */}
        <span class="visually-hidden">
          {hideText ? (
            label
          ) : (
            <>
              {label}:{' '}
              <span lang="ja" class="jp">
                {text}
              </span>
            </>
          )}
        </span>
      </button>
      {problem && (
        <span
          key={problem.attempt}
          role="alert"
          class="muted"
          style={{ fontSize: 'var(--fs-xs)', maxWidth: '18em' }}
        >
          {SPEECH_PROBLEM_TEXT[problem.kind]}
        </span>
      )}
    </>
  );
}
