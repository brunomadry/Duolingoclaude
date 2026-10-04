import { useRef } from 'preact/hooks';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
}

/** Radio group styled as a segmented control (keyboard and VoiceOver friendly). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  const name = useRef(`seg-${Math.random().toString(36).slice(2)}`).current;
  return (
    <div class="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const id = `${name}-${o.value}`;
        return (
          <span key={o.value}>
            <input
              type="radio"
              id={id}
              name={name}
              value={o.value}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
            />
            <label for={id}>{o.label}</label>
          </span>
        );
      })}
    </div>
  );
}
