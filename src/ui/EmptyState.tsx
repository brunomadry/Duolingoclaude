import type { ComponentChildren } from 'preact';
import { Mascot } from '../mascot/Mascot.tsx';
import type { Pose } from '../mascot/parts.ts';

interface EmptyStateProps {
  title: string;
  text: string;
  pose?: Pose;
  children?: ComponentChildren;
}

export function EmptyState({ title, text, pose = 'thinking', children }: EmptyStateProps) {
  return (
    <div class="empty">
      <Mascot pose={pose} size={140} decorative />
      <h2 class="empty__title">{title}</h2>
      <p class="empty__text">{text}</p>
      {children}
    </div>
  );
}
