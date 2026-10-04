import { useMemo } from 'preact/hooks';
import {
  AVATARS,
  FULL_VIEWBOX,
  HEAD_VIEWBOX,
  composeAvatar,
  composePose,
  type AvatarId,
  type Pose,
} from './parts.ts';

const POSE_LABELS: Record<Pose, string> = {
  idle: 'Aka, czerwona panda, siedzi spokojnie',
  happy: 'Aka się cieszy i macha łapką',
  thinking: 'Aka się zastanawia',
  celebrating: 'Aka świętuje z uniesionymi łapkami',
  sleepy: 'Aka drzemie',
};

interface MascotProps {
  pose?: Pose;
  size?: number;
  /** Decorative mascots are hidden from VoiceOver. */
  decorative?: boolean;
  class?: string;
}

/** Full-body mascot. Markup comes from our own static parts, never from user input. */
export function Mascot({ pose = 'idle', size = 160, decorative = false, class: cls }: MascotProps) {
  const markup = useMemo(() => composePose(pose), [pose]);
  return (
    <svg
      class={['mascot', `mascot--${pose}`, cls].filter(Boolean).join(' ')}
      viewBox={FULL_VIEWBOX}
      width={size}
      height={size}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? 'true' : undefined}
      aria-label={decorative ? undefined : POSE_LABELS[pose]}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

interface AvatarProps {
  id: AvatarId;
  size?: number;
  label?: string;
  /** Hide from VoiceOver when the surrounding control already names it. */
  decorative?: boolean;
}

export function Avatar({ id, size = 64, label, decorative = false }: AvatarProps) {
  const markup = useMemo(() => composeAvatar(id), [id]);
  return (
    <svg
      class="avatar"
      viewBox={HEAD_VIEWBOX}
      width={size}
      height={size}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? 'true' : undefined}
      aria-label={decorative ? undefined : (label ?? `Awatar: ${AVATARS[id].label}`)}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
