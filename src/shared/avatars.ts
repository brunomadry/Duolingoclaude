/** Stable avatar ids stored on the server. Visuals live in src/mascot/parts.ts. */
export const AVATAR_IDS = [
  'plain',
  'scarf',
  'hat',
  'glasses',
  'leaf',
  'headband',
  'sakura',
  'sleepy',
] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

export function isAvatarId(v: unknown): v is AvatarId {
  return typeof v === 'string' && (AVATAR_IDS as readonly string[]).includes(v);
}
